import { describe, it, expect } from 'vitest'
import {
    normalizeSlice, nineSlicePieces, nineSliceInner,
    DEFAULT_SLICE_PCT, MIN_SLICE_PCT, MAX_SLICE_PCT,
} from '@/lib/nineSlice'

describe('normalizeSlice', () => {
    it('is null when there is nothing usable', () => {
        // null is load-bearing: it is what tells FramedPhoto that a frame
        // saved before nine-slice existed must keep rendering the old way.
        for (const v of [undefined, null, 0, -3, 'x', NaN, '']) {
            expect(normalizeSlice(v), String(v)).toBeNull()
        }
    })

    it('clamps instead of letting the middle disappear', () => {
        // At 50% the four corners meet and there is no middle left to
        // drop, which is the one thing this whole module is for.
        expect(normalizeSlice(80)).toBe(MAX_SLICE_PCT / 100)
        expect(normalizeSlice(0.5)).toBe(MIN_SLICE_PCT / 100)
        expect(normalizeSlice(30)).toBeCloseTo(0.3, 12)
    })
})

describe('nineSlicePieces', () => {
    const box = { boxW: 400, boxH: 300, slicePct: DEFAULT_SLICE_PCT, borderPx: 40 }

    it('gives eight pieces and never a ninth', () => {
        const { pieces } = nineSlicePieces(box)
        expect(pieces).toHaveLength(8)
        // The middle is the piece that would have to be transparent.
        // It is absent, not empty.
        expect(pieces.map(p => p.key).sort()).toEqual(['b', 'bl', 'br', 'l', 'r', 't', 'tl', 'tr'])
    })

    it('tiles the border ring exactly — no gaps, no overlaps', () => {
        // The property that makes it look like a frame rather than eight
        // rectangles: every edge meets its corners at the same pixel.
        const { pieces, border: b } = nineSlicePieces(box)
        const by = Object.fromEntries(pieces.map(p => [p.key, p]))
        expect(by.t.x).toBe(b)
        expect(by.t.x + by.t.w).toBe(box.boxW - b)
        expect(by.l.y).toBe(b)
        expect(by.l.y + by.l.h).toBe(box.boxH - b)
        expect(by.tr.x + by.tr.w).toBe(box.boxW)
        expect(by.br.y + by.br.h).toBe(box.boxH)
    })

    it('keeps corners square at any slot aspect', () => {
        // A frame drawn at 4:3 has to survive a portrait slot. Corners
        // hold their shape; only the edges stretch.
        for (const [w, h] of [[400, 300], [300, 400], [600, 200]]) {
            const { pieces, border } = nineSlicePieces({ ...box, boxW: w, boxH: h })
            for (const p of pieces.filter(x => x.key.length === 2)) {
                expect(p.w, `${w}x${h}`).toBe(border)
                expect(p.h, `${w}x${h}`).toBe(border)
            }
        }
    })

    it('stretches each edge along its own axis only', () => {
        const wide = nineSlicePieces({ ...box, boxW: 800 })
        const narrow = nineSlicePieces({ ...box, boxW: 400 })
        const t = k => o => o.pieces.find(p => p.key === k)
        // Wider slot → the top edge's source stretches horizontally and
        // its thickness does not move.
        expect(t('t')(wide).imgW).toBeGreaterThan(t('t')(narrow).imgW)
        expect(t('t')(wide).imgH).toBe(t('t')(narrow).imgH)
        // The left edge is untouched by width.
        expect(t('l')(wide).imgH).toBe(t('l')(narrow).imgH)
    })

    it('slides the source so each piece shows its own cell', () => {
        const { pieces } = nineSlicePieces(box)
        const by = Object.fromEntries(pieces.map(p => [p.key, p]))
        expect(by.tl.imgX).toBe(0)
        expect(by.tl.imgY).toBe(0)
        expect(by.tr.imgX).toBeLessThan(0)
        expect(by.tr.imgY).toBe(0)
        expect(by.br.imgX).toBeLessThan(0)
        expect(by.br.imgY).toBeLessThan(0)
        // The far corner sits exactly one "everything but the last cell"
        // to the left of its box.
        const s = DEFAULT_SLICE_PCT / 100
        expect(by.tr.imgX).toBeCloseTo(-(by.tr.imgW * (1 - s)), 10)
    })

    it('refuses a border thicker than the box can hold', () => {
        // Otherwise the corners overlap in the middle and the edges take
        // negative width — a frame that eats the photo.
        const { border, pieces } = nineSlicePieces({ ...box, boxW: 100, boxH: 80, borderPx: 400 })
        expect(border).toBeLessThan(40)
        expect(pieces.every(p => p.w > 0 && p.h > 0)).toBe(true)
    })

    it('drops the edges rather than drawing them backwards', () => {
        const r = nineSlicePieces({ boxW: 60, boxH: 60, slicePct: 30, borderPx: 29.5 })
        expect(r.pieces.every(p => p.w >= 0 && p.h >= 0)).toBe(true)
    })

    it('survives junk instead of emitting NaN into a style attribute', () => {
        for (const args of [
            {}, { boxW: 0, boxH: 300, slicePct: 30, borderPx: 10 },
            { boxW: 400, boxH: 300, slicePct: null, borderPx: 10 },
            { boxW: NaN, boxH: NaN, slicePct: 30, borderPx: 10 },
        ]) {
            expect(nineSlicePieces(args), JSON.stringify(args)).toBeNull()
        }
        const ok = nineSlicePieces({ boxW: 400, boxH: 300, slicePct: 30, borderPx: 'x' })
        expect(ok.pieces.every(p => Number.isFinite(p.imgW) && Number.isFinite(p.imgX))).toBe(true)
    })
})

describe('nineSliceInner', () => {
    it('is the box minus the ring, so the footprint never moves', () => {
        const r = nineSliceInner({ boxW: 400, boxH: 300, borderPx: 30 })
        expect(r).toEqual({ border: 30, x: 30, y: 30, w: 340, h: 240 })
    })

    it('never returns a photo with no room to be a photo', () => {
        const r = nineSliceInner({ boxW: 40, boxH: 40, borderPx: 500 })
        expect(r.w).toBeGreaterThan(0)
        expect(r.h).toBeGreaterThan(0)
    })

    it('survives junk', () => {
        expect(nineSliceInner({})).toBeNull()
        expect(nineSliceInner({ boxW: 400, boxH: 300, borderPx: undefined }).border).toBe(0)
    })
})
