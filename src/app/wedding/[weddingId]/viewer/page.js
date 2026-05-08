'use client'

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import HTMLFlipBook from 'react-pageflip'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage, db } from '@/lib/firebaseClient'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

import DesignControls from '../../../../components/DesignControls/DesignControls'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import BookCoverTemplate from '@/components/BookCoverTemplate/BookCoverTemplate'
import BookBackCoverTemplate from '@/components/BookBackCoverTemplate/BookBackCoverTemplate'
import PrintOrderModal from '@/components/PrintOrderModal/PrintOrderModal'
import { getEntries } from '../../../../lib/classifyMedia'
import defaultStyle from '@/app/wedding/[weddingId]/viewer/defaultStyle'
import { BOOK_FORMATS, resolveFormatConfig } from '@/lib/bookFormats'
import { NextIntlClientProvider, useTranslations, useLocale } from 'next-intl'
import { getMessages } from '@/i18n/getMessages'
import { normalizeLocale } from '@/i18n/locales'

// --- הגדרות דפוס (LULU COMPLIANT) ---
//
// These are the dimensions the live "שליחה להדפסה" flow uses (the Lulu order
// path that's been in production). We are deliberately NOT changing them in
// this PR — the super-admin "Download PDFs" menu uses the bookFormats presets
// instead, so we can iterate on the print spec without risking the shipped
// order flow.

// 1. תוכן הספר (Content) - ריבוע סטנדרטי
const CONTENT_CONFIG = {
    widthMM: 216,
    heightMM: 216,
    dpi: 300,
}

// 2. כריכה (Full Spread) - כולל שוליים ושדרה (19x10.25 inches)
const COVER_CONFIG = {
    widthMM: 482.6,
    heightMM: 260.35,
    spineMM: 6.35, // עובי שדרה משוער
    dpi: 300,
}

// Outer wrapper — owns the runtime locale and wraps the viewer in
// NextIntlClientProvider so descendants (BookViewerInner + DesignControls
// when needed) can use the i18n hooks. The inner component bubbles the
// doc's locale up via onLocaleDiscovered() once Firestore answers.
export default function BookViewer() {
    const [locale, setLocale] = useState('he')
    const onLocaleDiscovered = useCallback(
        next => setLocale(prev => (prev === next ? prev : next)),
        []
    )
    return (
        <NextIntlClientProvider locale={locale} messages={getMessages(locale)}>
            <BookViewerInner onLocaleDiscovered={onLocaleDiscovered} />
        </NextIntlClientProvider>
    )
}

function BookViewerInner({ onLocaleDiscovered }) {
    const { weddingId } = useParams()
    const t = useTranslations('viewer')
    const locale = useLocale()

    const [pages, setPages] = useState([])
    const [loading, setLoading] = useState(true)
    const [designLoading, setDesignLoading] = useState(true)
    const [mode, setMode] = useState('book')
    const [viewerSize, setViewerSize] = useState(500)
    const [isMobile, setIsMobile] = useState(false)
    const [styleSettings, setStyleSettings] = useState(defaultStyle)
    // Inject the wedding's locale into styleSettings so BookPageTemplate
    // and the page layouts (Notebook, Collage) can read it and set their
    // own dir + use the right logical CSS resolution. MUST be declared
    // here, alongside other top-level hooks — placing it after any early
    // return below would violate the rules of hooks (different render
    // paths returned different hook counts on first vs. second render).
    const styleWithLocale = useMemo(() => ({ ...styleSettings, locale }), [styleSettings, locale])
    const [isGenerating, setIsGenerating] = useState(false)
    const [showPrintModal, setShowPrintModal] = useState(false)
    const [printStatus, setPrintStatus] = useState('idle') // 'idle' | 'generating' | 'uploading' | 'ordering' | 'done' | 'error'
    const [saveStatus, setSaveStatus] = useState('idle') // 'idle' | 'saving' | 'saved'
    const saveTimerRef = useRef(null)

    // ── Auto-export (super-admin "Download PDFs") ─────────────────────────────
    // If the URL has ?autoExport=<formatId>, we generate the PDFs in that
    // Lulu-compliant format and trigger browser downloads instead of uploading
    // to Firebase / calling the Lulu order API. The live print-order flow is
    // untouched.
    //
    // We read the param from window.location.search in an effect instead of
    // next/navigation's useSearchParams(). In Next.js 15 useSearchParams()
    // requires a <Suspense> boundary at build-time; since we only need the
    // value client-side for a side effect, reading from window is simpler
    // and keeps the build green.
    const [autoExportFormatId, setAutoExportFormatId] = useState(null)
    useEffect(() => {
        if (typeof window === 'undefined') return
        const params = new URLSearchParams(window.location.search)
        setAutoExportFormatId(params.get('autoExport'))
    }, [])
    const autoExportFormat = autoExportFormatId ? BOOK_FORMATS[autoExportFormatId] : null
    const [exportStatus, setExportStatus] = useState('idle') // 'idle' | 'generating' | 'done' | 'error'
    const [exportMessage, setExportMessage] = useState('')
    const exportTriggeredRef = useRef(false)

    // Refs לאזורי ההדפסה הנסתרים
    const contentRef = useRef(null)
    const fullCoverRef = useRef(null)
    // Refs for the auto-export hidden render area (separate from the live
    // print one so we can pick different dimensions per format without
    // disturbing the shipped flow).
    const exportContentRef = useRef(null)
    const exportCoverRef = useRef(null)

    useEffect(() => {
        const init = async () => {
            if (weddingId) {
                // Load entries
                const data = await getEntries(weddingId)
                setPages(data.reverse())
                setLoading(false)

                // Load cover design from Firestore
                try {
                    const snap = await getDoc(doc(db, 'weddings', weddingId))
                    if (snap.exists()) {
                        const firestoreData = snap.data()
                        // Bubble the doc's locale up to the outer provider so
                        // every chrome string (DesignControls, viewer status
                        // messages) speaks the wedding's configured language.
                        onLocaleDiscovered(normalizeLocale(firestoreData.locale))
                        if (firestoreData.coverDesign) {
                            setStyleSettings({ ...defaultStyle, ...firestoreData.coverDesign })
                        } else if (typeof window !== 'undefined') {
                            // Migration: fall back to localStorage if never saved to Firestore
                            const savedStyle = localStorage.getItem('bookStyle')
                            if (savedStyle) setStyleSettings(JSON.parse(savedStyle))
                        }
                    }
                } catch (err) {
                    console.error('Failed to load cover design:', err)
                } finally {
                    setDesignLoading(false)
                }
            }
        }
        init()
    }, [weddingId])

    const calculateBookSize = useCallback(() => {
        const w = window.innerWidth
        const h = window.innerHeight
        setIsMobile(w < 1024)

        const SIDEBAR_W = 380
        const availableWidth = w < 1024 ? w - 20 : w - SIDEBAR_W - 60
        const availableHeight = h - 160

        const optimalSize =
            w < 1024 ? Math.min(availableWidth, availableHeight) : Math.min(availableWidth / 2, availableHeight)

        setViewerSize(Math.floor(Math.min(Math.max(optimalSize, 280), 750)))
    }, [])

    useEffect(() => {
        calculateBookSize()
        window.addEventListener('resize', calculateBookSize)
        return () => window.removeEventListener('resize', calculateBookSize)
    }, [calculateBookSize])

    // ── Debounced Firestore save ─────────────────────────────────────────────
    // Firestore rejects: undefined, NaN, Infinity, functions, class instances,
    // DOM nodes, arrays containing any of those. Past builds only stripped
    // undefined, which let a single bad NaN (e.g. from a joystick drag before
    // the pad had measured itself) poison every subsequent save — each failed
    // write was retried internally until the Firestore write queue exhausted
    // and surfaced "resource-exhausted". Strip everything Firestore can't eat.
    const sanitize = (v) => {
        if (v === undefined) return undefined
        if (v === null) return null
        if (typeof v === 'number') return Number.isFinite(v) ? v : null
        if (typeof v === 'function' || typeof v === 'symbol') return undefined
        if (typeof v !== 'object') return v // string, boolean, bigint
        if (Array.isArray(v)) {
            return v.map(sanitize).filter(x => x !== undefined)
        }
        // Only serialize plain objects — skip class instances / DOM nodes /
        // Blobs / Files / whatever else might sneak in.
        const proto = Object.getPrototypeOf(v)
        if (proto !== Object.prototype && proto !== null) return undefined
        const out = {}
        for (const [k, val] of Object.entries(v)) {
            const s = sanitize(val)
            if (s !== undefined) out[k] = s
        }
        return out
    }

    // If a cover image is still sitting in state as a base64 data URL, upload
    // it to Firebase Storage and return the download URL. Otherwise return
    // whatever was passed in. Firestore rejects string fields > ~1MB with an
    // "invalid nested entity" error, and a base64 JPEG blows past that fast.
    const migrateCoverImageIfNeeded = useCallback(async (coverImg) => {
        if (typeof coverImg !== 'string') return coverImg
        if (!coverImg.startsWith('data:')) return coverImg // already a URL — nothing to do
        try {
            const blob = await (await fetch(coverImg)).blob()
            const mime = blob.type || 'image/jpeg'
            const ext = mime.split('/')[1] || 'jpg'
            const path = `weddings/${weddingId}/cover.${ext}`
            const fileRef = ref(storage, path)
            await uploadBytes(fileRef, blob, { contentType: mime })
            const url = await getDownloadURL(fileRef)
            return url
        } catch (e) {
            console.warn('Cover image migration to Storage failed:', e)
            return coverImg // fall through; save will still fail but at least we tried
        }
    }, [weddingId])

    const saveCoverDesign = useCallback((newSettings) => {
        setSaveStatus('saving')
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(async () => {
            try {
                // Migrate any oversized base64 coverImage to Storage before
                // the Firestore write — otherwise the whole doc gets rejected.
                const migratedUrl = await migrateCoverImageIfNeeded(newSettings.coverImage)
                const settingsToSave =
                    migratedUrl !== newSettings.coverImage
                        ? { ...newSettings, coverImage: migratedUrl }
                        : newSettings
                // Sync the migration back into local state so subsequent saves
                // see the URL (and the preview <img> starts loading from CDN
                // instead of carrying the giant data URL around).
                if (migratedUrl !== newSettings.coverImage) {
                    setStyleSettings(prev => ({ ...prev, coverImage: migratedUrl }))
                }
                await setDoc(
                    doc(db, 'weddings', weddingId),
                    { coverDesign: sanitize(settingsToSave) },
                    { merge: true }
                )
                setSaveStatus('saved')
                setTimeout(() => setSaveStatus('idle'), 2500)
            } catch (err) {
                console.error('Failed to save cover design:', err?.message || err)
                setSaveStatus('idle')
            }
        }, 800)
    }, [weddingId, migrateCoverImageIfNeeded])

    const handleStyleChange = updated => {
        const newSettings = { ...styleSettings, ...updated }
        setStyleSettings(newSettings)
        saveCoverDesign(newSettings)
    }

    // --- יצירת PDF גנרית (מקבלת קונפיגורציה) ---
    const generatePdfFromRef = async (elementRef, fileNamePrefix, config) => {
        if (!elementRef.current) return null

        const pdf = new jsPDF({
            orientation: config.widthMM > config.heightMM ? 'landscape' : 'portrait',
            unit: 'mm',
            format: [config.widthMM, config.heightMM],
            compress: true,
        })

        const pageElements = elementRef.current.children
        const pixelsWidth = (config.widthMM / 25.4) * config.dpi

        for (let i = 0; i < pageElements.length; i++) {
            const pageEl = pageElements[i]
            const domRect = pageEl.getBoundingClientRect()
            const scale = pixelsWidth / domRect.width

            const canvas = await html2canvas(pageEl, {
                scale: scale,
                useCORS: true,
                allowTaint: true,
                logging: false,
                width: domRect.width,
                height: domRect.height,
                windowWidth: domRect.width,
                windowHeight: domRect.height,
                backgroundColor: '#ffffff',
            })

            const imgData = canvas.toDataURL('image/jpeg', 0.95)

            if (i > 0) pdf.addPage([config.widthMM, config.heightMM])
            pdf.addImage(imgData, 'JPEG', 0, 0, config.widthMM, config.heightMM)
        }

        const pdfBlob = pdf.output('blob')
        const storageRef = ref(storage, `wedding-books/${weddingId}/${fileNamePrefix}.pdf`)
        await uploadBytes(storageRef, pdfBlob)

        return await getDownloadURL(storageRef)
    }

    // Download-only variant — produces the same PDF as generatePdfFromRef but
    // hands it to the browser instead of uploading to Firebase Storage. Used
    // exclusively by the super-admin "Download PDFs" flow.
    const generatePdfBlobFromRef = async (elementRef, config) => {
        if (!elementRef.current) return null

        const pdf = new jsPDF({
            orientation: config.widthMM > config.heightMM ? 'landscape' : 'portrait',
            unit: 'mm',
            format: [config.widthMM, config.heightMM],
            compress: true,
        })

        const pageElements = elementRef.current.children
        const pixelsWidth = (config.widthMM / 25.4) * config.dpi

        for (let i = 0; i < pageElements.length; i++) {
            const pageEl = pageElements[i]
            const domRect = pageEl.getBoundingClientRect()
            if (!domRect.width || !domRect.height) continue
            const scale = pixelsWidth / domRect.width

            const canvas = await html2canvas(pageEl, {
                scale: scale,
                useCORS: true,
                allowTaint: true,
                logging: false,
                width: domRect.width,
                height: domRect.height,
                windowWidth: domRect.width,
                windowHeight: domRect.height,
                backgroundColor: '#ffffff',
            })

            const imgData = canvas.toDataURL('image/jpeg', 0.95)
            if (i > 0) pdf.addPage([config.widthMM, config.heightMM])
            pdf.addImage(imgData, 'JPEG', 0, 0, config.widthMM, config.heightMM)
        }

        return pdf.output('blob')
    }

    const triggerBrowserDownload = (blob, filename) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        setTimeout(() => {
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        }, 0)
    }

    const handlePrintOrder = async (shippingAddress) => {
        setIsGenerating(true)
        setPrintStatus('generating')
        try {
            // 1. יצירת תוכן (Content) - דפים נפרדים
            const contentUrl = await generatePdfFromRef(contentRef, 'WeddingBook-Content', CONTENT_CONFIG)

            // 2. יצירת כריכה (Spread) - דף אחד רחב
            setPrintStatus('uploading')
            const coversUrl = await generatePdfFromRef(fullCoverRef, 'WeddingBook-Covers', COVER_CONFIG)

            if (!contentUrl || !coversUrl) throw new Error('Failed to generate PDFs')

            // 3. שליחה ל-Lulu Print API
            setPrintStatus('ordering')
            const res = await fetch('/api/lulu/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    weddingId,
                    contentUrl,
                    coverUrl: coversUrl,
                    pageCount: pages.length,
                    shippingAddress,
                    quantity: 1,
                }),
            })

            const data = await res.json()

            if (!res.ok) throw new Error(data.error || 'Failed to create print order')

            setPrintStatus('done')
            setShowPrintModal(false)
            alert(t('orderSuccess', { orderId: data.printJobId }))
        } catch (error) {
            console.error('Print order error:', error)
            setPrintStatus('error')
            alert(t('orderError', { error: error.message }))
        } finally {
            setIsGenerating(false)
            setTimeout(() => setPrintStatus('idle'), 1000)
        }
    }

    // ── Auto-export (super-admin "Download PDFs") ─────────────────────────────
    // Runs exactly once after pages + style are loaded. Generates content +
    // cover PDFs at the selected format's dimensions and triggers browser
    // downloads. Each PDF is standalone — the two files together are what
    // you'd upload to Lulu's cover/interior drop zones.
    const exportConfig = useMemo(() => {
        if (!autoExportFormat) return null
        return resolveFormatConfig(autoExportFormat.id, pages.length)
    }, [autoExportFormat, pages.length])

    useEffect(() => {
        if (!autoExportFormat) return
        if (loading || designLoading) return
        if (exportTriggeredRef.current) return
        if (!exportConfig) return
        // Wait a tick so the hidden export render has committed to the DOM
        // before html2canvas snapshots it.
        exportTriggeredRef.current = true
        const t = setTimeout(async () => {
            setExportStatus('generating')
            setExportMessage(t('exportingContent'))
            try {
                const contentBlob = await generatePdfBlobFromRef(exportContentRef, exportConfig.content)
                if (contentBlob) {
                    triggerBrowserDownload(
                        contentBlob,
                        `WeddingBook-${weddingId}-${autoExportFormat.id}-Content.pdf`
                    )
                }
                setExportMessage(t('exportingCover'))
                const coverBlob = await generatePdfBlobFromRef(exportCoverRef, exportConfig.cover)
                if (coverBlob) {
                    triggerBrowserDownload(
                        coverBlob,
                        `WeddingBook-${weddingId}-${autoExportFormat.id}-Cover.pdf`
                    )
                }
                setExportStatus('done')
                setExportMessage(
                    t('exportDone', { format: autoExportFormat.label })
                )
            } catch (err) {
                console.error('auto-export failed:', err)
                setExportStatus('error')
                setExportMessage(t('exportError', { error: err?.message || err }))
            }
        }, 800)
        return () => clearTimeout(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoExportFormat, loading, designLoading, exportConfig])

    if (loading || designLoading) return (
        <div className='flex h-[calc(100vh-64px)] items-center justify-center bg-gradient-to-br from-[#F5F5F5] via-[#f0ebe3] to-[#ebe5da]'>
            <div className='flex flex-col items-center gap-6'>
                <div className='flex items-center justify-center'>
                    <div className='animate-spin rounded-full h-12 w-12 border-[3px] border-[#AA8840]/20 border-t-[#c9a44e] shadow-lg shadow-[#AA8840]/10' />
                </div>
                <div className='text-center'>
                    <p className='text-sm text-gray-600 font-bold tracking-wide'>{t('loadingCover')}</p>
                    <p className='text-xs text-gray-400 mt-2'>{t('oneMoment')}</p>
                </div>
            </div>
        </div>
    )

    const hasCover = styleSettings.coverTitle || styleSettings.coverImage

    // --- חישובים לאזור הנסתר ---

    // 1. מידות תוכן
    const contentDisplayWidth = 800
    const contentAspectRatio = CONTENT_CONFIG.widthMM / CONTENT_CONFIG.heightMM

    // 2. מידות כריכה (Spread)
    // נשתמש ברוחב תצוגה גדול כדי שיהיה נוח לרינדור
    const spreadDisplayWidth = 1200
    const spreadAspectRatio = COVER_CONFIG.widthMM / COVER_CONFIG.heightMM
    const spreadDisplayHeight = spreadDisplayWidth / spreadAspectRatio

    // חישוב יחסי רוחב בתוך ה-Spread (באחוזים או יחסים)
    // רוחב כל צד (קדמי/אחורי) במ"מ
    const coverPanelWidthMM = (COVER_CONFIG.widthMM - COVER_CONFIG.spineMM) / 2

    // המרה לפיקסלים בתוך ה-Container של ה-DOM
    const pxPerMM = spreadDisplayWidth / COVER_CONFIG.widthMM
    const panelWidthPx = coverPanelWidthMM * pxPerMM
    const spineWidthPx = COVER_CONFIG.spineMM * pxPerMM

    return (
        <AdminPageWrapper>
            <div
                dir={locale === 'he' ? 'rtl' : 'ltr'}
                className='relative flex flex-col-reverse lg:flex-row h-[calc(100vh-64px)] overflow-hidden bg-gradient-to-br from-[#F5F5F5] via-[#f0ebe3] font-sans'
            >
                <aside
                    className={`relative z-20 flex flex-col shrink-0 bg-white/80 backdrop-blur-md border-l border-white/50 transition-all ${
                        isMobile ? 'h-[350px] w-full border-t rounded-t-3xl' : 'h-full w-[380px]'
                    }`}
                >
                    <div className='h-full overflow-hidden'>
                        <DesignControls
                            settings={styleSettings}
                            onChange={handleStyleChange}
                            mode={mode}
                            onModeChange={setMode}
                            saveStatus={saveStatus}
                            weddingId={weddingId}
                            locale={locale}
                        />
                    </div>
                </aside>

                <main
                    className='relative z-10 flex-1 flex flex-col items-center justify-center p-4 min-h-0 overflow-hidden'
                >
                    <div
                        className='relative shrink-0'
                        style={{
                            width: mode === 'book' && !isMobile ? viewerSize * 2 : viewerSize,
                            height: viewerSize,
                        }}
                    >
                        {mode === 'cover' ? (
                            <HTMLFlipBook
                                width={viewerSize}
                                height={viewerSize}
                                size='fixed'
                                usePortrait={true}
                                showCover={false}
                                drawShadow={false}
                                className='book-flip'
                            >
                                <div className='demo-page'>
                                    <BookCoverTemplate
                                        styleSettings={styleWithLocale}
                                        scaledWidth={viewerSize}
                                        scaledHeight={viewerSize}
                                    />
                                </div>
                            </HTMLFlipBook>
                        ) : (
                            <HTMLFlipBook
                                key={`${viewerSize}-${isMobile}`}
                                width={viewerSize}
                                height={viewerSize}
                                size='fixed'
                                usePortrait={isMobile}
                                showCover={!!hasCover}
                                mobileScrollSupport={true}
                                className='book-flip'
                                drawShadow={false}
                                flippable={true}
                            >
                                <div className='demo-page shadow-inner'>
                                    <BookBackCoverTemplate scaledWidth={viewerSize} scaledHeight={viewerSize} />
                                </div>
                                {pages.map(entry => (
                                    <div key={entry.id} className='demo-page border-l border-[#AA8840]/10'>
                                        <BookPageTemplate
                                            entry={entry}
                                            styleSettings={styleWithLocale}
                                            scaledWidth={viewerSize}
                                            scaledHeight={viewerSize}
                                        />
                                    </div>
                                ))}
                                <div className='demo-page shadow-inner'>
                                    <BookCoverTemplate
                                        styleSettings={styleWithLocale}
                                        scaledWidth={viewerSize}
                                        scaledHeight={viewerSize}
                                    />
                                </div>
                            </HTMLFlipBook>
                        )}
                    </div>

                    {!isMobile && (
                        <div className='mt-6 z-30'>
                            <button
                                onClick={() => setShowPrintModal(true)}
                                disabled={isGenerating}
                                className='group flex items-center justify-center gap-3 px-8 py-3.5 rounded-2xl gold-shimmer text-white font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed'
                            >
                                {isGenerating ? (
                                    <>
                                        <div className='w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin'></div>
                                        <span className='text-sm font-bold tracking-wide'>
                                            {printStatus === 'generating' && t('printStatusGenerating')}
                                            {printStatus === 'uploading' && t('printStatusUploading')}
                                            {printStatus === 'ordering' && t('printStatusOrdering')}
                                            {printStatus === 'done' && t('printStatusDone')}
                                            {printStatus === 'error' && t('printStatusError')}
                                            {printStatus === 'idle' && t('printStatusIdle')}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <span className='text-sm font-bold tracking-wide'>{t('sendToPrint')}</span>
                                        <svg className='w-5 h-5 group-hover:scale-110 transition-transform duration-300' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}><path strokeLinecap='round' strokeLinejoin='round' d='M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z' /></svg>
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </main>
            </div>

            {/* --- Print Order Modal --- */}
            {showPrintModal && (
                <PrintOrderModal
                    onClose={() => setShowPrintModal(false)}
                    onSubmit={handlePrintOrder}
                    isLoading={isGenerating}
                />
            )}

            {/* --- Hidden Print Area --- */}
            <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
                {/* 1. Content PDF (8.5x8.5) */}
                <div ref={contentRef}>
                    {pages.map(entry => (
                        <div
                            key={entry.id}
                            className='page-for-pdf'
                            style={{
                                width: `${contentDisplayWidth}px`,
                                height: `${contentDisplayWidth / contentAspectRatio}px`,
                                overflow: 'hidden',
                            }}
                        >
                            <BookPageTemplate
                                entry={entry}
                                styleSettings={styleWithLocale}
                                scaledWidth={contentDisplayWidth}
                                scaledHeight={contentDisplayWidth / contentAspectRatio}
                            />
                        </div>
                    ))}
                </div>

                {/* 2. Full Cover Spread (19x10.25) */}
                {/* מבנה: [אחורה] [שדרה] [קדימה] */}
                <div ref={fullCoverRef}>
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'row',
                            width: `${spreadDisplayWidth}px`,
                            height: `${spreadDisplayHeight}px`,
                            overflow: 'hidden',
                            backgroundColor: styleSettings.coverColor || '#ffffff',
                        }}
                    >
                        {/* חלק שמאלי: כריכה אחורית */}
                        <div
                            style={{
                                width: `${panelWidthPx}px`,
                                height: '100%',
                                position: 'relative',
                                overflow: 'hidden',
                            }}
                        >
                            <BookBackCoverTemplate scaledWidth={panelWidthPx} scaledHeight={spreadDisplayHeight} />
                        </div>

                        {/* חלק אמצעי: שדרה (Spine) */}
                        <div
                            style={{
                                width: `${spineWidthPx}px`,
                                height: '100%',
                                backgroundColor: styleSettings.coverColor || '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            {/* אפשר להוסיף טקסט שדרה כאן אם רוצים */}
                        </div>

                        {/* חלק ימני: כריכה קדמית */}
                        <div
                            style={{
                                width: `${panelWidthPx}px`,
                                height: '100%',
                                position: 'relative',
                                overflow: 'hidden',
                            }}
                        >
                            <BookCoverTemplate
                                styleSettings={styleWithLocale}
                                scaledWidth={panelWidthPx}
                                scaledHeight={spreadDisplayHeight}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* --- Auto-export hidden render (super-admin "Download PDFs") --- */}
            {/*
                Renders at the selected BOOK_FORMATS preset's dimensions so
                html2canvas → jsPDF produces a Lulu-compliant PDF per format.
                Only mounted when ?autoExport=<formatId> is in the URL, so it
                costs nothing during normal viewing.
            */}
            {autoExportFormat && exportConfig && (
                <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
                    {/* Interior content — one page per entry, at the format's
                        content size (includes bleed). */}
                    <div ref={exportContentRef}>
                        {pages.map(entry => {
                            // Scale to a comfortable 1000px render width; the
                            // PDF generator will rescale to hit 300 DPI.
                            const renderW = 1000
                            const renderH = renderW * (exportConfig.content.heightMM / exportConfig.content.widthMM)
                            return (
                                <div
                                    key={entry.id}
                                    style={{
                                        width: `${renderW}px`,
                                        height: `${renderH}px`,
                                        overflow: 'hidden',
                                    }}
                                >
                                    <BookPageTemplate
                                        entry={entry}
                                        styleSettings={styleWithLocale}
                                        scaledWidth={renderW}
                                        scaledHeight={renderH}
                                    />
                                </div>
                            )
                        })}
                    </div>

                    {/* Cover spread — one page, sized to the format's computed
                        cover dimensions. For saddle-stitch this has no spine;
                        for hardcover it's bigger (wrap margin). */}
                    <div ref={exportCoverRef}>
                        {(() => {
                            const renderW = 1400
                            const renderH = renderW * (exportConfig.cover.heightMM / exportConfig.cover.widthMM)
                            const spineWidthPxExport =
                                (exportConfig.cover.spineMM / exportConfig.cover.widthMM) * renderW
                            const panelWidthPxExport = (renderW - spineWidthPxExport) / 2
                            return (
                                <div
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'row',
                                        width: `${renderW}px`,
                                        height: `${renderH}px`,
                                        overflow: 'hidden',
                                        backgroundColor: styleSettings.coverColor || '#ffffff',
                                    }}
                                >
                                    {/* Back cover */}
                                    <div style={{ width: `${panelWidthPxExport}px`, height: '100%', position: 'relative', overflow: 'hidden' }}>
                                        <BookBackCoverTemplate scaledWidth={panelWidthPxExport} scaledHeight={renderH} />
                                    </div>
                                    {/* Spine (0 for saddle-stitch, which just skips rendering it) */}
                                    {spineWidthPxExport > 0 && (
                                        <div
                                            style={{
                                                width: `${spineWidthPxExport}px`,
                                                height: '100%',
                                                backgroundColor: styleSettings.coverColor || '#ffffff',
                                            }}
                                        />
                                    )}
                                    {/* Front cover */}
                                    <div style={{ width: `${panelWidthPxExport}px`, height: '100%', position: 'relative', overflow: 'hidden' }}>
                                        <BookCoverTemplate
                                            styleSettings={styleWithLocale}
                                            scaledWidth={panelWidthPxExport}
                                            scaledHeight={renderH}
                                        />
                                    </div>
                                </div>
                            )
                        })()}
                    </div>
                </div>
            )}

            {/* --- Auto-export status overlay --- */}
            {autoExportFormat && (
                <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm'>
                    <div className='bg-white rounded-2xl shadow-2xl p-8 max-w-md w-[90%] text-center' dir={locale === 'he' ? 'rtl' : 'ltr'}>
                        <h2 className='text-xl font-bold mb-2' style={{ color: '#AA8840' }}>
                            {t('downloadPdf', { format: autoExportFormat.label })}
                        </h2>
                        <p className='text-xs text-gray-500 mb-6'>{autoExportFormat.description}</p>

                        {exportStatus === 'generating' && (
                            <div className='flex flex-col items-center gap-4'>
                                <div className='animate-spin rounded-full h-10 w-10 border-[3px] border-[#AA8840]/20 border-t-[#c9a44e]' />
                                <p className='text-sm text-gray-700'>{exportMessage}</p>
                            </div>
                        )}
                        {exportStatus === 'done' && (
                            <div className='flex flex-col items-center gap-4'>
                                <div className='text-3xl'>✓</div>
                                <p className='text-sm text-gray-700'>{exportMessage}</p>
                                <button
                                    onClick={() => window.close()}
                                    className='mt-2 px-6 py-2 rounded-xl bg-[#AA8840] text-white text-sm font-bold'
                                >
                                    {t('closeWindow')}
                                </button>
                            </div>
                        )}
                        {exportStatus === 'error' && (
                            <div className='flex flex-col items-center gap-4'>
                                <div className='text-3xl text-red-500'>✕</div>
                                <p className='text-sm text-red-700'>{exportMessage}</p>
                            </div>
                        )}
                        {exportStatus === 'idle' && (
                            <p className='text-sm text-gray-500'>{t('waitingBook')}</p>
                        )}
                    </div>
                </div>
            )}
        </AdminPageWrapper>
    )
}
