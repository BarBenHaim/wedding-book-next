'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import HTMLFlipBook from 'react-pageflip'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebaseClient'

/* --- רכיבים פנימיים --- */
import DesignControls from '../../../../components/DesignControls/DesignControls'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import BookCoverTemplate from '@/components/BookCoverTemplate/BookCoverTemplate'
import BookBackCoverTemplate from '@/components/BookBackCoverTemplate/BookBackCoverTemplate'

/* --- לוגיקה ונתונים --- */
import { getEntries } from '../../../../lib/classifyMedia'
import defaultStyle from '@/app/wedding/[weddingId]/viewer/defultStyle'

export default function BookViewer() {
    const { weddingId } = useParams()

    // --- State ---
    const [pages, setPages] = useState([])
    const [loading, setLoading] = useState(true)
    const [mode, setMode] = useState('book')
    const [viewerSize, setViewerSize] = useState(500)
    const [baseSize] = useState(2362)
    const [isMobile, setIsMobile] = useState(false)
    const [styleSettings, setStyleSettings] = useState(defaultStyle)

    const hiddenRef = useRef(null)

    // --- טעינה ---
    useEffect(() => {
        const init = async () => {
            if (typeof window !== 'undefined') {
                const savedStyle = localStorage.getItem('bookStyle')
                if (savedStyle) setStyleSettings(JSON.parse(savedStyle))
            }
            if (weddingId) {
                const data = await getEntries(weddingId)
                setPages(data.reverse())
                setLoading(false)
            }
        }
        init()
    }, [weddingId])

    // --- חישוב גודל ---
    const calculateBookSize = useCallback(() => {
        const w = window.innerWidth
        const h = window.innerHeight
        const mobile = w < 1024
        setIsMobile(mobile)

        const HEADER_H = 64
        const SIDEBAR_W = 380
        const PADDING_TOP = 60 // רווח מלמעלה
        const PADDING_BOTTOM = 100 // רווח לכפתור

        const availableWidth = mobile ? w - 20 : w - SIDEBAR_W - 60
        const availableHeight = h - HEADER_H - PADDING_TOP - PADDING_BOTTOM

        let optimalSize = 0

        if (mobile) {
            optimalSize = Math.min(availableWidth, availableHeight)
        } else {
            // בדסקטופ הספר כפול
            optimalSize = Math.min(availableWidth / 2, availableHeight)
        }

        setViewerSize(Math.floor(Math.min(Math.max(optimalSize, 280), 750)))
    }, [])

    useEffect(() => {
        calculateBookSize()
        window.addEventListener('resize', calculateBookSize)
        return () => window.removeEventListener('resize', calculateBookSize)
    }, [calculateBookSize])

    const handleStyleChange = updated => {
        const newSettings = { ...styleSettings, ...updated }
        setStyleSettings(newSettings)
        if (typeof window !== 'undefined') localStorage.setItem('bookStyle', JSON.stringify(newSettings))
    }

    const handleSendToEmail = async () => {
        alert('כאן תופעל יצירת ה-PDF')
    }

    if (loading)
        return (
            <div className='flex flex-col items-center justify-center h-screen bg-gradient-to-br from-purple-50 via-white to-purple-100'>
                <div className='animate-spin rounded-full h-8 w-8 border-[3px] border-purple-200 border-t-purple-600 mb-4 shadow-sm'></div>
                <p className='text-purple-900 font-medium tracking-wide'>טוען את הספר...</p>
            </div>
        )

    const hasCover = styleSettings.coverTitle || styleSettings.coverImage

    return (
        <AdminPageWrapper>
            {/* רקע: Gradient כמו ב-WeddingHome 
                מבנה: RTL + Flex 
            */}
            <div
                dir='rtl'
                className='relative flex flex-col-reverse lg:flex-row h-[calc(100vh-64px)] overflow-hidden bg-gradient-to-br from-purple-50 font-sans'
            >
                {/* --- Glow Effects (כמו ב-WeddingHome) --- */}

                {/* --- צד ימין: סרגל כלים --- */}
                <aside
                    className={`
                    relative z-20 flex flex-col shrink-0 
                    bg-white/80 backdrop-blur-md border-l border-white/50  transition-all
                    ${isMobile ? 'h-[350px] w-full border-t rounded-t-3xl' : 'h-full w-[380px]'}
                `}
                >
                    <div className='h-full overflow-hidden'>
                        <DesignControls
                            settings={styleSettings}
                            onChange={handleStyleChange}
                            mode={mode}
                            onModeChange={setMode}
                        />
                    </div>
                </aside>

                {/* --- צד שמאל: אזור התצוגה --- */}
                <main
                    className={`
                    relative z-10 flex-1 flex flex-col p-6 overflow-hidden transition-all duration-500 ease-in-out
                    
                    /* 🔥 לוגיקת יישור משופרת: */
                    ${
                        isMobile
                            ? 'items-center justify-center' // במובייל: תמיד ממורכז!
                            : mode === 'book'
                            ? 'items-start justify-start pt-12 px-10' // דסקטופ ספר: מוצמד להתחלה
                            : 'items-center justify-center' // דסקטופ כריכה: ממורכז
                    }
                `}
                >
                    {/* תווית "תצוגה מקדימה" */}
                    <div
                        className={`
                        absolute z-10 pointer-events-none transition-all duration-500
                        ${mode === 'book' ? 'top-4 right-8 opacity-60' : 'top-8 opacity-80'}
                    `}
                    >
                        <span
                            className='
                            bg-white/60 backdrop-blur-sm text-purple-900 px-4 py-1.5 rounded-full text-xs font-bold 
                            shadow-sm ring-1 ring-purple-100/50 flex items-center gap-2
                        '
                        >
                            <span className='relative flex h-2 w-2'>
                                <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75'></span>
                                <span className='relative inline-flex rounded-full h-2 w-2 bg-pink-500'></span>
                            </span>
                            תצוגה מקדימה
                        </span>
                    </div>

                    {/* קונטיינר הספר */}
                    <div
                        className='relative transition-all duration-700 ease-out  rounded-sm shrink-0'
                        style={{
                            width: viewerSize,
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
                                <div className='demo-page  shadow-inner'>
                                    <BookBackCoverTemplate scaledWidth={viewerSize} scaledHeight={viewerSize} />
                                </div>
                                {pages.map(entry => (
                                    <div key={entry.id} className='demo-page  border-l border-purple-50/30'>
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

                    {/* 🔥 כפתור הדפסה גרדיאנט צבעוני (כמו ב-WeddingHome)
                        ממוקם קבוע במרכז למטה */}
                    {!isMobile && (
                        <div className='absolute bottom-8 left-1/2 -translate-x-1/2 z-30'>
                            <button
                                onClick={handleSendToEmail}
                                className='
                                    group flex items-center gap-3 
                                    bg-gradient-to-r from-purple-600 to-pink-500 text-white 
                                    px-8 py-3 rounded-xl shadow-lg shadow-purple-500/20 
                                    cursor-pointer transition-all duration-300 transform
                                    hover:scale-105 hover:shadow-purple-500/40
                                '
                            >
                                <span className='text-sm font-bold tracking-wide'>שליחה להדפסה</span>
                                <span className='text-xl group-hover:rotate-12 transition-transform duration-300'></span>
                            </button>
                        </div>
                    )}
                </main>
            </div>

            {/* --- PDF Render Area --- */}
            <div
                ref={hiddenRef}
                aria-hidden='true'
                style={{
                    position: 'fixed',
                    left: '-9999px',
                    top: 0,
                    width: baseSize,
                    height: baseSize,
                    overflow: 'hidden',
                }}
            >
                <div className='page-for-pdf' style={{ width: baseSize, height: baseSize }}>
                    <BookBackCoverTemplate scaledWidth={baseSize} scaledHeight={baseSize} />
                </div>
                {pages.map(entry => (
                    <div key={entry.id} className='page-for-pdf' style={{ width: baseSize, height: baseSize }}>
                        <BookPageTemplate
                            entry={entry}
                            styleSettings={styleSettings}
                            scaledWidth={baseSize}
                            scaledHeight={baseSize}
                        />
                    </div>
                ))}
                <div className='page-for-pdf' style={{ width: baseSize, height: baseSize }}>
                    <BookCoverTemplate styleSettings={styleSettings} scaledWidth={baseSize} scaledHeight={baseSize} />
                </div>
            </div>
        </AdminPageWrapper>
    )
}
