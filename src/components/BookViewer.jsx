import { useEffect, useState, useRef } from 'react'
import HTMLFlipBook from 'react-pageflip'
import BookPageTemplate from './BookPageTemplate'
import DesignControls from './DesignControls'
import mediaSample from '../lib/mediaSample.json'
import './BookViewer.css'

export default function BookViewer() {
    const [pages, setPages] = useState(() => {
        return JSON.parse(localStorage.getItem('bookPages')) || mediaSample
    })

    const [dimensions, setDimensions] = useState(getBookDimensions())
    const [styleSettings, setStyleSettings] = useState(() => {
        return JSON.parse(localStorage.getItem('bookStyle')) || defaultStyle
    })

    const resizeTimeout = useRef(null)
    const bookRef = useRef(null)

    function getBookDimensions() {
        const width = window.innerWidth * 0.35
        const height = width * 0.7
        return { width: Math.round(width), height: Math.round(height) }
    }

    const handleStyleChange = updated => {
        const newSettings = { ...styleSettings, ...updated }
        setStyleSettings(newSettings)
        localStorage.setItem('bookStyle', JSON.stringify(newSettings))
    }

    useEffect(() => {
        const handleResize = () => {
            if (resizeTimeout.current) clearTimeout(resizeTimeout.current)
            resizeTimeout.current = setTimeout(() => {
                setDimensions(getBookDimensions())
            }, 300)
        }

        window.addEventListener('resize', handleResize)
        handleResize()
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    return (
        <div className='book-layout'>
            <aside className='editor-panel'>
                <h2>🎨 עיצוב הספר</h2>
                <DesignControls settings={styleSettings} onChange={handleStyleChange} />
            </aside>

            <main className='book-view'>
                <HTMLFlipBook
                    ref={bookRef}
                    key={`${dimensions.width}x${dimensions.height}`}
                    width={dimensions.width}
                    height={dimensions.height}
                    size='fixed'
                    drawShadow={true}
                    flippingTime={600}
                    showCover={true}
                    mobileScrollSupport={true}
                    clickEventForward={true}
                    usePortrait={false}
                    startPage={0}
                    rtl={true}
                    className='flipbook'
                >
                    {pages.map((entry, index) => (
                        <div key={index} className='page'>
                            <BookPageTemplate entry={entry} styleSettings={styleSettings} />
                        </div>
                    ))}
                </HTMLFlipBook>
            </main>
        </div>
    )
}

const defaultStyle = {
    backgroundColor: '#fdfaf6',
    fontFamily: `'Noto Serif Hebrew', 'David Libre', serif`,
    fontSize: 20,
    fontColor: '#3a2f2f',
    borderColor: '#d8bfa4',
    borderWidth: 2,
    borderRadius: 10,
    textureUrl: 'https://www.transparenttextures.com/patterns/paper-fibers.png',
}
