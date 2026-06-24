'use client'

// "Here's your page in the book" — a delight preview shown on the thanks page
// after a guest submits. It renders the guest's OWN entry exactly as a book
// page (same BookPageTemplate the real book uses) and lets them flip through
// the existing design presets to see how their page would look in each.
//
// IMPORTANT: this is a read-only preview/toy. Picking a design here does NOT
// change the real book — the book's design stays the owner's choice. The first
// option is always the book's actual design, so the guest sees the real thing
// first, then gets to play.
//
// Heads itself with the event-aware book title (buildShareCopy) so it reads as
// "…in <Grandma Tikva's birthday book>", per event type + celebrant(s).

import { useEffect, useMemo, useRef, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebaseClient'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import defaultStyle, { resolveInteriorDesign } from '@/app/wedding/[weddingId]/viewer/defaultStyle'
import { listPresets, resolvePreset, BUILTIN_PRESETS } from '@/lib/studioPresets'
import { buildShareCopy } from '@/lib/shareCopy'

const STR = {
    he: { heading: 'ככה הברכה שלך נראית בספר', pick: 'רוצים לטעום עיצובים אחרים? בחרו 👇', book: 'העיצוב של הספר' },
    en: { heading: 'Here’s your page in the book', pick: 'Want to try other designs? Tap 👇', book: 'The book’s design' },
    es: { heading: 'Así se ve tu página en el libro', pick: '¿Probar otros diseños? Toca 👇', book: 'Diseño del libro' },
    it: { heading: 'Ecco la tua pagina nel libro', pick: 'Vuoi provare altri design? Tocca 👇', book: 'Design del libro' },
}

const MAX_SIZE = 330 // cap on the square preview canvas; shrinks to fit narrow phones

export default function BookPagePreview({ weddingId, entryId, locale = 'he' }) {
    const [entry, setEntry] = useState(null)
    const [wedding, setWedding] = useState(null)
    const [designs, setDesigns] = useState([])
    const [sel, setSel] = useState(0)
    const [loaded, setLoaded] = useState(false)
    // Responsive canvas: measure the available width so BookPageTemplate
    // renders at the real pixel size and never overflows / gets clipped.
    const wrapRef = useRef(null)
    const [size, setSize] = useState(300)

    useEffect(() => {
        if (!weddingId || !entryId) {
            setLoaded(true)
            return
        }
        let cancelled = false
        ;(async () => {
            try {
                const [wSnap, eSnap] = await Promise.all([
                    getDoc(doc(db, 'weddings', weddingId)),
                    getDoc(doc(db, 'weddings', weddingId, 'entries', entryId)),
                ])
                if (cancelled) return
                if (!eSnap.exists()) {
                    setLoaded(true)
                    return
                }
                const e = eSnap.data()
                setEntry({
                    id: entryId,
                    name: e.name || '',
                    text: e.text || '',
                    imageUrl: e.imageUrl || null,
                    photoPosition: e.photoPosition,
                    photoRotation: e.photoRotation,
                })
                const w = wSnap.exists() ? wSnap.data() : {}
                setWedding(w)

                // Option 0 = the book's REAL interior design (so they see the
                // genuine thing first); then every existing preset to explore.
                const opts = [
                    { key: '__book', label: (STR[locale] || STR.he).book, style: { ...defaultStyle, ...(resolveInteriorDesign(w) || {}), locale } },
                ]
                let presets = BUILTIN_PRESETS
                try {
                    const live = await listPresets()
                    if (Array.isArray(live) && live.length) presets = live
                } catch {
                    /* fall back to built-ins */
                }
                for (const p of presets) {
                    const rp = resolvePreset(p)
                    opts.push({ key: p.id || p.name, label: p.name || 'עיצוב', style: { ...defaultStyle, ...(rp.values || {}), locale } })
                }
                if (cancelled) return
                setDesigns(opts)
                // Default the picker to the long birthday-blessing style when it
                // exists (the owner's "ברכת יום הולדת — ארוכה" preset); else any
                // "long" style; else the book's own design (index 0).
                let def = opts.findIndex(o => /ארוכ/.test(o.label) && /הולדת/.test(o.label))
                if (def < 0) def = opts.findIndex(o => /ארוכ/.test(o.label))
                setSel(def < 0 ? 0 : def)
                setLoaded(true)
            } catch {
                if (!cancelled) setLoaded(true)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [weddingId, entryId, locale])

    // Measure once content is in (and on resize) so the square fits the column.
    useEffect(() => {
        function measure() {
            const w = wrapRef.current?.clientWidth || MAX_SIZE
            setSize(Math.max(220, Math.min(MAX_SIZE, Math.floor(w))))
        }
        measure()
        window.addEventListener('resize', measure)
        return () => window.removeEventListener('resize', measure)
    }, [loaded])

    const t = STR[locale] || STR.he
    const rtl = locale === 'he'
    const ctx = useMemo(() => {
        try {
            return wedding ? buildShareCopy(wedding).title || '' : ''
        } catch {
            return ''
        }
    }, [wedding])

    if (!loaded || !entry || !designs.length) return null
    const style = designs[Math.min(sel, designs.length - 1)].style

    return (
        <div dir={rtl ? 'rtl' : 'ltr'} style={{ marginBottom: 22 }}>
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1a1410' }}>{t.heading}</div>
                {ctx && <div style={{ fontSize: 12.5, color: '#9a8763', marginTop: 3 }}>{ctx}</div>}
            </div>

            {/* The page itself — real BookPageTemplate render. */}
            <div ref={wrapRef} style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                <div
                    style={{
                        width: size,
                        height: size,
                        borderRadius: 14,
                        overflow: 'hidden',
                        boxShadow: '0 18px 44px -18px rgba(120,96,60,0.45), 0 0 0 1px rgba(212,184,103,0.25)',
                    }}
                >
                    <BookPageTemplate entry={entry} styleSettings={style} scaledWidth={size} scaledHeight={size} />
                </div>
            </div>

            {/* Design picker — read-only fun; never changes the real book. */}
            <div style={{ marginTop: 14 }}>
                <div style={{ textAlign: 'center', fontSize: 12, color: '#9a8763', marginBottom: 8 }}>{t.pick}</div>
                <div
                    style={{
                        display: 'flex',
                        gap: 8,
                        overflowX: 'auto',
                        padding: '2px 4px 6px',
                        WebkitOverflowScrolling: 'touch',
                    }}
                >
                    {designs.map((d, i) => (
                        <button
                            key={`${d.key}-${i}`}
                            type='button'
                            onClick={() => setSel(i)}
                            style={{
                                flexShrink: 0,
                                fontSize: 12.5,
                                fontWeight: 600,
                                color: i === sel ? '#fff' : '#6b5836',
                                background: i === sel ? '#c9a44e' : '#fffdf8',
                                border: `1px solid ${i === sel ? '#c9a44e' : '#e3d6ba'}`,
                                borderRadius: 999,
                                padding: '7px 15px',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {d.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}
