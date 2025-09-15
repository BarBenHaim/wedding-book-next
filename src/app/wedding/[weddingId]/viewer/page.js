'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import HTMLFlipBook from 'react-pageflip'
import DesignControls from '../../../../components/DesignControls/DesignControls'
import { getEntries } from '../../../../lib/classifyMedia'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import defaultStyle from '@/app/wedding/[weddingId]/viewer/defultStyle'

import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

export default function BookViewer() {
    const [pages, setPages] = useState([])
    const [loading, setLoading] = useState(true)
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
    const [styleSettings, setStyleSettings] = useState(() =>
        typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('bookStyle')) || defaultStyle : defaultStyle
    )
    const hiddenRef = useRef(null)
    const { weddingId } = useParams()

    // יחס A4 landscape ב־300DPI
    const PRINT_WIDTH = 3508
    const PRINT_HEIGHT = 2480

    function getBookDimensions() {
        const screenWidth = window.innerWidth
        const width = screenWidth > 768 ? screenWidth * 0.35 : screenWidth * 0.85
        const height = width * (PRINT_HEIGHT / PRINT_WIDTH)
        return { width: Math.round(width), height: Math.round(height) }
    }

    useEffect(() => {
        setDimensions(getBookDimensions())
        async function fetchData() {
            if (!weddingId) return
            const data = await getEntries(weddingId)
            setPages(data)
            setLoading(false)
        }
        fetchData()

        const handleResize = () => {
            setDimensions(getBookDimensions())
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [weddingId])

    const handleStyleChange = updated => {
        const newSettings = { ...styleSettings, ...updated }
        setStyleSettings(newSettings)
        if (typeof window !== 'undefined') {
            localStorage.setItem('bookStyle', JSON.stringify(newSettings))
        }
    }

    async function handleDownloadPDF() {
        if (!hiddenRef.current) return
        const pageEls = hiddenRef.current.querySelectorAll('.page-for-pdf')

        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'px',
            format: [PRINT_WIDTH, PRINT_HEIGHT],
        })

        for (let i = 0; i < pageEls.length; i++) {
            const canvas = await html2canvas(pageEls[i], {
                scale: 2,
                useCORS: true,
                backgroundColor: '#fff',
            })
            const imgData = canvas.toDataURL('image/jpeg', 1.0)
            if (i > 0) pdf.addPage()
            pdf.addImage(imgData, 'JPEG', 0, 0, PRINT_WIDTH, PRINT_HEIGHT)
        }

        pdf.save('wedding-book.pdf')
    }

    if (loading) {
        return (
            <div className='flex h-[calc(100vh-4rem)] flex-col items-center justify-center bg-gradient-to-br from-purple-50 via-white to-purple-100 text-gray-700'>
                <div className='animate-spin rounded-full h-12 w-12 border-4 border-purple-400 border-t-transparent mb-4'></div>
                <p className='text-sm font-medium'>טוען את ספר הזיכרונות…</p>
            </div>
        )
    }

    return (
        <>
            {/* תצוגה רגילה */}
            <div className='relative flex h-[calc(100vh-4rem)] bg-gradient-to-br from-purple-50 via-white to-purple-100'>
                {/* Glow רקע */}
                <div className='absolute -top-24 left-0 h-72 w-72 rounded-full bg-purple-300/30 blur-3xl'></div>
                <div className='absolute bottom-0 right-0 h-96 w-96 rounded-full bg-pink-300/30 blur-3xl'></div>

                <main className='relative z-10 flex flex-1 items-center justify-center p-6 gap-6'>
                    {/* פאנל עיצוב */}
                    <aside className='hidden lg:block w-1/4 border-l border-gray-200 bg-white/80 backdrop-blur-md p-6 shadow-xl rounded-l-2xl'>
                        <h2 className='mb-6 text-xl font-bold text-gray-800'>עיצוב הספר</h2>
                        <DesignControls settings={styleSettings} onChange={handleStyleChange} />
                    </aside>

                    {/* ספר */}
                    <HTMLFlipBook width={dimensions.width} height={dimensions.height} size='fixed' drawShadow showCover>
                        {pages.map((entry, index) => (
                            <div key={index} className='page'>
                                <BookPageTemplate
                                    entry={entry}
                                    styleSettings={styleSettings}
                                    printMode={false} // מצב צפייה
                                />
                            </div>
                        ))}
                    </HTMLFlipBook>
                </main>
            </div>

            {/* כפתור הורדה */}
            <button
                onClick={handleDownloadPDF}
                className='w-full rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 px-4 py-3 text-white font-medium shadow hover:scale-105 transition'
            >
                📥 הורד כ־PDF
            </button>

            {/* גרסה מוסתרת להדפסה */}
            {/* גרסה מוסתרת להדפסה */}
            <div
                ref={hiddenRef}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: 0,
                    height: 0,
                    overflow: 'hidden',
                    opacity: 0,
                    pointerEvents: 'none',
                }}
            >
                {pages.map((entry, idx) => (
                    <div
                        key={idx}
                        className='page-for-pdf'
                        style={{
                            width: PRINT_WIDTH,
                            height: PRINT_HEIGHT,
                            background: '#fff',
                        }}
                    >
                        <BookPageTemplate
                            entry={entry}
                            styleSettings={styleSettings}
                            printMode={true} // מצב הדפסה
                        />
                    </div>
                ))}
            </div>
        </>
    )
}
