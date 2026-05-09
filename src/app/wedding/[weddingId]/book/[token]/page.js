'use client'

// Digital Edition viewer.
//
// Public route — no auth needed; access is gated by the URL token
// (a UUID stored on the wedding doc's `digitalTokens` array). When a
// guest opens the link they bought, this page:
//   1. Reads weddingId + token from the URL.
//   2. Fetches the wedding doc.
//   3. Checks that `wedding.digitalTokens` contains the token.
//   4. If valid: loads entries, renders a beautiful presentation-mode
//      flipbook using HTMLFlipBook + the existing BookPageTemplate.
//   5. If invalid: shows a friendly "expired or invalid" screen.
//
// The book is rendered identically to /viewer (same BookPageTemplate),
// just without the design controls or print-order chrome — the guest
// is consuming, not editing. PDF download is offered via a server-
// side route so the device's CPU isn't pinned re-rendering pages.

import React, { useEffect, useState, useRef, useMemo } from 'react'
import { useParams } from 'next/navigation'
import HTMLFlipBook from 'react-pageflip'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebaseClient'
import { getEntries } from '@/lib/classifyMedia'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import BookCoverTemplate from '@/components/BookCoverTemplate/BookCoverTemplate'
import BookBackCoverTemplate from '@/components/BookBackCoverTemplate/BookBackCoverTemplate'
import defaultStyle from '@/app/wedding/[weddingId]/viewer/defaultStyle'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@/i18n/getMessages'
import { normalizeLocale } from '@/i18n/locales'

export default function DigitalEditionPage() {
    const { weddingId, token } = useParams()
    const [locale, setLocale] = useState('he')
    const [status, setStatus] = useState('loading') // loading | invalid | ready
    const [wedding, setWedding] = useState(null)
    const [entries, setEntries] = useState([])

    useEffect(() => {
        if (!weddingId || !token) return
        let cancelled = false
        ;(async () => {
            try {
                const wSnap = await getDoc(doc(db, 'weddings', weddingId))
                if (cancelled) return
                if (!wSnap.exists()) {
                    setStatus('invalid')
                    return
                }
                const w = wSnap.data()
                const tokens = Array.isArray(w.digitalTokens) ? w.digitalTokens : []
                if (!tokens.includes(token)) {
                    setStatus('invalid')
                    return
                }
                setLocale(normalizeLocale(w.locale))
                setWedding(w)
                const list = await getEntries(weddingId)
                if (cancelled) return
                setEntries(list)
                setStatus('ready')
            } catch (err) {
                console.error('[digital-edition] load failed', err)
                if (!cancelled) setStatus('invalid')
            }
        })()
        return () => {
            cancelled = true
        }
    }, [weddingId, token])

    // Hide the global Header + Footer so the digital book takes the
    // full viewport. Same DOM-toggle approach used elsewhere.
    useEffect(() => {
        if (typeof document === 'undefined') return
        const header = document.querySelector('body > header')
        const footer = document.querySelector('body > footer')
        const prevHeader = header?.style.display
        const prevFooter = footer?.style.display
        if (header) header.style.display = 'none'
        if (footer) footer.style.display = 'none'
        return () => {
            if (header) header.style.display = prevHeader || ''
            if (footer) footer.style.display = prevFooter || ''
        }
    }, [])

    return (
        <NextIntlClientProvider locale={locale} messages={getMessages(locale)}>
            {status === 'loading' && <LoadingScreen />}
            {status === 'invalid' && <InvalidScreen />}
            {status === 'ready' && wedding && (
                <BookViewer wedding={wedding} entries={entries} weddingId={weddingId} />
            )}
        </NextIntlClientProvider>
    )
}

// ─── Loading ─────────────────────────────────────────────────────────────
function LoadingScreen() {
    return (
        <div className='min-h-screen flex items-center justify-center' style={{ backgroundColor: '#1a1410' }}>
            <div className='flex flex-col items-center gap-4'>
                <div className='animate-spin rounded-full h-10 w-10 border-[3px] border-[#c9a44e]/30 border-t-[#c9a44e]'></div>
                <p style={{ color: '#c9a44e', fontSize: '13px', letterSpacing: '0.05em' }}>טוען את הספר שלכם...</p>
            </div>
        </div>
    )
}

// ─── Invalid token screen ───────────────────────────────────────────────
function InvalidScreen() {
    return (
        <div className='min-h-screen flex items-center justify-center px-6 text-center' style={{ backgroundColor: '#1a1410' }}>
            <div>
                <svg viewBox='0 0 24 24' className='w-12 h-12 mx-auto mb-4' fill='none' stroke='#c9a44e' strokeWidth={1.4}>
                    <path strokeLinecap='round' strokeLinejoin='round' d='M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z' />
                </svg>
                <h2 style={{ color: '#f5ead2', fontSize: '24px', fontWeight: 700, marginBottom: 8 }}>הקישור לא תקף</h2>
                <p style={{ color: '#9a8665', fontSize: '14px', maxWidth: 320, margin: '0 auto', lineHeight: 1.6 }}>
                    הקישור שעקבת אחריו פג תוקף או שאינו שייך לספר זה. אם רכשת את המהדורה הדיגיטלית — בדוק את האימייל שקיבלת או פנה אלינו.
                </p>
            </div>
        </div>
    )
}

// ─── Main book viewer ───────────────────────────────────────────────────
function BookViewer({ wedding, entries, weddingId }) {
    const flipRef = useRef(null)
    const [page, setPage] = useState(0)
    const [opened, setOpened] = useState(false) // landing → book transition
    const [pageSize, setPageSize] = useState({ w: 480, h: 480 })
    const [downloading, setDownloading] = useState(false)

    // Page dimensions — keep the book SQUARE (matches Lulu PB 8.5×8.5)
    // and scale down to fit the viewport on smaller screens. We
    // measure on mount + resize.
    useEffect(() => {
        function recalc() {
            if (typeof window === 'undefined') return
            const vw = window.innerWidth
            const vh = window.innerHeight - 120 // toolbar + breathing
            // Two-page spread on wide screens; single on narrow.
            const isWide = vw >= 900
            const targetW = isWide ? Math.min(vw * 0.45, 520) : Math.min(vw * 0.92, 480)
            const targetH = Math.min(targetW, vh)
            setPageSize({ w: Math.floor(targetH), h: Math.floor(targetH) })
        }
        recalc()
        window.addEventListener('resize', recalc)
        return () => window.removeEventListener('resize', recalc)
    }, [])

    const styleSettings = useMemo(() => {
        return wedding.book?.designSettings || defaultStyle
    }, [wedding])

    const totalPages = entries.length + 2 // cover + entries + back cover

    function next() {
        flipRef.current?.pageFlip().flipNext()
    }
    function prev() {
        flipRef.current?.pageFlip().flipPrev()
    }
    function fullscreen() {
        const el = document.documentElement
        if (!document.fullscreenElement) el.requestFullscreen?.()
        else document.exitFullscreen?.()
    }
    function share() {
        const url = window.location.href
        if (navigator.share) {
            navigator.share({ title: 'הספר הדיגיטלי שלנו', url }).catch(() => {})
        } else {
            navigator.clipboard?.writeText(url).then(() => alert('הקישור הועתק'))
        }
    }
    async function downloadPdf() {
        // Stub — server-side PDF generation. For now just alert.
        // The /api/digital-edition/pdf endpoint would generate a PDF
        // mirroring the printed book. Wire that up when ready.
        setDownloading(true)
        try {
            const res = await fetch(`/api/digital-edition/pdf?weddingId=${weddingId}&token=${encodeURIComponent(window.location.pathname.split('/').pop())}`)
            if (!res.ok) throw new Error('pdf-failed')
            const blob = await res.blob()
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = 'wedding-book.pdf'
            a.click()
        } catch {
            alert('הורדת PDF זמינה בקרוב.')
        } finally {
            setDownloading(false)
        }
    }

    // ─── Landing screen — couple's names + "open book" CTA ─────────
    if (!opened) {
        const bride = (wedding.brideNameHe || wedding.brideName || '').trim()
        const groom = (wedding.groomNameHe || wedding.groomName || '').trim()
        const celebrant = (wedding.celebrantNameHe || wedding.celebrantName || '').trim()
        const headlineNames = bride && groom ? `${bride} ו${groom}` : bride || groom || celebrant || ''
        return (
            <div
                className='min-h-screen flex items-center justify-center px-6 text-center relative overflow-hidden'
                style={{
                    background: 'radial-gradient(ellipse at 50% 30%, #2a1f17 0%, #14100c 70%)',
                }}
            >
                <div
                    aria-hidden
                    className='absolute inset-0 pointer-events-none opacity-30'
                    style={{
                        backgroundImage: 'url(/backgrounds/romanticgarden.png)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        filter: 'blur(2px)',
                    }}
                />
                <div className='relative z-10 max-w-md'>
                    <svg viewBox='0 0 24 24' className='w-7 h-7 mx-auto mb-5' fill='#c9a44e'>
                        <path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' />
                    </svg>
                    <p style={{ color: '#c9a44e', fontSize: '12px', letterSpacing: '0.2em', marginBottom: 12 }}>
                        ספר הברכות הדיגיטלי
                    </p>
                    <h1
                        style={{
                            color: '#f5ead2',
                            fontSize: '38px',
                            fontWeight: 700,
                            letterSpacing: '-0.01em',
                            lineHeight: 1.15,
                            marginBottom: 16,
                            fontFamily: "'David Libre', 'Frank Ruhl Libre', 'Times New Roman', serif",
                        }}
                    >
                        {headlineNames || 'הספר שלכם'}
                    </h1>
                    <p
                        style={{
                            color: '#a89378',
                            fontSize: '14px',
                            maxWidth: 360,
                            margin: '0 auto 32px',
                            lineHeight: 1.6,
                        }}
                    >
                        {entries.length} ברכות ותמונות מהאורחים, נשמרות לכם לתמיד. שתפו עם המשפחה והחברים — הקישור שלכם בלבד.
                    </p>
                    <button
                        onClick={() => setOpened(true)}
                        className='inline-flex items-center justify-center gap-3 transition-all active:scale-[0.98]'
                        style={{
                            background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                            boxShadow: '0 14px 32px -10px rgba(170,136,64,0.55), 0 4px 10px -4px rgba(170,136,64,0.30), inset 0 1px 0 rgba(255,255,255,0.25)',
                            padding: '14px 28px',
                            fontSize: '15.5px',
                            fontWeight: 700,
                            color: '#ffffff',
                            borderRadius: 16,
                            letterSpacing: '0.01em',
                        }}
                    >
                        <svg viewBox='0 0 24 24' className='w-[14px] h-[14px]' fill='currentColor'>
                            <path d='M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25' />
                        </svg>
                        <span>פתחו את הספר</span>
                    </button>

                    <div className='flex items-center justify-center gap-4 mt-7' style={{ color: '#7a6a52', fontSize: '12px' }}>
                        <button onClick={share} className='hover:text-[#c9a44e] transition-colors flex items-center gap-1.5'>
                            <svg viewBox='0 0 24 24' className='w-[14px] h-[14px]' fill='none' stroke='currentColor' strokeWidth={1.7}>
                                <path strokeLinecap='round' strokeLinejoin='round' d='M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z' />
                            </svg>
                            <span>שתפו</span>
                        </button>
                        <span style={{ color: '#3d2e1a' }}>·</span>
                        <button onClick={downloadPdf} className='hover:text-[#c9a44e] transition-colors flex items-center gap-1.5'>
                            <svg viewBox='0 0 24 24' className='w-[14px] h-[14px]' fill='none' stroke='currentColor' strokeWidth={1.7}>
                                <path strokeLinecap='round' strokeLinejoin='round' d='M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5' />
                            </svg>
                            <span>{downloading ? 'מכין PDF…' : 'הורדה כ-PDF'}</span>
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // ─── Flipbook view ─────────────────────────────────────────────────
    return (
        <div
            className='min-h-screen flex flex-col relative'
            style={{ background: 'radial-gradient(ellipse at 50% 30%, #2a1f17 0%, #0d0a07 100%)' }}
        >
            {/* Top toolbar */}
            <div className='flex items-center justify-between px-4 py-3 relative z-10'>
                <button
                    onClick={() => setOpened(false)}
                    className='inline-flex items-center gap-1.5 transition-colors'
                    style={{ color: '#a89378', fontSize: '13px' }}
                >
                    <svg viewBox='0 0 24 24' className='w-[16px] h-[16px] rtl:rotate-180' fill='none' stroke='currentColor' strokeWidth={2}>
                        <path strokeLinecap='round' strokeLinejoin='round' d='M15 19l-7-7 7-7' />
                    </svg>
                    <span>חזרה</span>
                </button>
                <div style={{ color: '#c9a44e', fontSize: '12px', letterSpacing: '0.05em' }}>
                    עמוד {Math.min(page + 1, totalPages)} / {totalPages}
                </div>
                <div className='flex items-center gap-2'>
                    <ToolbarButton onClick={share} title='שתף'>
                        <svg viewBox='0 0 24 24' className='w-[15px] h-[15px]' fill='none' stroke='currentColor' strokeWidth={1.7}>
                            <path strokeLinecap='round' strokeLinejoin='round' d='M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z' />
                        </svg>
                    </ToolbarButton>
                    <ToolbarButton onClick={downloadPdf} title='הורדה'>
                        <svg viewBox='0 0 24 24' className='w-[15px] h-[15px]' fill='none' stroke='currentColor' strokeWidth={1.7}>
                            <path strokeLinecap='round' strokeLinejoin='round' d='M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5' />
                        </svg>
                    </ToolbarButton>
                    <ToolbarButton onClick={fullscreen} title='מסך מלא'>
                        <svg viewBox='0 0 24 24' className='w-[15px] h-[15px]' fill='none' stroke='currentColor' strokeWidth={1.7}>
                            <path strokeLinecap='round' strokeLinejoin='round' d='M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15' />
                        </svg>
                    </ToolbarButton>
                </div>
            </div>

            {/* Flipbook */}
            <div className='flex-1 flex items-center justify-center px-2 pb-6 relative z-10'>
                {entries.length > 0 ? (
                    <HTMLFlipBook
                        ref={flipRef}
                        width={pageSize.w}
                        height={pageSize.h}
                        size='fixed'
                        showCover={true}
                        flippingTime={700}
                        usePortrait={true}
                        mobileScrollSupport={true}
                        onFlip={e => setPage(e.data)}
                        style={{ boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6)' }}
                    >
                        {/* Front cover */}
                        <div>
                            <div style={{ width: pageSize.w, height: pageSize.h, background: '#fff' }}>
                                <BookCoverTemplate
                                    wedding={wedding}
                                    styleSettings={styleSettings}
                                    scaledWidth={pageSize.w}
                                    scaledHeight={pageSize.h}
                                />
                            </div>
                        </div>
                        {/* Entry pages */}
                        {entries.map(entry => (
                            <div key={entry.id}>
                                <div style={{ width: pageSize.w, height: pageSize.h, background: '#fff' }}>
                                    <BookPageTemplate
                                        entry={entry}
                                        styleSettings={styleSettings}
                                        scaledWidth={pageSize.w}
                                        scaledHeight={pageSize.h}
                                    />
                                </div>
                            </div>
                        ))}
                        {/* Back cover */}
                        <div>
                            <div style={{ width: pageSize.w, height: pageSize.h, background: '#fff' }}>
                                <BookBackCoverTemplate scaledWidth={pageSize.w} scaledHeight={pageSize.h} />
                            </div>
                        </div>
                    </HTMLFlipBook>
                ) : (
                    <p style={{ color: '#a89378', fontSize: '14px' }}>הספר עדיין ריק.</p>
                )}
            </div>

            {/* Bottom navigation */}
            <div className='flex items-center justify-center gap-3 pb-6 relative z-10'>
                <ToolbarButton onClick={prev} title='הקודם'>
                    <svg viewBox='0 0 24 24' className='w-[16px] h-[16px]' fill='none' stroke='currentColor' strokeWidth={2}>
                        <path strokeLinecap='round' strokeLinejoin='round' d='M9 5l7 7-7 7' />
                    </svg>
                </ToolbarButton>
                <ToolbarButton onClick={next} title='הבא'>
                    <svg viewBox='0 0 24 24' className='w-[16px] h-[16px]' fill='none' stroke='currentColor' strokeWidth={2}>
                        <path strokeLinecap='round' strokeLinejoin='round' d='M15 19l-7-7 7-7' />
                    </svg>
                </ToolbarButton>
            </div>
        </div>
    )
}

function ToolbarButton({ onClick, children, title }) {
    return (
        <button
            onClick={onClick}
            title={title}
            className='inline-flex items-center justify-center rounded-full transition-all active:scale-95'
            style={{
                width: 36,
                height: 36,
                background: 'rgba(201,164,78,0.10)',
                border: '1px solid rgba(201,164,78,0.30)',
                color: '#c9a44e',
            }}
        >
            {children}
        </button>
    )
}
