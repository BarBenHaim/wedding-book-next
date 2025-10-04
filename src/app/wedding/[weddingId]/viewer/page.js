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
                    {/* פאנל עיצוב */}
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

                    {/* הספר / הכריכה */}
                    <div className='flex flex-1 flex-col items-center justify-center p-4 sm:p-6 overflow-hidden'>
                        <div className='flex items-center justify-center' style={{ height: viewerSize }}>
                            {mode === 'cover' ? (
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
                        </div>
                    </div>
                </main>
            </div>
        </AdminPageWrapper>
    )
}
