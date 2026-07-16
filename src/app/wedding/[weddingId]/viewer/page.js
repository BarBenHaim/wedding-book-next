'use client'

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import HTMLFlipBook from 'react-pageflip'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage, db } from '@/lib/firebaseClient'
import { doc, getDoc, setDoc } from 'firebase/firestore'
// html2canvas + jsPDF are ~400 KB combined and only used by the
// admin's "Send to Lulu" + "Download PDFs" flows — never by normal
// viewing. Dynamically imported inside the handlers below so a
// regular viewer load never pays for them.

import DesignControls from '../../../../components/DesignControls/DesignControls'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import BookCoverTemplate from '@/components/BookCoverTemplate/BookCoverTemplate'
import BookBackCoverTemplate from '@/components/BookBackCoverTemplate/BookBackCoverTemplate'
import { expandBookPages } from '@/lib/bookPages'
import PrintOrderModal from '@/components/PrintOrderModal/PrintOrderModal'
import { getEntries } from '../../../../lib/classifyMedia'
import defaultStyle, { resolveInteriorDesign } from '@/app/wedding/[weddingId]/viewer/defaultStyle'
import { applyPresetClean } from '@/lib/bookDesignSchema'
import { listPresets, resolvePreset, filterPresetsByEventType, BUILTIN_PRESETS } from '@/lib/studioPresets'
import { BOOK_FORMATS, resolveFormatConfig } from '@/lib/bookFormats'
import { NextIntlClientProvider, useTranslations, useLocale } from 'next-intl'
import { getMessages } from '@/i18n/getMessages'
import { normalizeLocale } from '@/i18n/locales'
import BookLoader from '@/components/BookLoader/BookLoader'

// --- הגדרות דפוס (LULU COMPLIANT) ---
//
// The live "שליחה להדפסה" flow ships every order under POD package
// 0850X0850FCPREPB060UW444GXX (Lulu PB 8.5×8.5" Premium) — see
// /api/lulu/create-order. So both the content and cover dimensions
// here must match THAT specific format's spec from bookFormats.js
// (the source of truth). The content config is static (every page is
// the same trim + bleed); the cover config depends on page count
// because spine width grows with the book — that's computed inside
// BookViewerInner via useMemo.
//
// 1. תוכן הספר (Content) - ריבוע 8.75" × 8.75" (trim + bleed each side)
const CONTENT_CONFIG = {
    widthMM: BOOK_FORMATS.classic.content.widthMM,   // 222.25
    heightMM: BOOK_FORMATS.classic.content.heightMM, // 222.25
    dpi: BOOK_FORMATS.classic.content.dpi,           // 300
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
    // styleSettings drives the page interior (BookPageTemplate).
    // Picking a preset in book mode mutates this slice only.
    const [styleSettings, setStyleSettings] = useState(defaultStyle)
    // coverStyleSettings drives the FRONT cover (BookCoverTemplate).
    // It's pinned to whatever the owner saved as `wedding.coverDesign`
    // — switching presets in book mode does NOT touch it, so the
    // names + cover image + cover typography the user explicitly
    // configured stay locked. Only edits made while mode === 'cover'
    // mutate this slice.
    const [coverStyleSettings, setCoverStyleSettings] = useState(defaultStyle)
    // Hold the raw wedding doc so the cover template can derive the
    // default "ספר הברכות של {names}" content from eventType +
    // brideName/groomName/celebrantName when no custom cover content
    // is set. Mirrors the pattern in /book/[token]/page.js.
    const [weddingDoc, setWeddingDoc] = useState(null)
    // LIVE PRESET LINK — when the wedding is linked to a studio preset
    // (bookDesignPresetId), the interior follows the preset's CURRENT
    // values, so studio edits show up here immediately. A manual edit
    // in this session detaches (userTouchedDesignRef + save clears it).
    const [livePresets, setLivePresets] = useState(null)
    const userTouchedDesignRef = useRef(false)
    useEffect(() => {
        let cancelled = false
        listPresets({}).then(list => { if (!cancelled && Array.isArray(list)) setLivePresets(list) }).catch(() => {})
        return () => { cancelled = true }
    }, [])
    useEffect(() => {
        if (userTouchedDesignRef.current) return
        const linkedId = weddingDoc?.bookDesignPresetId
        if (!linkedId || !Array.isArray(livePresets)) return
        const linked = livePresets.find(p => p.id === linkedId)
        if (!linked) return
        const live = applyPresetClean(resolvePreset(linked).values || {})
        setStyleSettings(prev => (JSON.stringify(prev) === JSON.stringify(live) ? prev : live))
    }, [livePresets, weddingDoc])
    // Inject the wedding's locale into styleSettings so BookPageTemplate
    // and the page layouts (Notebook, Collage) can read it and set their
    // own dir + use the right logical CSS resolution. MUST be declared
    // here, alongside other top-level hooks — placing it after any early
    // return below would violate the rules of hooks (different render
    // paths returned different hook counts on first vs. second render).
    const styleWithLocale = useMemo(() => ({ ...styleSettings, locale }), [styleSettings, locale])
    // Smart auto-split pagination (optional, per-design): a long blessing +
    // photo becomes a blessing-only page followed by a photo-only page; short
    // ones stay combined. `pages` is already in flip order, and the split
    // keeps each blessing's two pages adjacent, so order stays correct.
    const displayPages = useMemo(
        () => expandBookPages(pages, { autoSplit: styleSettings.autoSplit, splitThreshold: styleSettings.splitThreshold, entriesPerPage: styleSettings.entriesPerPage }),
        [pages, styleSettings.autoSplit, styleSettings.splitThreshold, styleSettings.entriesPerPage]
    )
    // Cover-only style merged with locale, used by BookCoverTemplate
    // so dir/RTL behavior matches the body without leaking the book's
    // typography changes.
    const coverStyleWithLocale = useMemo(
        () => ({ ...coverStyleSettings, locale }),
        [coverStyleSettings, locale]
    )

    // Dynamic cover config — Lulu's PB cover is wider for thicker books
    // because the spine grows with page count (0.0572 mm/page for the
    // 60# UW paper this POD uses). The previous static COVER_CONFIG
    // (482.6 × 260.35 mm with a fixed 6.35 mm spine) didn't match Lulu's
    // PB spec at any page count and didn't track spine thickness, so
    // every printed cover had its spine landing in the wrong place.
    // We now compute the cover from the same source-of-truth used by
    // the super-admin Download PDFs flow (BOOK_FORMATS.classic).
    // Falls back to minPages while pages are loading so the in-viewer
    // cover preview has a sensible spine even before data arrives.
    const coverConfig = useMemo(
        () =>
            BOOK_FORMATS.classic.cover.compute(
                pages.length || BOOK_FORMATS.classic.minPages
            ),
        [pages.length]
    )
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
    // Ref into the book mode HTMLFlipBook so the prev/next buttons
    // below the book can call flipNext / flipPrev programmatically.
    const flipRef = useRef(null)

    useEffect(() => {
        const init = async () => {
            if (!weddingId) return
            // Fire both reads in parallel — they're independent and
            // were costing us a serialized RTT before. Promise.allSettled
            // so an entries failure (e.g. a Firestore rules issue) can
            // still let the cover design load, and vice versa.
            const [entriesResult, weddingResult] = await Promise.allSettled([
                getEntries(weddingId),
                getDoc(doc(db, 'weddings', weddingId)),
            ])

            // ── Entries ──
            if (entriesResult.status === 'fulfilled') {
                setPages(entriesResult.value.reverse())
            } else {
                console.error('Failed to load entries:', entriesResult.reason)
                setPages([])
            }
            setLoading(false)

            // ── Cover design / wedding doc ──
            try {
                if (weddingResult.status === 'fulfilled' && weddingResult.value.exists()) {
                    const firestoreData = weddingResult.value.data()
                    // Bubble the doc's locale up to the outer provider so
                    // every chrome string (DesignControls, viewer status
                    // messages) speaks the wedding's configured language.
                    onLocaleDiscovered(normalizeLocale(firestoreData.locale))
                    // Stash the doc so BookCoverTemplate can pull
                    // eventType + names for its default content.
                    setWeddingDoc(firestoreData)
                    // Split-state hydration: bookDesign drives the page
                    // interior; coverDesign drives the front cover.
                    // Backward-compat: weddings created before this
                    // split only have `coverDesign`, so we use it for
                    // BOTH the first time.
                    // Interior pages: bookDesign, else coverDesign WITHOUT its
                    // imageStyle (the cover's photo size shrinks interior photos
                    // and leaves a gap — see resolveInteriorDesign).
                    const savedBook = resolveInteriorDesign(firestoreData)
                    const savedCover = firestoreData.coverDesign || firestoreData.bookDesign
                    if (savedBook) {
                        // Canonical fill — legacy/partial designs get every
                        // missing key from the canonical defaults, so the
                        // interior renders identically on every device.
                        setStyleSettings(applyPresetClean(savedBook))
                    } else if (typeof window !== 'undefined') {
                        const savedStyle = localStorage.getItem('bookStyle')
                        if (savedStyle) setStyleSettings(JSON.parse(savedStyle))
                    }
                    if (savedCover) {
                        setCoverStyleSettings({ ...defaultStyle, ...savedCover })
                    }
                } else if (weddingResult.status === 'rejected') {
                    console.error('Failed to load cover design:', weddingResult.reason)
                }
            } finally {
                setDesignLoading(false)
            }
        }
        init()
    }, [weddingId])

    const calculateBookSize = useCallback(() => {
        const w = window.innerWidth
        const h = window.innerHeight
        const mobile = w < 1024
        setIsMobile(mobile)

        // Vertical budget on mobile:
        //   • 64 px global header
        //   • 80 px top preset strip (thumbnail row, the user's
        //     primary control — kept always-visible per their ask)
        //   • ~40 px page-flip controls under the book
        // → ~184 reserved around the book on mobile, leaving roughly
        // 483 px square on iPhone SE — comfortably fits without
        // clipping. Desktop reserves the same ~160 around the book
        // for the right-rail design panel.
        const SIDEBAR_W = 380
        const availableWidth = mobile ? w - 20 : w - SIDEBAR_W - 60
        const availableHeight = mobile ? h - 184 : h - 160

        const optimalSize =
            mobile ? Math.min(availableWidth, availableHeight) : Math.min(availableWidth / 2, availableHeight)

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

    // Saves the design slice that's currently being edited. `target`
    // is 'cover' or 'book' — Firestore field swaps to coverDesign or
    // bookDesign respectively. Cover-image migration only runs when
    // saving the cover (bookDesign never carries a coverImage).
    const saveDesign = useCallback((newSettings, target) => {
        setSaveStatus('saving')
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(async () => {
            try {
                let settingsToSave = newSettings
                if (target === 'cover') {
                    const migratedUrl = await migrateCoverImageIfNeeded(newSettings.coverImage)
                    settingsToSave =
                        migratedUrl !== newSettings.coverImage
                            ? { ...newSettings, coverImage: migratedUrl }
                            : newSettings
                    if (migratedUrl !== newSettings.coverImage) {
                        setCoverStyleSettings(prev => ({ ...prev, coverImage: migratedUrl }))
                    }
                }
                const field = target === 'cover' ? 'coverDesign' : 'bookDesign'
                const payload = { [field]: sanitize(settingsToSave) }
                if (target === 'book') {
                    // LIVE LINK bookkeeping — link ONLY on full canonical
                    // equality with a preset (i.e. a pure preset pick).
                    // Any owner tweak — even one slider — breaks equality
                    // and detaches, so studio edits never override work a
                    // couple did on purpose. (A loose signature match here
                    // would have re-linked margin-tweaked designs and wiped
                    // the tweaks on the next studio edit.)
                    const savedCanon = JSON.stringify(applyPresetClean(settingsToSave))
                    const match = (Array.isArray(livePresets) ? livePresets : []).find(
                        p => JSON.stringify(applyPresetClean(resolvePreset(p).values || {})) === savedCanon
                    )
                    payload.bookDesignPresetId = match?.id || null
                }
                await setDoc(
                    doc(db, 'weddings', weddingId),
                    payload,
                    { merge: true }
                )
                setSaveStatus('saved')
                setTimeout(() => setSaveStatus('idle'), 2500)
            } catch (err) {
                console.error('Failed to save design:', err?.message || err)
                setSaveStatus('idle')
            }
        }, 800)
    }, [weddingId, migrateCoverImageIfNeeded, livePresets])

    // handleStyleChange routes updates by mode: cover edits flow into
    // coverStyleSettings + Firestore.coverDesign; book edits into
    // styleSettings + Firestore.bookDesign. This is why picking a
    // preset in book mode no longer mutates the cover.
    const handleStyleChange = updated => {
        if (mode === 'cover') {
            const newSettings = { ...coverStyleSettings, ...updated }
            setCoverStyleSettings(newSettings)
            saveDesign(newSettings, 'cover')
        } else {
            // The owner is actively shaping the interior — stop the
            // live-link effect from overriding their in-session work.
            // The save below re-links or detaches by signature.
            userTouchedDesignRef.current = true
            const newSettings = { ...styleSettings, ...updated }
            setStyleSettings(newSettings)
            saveDesign(newSettings, 'book')
        }
    }

    // --- יצירת PDF גנרית (מקבלת קונפיגורציה) ---
    const generatePdfFromRef = async (elementRef, fileNamePrefix, config) => {
        if (!elementRef.current) return null

        // Dynamic-import the heavy PDF deps the first time the admin
        // actually generates a PDF. Keeps these ~400 KB off every
        // viewer's initial bundle. The libs are cached after the
        // first call (Next handles that), so subsequent generations
        // don't re-pay the import cost.
        const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
            import('html2canvas'),
            import('jspdf'),
        ])

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

        // Same dynamic-import as generatePdfFromRef — see the comment
        // there for the rationale. Module cache means this is free
        // on the second + subsequent generation.
        const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
            import('html2canvas'),
            import('jspdf'),
        ])

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
            const coversUrl = await generatePdfFromRef(fullCoverRef, 'WeddingBook-Covers', coverConfig)

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

    if (loading || designLoading) return <BookLoader label={t('loadingCover')} />

    const hasCover = styleSettings.coverTitle || styleSettings.coverImage

    // --- חישובים לאזור הנסתר ---

    // 1. מידות תוכן
    const contentDisplayWidth = 800
    const contentAspectRatio = CONTENT_CONFIG.widthMM / CONTENT_CONFIG.heightMM

    // 2. מידות כריכה (Spread)
    // נשתמש ברוחב תצוגה גדול כדי שיהיה נוח לרינדור
    const spreadDisplayWidth = 1200
    const spreadAspectRatio = coverConfig.widthMM / coverConfig.heightMM
    const spreadDisplayHeight = spreadDisplayWidth / spreadAspectRatio

    // חישוב יחסי רוחב בתוך ה-Spread (באחוזים או יחסים)
    // רוחב כל צד (קדמי/אחורי) במ"מ
    const coverPanelWidthMM = (coverConfig.widthMM - coverConfig.spineMM) / 2

    // המרה לפיקסלים בתוך ה-Container של ה-DOM
    const pxPerMM = spreadDisplayWidth / coverConfig.widthMM
    const panelWidthPx = coverPanelWidthMM * pxPerMM
    const spineWidthPx = coverConfig.spineMM * pxPerMM

    return (
        <AdminPageWrapper>
            <div
                dir={locale === 'he' ? 'rtl' : 'ltr'}
                // h-[calc(100dvh-64px)] uses the dynamic-viewport unit
                // so the outer container exactly matches the visible
                // area as mobile browser chrome (URL bar) shows / hides.
                // 64px is the global Header sitting above this div.
                //
                // flex-col-reverse on mobile used to place the aside
                // below the book in-flow; the aside is now a fixed-
                // Mobile uses flex-col (preset strip on top, book below);
                // desktop keeps the original side-by-side rail layout.
                className='relative flex flex-col lg:flex-row h-[calc(100dvh-64px)] overflow-hidden bg-gradient-to-br from-[#F5F5F5] via-[#f0ebe3] font-sans'
            >
                {/* MOBILE — top preset strip. Horizontal scroll of mini
                    book-page previews, ~64 px tall. Replaces the
                    bottom-sheet pattern (35f0bc6): the user asked for
                    presets to be always-visible at the top, not behind
                    a button. Hidden on desktop where the right-rail
                    DesignControls already exposes the gallery in the
                    Card. */}
                {isMobile && (
                    <MobilePresetStrip
                        styleSettings={styleSettings}
                        onApply={vals => handleStyleChange(vals)}
                        eventType={weddingDoc?.eventType}
                    />
                )}

                {/* DESKTOP — full side rail with the design controls.
                    Hidden entirely on mobile (the mobile preset strip
                    above covers the couple's primary need; the rest of
                    DesignControls is admin-only via isAdmin=false). */}
                <aside
                    className='hidden lg:flex relative z-20 flex-col shrink-0 h-full w-[380px] bg-white/80 backdrop-blur-md border-l border-white/50'
                >
                    <div className='flex-1 min-h-0 overflow-hidden'>
                        <DesignControls
                            settings={mode === 'cover' ? coverStyleSettings : styleSettings}
                            onChange={handleStyleChange}
                            mode={mode}
                            onModeChange={setMode}
                            saveStatus={saveStatus}
                            weddingId={weddingId}
                            locale={locale}
                            eventType={weddingDoc?.eventType}
                        />
                    </div>
                </aside>

                <main
                    // Centered on both axes: mobile (preset strip
                    // above + book below) and desktop (book filling
                    // the remaining width to the right of the rail).
                    // The flex centering plus min-h-0 lets the book
                    // sit in the middle of whatever vertical space
                    // remains without overflowing the parent.
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
                                        wedding={{
                                            eventType: weddingDoc?.eventType,
                                            brideName: weddingDoc?.brideName,
                                            groomName: weddingDoc?.groomName,
                                            celebrantName: weddingDoc?.celebrantName,
                                            customTitle: weddingDoc?.customTitle,
                                            age: weddingDoc?.age,
                                        }}
                                        styleSettings={coverStyleWithLocale}
                                        scaledWidth={viewerSize}
                                        scaledHeight={viewerSize}
                                    />
                                </div>
                            </HTMLFlipBook>
                        ) : (
                            <HTMLFlipBook
                                ref={flipRef}
                                // Include pages.length in the key so the
                                // book remounts when entries finish
                                // loading — startPage is an INITIAL
                                // value in react-pageflip, not reactive,
                                // so we need the fresh mount to land on
                                // the FrontCover (which is now the LAST
                                // child after the RTL reversal below).
                                key={`${viewerSize}-${isMobile}-${displayPages.length}`}
                                width={viewerSize}
                                height={viewerSize}
                                size='fixed'
                                usePortrait={isMobile}
                                showCover={true}
                                // Land on FrontCover (which sits at the
                                // end of the reversed array). When pages
                                // is empty (still loading), there's no
                                // entry to land on, so we fall back to 0
                                // which shows BackCover — the remount
                                // triggered by the key change above
                                // bumps us to the FrontCover once data
                                // arrives.
                                startPage={displayPages.length + 1}
                                mobileScrollSupport={true}
                                className='book-flip'
                                drawShadow={false}
                                flippable={true}
                            >
                                {/* RTL reading order:
                                      BackCover (index 0)
                                      → entries (1 … N)
                                      → FrontCover (index N+1)
                                    Combined with startPage={N+1}, the
                                    book opens on the FrontCover but
                                    "going forward in the reading" =
                                    decreasing index = flipPrev. The
                                    left-pointing chevron in the arrow
                                    row below is wired to flipPrev so
                                    its visual direction matches the
                                    user's mental "next page" action
                                    in a Hebrew book.

                                    react-pageflip has no native RTL
                                    flag (checked the .d.ts) so the
                                    flip animation itself still peels
                                    LTR — we get RTL semantics via
                                    array reversal + arrow handlers,
                                    the page-turn animation is the
                                    library's fixed visual. */}
                                <div className='demo-page shadow-inner'>
                                    <BookBackCoverTemplate scaledWidth={viewerSize} scaledHeight={viewerSize} />
                                </div>
                                {displayPages.map(entry => (
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
                                        wedding={{
                                            eventType: weddingDoc?.eventType,
                                            brideName: weddingDoc?.brideName,
                                            groomName: weddingDoc?.groomName,
                                            celebrantName: weddingDoc?.celebrantName,
                                            customTitle: weddingDoc?.customTitle,
                                            age: weddingDoc?.age,
                                        }}
                                        styleSettings={coverStyleWithLocale}
                                        scaledWidth={viewerSize}
                                        scaledHeight={viewerSize}
                                    />
                                </div>
                            </HTMLFlipBook>
                        )}
                    </div>

                    {/* Prev/next arrows below the book — useful on
                        mobile (no keyboard) and a nice extra on
                        desktop too. Hidden in cover mode (single
                        page, nothing to flip). */}
                    {mode === 'book' && (
                        <div className='flex items-center gap-3 mt-4 z-30'>
                            {/* Hebrew RTL convention — book opens
                                right-to-left, so PREVIOUS page is to
                                the right (where you came from) and
                                NEXT page is to the left (where you're
                                going). The flex container is in an
                                RTL context, so the first child renders
                                on the visual RIGHT (= "previous"
                                position) and the second on the LEFT
                                (= "next" position). The arrow on the
                                right button points RIGHT (→) so the
                                visual cue matches the action; the
                                left button's arrow points LEFT (←).
                                Was reversed before this fix. */}
                            <button
                                onClick={() => flipRef.current?.pageFlip().flipNext()}
                                aria-label='הבא'
                                className='inline-flex items-center justify-center transition-all hover:scale-105 active:scale-95'
                                style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.92)',
                                    border: '1px solid rgba(170,136,64,0.35)',
                                    color: '#aa8840',
                                    boxShadow: '0 4px 12px -4px rgba(45,30,16,0.18)',
                                    backdropFilter: 'blur(8px)',
                                }}
                            >
                                <svg viewBox='0 0 24 24' className='w-[18px] h-[18px]' fill='none' stroke='currentColor' strokeWidth={1.8}>
                                    <path strokeLinecap='round' strokeLinejoin='round' d='M9 5l7 7-7 7' />
                                </svg>
                            </button>
                            <button
                                onClick={() => flipRef.current?.pageFlip().flipPrev()}
                                aria-label='הקודם'
                                className='inline-flex items-center justify-center transition-all hover:scale-105 active:scale-95'
                                style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.92)',
                                    border: '1px solid rgba(170,136,64,0.35)',
                                    color: '#aa8840',
                                    boxShadow: '0 4px 12px -4px rgba(45,30,16,0.18)',
                                    backdropFilter: 'blur(8px)',
                                }}
                            >
                                <svg viewBox='0 0 24 24' className='w-[18px] h-[18px]' fill='none' stroke='currentColor' strokeWidth={1.8}>
                                    <path strokeLinecap='round' strokeLinejoin='round' d='M15 19l-7-7 7-7' />
                                </svg>
                            </button>
                        </div>
                    )}

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
                    {displayPages.map(entry => (
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
                                styleSettings={coverStyleWithLocale}
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
                        {displayPages.map(entry => {
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
                                            styleSettings={coverStyleWithLocale}
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
                                <BookLoader fullScreen={false} size={150} />
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

// ── Mobile preset strip ─────────────────────────────────────────────
// Top-of-viewport row of mini book-page previews, always visible on
// mobile (no toggle, no button to press). Each tile renders an actual
// <BookPageTemplate /> at small scale using the preset's resolved
// values so the user picks by sight, not by name.
//
// Reads the live list from Firestore via listPresets() with the
// hardcoded BUILTIN_PRESETS as the offline fallback — same path
// DesignControls uses. Apply mutates the wedding doc through the
// parent's onApply (which is handleStyleChange → saveCoverDesign).
//
// Tile size: 64×64 — enough to show the typography, background, and
// photo placement, small enough that four tiles fit across an iPhone
// SE without scrolling. More than four overflow horizontally with a
// scroll-snap row (thumb-friendly).
// `eventType` filters the strip to presets tagged for this wedding's
// event type + generic (untagged) ones — same rule as every other
// couple-facing gallery.
function MobilePresetStrip({ styleSettings, onApply, eventType }) {
    const [presets, setPresets] = useState(() => filterPresetsByEventType(BUILTIN_PRESETS, eventType))

    useEffect(() => {
        let cancelled = false
        listPresets({ eventType }).then(list => {
            if (!cancelled && Array.isArray(list) && list.length > 0) setPresets(list)
        })
        return () => { cancelled = true }
    }, [eventType])

    // Identify which preset is currently active by signature-matching
    // the wedding's styleSettings against each preset's resolved
    // values — same shape DesignControls uses. Cheaper than a deep
    // compare and resilient to defaultStyle merging.
    const activeKey = useMemo(() => {
        for (const p of presets) {
            const v = resolvePreset(p).values || {}
            if (
                v.backgroundColor === styleSettings.backgroundColor &&
                v.fontClass === styleSettings.fontClass &&
                v.texture === styleSettings.texture &&
                v.template === styleSettings.template
            ) {
                return p.id || p.name
            }
        }
        return null
    }, [presets, styleSettings])

    const TILE = 56

    return (
        <div
            className='lg:hidden shrink-0 w-full bg-white/80 backdrop-blur-md border-b border-[#ead9b3]'
            style={{ paddingBlock: 8 }}
        >
            <div
                className='flex items-center gap-2 overflow-x-auto px-3'
                style={{
                    scrollbarWidth: 'none',
                    WebkitOverflowScrolling: 'touch',
                    scrollSnapType: 'x mandatory',
                }}
            >
                {presets.map(preset => {
                    const presetKey = preset.id || preset.name
                    const isActive = activeKey === presetKey
                    const resolved = resolvePreset(preset).values || {}
                    // Canonical fill — the tile must promise EXACTLY what
                    // applying the preset will deliver (same resolution as
                    // the interior render).
                    const previewStyle = applyPresetClean(resolved)
                    return (
                        <button
                            key={presetKey}
                            type='button'
                            onClick={() => onApply(resolved)}
                            title={preset.name}
                            aria-label={preset.name}
                            className={`shrink-0 relative rounded-md overflow-hidden transition-all active:scale-95 ${
                                isActive
                                    ? 'ring-2 ring-[#AA8840]'
                                    : 'ring-1 ring-[#ead9b3]'
                            }`}
                            style={{ width: TILE, height: TILE, scrollSnapAlign: 'start' }}
                        >
                            <BookPageTemplate
                                entry={MOBILE_STRIP_MOCK_ENTRY}
                                styleSettings={previewStyle}
                                scaledWidth={TILE}
                                scaledHeight={TILE}
                            />
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

// Mock entry for the mobile preset strip — same shape DesignControls'
// gallery uses. Tiny placeholder photo, short blessing, generic name.
const MOBILE_STRIP_MOCK_ENTRY = {
    id: 'viewer-mobile-strip-mock',
    name: 'יעל ויואב',
    text: 'ברכה',
    imageUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f5d39e"/><stop offset="100%" stop-color="#d8b986"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><path d="M0 220 Q100 170 200 200 T 400 210 V 300 H 0 Z" fill="#a87f4b"/></svg>'
    )}`,
}
