'use client'

import React, { useEffect, useState, useRef, forwardRef } from 'react'
import { useParams } from 'next/navigation'
import HTMLFlipBook from 'react-pageflip'
import DesignControls from '../../../../components/DesignControls/DesignControls'
import { getEntries } from '../../../../lib/classifyMedia'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'

export default function BookViewer() {
    const [pages, setPages] = useState([])
    const [loading, setLoading] = useState(true)
    const [dimensions, setDimensions] = useState({ width: 500, height: 350 })
    const [styleSettings, setStyleSettings] = useState(() => {
        if (typeof window !== 'undefined') {
            return JSON.parse(localStorage.getItem('bookStyle')) || defaultStyle
        }
        return defaultStyle
    })

    const { weddingId } = useParams()
    const resizeTimeout = useRef(null)
    const bookRef = useRef(null)

    function getBookDimensions() {
        const screenWidth = window.innerWidth
        const width = screenWidth > 768 ? screenWidth * 0.35 : screenWidth * 0.85
        const height = width * 0.7
        return { width: Math.round(width), height: Math.round(height) }
    }

    const handleStyleChange = updated => {
        const newSettings = { ...styleSettings, ...updated }
        setStyleSettings(newSettings)
        if (typeof window !== 'undefined') {
            localStorage.setItem('bookStyle', JSON.stringify(newSettings))
        }
    }

    useEffect(() => {
        setDimensions(getBookDimensions())

        const handleResize = () => {
            if (resizeTimeout.current) clearTimeout(resizeTimeout.current)
            resizeTimeout.current = setTimeout(() => {
                setDimensions(getBookDimensions())
            }, 300)
        }

        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    useEffect(() => {
        async function fetchData() {
            if (!weddingId) return
            const data = await getEntries(weddingId)
            setPages(data)
            setLoading(false)
        }
        fetchData()
    }, [weddingId])

    if (loading) {
        return (
            <div className='flex min-h-screen items-center justify-center bg-gradient-to-br from-pink-50 via-white to-pink-100'>
                <div className='animate-spin rounded-full h-12 w-12 border-4 border-pink-400 border-t-transparent'></div>
            </div>
        )
    }

    return (
        <div className='flex min-h-screen bg-gradient-to-br from-pink-50 via-white to-pink-100'>
            <main className='flex flex-1 items-center justify-center p-6'>
                <HTMLFlipBook
                    ref={bookRef}
                    key={`${dimensions.width}x${dimensions.height}`}
                    width={dimensions.width}
                    height={dimensions.height}
                    size='fixed'
                    drawShadow
                    flippingTime={700}
                    showCover
                    mobileScrollSupport
                    clickEventForward
                    usePortrait={false}
                    startPage={0}
                    className='flipbook  '
                >
                    {pages.map((entry, index) => (
                        <div key={index} className='page'>
                            <BookPageTemplate entry={entry} styleSettings={styleSettings} />
                        </div>
                    ))}
                </HTMLFlipBook>

                <aside className='hidden lg:block w-1/4 border-l border-gray-200 bg-white/70 backdrop-blur-sm p-6 shadow-lg'>
                    <h2 className='mb-4 text-xl font-semibold text-gray-800'>🎨 עיצוב הספר</h2>
                    <DesignControls settings={styleSettings} onChange={handleStyleChange} />
                </aside>
            </main>
        </div>
    )
}

const Page = forwardRef(({ entry, styleSettings }, ref) => {
    return (
        <div
            ref={ref}
            className='page flex flex-col justify-between rounded-lg border bg-white/95 p-6 backdrop-blur-sm'
            style={{
                backgroundColor: styleSettings.backgroundColor,
                backgroundImage: styleSettings.textureUrl ? `url(${styleSettings.textureUrl})` : 'none',
                backgroundSize: 'cover',
                fontFamily: styleSettings.fontFamily,
                fontSize: styleSettings.fontSize,
                color: styleSettings.fontColor,
                borderColor: styleSettings.borderColor,
                borderWidth: styleSettings.borderWidth,
                borderRadius: styleSettings.borderRadius,
            }}
        >
            {entry.name && <p className='mt-4 text-right text-xs text-gray-600 italic'>{entry.name}</p>}
        </div>
    )
})
Page.displayName = 'Page'
