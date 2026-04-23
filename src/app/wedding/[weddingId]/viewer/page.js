'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
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
import defaultStyle from '@/app/wedding/[weddingId]/viewer/defultStyle'

// --- הגדרות דפוס (LULU COMPLIANT) ---

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

export default function BookViewer() {
    const { weddingId } = useParams()

    const [pages, setPages] = useState([])
    const [loading, setLoading] = useState(true)
    const [designLoading, setDesignLoading] = useState(true)
    const [mode, setMode] = useState('book')
    const [viewerSize, setViewerSize] = useState(500)
    const [isMobile, setIsMobile] = useState(false)
    const [styleSettings, setStyleSettings] = useState(defaultStyle)
    const [isGenerating, setIsGenerating] = useState(false)
    const [showPrintModal, setShowPrintModal] = useState(false)
    const [printStatus, setPrintStatus] = useState('idle') // 'idle' | 'generating' | 'uploading' | 'ordering' | 'done' | 'error'
    const [saveStatus, setSaveStatus] = useState('idle') // 'idle' | 'saving' | 'saved'
    const saveTimerRef = useRef(null)

    // Refs לאזורי ההדפסה הנסתרים
    const contentRef = useRef(null)
    const fullCoverRef = useRef(null)

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

    const saveCoverDesign = useCallback((newSettings) => {
        setSaveStatus('saving')
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(async () => {
            try {
                await setDoc(doc(db, 'weddings', weddingId), { coverDesign: sanitize(newSettings) }, { merge: true })
                setSaveStatus('saved')
                setTimeout(() => setSaveStatus('idle'), 2500)
            } catch (err) {
                console.error('Failed to save cover design:', err)
                setSaveStatus('idle')
            }
        }, 800)
    }, [weddingId])

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
            alert(`ההזמנה נוצרה בהצלחה! 🎉\nמספר הזמנה: ${data.printJobId}\nהספר בדרך אליכם.`)
        } catch (error) {
            console.error('Print order error:', error)
            setPrintStatus('error')
            alert(`אירעה שגיאה: ${error.message}\nנסו שוב מאוחר יותר.`)
        } finally {
            setIsGenerating(false)
            setTimeout(() => setPrintStatus('idle'), 1000)
        }
    }

    if (loading || designLoading) return (
        <div className='flex h-[calc(100vh-64px)] items-center justify-center bg-gradient-to-br from-[#F5F5F5] via-[#f0ebe3] to-[#ebe5da]'>
            <div className='flex flex-col items-center gap-6'>
                <div className='flex items-center justify-center'>
                    <div className='animate-spin rounded-full h-12 w-12 border-[3px] border-[#AA8840]/20 border-t-[#c9a44e] shadow-lg shadow-[#AA8840]/10' />
                </div>
                <div className='text-center'>
                    <p className='text-sm text-gray-600 font-bold tracking-wide'>טוען את עיצוב הכריכה...</p>
                    <p className='text-xs text-gray-400 mt-2'>רגע אחד בלבד</p>
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
                dir='rtl'
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
                                        styleSettings={styleSettings}
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
                                            styleSettings={styleSettings}
                                            scaledWidth={viewerSize}
                                            scaledHeight={viewerSize}
                                        />
                                    </div>
                                ))}
                                <div className='demo-page shadow-inner'>
                                    <BookCoverTemplate
                                        styleSettings={styleSettings}
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
                                            {printStatus === 'generating' && 'מייצר קבצי PDF...'}
                                            {printStatus === 'uploading' && 'מעלה קבצים...'}
                                            {printStatus === 'ordering' && 'שולח להדפסה...'}
                                            {printStatus === 'done' && 'ההזמנה נוצרה!'}
                                            {printStatus === 'error' && 'שגיאה'}
                                            {printStatus === 'idle' && 'מעבד...'}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <span className='text-sm font-bold tracking-wide'>שליחה להדפסה</span>
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
                                styleSettings={styleSettings}
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
                                styleSettings={styleSettings}
                                scaledWidth={panelWidthPx}
                                scaledHeight={spreadDisplayHeight}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </AdminPageWrapper>
    )
}
