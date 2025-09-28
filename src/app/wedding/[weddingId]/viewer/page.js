'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import HTMLFlipBook from 'react-pageflip'
import DesignControls from '../../../../components/DesignControls/DesignControls'
import { getEntries } from '../../../../lib/classifyMedia'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import BookCoverTemplate from '@/components/BookCoverTemplate/BookCoverTemplate'
import defaultStyle from '@/app/wedding/[weddingId]/viewer/defultStyle'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import { storage } from '@/lib/firebaseClient'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'

export default function BookViewer() {
    const [pages, setPages] = useState([])
    const [loading, setLoading] = useState(true)
    const [viewerSize, setViewerSize] = useState(2362) // ברירת מחדל 20x20 ב־300dpi
    const [baseSize, setBaseSize] = useState(2362)
    const [pdfSize, setPdfSize] = useState(200) // מ״מ
    const [styleSettings, setStyleSettings] = useState(() =>
        typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('bookStyle')) || defaultStyle : defaultStyle
    )
    const hiddenRef = useRef(null)
    const bookRef = useRef(null)
    const { weddingId } = useParams()

    function getBookDimensions() {
        const screenWidth = window.innerWidth
        return screenWidth * 0.35
    }

    useEffect(() => {
        setViewerSize(getBookDimensions())

        async function fetchData() {
            if (!weddingId) return
            const data = await getEntries(weddingId)
            setPages(data)
            setLoading(false)
        }
        fetchData()

        let resizeTimer
        const handleResize = () => {
            clearTimeout(resizeTimer)
            resizeTimer = setTimeout(() => {
                setViewerSize(getBookDimensions())
            }, 500)
        }

        window.addEventListener('resize', handleResize)
        return () => {
            clearTimeout(resizeTimer)
            window.removeEventListener('resize', handleResize)
        }
    }, [weddingId])

    const handleStyleChange = updated => {
        const newSettings = { ...styleSettings, ...updated }
        setStyleSettings(newSettings)
        if (typeof window !== 'undefined') {
            localStorage.setItem('bookStyle', JSON.stringify(newSettings))
        }
    }

    // בחירת גודל ספר
    function handleSelectSize(sizeCm) {
        if (sizeCm === 20) {
            setPdfSize(200) // 200 מ״מ
            setBaseSize(2362) // 20 ס״מ ב־300dpi
        } else if (sizeCm === 30) {
            setPdfSize(300) // 300 מ״מ
            setBaseSize(3543) // 30 ס״מ ב־300dpi
        }
    }

    // פונקציית עזר - טוענת את כל התמונות ב־container לפני צילום
    async function loadImages(container) {
        const imgs = container.querySelectorAll('img')
        const promises = Array.from(imgs).map(
            img =>
                new Promise(resolve => {
                    if (img.complete) {
                        resolve()
                    } else {
                        img.onload = () => resolve()
                        img.onerror = () => resolve() // גם במקרה של שגיאה נמשיך
                    }
                })
        )
        await Promise.all(promises)
    }

    async function handleDownloadPDF() {
        if (!hiddenRef.current) return
        const pageEls = hiddenRef.current.querySelectorAll('.page-for-pdf')

        // ודא שכל התמונות נטענו לפני צילום
        await loadImages(hiddenRef.current)

        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: [pdfSize, pdfSize],
        })

        for (let i = 0; i < pageEls.length; i++) {
            const canvas = await html2canvas(pageEls[i], {
                scale: 2,
                useCORS: true,
                backgroundColor: '#fff',
            })
            const imgData = canvas.toDataURL('image/jpeg', 1.0)
            if (i > 0) pdf.addPage()
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfSize, pdfSize)
        }

        // הפקה כ־Blob
        const pdfBlob = pdf.output('blob')

        // העלאה ל־Firebase Storage
        const fileRef = ref(storage, `wedding-books/book-${Date.now()}.pdf`)
        await uploadBytes(fileRef, pdfBlob)
        const downloadURL = await getDownloadURL(fileRef)

        // שליחת לינק במייל דרך ה־API שלך
        await fetch('/api/send-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: downloadURL }),
        })
    }

    const hasCover = styleSettings.coverTitle?.trim() || styleSettings.coverSubtitle?.trim()

    if (loading) {
        return (
            <div className='flex flex-col items-center justify-center text-gray-700'>
                <div className='animate-spin rounded-full h-12 w-12 border-4 border-purple-400 border-t-transparent mb-4'></div>
                <p className='text-sm font-medium'>טוען את ספר הזיכרונות…</p>
            </div>
        )
    }

    return (
        <AdminPageWrapper>
            <div className='relative flex h-[calc(100vh-4rem)] bg-gradient-to-br from-purple-50 via-white to-purple-100 overflow-hidden'>
                <main className='relative z-10 flex flex-1'>
                    {/* פאנל עיצוב */}
                    <aside className='lg:block w-1/4 border-l border-gray-200 bg-white/80 backdrop-blur-md p-6 shadow-xl rounded-l-2xl overflow-y-auto'>
                        <DesignControls settings={styleSettings} onChange={handleStyleChange} />

                        {/* בחירת גודל */}
                        <div className='mt-6'>
                            <h3 className='font-medium mb-2'>בחר גודל ספר</h3>
                            <div className='flex gap-3'>
                                <button
                                    onClick={() => handleSelectSize(20)}
                                    className={`px-4 py-2 rounded-lg border ${
                                        pdfSize === 200 ? 'bg-purple-600 text-white' : 'bg-white'
                                    }`}
                                >
                                    20×20 ס״מ
                                </button>
                                <button
                                    onClick={() => handleSelectSize(30)}
                                    className={`px-4 py-2 rounded-lg border ${
                                        pdfSize === 300 ? 'bg-purple-600 text-white' : 'bg-white'
                                    }`}
                                >
                                    30×30 ס״מ
                                </button>
                            </div>
                            <p className='mt-2 text-sm text-gray-600'>
                                גודל נוכחי: {pdfSize / 10}×{pdfSize / 10} ס״מ
                            </p>
                        </div>
                    </aside>

                    {/* מרכז הספר */}
                    <div className='flex flex-1 flex-col items-center justify-center'>
                        {hasCover || pages.length > 0 ? (
                            <HTMLFlipBook
                                ref={bookRef}
                                key={`${viewerSize}-${pages.length}`}
                                width={viewerSize}
                                height={viewerSize}
                                usePortrait={false}
                                size='fixed'
                                drawShadow={false}
                                showCover={!!hasCover}
                                mobileScrollSupport={false}
                                className='book-flip'
                            >
                                {/* כריכה קדמית */}
                                <div style={{ width: viewerSize, height: viewerSize }}>
                                    <BookCoverTemplate
                                        styleSettings={styleSettings}
                                        scaledWidth={viewerSize}
                                        scaledHeight={viewerSize}
                                    />
                                </div>

                                {/* דפים פנימיים */}
                                {pages.map(entry => (
                                    <div key={entry.id} style={{ width: viewerSize, height: viewerSize }}>
                                        <BookPageTemplate
                                            entry={entry}
                                            styleSettings={styleSettings}
                                            scaledWidth={viewerSize}
                                            scaledHeight={viewerSize}
                                        />
                                    </div>
                                ))}
                            </HTMLFlipBook>
                        ) : (
                            <p className='text-gray-400 text-sm'>אין עדיין דפים להצגה</p>
                        )}

                        {/* כפתור הורדה */}
                        <button
                            onClick={handleDownloadPDF}
                            className='mt-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-3 text-white font-medium shadow hover:scale-105 transition'
                        >
                            📥 הורד כ־PDF ({pdfSize / 10}×{pdfSize / 10} ס״מ)
                        </button>
                    </div>
                </main>
            </div>

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
                {/* כריכה קדמית */}
                {hasCover && (
                    <div className='page-for-pdf' style={{ width: baseSize, height: baseSize, background: '#fff' }}>
                        <BookCoverTemplate
                            styleSettings={styleSettings}
                            scaledWidth={baseSize}
                            scaledHeight={baseSize}
                        />
                    </div>
                )}

                {/* דפים פנימיים */}
                {pages.map(entry => (
                    <div
                        key={entry.id}
                        className='page-for-pdf'
                        style={{ width: baseSize, height: baseSize, background: '#fff' }}
                    >
                        <BookPageTemplate
                            entry={entry}
                            styleSettings={styleSettings}
                            scaledWidth={baseSize}
                            scaledHeight={baseSize}
                        />
                    </div>
                ))}

                {/* כריכה אחורית */}
                {hasCover && (
                    <div className='page-for-pdf' style={{ width: baseSize, height: baseSize, background: '#fff' }}>
                        <BookCoverTemplate
                            styleSettings={styleSettings}
                            scaledWidth={baseSize}
                            scaledHeight={baseSize}
                        />
                    </div>
                )}
            </div>
        </AdminPageWrapper>
    )
}
