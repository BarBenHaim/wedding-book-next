'use client'

// Per-page design overrides, edited on the page itself.
//
// You click a page in the book, the rail becomes that page's controls,
// and every slider moves the real page behind you as you drag it. There
// is no thumbnail, no picker and no preview tile, because the book IS
// the preview — anything less means designing against an approximation
// and finding out at the printer.
//
// ── Live means local first ──────────────────────────────────────────
//
// A slider that waits for a round trip per tick feels broken, and at
// twenty ticks a second it would also be twenty writes. So the draft
// lives here, is applied to the book the instant it changes, and is
// written to Firestore on a debounce. The screen is never waiting on the
// network; the network is catching up with the screen.
//
// ── Inherit is the default and stays visible ────────────────────────
//
// Every control starts INHERITED and shows the book's current value. The
// moment you move it, it pins — and says so, with a way back. That
// distinction is the whole feature: a pinned key stops following the
// book forever, so an operator who pins nine sliders while exploring has
// quietly broken this page's relationship with every future preset
// change. Pins are deliberate, visible and individually reversible.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getIdToken } from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'
import { PHOTO_FRAMES } from '@/lib/photoFrames'
import { TEXTURES_REGISTRY } from '@/lib/studioPresets'
import { buildPageIndex, pageLabel } from '@/lib/bookPageIndex'
import { sanitizePageStyle, overriddenKeys, mergePageStyle } from '@/lib/pageStyle'
import { applyPresetClean } from '@/lib/bookDesignSchema'

const GOLD = '#AA8840'
const SAVE_DEBOUNCE_MS = 450

function Row({ label, pinned, onUnpin, children, hint }) {
    return (
        <div className='mb-3'>
            <div className='flex items-center justify-between gap-2 mb-1'>
                <span className='text-[11.5px] font-bold text-gray-600 flex items-center gap-1.5'>
                    {label}
                    {pinned && (
                        <span className='text-[9px] px-1 py-px rounded' style={{ background: '#f5efe3', color: GOLD }}>
                            נעול
                        </span>
                    )}
                </span>
                {pinned && (
                    <button onClick={onUnpin} className='text-[10.5px] font-bold text-gray-400 hover:text-gray-600'>
                        חזרה לספר
                    </button>
                )}
            </div>
            {children}
            {hint && <p className='text-[10px] text-gray-400 mt-1'>{hint}</p>}
        </div>
    )
}

function Slider({ value, min, max, step = 1, onChange, suffix = '' }) {
    return (
        <div className='flex items-center gap-2'>
            <input
                type='range' min={min} max={max} step={step} value={value}
                onChange={e => onChange(Number(e.target.value))}
                className='flex-1 accent-[#AA8840]'
            />
            <span className='text-[11px] font-bold text-gray-500 w-12 text-left tabular-nums' dir='ltr'>
                {value}{suffix}
            </span>
        </div>
    )
}

function Choice({ options, value, onChange }) {
    return (
        <div className='flex flex-wrap gap-1.5'>
            {options.map(o => (
                <button
                    key={String(o.value)}
                    onClick={() => onChange(o.value)}
                    className='px-2 py-1 rounded-lg text-[11px] font-bold transition-all'
                    style={value === o.value
                        ? { background: GOLD, color: '#fff' }
                        : { background: '#fff', color: '#7a6a52', border: '1px solid #ead9b3' }}
                >
                    {o.label}
                </button>
            ))}
        </div>
    )
}

export default function PageStyleControls({
    entries = [],
    styleSettings,
    weddingId,
    selectedId,
    onSelect,
    onEntriesChange,
}) {
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)
    const [draft, setDraft] = useState({})
    const timer = useRef(null)

    const selected = useMemo(() => entries.find(e => e.id === selectedId) || null, [entries, selectedId])

    const pageIndex = useMemo(
        () => buildPageIndex(entries, applyPresetClean(styleSettings || {})),
        [entries, styleSettings],
    )

    // Reseed only when the SELECTION changes. Reseeding on every entries
    // change would fight the user: the optimistic update writes back into
    // entries, which would reset the draft mid-drag.
    useEffect(() => {
        setDraft(sanitizePageStyle(entries.find(e => e.id === selectedId)?.pageStyle))
        setError(null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId])

    const pinned = useMemo(() => new Set(overriddenKeys(draft)), [draft])

    // The values the controls display: the book's design with this page's
    // pins on top. An inherited slider therefore shows the book's number
    // rather than a zero that would lie about what is on the page.
    const effective = useMemo(
        () => mergePageStyle(applyPresetClean(styleSettings || {}), draft),
        [styleSettings, draft],
    )

    // Replace, not merge: the browser holds the whole override, so an
    // unpin is simply a draft with one fewer key. Merging server-side
    // would make removal impossible to express.
    const flush = useCallback(async next => {
        if (!selectedId) return
        setSaving(true)
        try {
            const token = await getIdToken(auth.currentUser)
            const res = await fetch('/api/entries/page-style', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ weddingId, entryId: selectedId, pageStyle: next, replace: true }),
            })
            const data = await res.json().catch(() => ({}))
            if (!data?.ok) throw new Error(data?.error || `HTTP ${res.status}`)
            setError(null)
        } catch (err) {
            // The page still looks right — the change is in local state —
            // so say so plainly rather than reverting under their hands.
            setError(`${err?.message || 'שגיאה'} · השינוי לא נשמר`)
        } finally {
            setSaving(false)
        }
    }, [selectedId, weddingId])

    const apply = useCallback(next => {
        setDraft(next)
        onEntriesChange?.(selectedId, next) // the book redraws now
        clearTimeout(timer.current)
        timer.current = setTimeout(() => flush(next), SAVE_DEBOUNCE_MS)
    }, [selectedId, onEntriesChange, flush])

    useEffect(() => () => clearTimeout(timer.current), [])

    const set = (key, value) => apply({ ...draft, [key]: value })
    const setImage = (key, value) => apply({ ...draft, imageStyle: { ...(draft.imageStyle || {}), [key]: value } })
    const unpin = key => {
        const next = { ...draft }
        delete next[key]
        apply(next)
    }
    const resetAll = () => apply({})

    const pinnedPages = useMemo(
        () => entries.filter(e => overriddenKeys(e.pageStyle).length > 0).length,
        [entries],
    )

    // Closed state: a one-line invitation rather than a panel taking a
    // third of the rail for a mode nobody is in yet.
    if (!selected) {
        return (
            <div className='shrink-0 border-t border-[#f0e6d2] bg-white/90 px-4 py-2.5'>
                <p className='text-[11.5px] text-gray-500 leading-relaxed'>
                    לחץ על עמוד בספר כדי לערוך רק אותו.
                    {pinnedPages > 0 && (
                        <span className='font-bold' style={{ color: GOLD }}> {pinnedPages} עמודים כבר שונו.</span>
                    )}
                </p>
            </div>
        )
    }

    return (
        <div className='shrink-0 border-t border-[#f0e6d2] bg-white/95'>
            <div className='flex items-center justify-between gap-2 px-4 py-2'>
                <div className='min-w-0'>
                    <p className='text-[12.5px] font-extrabold text-[#3d2e1a] truncate'>
                        עמוד <span dir='ltr' className='tabular-nums'>{pageLabel(pageIndex.byEntry[selected.id]) || '—'}</span>
                        {selected.name ? ` · ${selected.name}` : ''}
                    </p>
                    <p className='text-[10px] text-gray-400'>
                        {pinned.size ? `${pinned.size} שינויים לעמוד הזה` : 'יורש הכל מעיצוב הספר'}
                        {saving ? ' · שומר…' : ''}
                    </p>
                </div>
                <div className='flex items-center gap-2 shrink-0'>
                    {pinned.size > 0 && (
                        <button onClick={resetAll} className='text-[10.5px] font-bold text-red-500 hover:text-red-600'>
                            אפס
                        </button>
                    )}
                    <button onClick={() => onSelect?.(null)} className='text-[11px] font-bold text-gray-400 hover:text-gray-600'>
                        סיום
                    </button>
                </div>
            </div>

            {error && (
                <div className='mx-4 mb-2 px-2 py-1.5 rounded text-[11px]' style={{ background: '#fff5f5', color: '#b32424' }}>
                    {error}
                </div>
            )}

            <div className='px-4 pb-3 max-h-[46vh] overflow-y-auto'>
                <Row label='ריווח תמונה מלמעלה' pinned={pinned.has('imageMarginTop')} onUnpin={() => unpin('imageMarginTop')}>
                    <Slider value={effective.imageMarginTop ?? 2} min={0} max={25} onChange={v => set('imageMarginTop', v)} suffix='%' />
                </Row>

                <Row label='ריווח תמונה מלמטה' pinned={pinned.has('imageMarginBottom')} onUnpin={() => unpin('imageMarginBottom')}>
                    <Slider value={effective.imageMarginBottom ?? 2} min={0} max={25} onChange={v => set('imageMarginBottom', v)} suffix='%' />
                </Row>

                <Row label='גודל התמונה' pinned={pinned.has('imageStyle')} onUnpin={() => unpin('imageStyle')}>
                    <Slider value={effective.imageStyle?.width ?? 80} min={30} max={100} onChange={v => setImage('width', v)} suffix='%' />
                </Row>

                <Row
                    label='חיתוך התמונה'
                    pinned={pinned.has('photoFit')}
                    onUnpin={() => unpin('photoFit')}
                    hint='״ללא חיתוך״ מראה את התמונה השלמה, גם אם הספר כולו חותך'
                >
                    <Choice
                        value={effective.photoFit ?? 'cover'}
                        onChange={v => set('photoFit', v)}
                        options={[{ value: 'cover', label: 'מילוי (4:3)' }, { value: 'contain', label: 'ללא חיתוך' }]}
                    />
                </Row>

                <Row label='יישור התמונה' pinned={pinned.has('imageAlign')} onUnpin={() => unpin('imageAlign')}>
                    <Choice
                        value={effective.imageAlign ?? 'center'}
                        onChange={v => set('imageAlign', v)}
                        options={[{ value: 'right', label: 'ימין' }, { value: 'center', label: 'מרכז' }, { value: 'left', label: 'שמאל' }]}
                    />
                </Row>

                <Row label='מסגרת לתמונה' pinned={pinned.has('photoFrame')} onUnpin={() => unpin('photoFrame')}>
                    <Choice
                        value={effective.photoFrame ?? null}
                        onChange={v => set('photoFrame', v)}
                        options={[{ value: null, label: 'בלי' }, ...PHOTO_FRAMES.map(f => ({ value: f.id, label: f.label }))]}
                    />
                </Row>

                <Row label='ריווח הברכה מלמעלה' pinned={pinned.has('textMarginTop')} onUnpin={() => unpin('textMarginTop')}>
                    <Slider value={effective.textMarginTop ?? 0} min={0} max={20} onChange={v => set('textMarginTop', v)} suffix='%' />
                </Row>

                <Row label='ריפוד העמוד' pinned={pinned.has('pagePadding')} onUnpin={() => unpin('pagePadding')}>
                    <Slider value={effective.pagePadding ?? 4} min={0} max={20} onChange={v => set('pagePadding', v)} suffix='%' />
                </Row>

                <Row label='צבע רקע העמוד' pinned={pinned.has('backgroundColor')} onUnpin={() => unpin('backgroundColor')}>
                    <div className='flex items-center gap-2'>
                        <input
                            type='color'
                            value={effective.backgroundColor || '#ffffff'}
                            onChange={e => set('backgroundColor', e.target.value)}
                            className='w-9 h-8 rounded cursor-pointer border border-[#ead9b3]'
                        />
                        <span className='text-[11px] text-gray-500 tabular-nums' dir='ltr'>{effective.backgroundColor || '#ffffff'}</span>
                    </div>
                </Row>

                <Row
                    label='מרקם רקע'
                    pinned={pinned.has('backgroundUrl')}
                    onUnpin={() => unpin('backgroundUrl')}
                    hint='״בלי״ מסיר את הרקע רק בעמוד הזה, גם אם לספר יש מרקם'
                >
                    <div className='flex flex-wrap gap-1.5'>
                        <button
                            onClick={() => set('backgroundUrl', null)}
                            className='px-2 py-1 rounded-lg text-[11px] font-bold'
                            style={pinned.has('backgroundUrl') && effective.backgroundUrl === null
                                ? { background: GOLD, color: '#fff' }
                                : { background: '#fff', color: '#7a6a52', border: '1px solid #ead9b3' }}
                        >
                            בלי
                        </button>
                        {TEXTURES_REGISTRY.map(t => (
                            <button
                                key={t.id}
                                onClick={() => set('backgroundUrl', t.src)}
                                title={t.label}
                                className='w-8 h-8 rounded-lg bg-cover bg-center'
                                style={{
                                    backgroundImage: `url(${t.src})`,
                                    outline: effective.backgroundUrl === t.src ? `2px solid ${GOLD}` : '1px solid #ead9b3',
                                }}
                            />
                        ))}
                    </div>
                </Row>
            </div>
        </div>
    )
}
