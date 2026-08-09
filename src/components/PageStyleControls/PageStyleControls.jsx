'use client'

// Per-page design overrides, next to the book you are designing.
//
// The rail above this sets the design for all fifty pages, which is what
// makes them look like one book. This is for the pages that need to
// disagree: the panorama that wants the full width, the four-line
// blessing floating in an empty page, the nearly-white photo that needs
// a darker surface under it. Without this, fixing one of those means
// changing the design for all fifty and trading one bad page for
// forty-nine.
//
// ── Inherit is the default and stays visible ────────────────────────
//
// Every control starts INHERITED and shows the book's current value. The
// moment you move it, it pins — and it says so, with a way back. That
// distinction is the whole feature: a pinned key stops following the
// book forever, so an operator who pins nine sliders by accident while
// exploring has quietly broken the page's relationship with every future
// preset change. Pins are therefore deliberate, visible and individually
// reversible.
//
// ── The preview is the point ────────────────────────────────────────
//
// The tile renders the real BookPageTemplate with the real merged style,
// so what you tune is what prints. Anything less than that and you are
// designing against an approximation and finding out at the printer.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getIdToken } from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import { PHOTO_FRAMES } from '@/lib/photoFrames'
import { TEXTURES_REGISTRY } from '@/lib/studioPresets'
import { buildPageIndex, pageLabel } from '@/lib/bookPageIndex'
import { sanitizePageStyle, overriddenKeys } from '@/lib/pageStyle'
import { applyPresetClean } from '@/lib/bookDesignSchema'
import { mergePageStyle } from '@/lib/pageStyle'

const GOLD = '#AA8840'

// ── One row, one setting, one honest state ──────────────────────────
function Row({ label, pinned, onUnpin, children, hint }) {
    return (
        <div className='mb-3'>
            <div className='flex items-center justify-between gap-2 mb-1'>
                <span className='text-[11.5px] font-bold text-gray-600 flex items-center gap-1.5'>
                    {label}
                    {pinned && (
                        <span className='text-[9px] px-1 py-px rounded' style={{ background: '#f5efe3', color: GOLD }}>
                            נעול לעמוד
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

export default function PageStyleControls({ entries = [], styleSettings, weddingId, onEntriesChange }) {
    // Collapsed by default. The rail is 380px of finite height shared
    // with the preset gallery, and a panel this tall permanently open
    // would cost the operator the thing they use most to buy the thing
    // they use occasionally.
    const [open, setOpen] = useState(false)
    const [selectedId, setSelectedId] = useState(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)

    // Print page numbers, so the picker speaks the same language as the
    // blessings screen and the proof.
    const pageIndex = useMemo(
        () => buildPageIndex(entries, applyPresetClean(styleSettings || {})),
        [entries, styleSettings],
    )

    const selected = useMemo(() => entries.find(e => e.id === selectedId) || null, [entries, selectedId])
    const draft = useMemo(() => sanitizePageStyle(selected?.pageStyle), [selected])
    const pinned = useMemo(() => new Set(overriddenKeys(draft)), [draft])

    // What the page renders with right now — the book's design with this
    // page's pins on top. Every control reads its displayed value from
    // here, so an inherited slider shows the book's number rather than a
    // zero that would lie about the current state.
    const effective = useMemo(
        () => mergePageStyle(applyPresetClean(styleSettings || {}), draft),
        [styleSettings, draft],
    )

    useEffect(() => {
        if (selectedId && !entries.some(e => e.id === selectedId)) setSelectedId(null)
    }, [entries, selectedId])

    const save = useCallback(async (patch, unpin = []) => {
        if (!selected) return
        setSaving(true)
        setError(null)
        try {
            const token = await getIdToken(auth.currentUser)
            const res = await fetch('/api/entries/page-style', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ weddingId, entryId: selected.id, pageStyle: patch, unpin }),
            })
            const data = await res.json().catch(() => ({}))
            if (!data?.ok) throw new Error(data?.error || `HTTP ${res.status}`)
            onEntriesChange?.(selected.id, data.pageStyle || {})
        } catch (err) {
            setError(err?.message || 'השמירה נכשלה')
        } finally {
            setSaving(false)
        }
    }, [selected, weddingId, onEntriesChange])

    const reset = useCallback(async () => {
        if (!selected) return
        setSaving(true)
        try {
            const token = await getIdToken(auth.currentUser)
            const res = await fetch('/api/entries/page-style', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ weddingId, entryId: selected.id, reset: true }),
            })
            const data = await res.json().catch(() => ({}))
            if (!data?.ok) throw new Error(data?.error || 'reset failed')
            onEntriesChange?.(selected.id, {})
        } catch (err) {
            setError(err?.message || 'האיפוס נכשל')
        } finally {
            setSaving(false)
        }
    }, [selected, weddingId, onEntriesChange])

    const set = (key, value) => save({ [key]: value })
    const unpin = key => save({ [key]: null }, [key])
    const setImage = (key, value) => save({ imageStyle: { ...(draft.imageStyle || {}), [key]: value } })

    const pinnedPages = useMemo(
        () => entries.filter(e => overriddenKeys(e.pageStyle).length > 0).length,
        [entries],
    )

    return (
        <div className='shrink-0 border-t border-[#f0e6d2] bg-white/90'>
            <button
                onClick={() => setOpen(v => !v)}
                className='w-full flex items-center justify-between gap-2 px-4 py-2.5 text-right'
            >
                <span className='text-[12.5px] font-extrabold text-[#3d2e1a]'>
                    עיצוב עמוד בודד
                    {pinnedPages > 0 && (
                        <span className='mr-1.5 text-[10px] font-bold px-1.5 py-px rounded' style={{ background: '#f5efe3', color: GOLD }}>
                            {pinnedPages}
                        </span>
                    )}
                </span>
                <span className='text-[11px] text-gray-400'>{saving ? 'שומר…' : (open ? 'סגור' : 'פתח')}</span>
            </button>

            {!open ? null : (
            <div className='px-4 pb-3 max-h-[52vh] overflow-y-auto'>

            {/* Page picker. A dot marks pages that already disagree with
                the book, so you can find your own past decisions. */}
            <div className='flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1'>
                {entries.map(entry => {
                    const label = pageLabel(pageIndex.byEntry[entry.id])
                    const has = overriddenKeys(entry.pageStyle).length > 0
                    const on = entry.id === selectedId
                    return (
                        <button
                            key={entry.id}
                            onClick={() => setSelectedId(on ? null : entry.id)}
                            title={entry.name || ''}
                            className='shrink-0 px-2 py-1 rounded-lg text-[11px] font-bold relative'
                            style={on
                                ? { background: GOLD, color: '#fff' }
                                : { background: '#fff', color: '#7a6a52', border: '1px solid #ead9b3' }}
                        >
                            <span dir='ltr' className='tabular-nums'>{label || '—'}</span>
                            {has && (
                                <span
                                    className='absolute -top-0.5 -left-0.5 w-1.5 h-1.5 rounded-full'
                                    style={{ background: on ? '#fff' : GOLD }}
                                />
                            )}
                        </button>
                    )
                })}
            </div>

            {!selected ? (
                <p className='text-[11px] text-gray-400 leading-relaxed mt-1'>
                    בחר עמוד כדי לשנות רק אותו. כל מה שלא תיגע בו ממשיך לרשת מעיצוב הספר,
                    גם אם תחליף פריסט אחר כך.
                </p>
            ) : (
                <>
                    {/* The real template, the real merged style. What you
                        tune here is what the printer receives. */}
                    <div className='flex gap-3 mt-2 mb-3'>
                        <div className='shrink-0 rounded-lg overflow-hidden' style={{ width: 120, height: 120, border: '1px solid #ead9b3' }}>
                            <BookPageTemplate
                                entry={{ ...selected, pageStyle: draft }}
                                styleSettings={{ ...(styleSettings || {}), locale: styleSettings?.locale }}
                                scaledWidth={120}
                                scaledHeight={120}
                            />
                        </div>
                        <div className='min-w-0 flex-1'>
                            <p className='text-[12px] font-bold text-[#3d2e1a] truncate'>{selected.name || 'ללא שם'}</p>
                            <p className='text-[10.5px] text-gray-400 mt-0.5'>
                                עמוד {pageLabel(pageIndex.byEntry[selected.id]) || '—'} · {pinned.size} שינויים לעמוד הזה
                            </p>
                            {pinned.size > 0 && (
                                <button onClick={reset} className='mt-2 text-[10.5px] font-bold text-red-500 hover:text-red-600'>
                                    אפס הכל — חזרה לעיצוב הספר
                                </button>
                            )}
                        </div>
                    </div>

                    {error && (
                        <div className='mb-2 px-2 py-1.5 rounded text-[11px]' style={{ background: '#fff5f5', color: '#b32424' }}>
                            {error}
                        </div>
                    )}

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
                        hint='״ללא חיתוך״ מראה את התמונה השלמה גם אם הספר כולו חותך'
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
                                style={effective.backgroundUrl === null && pinned.has('backgroundUrl')
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
                </>
            )}
            </div>
            )}
        </div>
    )
}
