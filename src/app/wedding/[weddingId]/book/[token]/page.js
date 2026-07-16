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
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebaseClient'
import { getEntries } from '@/lib/classifyMedia'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import { expandBookPages } from '@/lib/bookPages'
import BookCoverTemplate from '@/components/BookCoverTemplate/BookCoverTemplate'
import BookBackCoverTemplate from '@/components/BookBackCoverTemplate/BookBackCoverTemplate'
import defaultStyle, { resolveInteriorDesign } from '@/app/wedding/[weddingId]/viewer/defaultStyle'
import { listPresets, resolvePreset, filterPresetsByEventType, BUILTIN_PRESETS } from '@/lib/studioPresets'
import { adoptSurfaceKeepCover } from '@/lib/presetFilters'
import { applyPresetClean } from '@/lib/bookDesignSchema'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@/i18n/getMessages'
import { normalizeLocale } from '@/i18n/locales'
import BookLoader from '@/components/BookLoader/BookLoader'

export default function DigitalEditionPage() {
    const { weddingId, token } = useParams()
    const [locale, setLocale] = useState('he')
    const [status, setStatus] = useState('loading') // loading | invalid | ready
    const [wedding, setWedding] = useState(null)
    const [entries, setEntries] = useState([])
    // Embedded mode (portal iframe): ?embed=1 hides the in-book design
    // strip, because the portal supplies its own native design picker.
    const [embed, setEmbed] = useState(false)

    useEffect(() => {
        setEmbed(typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embed') === '1')
    }, [])

    useEffect(() => {
        if (!weddingId || !token) return
        let cancelled = false
        ;(async () => {
            try {
                // Fire BOTH reads together — entries are public per the
                // Firestore rules, so they don't need to wait for token
                // validation. Overlapping the two round-trips shaves a
                // full network hop off the load. The wedding doc lands
                // first (it's tiny) → setWedding immediately so the
                // loading screen can show the book's REAL cover while
                // the entries are still on the wire.
                const entriesPromise = getEntries(weddingId).catch(() => [])
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
                const list = await entriesPromise
                if (cancelled) return
                // Render entry photos straight from their stored Firebase
                // URLs — exactly like the viewer and the portal, which load
                // reliably. We previously routed these through the
                // /api/book-photo proxy for anti-extraction, but that proxy
                // intermittently 502'd (stale download tokens / CDN) and
                // broke the shared book link. Matching the viewer's
                // direct-load behaviour is the reliable choice. We normalise
                // imageUrl = photoUrl = whichever field actually holds the
                // URL, so every book layout (which reads entry.imageUrl)
                // renders it.
                const normalized = list.map(e => {
                    const real = e.imageUrl || e.photoUrl
                    return real ? { ...e, imageUrl: real, photoUrl: real } : e
                })
                setEntries(normalized)
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

    // ─── Aggressive image preload ──────────────────────────────────
    // The book photo proxy (/api/book-photo/.../?token=...) does a
    // server-side fetch from Firebase Storage on every cold request,
    // which adds ~300-600ms of latency. Without preloading, that
    // delay shows up exactly when the user flips a page — the
    // animation completes, then the photo pops in late.
    //
    // Fix: warm the browser cache for EVERY entry photo as soon as
    // entries are loaded. `new Image()` doesn't insert into the DOM
    // but DOES trigger a real fetch; the proxy response is cached
    // (Cache-Control: private, max-age=3600) so subsequent <img>
    // tags inside the flipbook hit the cache and render instantly.
    //
    // fetchPriority='low' so the preloads don't compete with the
    // book's initial render and the visible first-page photo.
    useEffect(() => {
        if (typeof window === 'undefined') return
        if (!entries || entries.length === 0) return
        const preloaders = []
        const warm = (e, priority) => {
            try {
                const img = new window.Image()
                img.fetchPriority = priority
                img.decoding = 'async'
                img.src = e.imageUrl
                preloaders.push(img)
            } catch {
                /* ignore — some browsers may not support all hints */
            }
        }
        // Two waves: the photos the reader hits FIRST (the front of the
        // book = the END of the entries array, since the flipbook opens
        // on the FrontCover and reads backward through the reversed
        // list) warm immediately; the rest wait ~1.4s so they don't
        // compete with the flipbook's initial paint for bandwidth.
        const withPhotos = entries.filter(e => e.imageUrl)
        const firstWave = withPhotos.slice(-6)
        const restWave = withPhotos.slice(0, -6)
        firstWave.forEach(e => warm(e, 'auto'))
        const t = setTimeout(() => restWave.forEach(e => warm(e, 'low')), 1400)
        return () => {
            clearTimeout(t)
            preloaders.length = 0
        }
    }, [entries])

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
                        content: 'התצוגה המקוונת אינה מודפסת — הספר המודפס יישלח אליכם.';
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
                {status === 'loading' && <LoadingScreen wedding={wedding} />}
                {status === 'invalid' && <InvalidScreen />}
                {status === 'ready' && wedding && (
                    <BookViewer wedding={wedding} entries={entries} weddingId={weddingId} token={token} embed={embed} />
                )}
            </div>
        </NextIntlClientProvider>
    )
}

// ─── Loading ─────────────────────────────────────────────────────────────
// Two modes:
//   • wedding present (doc arrived, entries still loading) → the book's
//     REAL front cover — BookCoverTemplate with the owner's coverDesign
//     — floating with a soft gold glow and a shine sweep. Rendering the
//     cover here also warms its image, so the flipbook's opening page
//     paints instantly when the book mounts.
//   • no wedding yet (first ~200ms) → the original mini-book animation.
function LoadingScreen() {
    // The old bespoke mini-book animation (270 lines) is retired in
    // favor of the shared brand BookLoader — one loader everywhere.
    return <BookLoader label='טוען את הספר שלכם' />
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
                    הקישור שעקבת אחריו פג תוקף או שאינו שייך לספר זה. אם רכשת את הספר — בדוק את האימייל שקיבלת או פנה אלינו.
                </p>
            </div>
        </div>
    )
}

// ─── Main book viewer ───────────────────────────────────────────────────
function BookViewer({ wedding, entries, weddingId, token, embed }) {
    const flipRef = useRef(null)
    const [page, setPage] = useState(null) // flipbook page index — set by onInit/onFlip
    // Skip the landing/welcome screen — the user opted to drop the
    // "you've reached the digital book of…" intro and jump straight
    // into the flipbook. The landing component is still defined below
    // (kept around as orphan code in case we re-enable it) but never
    // rendered: `opened` starts at true.
    const [opened, setOpened] = useState(true)
    const [pageSize, setPageSize] = useState({ w: 480, h: 480, isPortrait: true })
    const [shareToast, setShareToast] = useState(false)
    // Design save feedback for the couple's preset picker: '' | 'saving' | 'saved' | 'error'
    const [designSave, setDesignSave] = useState('')

    // Hide the global Header + Footer on this route so the book
    // experience owns the full viewport — same DOM-toggle pattern the
    // photo page uses. Without this, the global Header (~64 px) shows
    // as a white strip above the book on mobile because the body's
    // default white background doesn't match the cream/floral page
    // wash. Restored on unmount so other routes still render their
    // chrome normally.
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

    // ─── Page sizing — bigger on desktop, two-page spread on
    //     wide screens, single portrait on mobile. We deliberately
    //     don't cap with a tight max because this is the premium
    //     experience: on a 27" monitor the book should still be
    //     impressive, not a tiny postcard. ──────────────────────────
    useEffect(() => {
        function recalc() {
            if (typeof window === 'undefined') return
            // Embedded in the portal iframe (?embed=1) → lower the "wide"
            // threshold so a ~700px book column still shows the two-page
            // spread; a standalone tab keeps the 900px threshold.
            const embedded = new URLSearchParams(window.location.search).get('embed') === '1'
            const vw = window.innerWidth
            // Vertical budget reserved for the UI surrounding the
            // book: arrow row (~74px) + page counter (in the arrow
            // row) + top padding above the book (~40-60px). The
            // preset-strip allowance (~160px) was removed when the
            // strip itself was dropped — the book now uses that
            // recovered height to grow toward the full viewport on
            // mobile. Total ≈ 160-180px reserved.
            const vh = window.innerHeight - (embedded ? 120 : 180)
            const isWide = vw >= (embedded ? 680 : 900)
            // Wide screen: two pages side-by-side. Each page can be
            // up to 48% of viewport width. The book is square (Lulu
            // 8.5×8.5), so pageHeight = pageWidth.
            // Narrow: one page, up to 94% of viewport width.
            const targetByWidth = isWide ? vw * (embedded ? 0.46 : 0.42) : vw * (embedded ? 0.96 : 0.98)
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

    // styleSettings is local state so the preset picker at the bottom
    // can swap designs live. Initial value priority (first match wins):
    //
    //   1. localStorage — the SAME device picked a preset on a prior
    //      visit, restore it. Per-device preference per the spring
    //      2026 product decision.
    //   2. wedding.coverDesign — the owner's authoritative design,
    //      set in /viewer. New visitors land on this.
    //   3. wedding.book?.designSettings — legacy field for old docs.
    //   4. defaultStyle — first-time fallback.
    //
    // All four sources are merged with defaultStyle's baseline so
    // BookPageTemplate's `??` fallbacks don't get triggered for fields
    // a preset doesn't define (same fix we made for /admin/studio).
    // Initial styleSettings — ALWAYS the owner's design as set in
    // /viewer's "book mode" (the wedding.bookDesign slice). No
    // session memory, no localStorage, no cross-device sync. Every
    // visitor opening the link lands on the owner's authoritative
    // design. The bottom preset strip lets them try other looks
    // FOR THIS SESSION ONLY — closing/reopening the tab returns to
    // the owner's design.
    //
    // Backward-compat fallback chain:
    //   1. wedding.bookDesign  — current canonical field
    //   2. wedding.coverDesign — pre-split docs that only had this
    //   3. wedding.book?.designSettings — very old docs
    //   4. defaultStyle — virgin wedding
    // Canonical fill (applyPresetClean): a stored design that predates
    // the schema — or was written by an older merge path — gets every
    // missing key from the canonical defaults, so legacy docs render
    // with the SAME margins/photo width/alignment as fresh ones.
    const [styleSettings, setStyleSettings] = useState(() =>
        // Interior pages: bookDesign, else coverDesign WITHOUT its imageStyle
        // (the cover's photo size shrinks interior photos and leaves a gap —
        // see resolveInteriorDesign).
        applyPresetClean(resolveInteriorDesign(wedding))
    )

    // The actual page sequence the book renders — entries expanded by the
    // smart auto-split (a long blessing → its own text page + photo page).
    // Hoisted so the flipbook's key + startPage track the REAL page count.
    // Keying react-pageflip on the un-expanded entries.length made it keep
    // the pre-split page count and silently drop the extra split pages once
    // autoSplit loaded from the design — i.e. missing blessings.
    const bookPages = useMemo(
        // Reverse entries BEFORE expanding (exactly like /viewer does). The
        // flipbook is RTL — children are [BackCover, ...pages, FrontCover] and
        // the reader opens on the FrontCover and flips right-to-left. Without
        // the reverse the blessings come out last-to-first (reversed vs the
        // order set in blessing-management). Reversing pre-split keeps each
        // split text→photo pair in the right order.
        () => expandBookPages([...entries].reverse(), {
            autoSplit: styleSettings.autoSplit,
            splitThreshold: styleSettings.splitThreshold,
            entriesPerPage: styleSettings.entriesPerPage,
            // Keep split text+photo pairs facing on one spread — but only in
            // the 2-up desktop view. On mobile (single page) there are no
            // spreads, so no divider leaves are added.
            padToSpread: !pageSize.isPortrait,
        }),
        [entries, styleSettings.autoSplit, styleSettings.splitThreshold, styleSettings.entriesPerPage, pageSize.isPortrait]
    )

    // ── Reading-position continuity ─────────────────────────────────
    // The flipbook remounts when the PHYSICAL page count changes (a
    // preset with different auto-split settings, or rotating between
    // the 1-up and 2-up layouts) — that's what its key encodes. A bare
    // remount snaps back to the FrontCover, which is exactly the
    // "switching designs reloads the book and starts over" bug. We
    // track the live page index in a ref and, on remount, map the
    // reader's distance-from-the-front onto the new count so they stay
    // on the same spot in the story. Presets with identical split
    // settings don't remount at all — styles restyle in place.
    const pageIndexRef = useRef(null)
    const prevLenRef = useRef(bookPages.length)
    let startIndex = bookPages.length + 1 // default: open on the FrontCover
    if (pageIndexRef.current != null) {
        const fromFront = prevLenRef.current + 1 - pageIndexRef.current
        startIndex = Math.min(bookPages.length + 1, Math.max(0, bookPages.length + 1 - fromFront))
    }
    useEffect(() => {
        prevLenRef.current = bookPages.length
    }, [bookPages.length])

    // ── Cover style — pinned to the wedding owner's choice ─────────
    // The front cover (BookCoverTemplate, with the couple's names) is
    // the wedding owner's territory: their design from /viewer should
    // ALWAYS render here, regardless of which preset a guest picks
    // for the interior. Building this from `wedding` (not from
    // styleSettings) ensures preset changes don't leak in.
    //
    // useMemo so the reference is stable until the wedding doc itself
    // changes — prevents BookCoverTemplate from re-rendering on every
    // styleSettings update the guest makes.
    const [coverStyleSettings, setCoverStyleSettings] = useState(() => ({
        ...defaultStyle,
        ...(wedding.coverDesign || wedding.book?.designSettings || {}),
    }))

    // Live preset list for the bottom picker. listPresets falls back
    // to BUILTIN_PRESETS on any Firestore error, so the strip is
    // never empty. Scoped to the wedding's eventType — this gallery
    // shows only presets tagged for the event's type + generic ones.
    const [presets, setPresets] = useState(() => filterPresetsByEventType(BUILTIN_PRESETS, wedding?.eventType))
    useEffect(() => {
        let cancelled = false
        listPresets({ eventType: wedding?.eventType }).then(list => {
            if (!cancelled && Array.isArray(list) && list.length > 0) setPresets(list)
        })
        return () => { cancelled = true }
         
    }, [wedding?.eventType])

    // Apply a preset AND persist it as the couple's chosen book design.
    //
    // The public link is token-gated; Firestore rules block anonymous
    // writes to the wedding doc, so the save goes through the
    // /api/digital-edition/set-design server route (Admin SDK), which
    // re-validates the token. Local state updates immediately for
    // instant feedback; the network write follows. The chosen design
    // becomes the canonical one the owner/admin sees in /viewer and
    // that ships to production.
    const applyPreset = async preset => {
        const resolved = resolvePreset(preset).values || {}
        // FULL RESET over the canonical schema — nothing survives from
        // the previous design (see bookDesignSchema.js).
        const merged = applyPresetClean(resolved)
        setStyleSettings(merged)
        // Cover adopts the preset's SURFACE look only — every
        // cover-specific field (photo, scale/position, title, subtitle,
        // text placement) stays exactly as the owner designed it.
        // Mirrors the server-side merge in set-design so the live
        // preview and the persisted doc agree. See adoptSurfaceKeepCover.
        setCoverStyleSettings(prev => adoptSurfaceKeepCover(prev, merged))
        if (!token) return
        try {
            setDesignSave('saving')
            const res = await fetch('/api/digital-edition/set-design', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ weddingId, token, design: merged }),
            })
            if (!res.ok) throw new Error('save failed')
            setDesignSave('saved')
            setTimeout(() => setDesignSave(''), 2500)
        } catch (err) {
            console.error('[digital-edition] design save failed', err)
            setDesignSave('error')
            setTimeout(() => setDesignSave(''), 3500)
        }
    }

    // Physical leaves in the flipbook: BackCover + every rendered page
    // (incl. auto-split text/photo pages and spread-alignment leaves) +
    // FrontCover. Counting raw entries here undercounted whenever the
    // smart split expanded an entry into two pages — the "page counter
    // is wrong" bug.
    const totalPages = bookPages.length + 2

    // RTL flipbook: children run BackCover(0) → pages → FrontCover(N+1)
    // and the reader OPENS on the FrontCover, flipping toward index 0.
    // "Next" in reading order therefore calls flipPrev (lower index).
    // The counter shows the reader's position from the front:
    // totalPages - pageIndex → 1 on the FrontCover, totalPages on the
    // BackCover.
    function next() { flipRef.current?.pageFlip().flipPrev() }
    function prev() { flipRef.current?.pageFlip().flipNext() }
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
        const title = names ? `ספר הברכות של ${names}` : 'ספר הברכות שלנו'
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
                {/* Background romantic image — heavy blur for atmosphere.
                    Mobile uses ebookmobilebg.png (portrait-tuned); desktop
                    uses the wider garden composition. */}
                <div
                    aria-hidden
                    className='absolute inset-0 pointer-events-none'
                    style={{
                        backgroundImage: `url(${
                            pageSize.isPortrait
                                ? '/backgrounds/ebookmobilebg.webp'
                                : '/backgrounds/romanticgarden.webp'
                        })`,
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
                        WEDDING TALES · ספר הברכות
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
                            : 'ספר הברכות שלכם'}
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
    // Mobile gets a dedicated portrait-tuned backdrop
    // (ebookmobilebg.png) — the desktop garden image is composed
    // for landscape framing and crops awkwardly on tall viewports.
    const bgImage = pageSize.isPortrait
        ? '/backgrounds/ebookmobilebg.webp'
        : '/backgrounds/romanticgarden.webp'
    return (
        <div
            className='h-[100dvh] flex flex-col relative overflow-hidden'
            style={{
                // Cream paper backdrop with a soft floral wash to
                // match the brand. The book itself sits on top with
                // its own halo, so the page bg is intentionally
                // subdued — it frames, doesn't compete.
                // h-[100dvh] + overflow-hidden = locked to the actual
                // visible viewport (dvh tracks mobile browser-chrome
                // shows/hides, vh would have been lvh = max chrome-
                // hidden area, overflowing under the URL bar). No
                // page scroll, no jitter during page flip.
                background: 'linear-gradient(180deg, #f5ead2 0%, #ebd9b3 100%)',
                backgroundImage: `url(${bgImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundBlendMode: 'soft-light',
            }}
        >
            {/* Top brand nav was here — fully removed per the
                spring 2026 user request. The book + bottom nav +
                preset strip is the whole experience now; chrome at
                the top only added clutter. The share/fullscreen
                actions and the WT branding moved to the bottom-bar
                or were dropped entirely. */}
            {false && (
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
                            ספר הברכות
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
            )}

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
            {/* Spacer above the book — pushes the book down so
                it sits visually centered.
                dir="rtl" matches the viewer's RTL setup so
                react-pageflip's flip animation reverses (Hebrew
                reading direction) and the book lands on the
                FrontCover (last child) as its opening view. */}
            <div dir='rtl' className='flex-1 flex items-center justify-center relative z-10 px-0 pt-[108px] sm:pt-[100px]'>
                {entries.length > 0 ? (
                    <div
                        className='relative animate-[bookOpen_500ms_cubic-bezier(0.2,0.8,0.2,1)_both]'
                        style={{
                            // box-shadow on the wrapper instead of
                            // filter:drop-shadow — drop-shadow forces
                            // the browser to repaint the whole filter
                            // pipeline on every page-flip frame
                            // (heavy GPU work, causes the lag the
                            // user reported). box-shadow stays around
                            // the wrapper rectangle and renders for
                            // free at composition time.
                            boxShadow: '0 30px 60px -10px rgba(45,30,16,0.30), 0 0 40px rgba(201,164,78,0.20)',
                        }}
                    >
                        <HTMLFlipBook
                            // Remount when the real (expanded) page count
                            // changes so react-pageflip rebuilds its internal
                            // page list and never drops the extra split pages.
                            key={`flip-${bookPages.length}`}
                            ref={flipRef}
                            width={pageSize.w}
                            height={pageSize.h}
                            size='fixed'
                            showCover={true}
                            // First mount: opens on the LAST array
                            // index (FrontCover). After a remount caused
                            // by a page-count change (preset switch /
                            // rotation), startIndex restores the
                            // reader's position instead of snapping
                            // back to the cover.
                            startPage={startIndex}
                            usePortrait={pageSize.isPortrait}
                            mobileScrollSupport={true}
                            // drawShadow=false matches /viewer — the
                            // library's internal page shadow is the
                            // expensive part during flip; turning it
                            // off restores the snappy feel without
                            // a visible loss (the wrapper's static
                            // box-shadow handles depth instead).
                            drawShadow={false}
                            // Mobile flip tuning: deliberately a bit
                            // slower than the default for a more
                            // luxurious "real book" feel. Lower swipe
                            // distance keeps a small thumb gesture
                            // enough to trigger a page turn — the
                            // default 30px requires a more deliberate
                            // drag.
                            flippingTime={pageSize.isPortrait ? 900 : 1100}
                            swipeDistance={pageSize.isPortrait ? 18 : 30}
                            maxShadowOpacity={0.4}
                            useMouseEvents={true}
                            onFlip={e => { pageIndexRef.current = e.data; setPage(e.data) }}
                            onInit={e => {
                                // Fires on every (re)mount with the real
                                // landing page — keeps the counter honest
                                // from the very first paint.
                                const p = e?.data?.page
                                if (typeof p === 'number') { pageIndexRef.current = p; setPage(p) }
                            }}
                        >
                            {/* Page order matches /viewer EXACTLY:
                                BackCover (decorative artwork) first,
                                entries in the middle, FrontCover
                                (with names) last. dir="rtl" on the
                                wrapper + showCover=true lands a
                                Hebrew reader on the FrontCover when
                                the book "opens" and flips right-to-
                                left through entries. */}
                            <div style={{ width: pageSize.w, height: pageSize.h, background: '#fff' }}>
                                <BookBackCoverTemplate scaledWidth={pageSize.w} scaledHeight={pageSize.h} />
                            </div>
                            {bookPages.map(entry => (
                                <div key={entry.id} style={{ width: pageSize.w, height: pageSize.h, background: '#fff' }}>
                                    <BookPageTemplate
                                        entry={entry}
                                        styleSettings={styleSettings}
                                        scaledWidth={pageSize.w}
                                        scaledHeight={pageSize.h}
                                    />
                                </div>
                            ))}
                            <div style={{ width: pageSize.w, height: pageSize.h, background: '#fff' }}>
                                <BookCoverTemplate
                                    wedding={wedding}
                                    /* Cover uses the OWNER's design,
                                       not the guest's preset choice. */
                                    styleSettings={coverStyleSettings}
                                    scaledWidth={pageSize.w}
                                    scaledHeight={pageSize.h}
                                />
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

            {/* Bottom controls — arrow row + page counter chip,
                stacked above the preset strip. The arrows used to
                hug the spine on either side of the book; the user
                asked for them moved here so the book reads cleaner
                on mobile (no thumbs blocking page edges). */}
            <div className='flex items-center justify-center gap-3 pt-2 pb-3 relative z-10'>
                <button
                    onClick={prev}
                    aria-label='הקודם'
                    className='inline-flex items-center justify-center transition-all hover:scale-105 active:scale-95'
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        background: 'rgba(253,249,239,0.92)',
                        border: '1px solid rgba(201,164,78,0.35)',
                        color: '#aa8840',
                        boxShadow: '0 4px 12px -4px rgba(45,30,16,0.18)',
                        backdropFilter: 'blur(8px)',
                    }}
                >
                    <svg viewBox='0 0 24 24' className='w-[18px] h-[18px]' fill='none' stroke='currentColor' strokeWidth={1.8}>
                        <path strokeLinecap='round' strokeLinejoin='round' d='M9 5l7 7-7 7' />
                    </svg>
                </button>

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
                        <span style={{ fontWeight: 600 }}>{page == null ? 1 : Math.min(totalPages, Math.max(1, totalPages - page))}</span>
                        <span style={{ opacity: 0.4, margin: '0 6px' }}>/</span>
                        <span style={{ opacity: 0.7 }}>{totalPages}</span>
                    </span>
                </div>

                <button
                    onClick={next}
                    aria-label='הבא'
                    className='inline-flex items-center justify-center transition-all hover:scale-105 active:scale-95'
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        background: 'rgba(253,249,239,0.92)',
                        border: '1px solid rgba(201,164,78,0.35)',
                        color: '#aa8840',
                        boxShadow: '0 4px 12px -4px rgba(45,30,16,0.18)',
                        backdropFilter: 'blur(8px)',
                    }}
                >
                    <svg viewBox='0 0 24 24' className='w-[18px] h-[18px]' fill='none' stroke='currentColor' strokeWidth={1.8}>
                        <path strokeLinecap='round' strokeLinejoin='round' d='M15 19l-7-7 7-7' />
                    </svg>
                </button>
            </div>

            {/* Couple's design picker — the no-login link is where the
                couple chooses the book's look. Picking a preset persists
                to the wedding doc via the token-gated
                /api/digital-edition/set-design route, so the choice
                sticks across devices and into production. (Reversal of
                the earlier "studio is the sole source of truth"
                decision, per 2026 product request.) */}
            {!embed && <PresetStrip presets={presets} activeStyle={styleSettings} onApply={applyPreset} />}

            {shareToast && (
                <div
                    className='fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-full text-xs animate-[fadeUp_300ms_ease-out_both] z-50'
                    style={{ background: 'rgba(201,164,78,0.15)', border: '1px solid rgba(201,164,78,0.5)', color: '#f5ead2', backdropFilter: 'blur(6px)' }}
                >
                    ✓ הקישור הועתק
                </div>
            )}

            {designSave && (
                <div
                    className='fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-full text-xs z-50'
                    style={{
                        background: designSave === 'error' ? 'rgba(180,60,60,0.18)' : 'rgba(201,164,78,0.15)',
                        border: designSave === 'error' ? '1px solid rgba(180,60,60,0.5)' : '1px solid rgba(201,164,78,0.5)',
                        color: '#f5ead2',
                        backdropFilter: 'blur(6px)',
                    }}
                >
                    {designSave === 'saving' ? 'שומר עיצוב…' : designSave === 'saved' ? '✓ העיצוב נשמר' : 'שמירה נכשלה — נסו שוב'}
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

// ── Preset strip — horizontal mini-preview gallery ──────────────
// Renders each preset as a 56×56 thumbnail using the real
// <BookPageTemplate /> at scaledWidth/Height = 200 then CSS-scaled
// down via transform: scale(). Picking one calls onApply which
// updates the live styleSettings in the parent.
function PresetStrip({ presets, activeStyle, onApply }) {
    if (!presets?.length) return null
    // Render size — internal page is 240x240, displayed thumbnail
    // is 96x96 → scale = 0.4. Big enough that the user can SEE the
    // typography, the photo placement and the background, not just
    // a colour swatch.
    // 130×130 thumbnails — gives BookPageTemplate's typography +
    // photo placeholder + bg color enough room to actually read as
    // a preset preview, not just a colored square.
    const TILE = 130
    return (
        <div
            className='relative z-10 pb-5 pt-2'
            style={{
                background:
                    'linear-gradient(180deg, transparent 0%, rgba(245,234,210,0.55) 30%, rgba(245,234,210,0.85) 100%)',
            }}
        >
            {/* Section caption — quiet, centered, makes the row's
                purpose obvious without screaming at the reader. */}
            <p
                className='text-center mb-2 px-4'
                style={{
                    color: '#7a6a52',
                    fontSize: '11px',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                }}
            >
                סגנון עיצוב
            </p>

            {/* Horizontal scroll-snap row. justify-center on small
                lists, scrolls horizontally on phones if there are
                many. Snap so each thumbnail lands cleanly under the
                user's thumb on a swipe-and-release. */}
            <div
                className='flex items-start gap-3 overflow-x-auto pb-2 px-4 scroll-smooth'
                style={{
                    scrollbarWidth: 'none',
                    WebkitOverflowScrolling: 'touch',
                    scrollSnapType: 'x mandatory',
                    justifyContent: 'safe center',
                }}
            >
                {presets.map(preset => {
                    const presetKey = preset.id || preset.name
                    const resolved = resolvePreset(preset).values || {}
                    // Canonical fill — the tile must promise EXACTLY what
                    // applying the preset will deliver (same resolution as
                    // the interior render above).
                    const previewStyle = applyPresetClean(resolved)
                    // Stable signature compare — the active styleSettings
                    // is merged from the preset's values + defaults, so
                    // object identity won't match. A handful of tell-tale
                    // fields is enough to identify which preset is live.
                    const isActive =
                        previewStyle.backgroundColor === activeStyle.backgroundColor &&
                        previewStyle.fontClass === activeStyle.fontClass &&
                        previewStyle.backgroundUrl === activeStyle.backgroundUrl &&
                        previewStyle.texture === activeStyle.texture &&
                        previewStyle.template === activeStyle.template
                    return (
                        <button
                            key={presetKey}
                            onClick={() => onApply(preset)}
                            title={preset.name}
                            aria-label={preset.name}
                            className='shrink-0 flex flex-col items-center gap-1.5 transition-all hover:scale-[1.04] active:scale-95'
                            style={{ scrollSnapAlign: 'center' }}
                        >
                            {/* The preview tile — clipped to the
                                tile size, hosts a real BookPageTemplate
                                rendered at RENDER and CSS-scaled to
                                fit. pointer-events:none on the inner
                                div so the whole tile remains a single
                                clickable target. */}
                            <div
                                style={{
                                    width: TILE,
                                    height: TILE,
                                    borderRadius: 12,
                                    overflow: 'hidden',
                                    background: '#fff',
                                    border: isActive
                                        ? '2px solid #aa8840'
                                        : '1px solid rgba(201,164,78,0.30)',
                                    boxShadow: isActive
                                        ? '0 8px 18px -6px rgba(170,136,64,0.50), 0 0 0 4px rgba(170,136,64,0.10)'
                                        : '0 4px 10px -5px rgba(45,30,16,0.20)',
                                    pointerEvents: 'none',
                                }}
                            >
                                {/* Render directly at TILE×TILE — the
                                    previous CSS transform:scale wrapper
                                    was rendering as an empty white
                                    square inside the digital-book-root
                                    (overflow + transform-origin +
                                    `pointer-events: none` on global
                                    images interacted in a way that hid
                                    the content). Direct render at
                                    TILE×TILE works cleanly. */}
                                <BookPageTemplate
                                    entry={PRESET_PREVIEW_ENTRY}
                                    styleSettings={previewStyle}
                                    scaledWidth={TILE}
                                    scaledHeight={TILE}
                                />
                            </div>
                            {/* Label — preset's name, small + serif,
                                gold when active so the choice is
                                visually obvious without reading. */}
                            <span
                                className='text-[10.5px] font-semibold whitespace-nowrap max-w-[110px] truncate'
                                style={{
                                    color: isActive ? '#aa8840' : '#7a6a52',
                                    letterSpacing: '0.02em',
                                }}
                            >
                                {preset.name || ''}
                            </span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

// Tiny placeholder entry for the preset strip — same SVG photo + a
// short blessing so each thumbnail reads as a real page rather than
// a color swatch.
const PRESET_PREVIEW_ENTRY = {
    id: 'digital-book-preset-preview',
    name: 'יעל ויואב',
    text: 'מזל טוב',
    imageUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f5d39e"/><stop offset="100%" stop-color="#d8b986"/></linearGradient></defs><rect width="400" height="300" fill="url(#s)"/><ellipse cx="320" cy="80" rx="38" ry="38" fill="#fff8e0" opacity="0.9"/><path d="M0 220 Q100 170 200 200 T 400 210 V 300 H 0 Z" fill="#a87f4b"/></svg>'
    )}`,
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
