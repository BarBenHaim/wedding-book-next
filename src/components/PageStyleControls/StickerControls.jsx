'use client'

// The sticker part of the page editor: a tray to add from, the stickers on this
// page, and for the chosen one a nine-point position pad, size, rotation, flip,
// duplicate and delete. No dragging on purpose: the page sits inside a flipbook
// that turns on a drag, so placement is by pad and sliders, which also works
// with a thumb on a phone. `stickers` is the page's own list; `onChange` gets the
// whole new list (the caller sanitises and saves it).

import { useState } from 'react'
import {
    STICKER_LIBRARY, STICKER_LABELS_HE, STICKER_GROUPS_HE, STICKER_LIMITS, STICKER_ANCHORS,
    stickerById, newSticker, sanitizeStickers,
} from '@/lib/stickers'

const GOLD = '#AA8840'

function Slider({ label, value, min, max, step = 1, onChange, suffix = '' }) {
    return (
        <label className='flex items-center gap-2 mb-1.5'>
            <span className='text-[11px] font-bold text-gray-500 w-14 shrink-0'>{label}</span>
            <input type='range' min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className='flex-1 accent-[#AA8840]' />
            <span className='text-[11px] font-bold text-gray-500 w-12 text-left tabular-nums' dir='ltr'>{value}{suffix}</span>
        </label>
    )
}

export default function StickerControls({ stickers = [], onChange }) {
    const list = sanitizeStickers(stickers)
    const [picked, setPicked] = useState(0)
    const sel = list[Math.min(picked, list.length - 1)] ? Math.min(picked, list.length - 1) : -1
    const current = sel >= 0 ? list[sel] : null
    const full = list.length >= STICKER_LIMITS.max

    const commit = next => onChange(sanitizeStickers(next))
    const patch = (i, p) => commit(list.map((s, j) => (j === i ? { ...s, ...p } : s)))

    const add = kind => {
        if (full) return
        // spread new ones over the corners so they do not land on each other
        const anchors = ['tr', 'bl', 'tl', 'br', 'tc', 'bc']
        const made = newSticker(kind, anchors[list.length % anchors.length])
        if (!made) return
        commit([...list, made])
        setPicked(list.length)
    }
    const remove = i => {
        commit(list.filter((_, j) => j !== i))
        setPicked(Math.max(0, i - 1))
    }
    const duplicate = i => {
        if (full) return
        const s = list[i]
        commit([...list, { ...s, x: Math.min(100, s.x + 6), y: Math.min(100, s.y + 6) }])
        setPicked(list.length)
    }

    const groups = Object.keys(STICKER_GROUPS_HE)

    return (
        <div>
            {groups.map(g => (
                <div key={g} className='mb-2'>
                    <div className='text-[10.5px] font-bold text-gray-400 mb-1'>{STICKER_GROUPS_HE[g]}</div>
                    <div className='flex flex-wrap gap-1.5'>
                        {STICKER_LIBRARY.filter(s => s.group === g).map(s => (
                            <button
                                key={s.id}
                                type='button'
                                onClick={() => add(s.id)}
                                disabled={full}
                                title={STICKER_LABELS_HE[s.id]}
                                aria-label={`הוספת מדבקה: ${STICKER_LABELS_HE[s.id]}`}
                                className='w-11 h-11 rounded-lg flex items-center justify-center transition-transform active:scale-95 disabled:opacity-40'
                                style={{ background: '#fff', border: '1px solid #ead9b3' }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={s.url} alt='' draggable={false} style={{ maxWidth: '84%', maxHeight: '84%', objectFit: 'contain' }} />
                            </button>
                        ))}
                    </div>
                </div>
            ))}
            {full && <p className='text-[10px] text-amber-700 mb-1'>עד {STICKER_LIMITS.max} מדבקות בעמוד</p>}

            {list.length > 0 && (
                <div className='mt-3 pt-2 border-t border-[#ead9b3]'>
                    <div className='flex flex-wrap gap-1.5 mb-2'>
                        {list.map((s, i) => (
                            <button
                                key={`${s.k}-${i}`}
                                type='button'
                                onClick={() => setPicked(i)}
                                title={STICKER_LABELS_HE[s.k]}
                                className='w-9 h-9 rounded-lg flex items-center justify-center'
                                style={{ background: '#fff', border: i === sel ? `2px solid ${GOLD}` : '1px solid #ead9b3' }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={stickerById(s.k)?.url} alt='' draggable={false} style={{ maxWidth: '80%', maxHeight: '80%', objectFit: 'contain' }} />
                            </button>
                        ))}
                    </div>

                    {current && (
                        <div>
                            <div className='flex items-start gap-3 mb-2'>
                                <div className='grid grid-cols-3 gap-1' dir='ltr' role='group' aria-label='מיקום המדבקה בעמוד'>
                                    {STICKER_ANCHORS.map(a => (
                                        <button
                                            key={a.id}
                                            type='button'
                                            title={a.label}
                                            aria-label={a.label}
                                            onClick={() => patch(sel, { x: a.x, y: a.y })}
                                            className='w-7 h-7 rounded'
                                            style={{
                                                background: Math.abs(current.x - a.x) < 5 && Math.abs(current.y - a.y) < 5 ? GOLD : '#fff',
                                                border: '1px solid #ead9b3',
                                            }}
                                        />
                                    ))}
                                </div>
                                <div className='flex flex-col gap-1.5'>
                                    <button type='button' onClick={() => patch(sel, { f: current.f ? 0 : 1 })} className='px-2 py-1 rounded-lg text-[11px] font-bold' style={{ background: '#fff', border: '1px solid #ead9b3', color: '#7a6a52' }}>
                                        {current.f ? 'ביטול היפוך' : 'היפוך'}
                                    </button>
                                    <button type='button' onClick={() => duplicate(sel)} disabled={full} className='px-2 py-1 rounded-lg text-[11px] font-bold disabled:opacity-40' style={{ background: '#fff', border: '1px solid #ead9b3', color: '#7a6a52' }}>
                                        שכפול
                                    </button>
                                    <button type='button' onClick={() => remove(sel)} className='px-2 py-1 rounded-lg text-[11px] font-bold' style={{ background: '#fff', border: '1px solid #e6b8b8', color: '#b04646' }}>
                                        מחיקה
                                    </button>
                                </div>
                            </div>
                            <Slider label='גודל' value={current.s} min={STICKER_LIMITS.minSize} max={STICKER_LIMITS.maxSize} onChange={v => patch(sel, { s: v })} suffix='%' />
                            <Slider label='סיבוב' value={current.r} min={STICKER_LIMITS.minRot} max={STICKER_LIMITS.maxRot} onChange={v => patch(sel, { r: v })} suffix='°' />
                            <Slider label='מהשמאל' value={Math.round(current.x)} min={-10} max={110} onChange={v => patch(sel, { x: v })} suffix='%' />
                            <Slider label='מלמעלה' value={Math.round(current.y)} min={-10} max={110} onChange={v => patch(sel, { y: v })} suffix='%' />
                        </div>
                    )}

                    <button type='button' onClick={() => { commit([]); setPicked(0) }} className='mt-1 text-[10.5px] font-bold text-gray-400 hover:text-gray-600'>
                        הסרת כל המדבקות מהעמוד
                    </button>
                </div>
            )}
        </div>
    )
}
