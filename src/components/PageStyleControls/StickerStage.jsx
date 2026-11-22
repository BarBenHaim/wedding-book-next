'use client'

// The sticker stage: the page, large, in a window of its own, with every
// sticker on it movable by hand. Drag to move; drag the round handle to
// resize and turn at once; the buttons flip, copy, bring to front and delete;
// the arrow keys nudge.
//
// It is a window rather than a layer on the flipbook because the flipbook
// turns the page on a drag. Here a drag means "move this sticker", and that
// is all it means.
//
// What is drawn is the real page: BookPageTemplate, the same component the
// flipbook and the print export use, so what is placed here is what prints.
// The boxes and handles over it are only for the hand. A split entry is two
// pages that share one style, so it gets a tab per page and a sticker placed
// on one tab belongs to that page alone (stickers.js `pg`).

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import {
    STICKER_LIBRARY, STICKER_LABELS_HE, STICKER_LIMITS, stickerById, stickerShownOn, newSticker, sanitizeStickers,
} from '@/lib/stickers'

const GOLD = '#AA8840'
const BLUE = '#2545E0'

export default function StickerStage({ pages, styleSettings, stickers, onChange, onClose }) {
    const [mounted, setMounted] = useState(false)
    const [tab, setTab] = useState(0)
    const [sel, setSel] = useState(-1)
    const [size, setSize] = useState(420)
    const stageRef = useRef(null)
    const list = sanitizeStickers(stickers)
    const split = pages.length > 1
    const page = pages[Math.min(tab, pages.length - 1)]
    const side = split ? (page._split === 'photo' ? 'p' : 't') : null

    useEffect(() => { setMounted(true) }, [])

    // the stage is as large as the window allows, and square like the page
    useEffect(() => {
        const fit = () => setSize(Math.max(260, Math.min(620, Math.floor(Math.min(window.innerWidth - 28, window.innerHeight - 250)))))
        fit()
        window.addEventListener('resize', fit)
        return () => window.removeEventListener('resize', fit)
    }, [])

    const commit = useCallback(next => onChange(sanitizeStickers(next)), [onChange])
    const visible = list.map((st, i) => ({ st, i })).filter(({ st }) => stickerShownOn(st, page?._split))
    const current = sel >= 0 && list[sel] && stickerShownOn(list[sel], page?._split) ? list[sel] : null

    const patch = (i, p) => commit(list.map((s, j) => (j === i ? { ...s, ...p } : s)))
    const add = kind => {
        const made = newSticker(kind, 'mc', side)
        if (!made || list.length >= STICKER_LIMITS.max) return
        commit([...list, made])
        setSel(list.length)
    }
    const remove = i => { commit(list.filter((_, j) => j !== i)); setSel(-1) }
    const duplicate = i => {
        if (list.length >= STICKER_LIMITS.max) return
        const s = list[i]
        commit([...list, { ...s, x: s.x + 5, y: s.y + 5 }])
        setSel(list.length)
    }
    const toFront = i => { commit([...list.filter((_, j) => j !== i), list[i]]); setSel(list.length - 1) }

    // ── dragging ─────────────────────────────────────────────────────
    const drag = useRef(null)
    const stagePoint = e => {
        const r = stageRef.current.getBoundingClientRect()
        return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }
    }
    const startMove = (e, i) => {
        e.preventDefault()
        e.stopPropagation()
        e.currentTarget.setPointerCapture?.(e.pointerId)
        setSel(i)
        const p = stagePoint(e)
        drag.current = { mode: 'move', i, sx: p.x, sy: p.y, ox: list[i].x, oy: list[i].y }
    }
    const startTurn = (e, i) => {
        e.preventDefault()
        e.stopPropagation()
        e.currentTarget.setPointerCapture?.(e.pointerId)
        drag.current = { mode: 'turn', i }
    }
    const onMove = e => {
        const d = drag.current
        if (!d || !stageRef.current) return
        const p = stagePoint(e)
        const st = list[d.i]
        if (!st) return
        if (d.mode === 'move') {
            patch(d.i, { x: d.ox + ((p.x - d.sx) / p.w) * 100, y: d.oy + ((p.y - d.sy) / p.h) * 100 })
        } else {
            // the handle sits on the box's bottom corner: its distance from the
            // centre is the half-diagonal (size) and its direction is the turn
            const ar = stickerById(st.k)?.ar || 1
            const cx = (st.x / 100) * p.w, cy = (st.y / 100) * p.h
            const dx = p.x - cx, dy = p.y - cy
            const half = Math.hypot(dx, dy)
            const widthPx = (2 * half) / Math.sqrt(1 + 1 / (ar * ar))
            const base = Math.atan2(1 / ar, 1) // the corner's own angle in the unrotated box
            let deg = ((Math.atan2(dy, dx) - base) * 180) / Math.PI
            if (deg > 180) deg -= 360
            if (deg < -180) deg += 360
            // a light snap to upright, so a straight sticker is easy to get
            if (Math.abs(deg) < 4) deg = 0
            patch(d.i, { s: (widthPx / p.w) * 100, r: deg })
        }
    }
    const endDrag = () => { drag.current = null }

    const onKey = e => {
        if (!current) return
        const step = e.shiftKey ? 3 : 0.6
        const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
        if (moves[e.key]) { e.preventDefault(); patch(sel, { x: current.x + moves[e.key][0], y: current.y + moves[e.key][1] }) }
        else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(sel) }
        else if (e.key === 'Escape') setSel(-1)
    }

    if (!mounted) return null

    const btn = { background: '#fff', border: '1px solid #ead9b3', color: '#5a4a32', borderRadius: 10, padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }

    return createPortal(
        <div
            role='dialog' aria-modal='true' aria-label='עריכת מדבקות על העמוד' dir='rtl'
            style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(20,24,58,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10 }}
            onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag}
        >
            <div style={{ background: '#fffaf0', borderRadius: 18, padding: 12, maxHeight: '98vh', overflow: 'auto', boxShadow: '0 30px 60px -20px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <strong style={{ fontSize: 14, color: '#5a4a32' }}>מדבקות על העמוד</strong>
                        {split && pages.map((p, i) => (
                            <button key={p.id} type='button' onClick={() => { setTab(i); setSel(-1) }} style={{ ...btn, ...(i === tab ? { background: GOLD, color: '#fff', border: `1px solid ${GOLD}` } : {}) }}>
                                {p._split === 'photo' ? 'עמוד התמונה' : 'עמוד הברכה'}
                            </button>
                        ))}
                    </div>
                    <button type='button' onClick={onClose} style={{ ...btn, background: BLUE, color: '#fff', border: `1px solid ${BLUE}` }}>סיום</button>
                </div>

                <div
                    ref={stageRef} tabIndex={0} onKeyDown={onKey} onPointerDown={() => setSel(-1)}
                    style={{ position: 'relative', width: size, height: size, margin: '0 auto', boxShadow: '0 6px 24px rgba(0,0,0,0.25)', outline: 'none', touchAction: 'none', userSelect: 'none' }}
                >
                    <BookPageTemplate entry={page} styleSettings={styleSettings} scaledWidth={size} scaledHeight={size} />
                    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 40 }}>
                        {visible.map(({ st, i }) => {
                            const def = stickerById(st.k)
                            const on = i === sel
                            return (
                                <div
                                    key={`${st.k}-${i}`}
                                    onPointerDown={e => startMove(e, i)}
                                    style={{
                                        position: 'absolute', left: `${st.x}%`, top: `${st.y}%`, width: `${st.s}%`, aspectRatio: String(def?.ar || 1),
                                        transform: `translate(-50%, -50%) rotate(${st.r}deg)`, cursor: 'grab', touchAction: 'none',
                                        outline: on ? `2px solid ${BLUE}` : '1px dashed rgba(37,69,224,0.35)', outlineOffset: 1,
                                    }}
                                >
                                    {on && (
                                        <span
                                            onPointerDown={e => startTurn(e, i)}
                                            title='גרירה: גודל וסיבוב'
                                            style={{ position: 'absolute', right: -9, bottom: -9, width: 20, height: 20, borderRadius: 10, background: BLUE, border: '2px solid #fff', cursor: 'nwse-resize', touchAction: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }}
                                        />
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', margin: '8px 0', minHeight: 32, flexWrap: 'wrap' }}>
                    {current ? (
                        <>
                            <button type='button' style={btn} onClick={() => patch(sel, { f: current.f ? 0 : 1 })}>היפוך</button>
                            <button type='button' style={btn} onClick={() => duplicate(sel)} disabled={list.length >= STICKER_LIMITS.max}>שכפול</button>
                            <button type='button' style={btn} onClick={() => toFront(sel)}>לחזית</button>
                            <button type='button' style={{ ...btn, color: '#b04646', border: '1px solid #e6b8b8' }} onClick={() => remove(sel)}>מחיקה</button>
                        </>
                    ) : (
                        <span style={{ fontSize: 11.5, color: '#8a7a5c', alignSelf: 'center' }}>
                            {visible.length ? 'לוחצים על מדבקה כדי לבחור, וגוררים כדי להזיז' : 'בוחרים מדבקה מהסרגל למטה'}
                        </span>
                    )}
                </div>

                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, maxWidth: size }}>
                    {STICKER_LIBRARY.map(s => (
                        <button
                            key={s.id} type='button' onClick={() => add(s.id)} title={STICKER_LABELS_HE[s.id]}
                            aria-label={`הוספת מדבקה: ${STICKER_LABELS_HE[s.id]}`}
                            style={{ flex: 'none', width: 46, height: 46, borderRadius: 10, background: '#fff', border: '1px solid #ead9b3', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={s.url} alt='' draggable={false} style={{ maxWidth: '82%', maxHeight: '82%', objectFit: 'contain' }} />
                        </button>
                    ))}
                </div>
            </div>
        </div>,
        document.body,
    )
}
