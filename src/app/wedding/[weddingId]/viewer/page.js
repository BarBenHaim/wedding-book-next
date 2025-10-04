'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import HTMLFlipBook from 'react-pageflip'
import DesignControls from '../../../../components/DesignControls/DesignControls'
import { getEntries } from '../../../../lib/classifyMedia'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import BookCoverTemplate from '@/components/BookCoverTemplate/BookCoverTemplate'
import BookBackCoverTemplate from '@/components/BookBackCoverTemplate/BookBackCoverTemplate'
import defaultStyle from '@/app/wedding/[weddingId]/viewer/defultStyle'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import { storage } from '@/lib/firebaseClient'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'

export default function BookViewer() {
    const [pages, setPages] = useState([])
    const [loading, setLoading] = useState(true)
    const [viewerSize, setViewerSize] = useState(2362)
    const [baseSize, setBaseSize] = useState(2362)
    const [pdfSize, setPdfSize] = useState(200)
    const [styleSettings, setStyleSettings] = useState(() =>
        typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('bookStyle')) || defaultStyle : defaultStyle
    )
    const [mode, setMode] = useState('book')
    const [isMobile, setIsMobile] = useState(false)

    const hiddenRef = useRef(null)
    const bookRef = useRef(null)
    const { weddingId } = useParams()

    function getBookDimensions() {
        const screenWidth = window.innerWidth
        if (screenWidth < 640) return screenWidth * 0.9
        else if (screenWidth < 1024) return screenWidth * 0.7
        else return screenWidth * 0.35
    }

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768)
            setViewerSize(getBookDimensions())
        }
        checkMobile()

        async function fetchData() {
            if (!weddingId) return
            const data = await getEntries(weddingId)
            setPages(data.reverse()) // RTL order
            setLoading(false)
        }
        fetchData()

        let resizeTimer
        const handleResize = () => {
            clearTimeout(resizeTimer)
            resizeTimer = setTimeout(checkMobile, 300)
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
        if (typeof window !== 'undefined') localStorage.setItem('bookStyle', JSON.stringify(newSettings))
    }

    function handleSelectSize(sizeCm) {
        if (sizeCm === 20) {
            setPdfSize(200)
            setBaseSize(2362)
        } else if (sizeCm === 30) {
            setPdfSize(300)
            setBaseSize(3543)
        }
    }

    // 🧾 טוען תמונות לפני הפקת PDF
    async function loadImages(container) {
        const imgs = container.querySelectorAll('img')
        const promises = Array.from(imgs).map(
            img =>
                new Promise(resolve => {
                    if (img.complete) resolve()
                    else {
                        img.onload = resolve
                        img.onerror = resolve
                    }
                })
        )
        await Promise.all(promises)
    }

    async function generatePDF(reverseOrder = true) {
        if (!hiddenRef.current) return
        const pageEls = Array.from(hiddenRef.current.querySelectorAll('.page-for-pdf'))

        // לוודא שכל התמונות נטענות
        await Promise.all(
            Array.from(hiddenRef.current.querySelectorAll('img')).map(img => {
                if (img.src.startsWith('blob:')) {
                    // המרה ל־base64 לפני הצילום
                    return fetch(img.src)
                        .then(r => r.blob())
                        .then(blob => {
                            const reader = new FileReader()
                            reader.onloadend = () => (img.src = reader.result)
                            reader.readAsDataURL(blob)
                        })
                }
                return Promise.resolve()
            })
        )

        const orderedPages = reverseOrder ? pageEls.reverse() : pageEls
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: [pdfSize, pdfSize],
        })

        for (let i = 0; i < orderedPages.length; i++) {
            const canvas = await html2canvas(orderedPages[i], {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
            })
            const imgData = canvas.toDataURL('image/jpeg', 1.0)
            if (i > 0) pdf.addPage()
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfSize, pdfSize)
        }

        return pdf
    }

    // ☁️ שליחה ל-Firebase ולמייל
    async function handleDownloadPDF() {
        const pdf = await generatePDF(true)
        const pdfBlob = pdf.output('blob')
        const fileRef = ref(storage, `wedding-books/book-${Date.now()}.pdf`)
        await uploadBytes(fileRef, pdfBlob)
        const downloadURL = await getDownloadURL(fileRef)
        await fetch('/api/send-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: downloadURL }),
        })
    }

    // 💾 הורדה מקומית
    async function handleDownloadLocalPDF() {
        const pdf = await generatePDF(true)
        pdf.save(`WeddingBook-${Date.now()}.pdf`)
    }

    const hasCover = styleSettings.coverTitle?.trim() || styleSettings.coverSubtitle?.trim()

    if (loading) {
        return (
            <div className='flex flex-col items-center justify-center text-gray-700 h-screen'>
                <div className='animate-spin rounded-full h-12 w-12 border-4 border-purple-400 border-t-transparent mb-4'></div>
                <p className='text-sm font-medium'>טוען את ספר הזיכרונות…</p>
            </div>
        )
    }

    return (
        <AdminPageWrapper>
            <div className='relative flex h-[calc(100vh-4rem)] bg-gradient-to-br from-purple-50 via-white to-purple-100 overflow-hidden'>
                <main className='relative z-10 flex flex-1 flex-col lg:flex-row'>
                    {/* 🎛️ פאנל עיצוב */}
                    <aside
                        className={`${
                            isMobile ? 'order-2 w-full border-t' : 'w-1/4 border-l'
                        } border-gray-200 bg-white/80 backdrop-blur-md p-4 sm:p-6 shadow-xl rounded-none lg:rounded-l-2xl overflow-y-auto`}
                    >
                        <DesignControls
                            settings={styleSettings}
                            onChange={handleStyleChange}
                            mode={mode}
                            onModeChange={newMode => setMode(newMode)}
                            pdfSize={pdfSize}
                            onSizeChange={handleSelectSize}
                        />
                    </aside>

                    {/* 📖 הספר / הכריכה */}
                    <div className='flex flex-1 flex-col items-center justify-center p-4 sm:p-6 overflow-hidden'>
                        <div className='flex items-center justify-center' style={{ height: viewerSize }}>
                            {mode === 'cover' ? (
                                // מצב עריכת כריכה בלבד
                                <div
                                    className='flex items-center justify-center transition-all duration-300'
                                    style={{ width: viewerSize, height: viewerSize }}
                                >
                                    <HTMLFlipBook
                                        width={viewerSize}
                                        height={viewerSize}
                                        size='fixed'
                                        usePortrait={true}
                                        singlePage={true}
                                        drawShadow={false}
                                        showCover={false}
                                        className='book-flip'
                                    >
                                        <div style={{ width: viewerSize, height: viewerSize }}>
                                            <BookCoverTemplate
                                                styleSettings={styleSettings}
                                                scaledWidth={viewerSize}
                                                scaledHeight={viewerSize}
                                            />
                                        </div>
                                    </HTMLFlipBook>
                                </div>
                            ) : (
                                // מצב ספר מלא
                                <HTMLFlipBook
                                    ref={bookRef}
                                    key={`${viewerSize}-${pages.length}-${isMobile}`}
                                    width={viewerSize}
                                    height={viewerSize}
                                    size='fixed'
                                    usePortrait={isMobile}
                                    singlePage={isMobile}
                                    drawShadow={false}
                                    showCover={!!hasCover}
                                    mobileScrollSupport={true}
                                    className='book-flip'
                                    startPage={pages.length + 1}
                                    onFlip={e => {
                                        const currentPage = e.data
                                        const totalPages = pages.length + 2
                                        if (currentPage === totalPages - 1) setMode('cover')
                                        else setMode('book')
                                    }}
                                >
                                    {/* כריכה אחורית */}
                                    <div style={{ width: viewerSize, height: viewerSize }}>
                                        <BookBackCoverTemplate scaledWidth={viewerSize} scaledHeight={viewerSize} />
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

                                    {/* כריכה קדמית */}
                                    <div style={{ width: viewerSize, height: viewerSize }}>
                                        <BookCoverTemplate
                                            styleSettings={styleSettings}
                                            scaledWidth={viewerSize}
                                            scaledHeight={viewerSize}
                                        />
                                    </div>
                                </HTMLFlipBook>
                            )}
                        </div>

                        {/* 📥 כפתורי הורדה / שליחה */}
                        <div className='flex flex-col items-center mt-8 space-y-3'>
                            <button
                                onClick={handleDownloadPDF}
                                className='relative rounded-full text-xs sm:text-sm font-medium overflow-hidden cursor-pointer group p-px bg-gradient-to-r from-purple-600 to-pink-500'
                            >
                                <span className='absolute left-0 top-0 h-full w-0 bg-gradient-to-r from-purple-600 to-pink-500 group-hover:w-full transition-all duration-500 ease-out' />
                                <span className='relative z-10 block rounded-full bg-white group-hover:bg-transparent text-gray-900 group-hover:text-white px-5 py-2 transition-colors duration-500'>
                                    ✨ שלח להדפסה ({pdfSize / 10}×{pdfSize / 10} ס״מ)
                                </span>
                            </button>

                            <button
                                onClick={handleDownloadLocalPDF}
                                className='relative rounded-full text-xs sm:text-sm font-medium overflow-hidden cursor-pointer group p-px bg-gradient-to-r from-pink-500 to-purple-500'
                            >
                                <span className='absolute left-0 top-0 h-full w-0 bg-gradient-to-r from-pink-500 to-purple-500 group-hover:w-full transition-all duration-500 ease-out' />
                                <span className='relative z-10 block rounded-full bg-white group-hover:bg-transparent text-gray-900 group-hover:text-white px-5 py-2 transition-colors duration-500'>
                                    💾 הורד למחשב ({pdfSize / 10}×{pdfSize / 10} ס״מ)
                                </span>
                            </button>
                        </div>
                    </div>
                </main>
            </div>

            {/* 🧾 גרסה מוסתרת ל-PDF */}
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
                <div className='page-for-pdf' style={{ width: baseSize, height: baseSize, background: '#fff' }}>
                    <BookBackCoverTemplate scaledWidth={baseSize} scaledHeight={baseSize} />
                </div>

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

                <div className='page-for-pdf' style={{ width: baseSize, height: baseSize, background: '#fff' }}>
                    <BookCoverTemplate styleSettings={styleSettings} scaledWidth={baseSize} scaledHeight={baseSize} />
                </div>
            </div>
        </AdminPageWrapper>
    )
}
