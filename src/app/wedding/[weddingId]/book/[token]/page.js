'use client'

// Digital Edition viewer — premium presentation, hardened against
// casual extraction.
//
// Access:
//   Public route. Auth via the `[token]` URL segment, which must
//   appear in `wedding.digitalTokens` on the doc. Tokens are minted
//   by /api/digital-edition/grant (super-admin only).
//
// Anti-extraction layers (see also /api/book-photo/...):
//   1. Photo URLs are PROXIED through /api/book-photo/* — the
//      original Firebase Storage URL never reaches the client. The
//      Network tab shows our endpoint, not the upstream image.
//   2. Right-click, drag, image-save, text-select all blocked on the
//      book area + every <img> inside it.
//   3. Save (Ctrl+S), Print (Ctrl+P), View Source (Ctrl+U) blocked.
//   4. No PDF download — the printed book is the upsell.
//   5. Watermark CSS overlay across the entire flipbook so screenshots
//      keep the brand.
//
// What this does NOT prevent (by design — physically impossible):
//   - Screenshots from the OS-level (Cmd+Shift+4 / PrintScreen).
//   - A determined user with DevTools who finds /api/book-photo
//     URLs and walks them out. We accept this — quality is the
//     premium proposition; the proxy serves FULL-RES photos so
//     the flipbook + retina + pinch-to-zoom look correct. The
//     security layers are deterrents for the 99% casual case,
//     not a fortress against the 1% determined.

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
                // ─── Swap each entry's direct Firebase Storage URL
                //     for our token-gated proxy URL. The book layouts
                //     (which don't know about tokens) just see a
                //     normal `imageUrl` and render via <img src=...>.
                const proxied = list.map(e => {
                    if (!e.imageUrl && !e.photoUrl) return e
                    return {
                        ...e,
                        imageUrl: `/api/book-photo/${weddingId}/${e.id}?token=${encodeURIComponent(token)}`,
                        photoUrl: `/api/book-photo/${weddingId}/${e.id}?token=${encodeURIComponent(token)}`,
                    }
                })
                setEntries(proxied)
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

    // ─── Hide global header + footer (full viewport) ───────────────
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

    // ─── Front-end deterrents — block save/print/source shortcuts ──
    // Doesn't stop a determined user, but stops every casual one.
    useEffect(() => {
        if (typeof window === 'undefined') return
        const onKey = e => {
            const k = e.key?.toLowerCase()
            // Cmd/Ctrl + (S | P | U)
            if ((e.metaKey || e.ctrlKey) && (k === 's' || k === 'p' || k === 'u')) {
                e.preventDefault()
                e.stopPropagation()
            }
        }
        const onCtx = e => {
            // Block right-click anywhere except interactive elements
            // that genuinely need it (none, in this view).
            e.preventDefault()
        }
        const onDrag = e => {
            // Block image dragging — most browsers' drag-to-save
            // gesture goes through this.
            e.preventDefault()
        }
        window.addEventListener('keydown', onKey, { capture: true })
        window.addEventListener('contextmenu', onCtx, { capture: true })
        window.addEventListener('dragstart', onDrag, { capture: true })
        return () => {
            window.removeEventListener('keydown', onKey, { capture: true })
            window.removeEventListener('contextmenu', onCtx, { capture: true })
            window.removeEventListener('dragstart', onDrag, { capture: true })
        }
    }, [])

    return (
        <NextIntlClientProvider locale={locale} messages={getMessages(locale)}>
            <style jsx global>{`
                /* Lock the digital book area against text/image
                 * extraction. Tailwind doesn't have a single utility
                 * that covers both Webkit + standards, so we write it
                 * once globally for the route. */
                .digital-book-root,
                .digital-book-root * {
                    -webkit-user-select: none;
                    -moz-user-select: none;
                    -ms-user-select: none;
                    user-select: none;
                    -webkit-touch-callout: none;
                }
                .digital-book-root img {
                    -webkit-user-drag: none;
                    pointer-events: none; /* drag/save handle disabled */
                }
                /* Print stylesheet — when someone hits Ctrl+P, render
                 * a notice instead of the book. Doesn't stop screen
                 * grabs but kills the "print to PDF" trick. */
                @media print {
                    .digital-book-root { display: none !important; }
                    body::before {
                        content: 'הספר הדיגיטלי לא ניתן להדפסה. להזמנת הספר הפיזי — צרו קשר.';
                        display: block;
                        padding: 40px;
                        font-family: sans-serif;
                        font-size: 14px;
                        color: #1a1410;
                        text-align: center;
                    }
                }
            `}</style>
            <div className='digital-book-root'>
                {status === 'loading' && <LoadingScreen />}
                {status === 'invalid' && <InvalidScreen />}
                {status === 'ready' && wedding && (
                    <BookViewer wedding={wedding} entries={entries} weddingId={weddingId} />
                )}
            </div>
        </NextIntlClientProvider>
    )
}

// ─── Loading ─────────────────────────────────────────────────────────────
function LoadingScreen() {
    return (
        <div
            className='min-h-screen flex items-center justify-center'
            style={{ background: 'radial-gradient(ellipse at 50% 30%, #2a1f17 0%, #14100c 100%)' }}
        >
            <div className='flex flex-col items-center gap-4'>
                <svg viewBox='0 0 24 24' className='w-10 h-10 animate-pulse' fill='#c9a44e'>
                    <path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' />
                </svg>
                <p style={{ color: '#c9a44e', fontSize: '12px', letterSpacing: '0.2em' }}>טוען את הספר שלכם</p>
            </div>
        </div>
    )
}

// ─── Invalid token screen ───────────────────────────────────────────────
function InvalidScreen() {
    return (
        <div
            className='min-h-screen flex items-center justify-center px-6 text-center'
            style={{ background: 'radial-gradient(ellipse at 50% 30%, #2a1f17 0%, #14100c 100%)' }}
        >
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
    const [opened, setOpened] = useState(false)
    const [pageSize, setPageSize] = useState({ w: 480, h: 480, isPortrait: true })
    const [shareToast, setShareToast] = useState(false)

    // ─── Page sizing — bigger on desktop, two-page spread on
    //     wide screens, single portrait on mobile. We deliberately
    //     don't cap with a tight max because this is the premium
    //     experience: on a 27" monitor the book should still be
    //     impressive, not a tiny postcard. ──────────────────────────
    useEffect(() => {
        function recalc() {
            if (typeof window === 'undefined') return
            const vw = window.innerWidth
            const vh = window.innerHeight - 160 // toolbar + nav row
            const isWide = vw >= 900
            // Wide screen: two pages side-by-side. Each page can be
            // up to 48% of viewport width. The book is square (Lulu
            // 8.5×8.5), so pageHeight = pageWidth.
            // Narrow: one page, up to 94% of viewport width.
            const targetByWidth = isWide ? vw * 0.42 : vw * 0.94
            // Cap by available vertical so the book never spills past
            // the bottom (with toolbar+nav reserved).
            const target = Math.min(targetByWidth, vh)
            // Floor to pixel + minimum 320 so flipbook stays usable
            // on tiny screens.
            const size = Math.max(320, Math.floor(target))
            setPageSize({ w: size, h: size, isPortrait: !isWide })
        }
        recalc()
        window.addEventListener('resize', recalc)
        return () => window.removeEventListener('resize', recalc)
    }, [])

    // ─── Keyboard navigation ──────────────────────────────────────
    // RTL flip: in Hebrew/Arabic, ArrowLeft is "next" (forward in
    // reading order), ArrowRight is "prev". For LTR locales, swap.
    useEffect(() => {
        if (!opened) return
        const isRtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl'
        const onKey = e => {
            if (e.key === 'ArrowLeft') {
                if (isRtl) flipRef.current?.pageFlip().flipNext()
                else flipRef.current?.pageFlip().flipPrev()
            } else if (e.key === 'ArrowRight') {
                if (isRtl) flipRef.current?.pageFlip().flipPrev()
                else flipRef.current?.pageFlip().flipNext()
            } else if (e.key === 'Escape') {
                setOpened(false)
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [opened])

    const styleSettings = useMemo(() => {
        return wedding.book?.designSettings || defaultStyle
    }, [wedding])

    const totalPages = entries.length + 2

    function next() { flipRef.current?.pageFlip().flipNext() }
    function prev() { flipRef.current?.pageFlip().flipPrev() }
    function fullscreen() {
        const el = document.documentElement
        if (!document.fullscreenElement) el.requestFullscreen?.()
        else document.exitFullscreen?.()
    }
    async function share() {
        const url = window.location.href
        const bride = (wedding.brideNameHe || wedding.brideName || '').trim()
        const groom = (wedding.groomNameHe || wedding.groomName || '').trim()
        const names = bride && groom ? `${bride} ו${groom}` : bride || groom || ''
        const title = names ? `הספר הדיגיטלי של ${names}` : 'הספר הדיגיטלי שלנו'
        try {
            if (navigator.share) {
                await navigator.share({ title, url })
            } else {
                await navigator.clipboard.writeText(url)
                setShareToast(true)
                setTimeout(() => setShareToast(false), 2500)
            }
        } catch {
            /* user cancelled — silent */
        }
    }

    // ─── Landing screen ───────────────────────────────────────────
    if (!opened) {
        const bride = (wedding.brideNameHe || wedding.brideName || '').trim()
        const groom = (wedding.groomNameHe || wedding.groomName || '').trim()
        const celebrant = (wedding.celebrantNameHe || wedding.celebrantName || '').trim()
        const headline = bride && groom ? `${bride} ו${groom}` : bride || groom || celebrant || 'הספר שלכם'

        return (
            <div
                className='min-h-screen flex items-center justify-center px-6 text-center relative overflow-hidden'
                style={{ background: 'radial-gradient(ellipse at 50% 30%, #2a1f17 0%, #14100c 100%)' }}
            >
                {/* Background romantic image — heavy blur for atmosphere */}
                <div
                    aria-hidden
                    className='absolute inset-0 pointer-events-none'
                    style={{
                        backgroundImage: 'url(/backgrounds/romanticgarden.png)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        opacity: 0.18,
                        filter: 'blur(3px)',
                    }}
                />
                {/* Slow-floating gold particles for premium ambiance */}
                <div aria-hidden className='absolute inset-0 pointer-events-none'>
                    {[...Array(14)].map((_, i) => (
                        <span
                            key={i}
                            className='absolute rounded-full'
                            style={{
                                width: 2 + (i % 3),
                                height: 2 + (i % 3),
                                background: '#c9a44e',
                                opacity: 0.4,
                                top: `${(i * 37) % 100}%`,
                                left: `${(i * 61) % 100}%`,
                                animation: `float-${i % 3} ${8 + (i % 5)}s ease-in-out infinite`,
                                animationDelay: `${i * 0.4}s`,
                            }}
                        />
                    ))}
                </div>

                <div className='relative z-10 max-w-md animate-[fadeUp_900ms_ease-out_both]'>
                    {/* Tiny tag */}
                    <p style={{ color: '#c9a44e', fontSize: '11px', letterSpacing: '0.3em', marginBottom: 18 }}>
                        WEDDING TALES · ספר הברכות הדיגיטלי
                    </p>

                    {/* Ornament cap */}
                    <div className='flex items-center justify-center gap-2 mb-4'>
                        <span className='block h-px w-14' style={{ background: 'linear-gradient(to left, transparent, #c9a44e, transparent)' }} />
                        <svg viewBox='0 0 24 24' className='w-3 h-3' fill='#c9a44e'>
                            <path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' />
                        </svg>
                        <span className='block h-px w-14' style={{ background: 'linear-gradient(to right, transparent, #c9a44e, transparent)' }} />
                    </div>

                    {/* Names */}
                    <h1
                        style={{
                            color: '#f5ead2',
                            fontSize: '44px',
                            fontWeight: 500,
                            letterSpacing: '-0.005em',
                            lineHeight: 1.1,
                            marginBottom: 10,
                            fontFamily: "'David Libre', 'Frank Ruhl Libre', 'Times New Roman', serif",
                            textShadow: '0 4px 20px rgba(0,0,0,0.55)',
                        }}
                    >
                        {headline}
                    </h1>

                    {/* Tagline */}
                    <p
                        style={{
                            color: '#a89378',
                            fontSize: '14px',
                            maxWidth: 380,
                            margin: '0 auto 36px',
                            lineHeight: 1.7,
                            fontStyle: 'italic',
                        }}
                    >
                        {entries.length > 0
                            ? `${entries.length} ברכות ותמונות מהאורחים, נשמרות לכם לתמיד`
                            : 'הספר הדיגיטלי שלכם'}
                    </p>

                    {/* Open CTA */}
                    <button
                        onClick={() => setOpened(true)}
                        className='inline-flex items-center justify-center gap-3 transition-all active:scale-[0.98] hover:scale-[1.02]'
                        style={{
                            background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                            boxShadow: '0 18px 38px -12px rgba(170,136,64,0.6), 0 4px 12px -4px rgba(170,136,64,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
                            padding: '16px 40px',
                            fontSize: '15px',
                            fontWeight: 700,
                            color: '#fff',
                            borderRadius: 999,
                            letterSpacing: '0.05em',
                        }}
                    >
                        <svg viewBox='0 0 24 24' className='w-[14px] h-[14px]' fill='currentColor'>
                            <path d='M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25' />
                        </svg>
                        <span>פתחו את הספר</span>
                    </button>

                    {/* Share only — no PDF */}
                    <div className='flex items-center justify-center mt-7'>
                        <button
                            onClick={share}
                            className='inline-flex items-center gap-1.5 transition-colors hover:text-[#c9a44e]'
                            style={{ color: '#7a6a52', fontSize: '12px', letterSpacing: '0.05em' }}
                        >
                            <svg viewBox='0 0 24 24' className='w-[13px] h-[13px]' fill='none' stroke='currentColor' strokeWidth={1.7}>
                                <path strokeLinecap='round' strokeLinejoin='round' d='M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z' />
                            </svg>
                            <span>שתפו את הקישור</span>
                        </button>
                    </div>
                </div>

                {shareToast && (
                    <div
                        className='fixed bottom-8 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-full text-xs animate-[fadeUp_300ms_ease-out_both] z-50'
                        style={{ background: 'rgba(201,164,78,0.15)', border: '1px solid rgba(201,164,78,0.5)', color: '#f5ead2', backdropFilter: 'blur(6px)' }}
                    >
                        ✓ הקישור הועתק
                    </div>
                )}

                <style jsx>{`
                    @keyframes fadeUp {
                        from { opacity: 0; transform: translateY(10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @keyframes float-0 {
                        0%, 100% { transform: translateY(0) translateX(0); }
                        50% { transform: translateY(-20px) translateX(8px); }
                    }
                    @keyframes float-1 {
                        0%, 100% { transform: translateY(0) translateX(0); }
                        50% { transform: translateY(-30px) translateX(-12px); }
                    }
                    @keyframes float-2 {
                        0%, 100% { transform: translateY(0) translateX(0); }
                        50% { transform: translateY(-25px) translateX(15px); }
                    }
                `}</style>
            </div>
        )
    }

    // ─── Flipbook view ─────────────────────────────────────────────
    return (
        <div
            className='min-h-screen flex flex-col relative'
            style={{
                // Cream paper backdrop with a soft floral wash to
                // match the brand. The book itself sits on top with
                // its own halo, so the page bg is intentionally
                // subdued — it frames, doesn't compete.
                background: 'linear-gradient(180deg, #f5ead2 0%, #ebd9b3 100%)',
                backgroundImage: 'url(/backgrounds/romanticgarden.png)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundBlendMode: 'soft-light',
            }}
        >
            {/* Top brand nav — WT logo on the start side, action
                icons on the end side. Cream wash with hairline
                bottom border to feel like a premium app chrome. */}
            <div
                className='flex items-center justify-between px-5 py-3 relative z-20'
                style={{
                    background: 'rgba(253,249,239,0.85)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    borderBottom: '1px solid rgba(201,164,78,0.20)',
                }}
            >
                {/* Brand cluster */}
                <button
                    onClick={() => setOpened(false)}
                    className='inline-flex items-center gap-2.5 transition-opacity hover:opacity-70'
                    title='חזרה למסך הפתיחה'
                >
                    <span
                        className='inline-flex items-center justify-center'
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            background: '#fff',
                            border: '1px solid rgba(201,164,78,0.30)',
                            color: '#aa8840',
                            fontSize: '13px',
                            fontWeight: 700,
                            letterSpacing: '0.05em',
                            fontFamily: "'David Libre', 'Times New Roman', serif",
                        }}
                    >
                        WT
                    </span>
                    <div className='text-start leading-tight'>
                        <div style={{ color: '#3d2e1a', fontSize: '14px', fontWeight: 700, letterSpacing: '0.02em' }}>
                            Wedding Tales
                        </div>
                        <div style={{ color: '#aa8840', fontSize: '10.5px', letterSpacing: '0.18em' }}>
                            ספר דיגיטלי
                        </div>
                    </div>
                </button>

                {/* Action cluster — share + fullscreen. No download. */}
                <div className='flex items-center gap-2'>
                    <NavIconButton onClick={share} label='שיתוף'>
                        <svg viewBox='0 0 24 24' className='w-[16px] h-[16px]' fill='none' stroke='currentColor' strokeWidth={1.7}>
                            <path strokeLinecap='round' strokeLinejoin='round' d='M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z' />
                        </svg>
                    </NavIconButton>
                    <NavIconButton onClick={fullscreen} label='מסך מלא'>
                        <svg viewBox='0 0 24 24' className='w-[16px] h-[16px]' fill='none' stroke='currentColor' strokeWidth={1.7}>
                            <path strokeLinecap='round' strokeLinejoin='round' d='M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15' />
                        </svg>
                    </NavIconButton>
                </div>
            </div>

            {/* Soft cream particles on the page bg */}
            <div aria-hidden className='absolute inset-0 pointer-events-none'>
                {[...Array(8)].map((_, i) => (
                    <span
                        key={i}
                        className='absolute rounded-full'
                        style={{
                            width: 1.5,
                            height: 1.5,
                            background: '#c9a44e',
                            opacity: 0.25,
                            top: `${(i * 47) % 100}%`,
                            left: `${(i * 71) % 100}%`,
                            animation: `bookfloat ${10 + (i % 4)}s ease-in-out infinite`,
                            animationDelay: `${i * 0.7}s`,
                        }}
                    />
                ))}
            </div>

            {/* Flipbook + side navigation arrows. The arrows are
                absolutely positioned next to the book so they hug
                the spine on either side at any viewport. */}
            <div className='flex-1 flex items-center justify-center relative z-10 px-2'>
                {entries.length > 0 ? (
                    <div
                        className='relative animate-[bookOpen_900ms_cubic-bezier(0.2,0.8,0.2,1)_both]'
                        style={{
                            // Soft golden halo behind the book on
                            // the cream backdrop. drop-shadow
                            // follows the book's actual silhouette
                            // (including mid-flip page rotation),
                            // unlike box-shadow which would glow
                            // around an invisible rectangle.
                            filter: 'drop-shadow(0 30px 60px rgba(45,30,16,0.30)) drop-shadow(0 0 40px rgba(201,164,78,0.20))',
                        }}
                    >
                        {/* Side arrow — RIGHT (start in RTL = "prev"
                            in reading direction). Anchored to the
                            book's right edge with negative offset. */}
                        <button
                            onClick={prev}
                            aria-label='הקודם'
                            className='absolute top-1/2 -translate-y-1/2 transition-all hover:scale-105 active:scale-95'
                            style={{
                                right: pageSize.isPortrait ? -56 : -68,
                                width: 48,
                                height: 48,
                                borderRadius: '50%',
                                background: 'rgba(253,249,239,0.92)',
                                border: '1px solid rgba(201,164,78,0.35)',
                                color: '#aa8840',
                                boxShadow: '0 6px 18px -6px rgba(45,30,16,0.20)',
                                backdropFilter: 'blur(8px)',
                                zIndex: 5,
                            }}
                        >
                            <svg viewBox='0 0 24 24' className='w-5 h-5 mx-auto' fill='none' stroke='currentColor' strokeWidth={1.8}>
                                <path strokeLinecap='round' strokeLinejoin='round' d='M9 5l7 7-7 7' />
                            </svg>
                        </button>

                        {/* Side arrow — LEFT (end in RTL = "next") */}
                        <button
                            onClick={next}
                            aria-label='הבא'
                            className='absolute top-1/2 -translate-y-1/2 transition-all hover:scale-105 active:scale-95'
                            style={{
                                left: pageSize.isPortrait ? -56 : -68,
                                width: 48,
                                height: 48,
                                borderRadius: '50%',
                                background: 'rgba(253,249,239,0.92)',
                                border: '1px solid rgba(201,164,78,0.35)',
                                color: '#aa8840',
                                boxShadow: '0 6px 18px -6px rgba(45,30,16,0.20)',
                                backdropFilter: 'blur(8px)',
                                zIndex: 5,
                            }}
                        >
                            <svg viewBox='0 0 24 24' className='w-5 h-5 mx-auto' fill='none' stroke='currentColor' strokeWidth={1.8}>
                                <path strokeLinecap='round' strokeLinejoin='round' d='M15 19l-7-7 7-7' />
                            </svg>
                        </button>
                        <HTMLFlipBook
                            ref={flipRef}
                            width={pageSize.w}
                            height={pageSize.h}
                            size='fixed'
                            showCover={true}
                            flippingTime={900}
                            usePortrait={pageSize.isPortrait}
                            mobileScrollSupport={true}
                            useMouseEvents={true}
                            swipeDistance={30}
                            maxShadowOpacity={0.5}
                            onFlip={e => setPage(e.data)}
                        >
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
                            <div>
                                <div style={{ width: pageSize.w, height: pageSize.h, background: '#fff' }}>
                                    <BookBackCoverTemplate scaledWidth={pageSize.w} scaledHeight={pageSize.h} />
                                </div>
                            </div>
                        </HTMLFlipBook>

                        {/* Watermark overlay across the book — barely
                            visible, but on a screenshot it's hard to
                            crop out cleanly. */}
                        <div
                            aria-hidden
                            className='absolute inset-0 pointer-events-none'
                            style={{
                                backgroundImage:
                                    "repeating-linear-gradient(-30deg, transparent 0 80px, rgba(201,164,78,0.04) 80px 81px)",
                                mixBlendMode: 'overlay',
                            }}
                        />
                    </div>
                ) : (
                    <p style={{ color: '#a89378', fontSize: '14px' }}>הספר עדיין ריק.</p>
                )}
            </div>

            {/* Bottom — centered page counter chip in elegant
                serif. Side arrows handle navigation now, so this is
                pure information. */}
            <div className='flex items-center justify-center pb-6 relative z-10'>
                <div
                    className='inline-flex items-center gap-3 rounded-full'
                    style={{
                        background: 'rgba(253,249,239,0.92)',
                        border: '1px solid rgba(201,164,78,0.30)',
                        padding: '7px 18px',
                        backdropFilter: 'blur(8px)',
                        boxShadow: '0 4px 14px -4px rgba(45,30,16,0.15)',
                    }}
                >
                    <svg viewBox='0 0 24 24' className='w-[10px] h-[10px]' fill='#c9a44e'>
                        <path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' />
                    </svg>
                    <span
                        style={{
                            color: '#aa8840',
                            fontSize: '13px',
                            fontFamily: "'David Libre', 'Frank Ruhl Libre', 'Times New Roman', serif",
                            letterSpacing: '0.12em',
                        }}
                    >
                        <span style={{ fontWeight: 600 }}>{Math.min(page + 1, totalPages)}</span>
                        <span style={{ opacity: 0.4, margin: '0 6px' }}>/</span>
                        <span style={{ opacity: 0.7 }}>{totalPages}</span>
                    </span>
                </div>
            </div>

            {shareToast && (
                <div
                    className='fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-full text-xs animate-[fadeUp_300ms_ease-out_both] z-50'
                    style={{ background: 'rgba(201,164,78,0.15)', border: '1px solid rgba(201,164,78,0.5)', color: '#f5ead2', backdropFilter: 'blur(6px)' }}
                >
                    ✓ הקישור הועתק
                </div>
            )}

            <style jsx>{`
                @keyframes bookOpen {
                    from { opacity: 0; transform: scale(0.94) translateY(20px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                @keyframes bookfloat {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-15px); }
                }
                @keyframes fadeUp {
                    from { opacity: 0; transform: translate(-50%, 10px); }
                    to { opacity: 1; transform: translate(-50%, 0); }
                }
            `}</style>
        </div>
    )
}

// Top-nav icon button — cream tile with label below for premium
// "app chrome" feel. Hovers up + glows gold.
function NavIconButton({ onClick, label, children }) {
    return (
        <button
            onClick={onClick}
            className='group inline-flex flex-col items-center gap-0.5 px-2 py-1 transition-colors'
            title={label}
        >
            <span
                className='inline-flex items-center justify-center rounded-xl transition-all group-hover:scale-105 group-active:scale-95'
                style={{
                    width: 38,
                    height: 38,
                    background: '#fff',
                    border: '1px solid rgba(201,164,78,0.30)',
                    color: '#aa8840',
                    boxShadow: '0 2px 6px -2px rgba(170,136,64,0.15)',
                }}
            >
                {children}
            </span>
            <span style={{ color: '#7a6a52', fontSize: '10px', letterSpacing: '0.05em' }}>{label}</span>
        </button>
    )
}
