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

    // בסיס אמיתי 20x20 ס״מ = 2362px
    const PRINT_WIDTH = 2362
    const PRINT_HEIGHT = 2362

    function getBookDimensions() {
        const screenWidth = window.innerWidth
        const width = screenWidth * 0.5
        return { width, height: width } // תמיד ריבוע
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
            orientation: 'portrait',
            unit: 'mm',
            format: [200, 200], // 20 ס״מ × 20 ס״מ
        })

        for (let i = 0; i < pageEls.length; i++) {
            const canvas = await html2canvas(pageEls[i], {
                scale: 2,
                useCORS: true,
                backgroundColor: '#fff',
            })
            const imgData = canvas.toDataURL('image/jpeg', 1.0)
            if (i > 0) pdf.addPage()
            pdf.addImage(imgData, 'JPEG', 0, 0, 200, 200)
        }

        pdf.save('wedding-book.pdf')
    }

    if (loading) {
        return (
            <div className='flex h-[calc(100vh-4rem)] flex-col items-center justify-center text-gray-700'>
                <div className='animate-spin rounded-full h-12 w-12 border-4 border-purple-400 border-t-transparent mb-4'></div>
                <p className='text-sm font-medium'>טוען את ספר הזיכרונות…</p>
            </div>
        )
    }

    return (
        <>
            <div className='relative flex h-[calc(100vh-4rem)] bg-gradient-to-br from-purple-50 via-white to-purple-100'>
                <main className='relative z-10 flex flex-1 items-center justify-center p-6 gap-6'>
                    {/* פאנל עיצוב */}
                    <aside className=' lg:block w-1/4 border-l border-gray-200 bg-white/80 backdrop-blur-md p-6 shadow-xl rounded-l-2xl'>
                        <h2 className='mb-6 text-xl font-bold text-gray-800'>עיצוב הספר</h2>
                        <DesignControls settings={styleSettings} onChange={handleStyleChange} />
                    </aside>

                    {/* ספר */}
                    <HTMLFlipBook
                        width={dimensions.width}
                        height={dimensions.height}
                        size='stretch'
                        drawShadow={false}
                        showCover={false}
                        mobileScrollSupport
                        className='book-flip'
                    >
                        {pages.map((entry, index) => (
                            <div
                                key={index}
                                className='page'
                                style={{ width: dimensions.width, height: dimensions.height }}
                            >
                                <BookPageTemplate
                                    entry={entry}
                                    styleSettings={styleSettings}
                                    scaledWidth={dimensions.width} // למסך
                                    scaledHeight={dimensions.height}
                                />
                            </div>
                        ))}
                    </HTMLFlipBook>
                </main>
            </div>

            {/* כפתור הורדה */}
            <button
                onClick={handleDownloadPDF}
                className='rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 px-4 py-3 text-white font-medium shadow hover:scale-105 transition mt-4 w-full'
            >
                📥 הורד כ־PDF
            </button>

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
                            scaledWidth={PRINT_WIDTH} // ל־PDF
                            scaledHeight={PRINT_HEIGHT}
                        />
                    </div>
                ))}
            </div>
        </>
    )
}
