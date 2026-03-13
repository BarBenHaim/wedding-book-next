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
    const saveCoverDesign = useCallback((newSettings) => {
        setSaveStatus('saving')
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(async () => {
            try {
                await setDoc(doc(db, 'weddings', weddingId), { coverDesign: newSettings }, { merge: true })
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

    const handleSendToEmail = async () => {
        setIsGenerating(true)
        try {
            // 1. יצירת תוכן (Content) - דפים נפרדים
            const contentUrl = await generatePdfFromRef(contentRef, 'WeddingBook-Content', CONTENT_CONFIG)

            // 2. יצירת כריכה (Spread) - דף אחד רחב
            const coversUrl = await generatePdfFromRef(fullCoverRef, 'WeddingBook-Covers', COVER_CONFIG)

            if (!contentUrl || !coversUrl) throw new Error('Failed to generate PDFs')

            await fetch('/api/send-book-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ weddingId, contentUrl, coversUrl }),
            })

            alert('הספר נשלח בהצלחה! הקבצים הותאמו לדפוס.')
        } catch (error) {
            alert('אירעה שגיאה ביצירת הספר. נסה שוב.')
        } finally {
            setIsGenerating(false)
        }
    }

    if (loading || designLoading) return (
        <div className='flex h-[calc(100vh-64px)] items-center justify-center bg-gradient-to-br from-purple-50 via-white to-pink-50'>
            <div className='flex flex-col items-center gap-4'>
                <div className='animate-spin rounded-full h-10 w-10 border-[3px] border-purple-200 border-t-purple-600' />
                <p className='text-sm text-gray-400 font-medium'>טוען את עיצוב הכריכה...</p>
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
                className='relative flex flex-col-reverse lg:flex-row h-[calc(100vh-64px)] overflow-hidden bg-gradient-to-br from-purple-50 font-sans'
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
                    className={`relative z-10 flex-1 flex flex-col p-6 overflow-hidden transition-all duration-500 ease-in-out ${
                        isMobile
                            ? 'items-center justify-center'
                            : mode === 'book'
                            ? 'items-start justify-start pt-12 px-10'
                            : 'items-center justify-center'
                    }`}
                >
                    <div
                        className='relative transition-all duration-700 ease-out rounded-sm shrink-0'
                        style={{ width: viewerSize, height: viewerSize }}
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
                                    <div key={entry.id} className='demo-page border-l border-purple-50/30'>
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
                        <div className='absolute bottom-8 left-1/2 -translate-x-1/2 z-30'>
                            <button
                                onClick={handleSendToEmail}
                                disabled={isGenerating}
                                className={`group flex items-center gap-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white px-8 py-3 rounded-xl shadow-lg shadow-purple-500/20 transition-all duration-300 transform ${
                                    isGenerating
                                        ? 'opacity-80 cursor-not-allowed scale-95'
                                        : 'hover:scale-105 hover:shadow-purple-500/40 cursor-pointer'
                                }`}
                            >
                                {isGenerating ? (
                                    <>
                                        <div className='w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin'></div>
                                        <span className='text-sm font-bold tracking-wide'>מעבד קבצים...</span>
                                    </>
                                ) : (
                                    <>
                                        <span className='text-sm font-bold tracking-wide'>שליחה להדפסה</span>
                                        <span className='text-xl group-hover:rotate-12 transition-transform duration-300'>
                                            🖨️
                                        </span>
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </main>
            </div>

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
