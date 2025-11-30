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
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebaseClient'

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

    // ✅ חישוב גודל הספר לפי רוחב וגם גובה זמין (מותאם מובייל)
    function getBookDimensions() {
        const w = window.innerWidth
        const h = window.innerHeight

        const HEADER = 64 // 4rem
        const CONTROLS = w < 1024 ? 260 : 0 // כש־DesignControls למטה
        const BUTTONS = 84 // כפתורי ההורדה
        const PADDING = 24

        const byWidth = w < 640 ? w * 0.9 : w < 1024 ? w * 0.7 : w * 0.35

        const availHeight = h - HEADER - CONTROLS - BUTTONS - PADDING
        return Math.max(180, Math.min(byWidth, availHeight))
    }

    useEffect(() => {
        const checkMobile = () => {
            const isMob = window.innerWidth < 768
            setIsMobile(isMob)
            setViewerSize(getBookDimensions())
        }
        checkMobile()

        async function fetchData() {
            if (!weddingId) return
            const data = await getEntries(weddingId)
            setPages(data.reverse())
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
        } else if (sizeCm === 21) {
            setPdfSize(210)
            setBaseSize(2480)
        } else if (sizeCm === 30) {
            setPdfSize(300)
            setBaseSize(3543)
        }
    }

    async function fixBlobImages(container) {
        const imgs = container.querySelectorAll('img')
        await Promise.all(
            Array.from(imgs).map(async img => {
                if (img.src.startsWith('blob:')) {
                    try {
                        const blob = await fetch(img.src).then(r => r.blob())
                        const reader = new FileReader()
                        await new Promise(res => {
                            reader.onloadend = () => {
                                img.src = reader.result
                                res()
                            }
                            reader.readAsDataURL(blob)
                        })
                    } catch (e) {
                        console.warn('⚠️ בעיה בהמרת blob לתמונה:', e)
                    }
                }
            })
        )
    }

    async function handleSendToEmail() {
        if (!hiddenRef.current) return

        await fixBlobImages(hiddenRef.current)
        const pagesEls = Array.from(hiddenRef.current.querySelectorAll('.page-for-pdf'))
        if (pagesEls.length < 3) return

        const backCoverEl = pagesEls[0]
        const bookPagesEls = pagesEls.slice(1, -1)
        const frontCoverEl = pagesEls[pagesEls.length - 1]

        const pageSizeMM = 216
        const bleedMM = 3.175
        const bleedSizeMM = pageSizeMM + bleedMM * 2

        const pdfContent = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: [bleedSizeMM, bleedSizeMM],
        })

        for (let i = 0; i < bookPagesEls.length; i++) {
            const canvas = await html2canvas(bookPagesEls[i], {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#fff',
            })
            const imgData = canvas.toDataURL('image/jpeg', 1.0)
            if (i > 0) pdfContent.addPage()
            pdfContent.addImage(imgData, 'JPEG', 0, 0, bleedSizeMM, bleedSizeMM)
        }

        await fixBlobImages(frontCoverEl)
        await fixBlobImages(backCoverEl)

        const TOTAL_W_MM = 482.6
        const TOTAL_H_MM = 260.35
        const SPINE_MM = 6.35
        const PANEL_W_MM = (TOTAL_W_MM - SPINE_MM) / 2

        const pdfCovers = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: [TOTAL_W_MM, TOTAL_H_MM],
        })

        const [frontCanvas, backCanvas] = await Promise.all([
            html2canvas(frontCoverEl, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#fff' }),
            html2canvas(backCoverEl, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#fff' }),
        ])
        const frontImg = frontCanvas.toDataURL('image/jpeg', 1.0)
        const backImg = backCanvas.toDataURL('image/jpeg', 1.0)

        pdfCovers.addImage(frontImg, 'JPEG', 0, 0, PANEL_W_MM, TOTAL_H_MM)
        pdfCovers.setFillColor('#FFFFFF')
        pdfCovers.rect(PANEL_W_MM, 0, SPINE_MM, TOTAL_H_MM, 'F')
        pdfCovers.addImage(backImg, 'JPEG', PANEL_W_MM + SPINE_MM, 0, PANEL_W_MM, TOTAL_H_MM)

        async function uploadAndSend(pdf, filename) {
            const blob = pdf.output('blob')
            const fileRef = ref(storage, `wedding-books/${filename}-${Date.now()}.pdf`)
            await uploadBytes(fileRef, blob)
            const url = await getDownloadURL(fileRef)
            await fetch('/api/send-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            })
        }

        await uploadAndSend(pdfContent, 'WeddingBook-Content-LULU')
        await uploadAndSend(pdfCovers, 'WeddingBook-Covers-LULU')

        alert('📩 שני הקבצים נשלחו למייל בהצלחה!')
    }

    async function handleDownloadLuluPDFs() {
        if (!hiddenRef.current) return
        await fixBlobImages(hiddenRef.current)
        const pagesEls = Array.from(hiddenRef.current.querySelectorAll('.page-for-pdf'))
        if (pagesEls.length < 3) return

        const backCoverEl = pagesEls[0]
        const bookPagesEls = pagesEls.slice(1, -1)
        const frontCoverEl = pagesEls[pagesEls.length - 1]

        const pageSizeMM = 216
        const bleedMM = 3.175
        const bleedSizeMM = pageSizeMM + bleedMM * 2

        async function renderToLuluPDF(elements, filename) {
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: [bleedSizeMM, bleedSizeMM],
            })
            for (let i = 0; i < elements.length; i++) {
                const canvas = await html2canvas(elements[i], {
                    scale: 2,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: '#fff',
                })
                const imgData = canvas.toDataURL('image/jpeg', 1.0)
                if (i > 0) pdf.addPage()
                pdf.addImage(imgData, 'JPEG', 0, 0, bleedSizeMM, bleedSizeMM)
            }
            const blob = pdf.output('blob')
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${filename}.pdf`
            a.click()
            URL.revokeObjectURL(url)
        }

        await renderToLuluPDF(bookPagesEls, 'WeddingBook-Content-LULU')

        const TOTAL_W_MM = 482.6
        const TOTAL_H_MM = 260.35
        const SPINE_MM = 6.35
        const PANEL_W_MM = (TOTAL_W_MM - SPINE_MM) / 2

        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: [TOTAL_W_MM, TOTAL_H_MM],
        })

        const [frontCanvas, backCanvas] = await Promise.all([
            html2canvas(frontCoverEl, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#fff' }),
            html2canvas(backCoverEl, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#fff' }),
        ])
        const frontImg = frontCanvas.toDataURL('image/jpeg', 1.0)
        const backImg = backCanvas.toDataURL('image/jpeg', 1.0)

        pdf.addImage(frontImg, 'JPEG', 0, 0, PANEL_W_MM, TOTAL_H_MM)
        pdf.setFillColor('#FFFFFF')
        pdf.rect(PANEL_W_MM, 0, SPINE_MM, TOTAL_H_MM, 'F')
        pdf.addImage(backImg, 'JPEG', PANEL_W_MM + SPINE_MM, 0, PANEL_W_MM, TOTAL_H_MM)

        const blob2 = pdf.output('blob')
        const url2 = URL.createObjectURL(blob2)
        const a2 = document.createElement('a')
        a2.href = url2
        a2.download = 'WeddingBook-Covers-LULU.pdf'
        a2.click()
        URL.revokeObjectURL(url2)
    }

    const hasCover = styleSettings.coverTitle?.trim() || styleSettings.coverSubtitle?.trim()

    if (loading)
        return (
            <div className='flex flex-col items-center justify-center text-gray-700 h-screen'>
                <div className='animate-spin rounded-full h-12 w-12 border-4 border-purple-400 border-t-transparent mb-4'></div>
                <p className='text-sm font-medium'>טוען את ספר הזיכרונות…</p>
            </div>
        )

    return (
        <AdminPageWrapper>
            <div className='relative flex min-h-[calc(100dvh-4rem)] bg-gradient-to-br from-purple-50 via-white to-purple-100 overflow-y-auto lg:overflow-hidden'>
                <main className='relative z-10 flex flex-1 flex-col lg:flex-row'>
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
                    <div className='flex flex-1 flex-col items-center justify-center p-4 sm:p-6'>
                        <p
                            className='
        text-xs           /* פונט קטן מאוד במובייל */
        md:text-sm        /* פונט רגיל בדסקטופ */
        mt-[0px]          /* מובייל */
        md:mt-[-8vw]      /* דסקטופ */
        md:mb-[2vw]       
        text-gray-500
    '
                        >
                            התמונות ייצאו מצוין בהדפסה, כאן זו רק תצוגה מקדימה.
                        </p>

                        {mode === 'cover' ? (
                            <HTMLFlipBook
                                width={viewerSize}
                                height={viewerSize}
                                size='fixed'
                                usePortrait
                                singlePage
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
                        ) : (
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
                                mobileScrollSupport
                                className='book-flip'
                            >
                                <div style={{ width: viewerSize, height: viewerSize }}>
                                    <BookBackCoverTemplate scaledWidth={viewerSize} scaledHeight={viewerSize} />
                                </div>
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
                                <div style={{ width: viewerSize, height: viewerSize }}>
                                    <BookCoverTemplate
                                        styleSettings={styleSettings}
                                        scaledWidth={viewerSize}
                                        scaledHeight={viewerSize}
                                    />
                                </div>
                            </HTMLFlipBook>
                        )}
                        <div className='flex flex-col items-center mt-8 space-y-3'>
                            {/* <button
                                onClick={handleDownloadLuluPDFs}
                                className='relative rounded-full text-xs sm:text-sm font-medium overflow-hidden cursor-pointer group p-px bg-gradient-to-r from-blue-600 to-purple-500'
                            >
                                <span className='absolute left-0 top-0 h-full w-0 bg-gradient-to-r from-blue-600 to-purple-500 group-hover:w-full transition-all duration-500 ease-out' />
                                <span className='relative z-10 block rounded-full bg-white group-hover:bg-transparent text-gray-900 group-hover:text-white px-5 py-2 transition-colors duration-500'>
                                    📘 הורדה ל־LULU (תוכן + כריכות)
                                </span>
                            </button> */}

                            <button
                                onClick={handleSendToEmail}
                                className='relative rounded-full text-xs sm:text-sm font-medium overflow-hidden cursor-pointer group p-px bg-gradient-to-r from-pink-500 to-purple-600'
                            >
                                <span className='absolute left-0 top-0 h-full w-0 bg-gradient-to-r from-pink-500 to-purple-600 group-hover:w-full transition-all duration-500 ease-out' />
                                <span className='relative z-10 block rounded-full bg-white group-hover:bg-transparent text-gray-900 group-hover:text-white px-5 py-2 transition-colors duration-500'>
                                    שליחת הספר להדפסה{' '}
                                </span>
                            </button>
                        </div>
                    </div>
                </main>
            </div>

            {/* גרסה מוסתרת ל־PDF */}
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
