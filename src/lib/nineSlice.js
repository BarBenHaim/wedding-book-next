// src/lib/nineSlice.js
//
// Turning any uploaded picture into a photo frame.
//
// The old uploaded-frame path stretched the artwork across the whole
// photo slot with object-fit:fill. That forced two things on whoever
// made the frame: it had to be TRANSPARENT in the middle, or it covered
// the photo; and it had to be drawn at the slot's exact proportions, or
// it came out visibly squashed. Hence "you need a transparent PNG at a
// certain resolution" — a rule nobody can satisfy from a stock frame.
//
// Nine-slice removes both. The source is cut into a 3×3 grid: four
// corners, four edges, and a middle that is simply never drawn. The
// corners keep their shape at any slot size, the edges stretch along
// their own axis only, and the middle — the part that would have to be
// transparent — does not exist. Any resolution, any aspect ratio, any
// opaque JPEG.
//
// ── Why this is not `border-image` ──────────────────────────────────
//
// CSS does exactly this in one line. The book, however, is exported to
// PDF through html2canvas, which does not implement border-image: the
// frame would look right on every screen and vanish from the printed
// book, which is the one place it actually matters. So the geometry is
// computed here and drawn as eight ordinary <img> elements inside
// clipping boxes, which html2canvas renders faithfully.
//
// Everything below is proportional, so the source's pixel dimensions
// never enter the maths — that is what makes "any resolution" true
// rather than aspirational.

/** How much of the source is border, when nobody has said. */
export const DEFAULT_SLICE_PCT = 30

/** Below this the slice is a hairline; above it the middle vanishes. */
export const MIN_SLICE_PCT = 4
export const MAX_SLICE_PCT = 45

/**
 * The slice as a fraction, clamped, or null when there is no usable one.
 *
 * null is the signal that separates the two eras: a frame saved before
 * this existed has no slice, and must keep rendering the old way.
 */
export function normalizeSlice(value) {
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) return null
    return Math.min(MAX_SLICE_PCT, Math.max(MIN_SLICE_PCT, n)) / 100
}

/**
 * The eight drawable pieces of the frame.
 *
 * Each piece is a clipping box (x/y/w/h) plus the position and size the
 * WHOLE source image takes inside it. Showing a region by scaling the
 * whole image and clipping — rather than cropping it — is what keeps
 * this independent of the source's pixel size.
 */
export function nineSlicePieces({ boxW, boxH, slicePct, borderPx } = {}) {
    const s = normalizeSlice(slicePct)
    const W = Number(boxW)
    const H = Number(boxH)
    if (!s || !(W > 0) || !(H > 0)) return null

    // A border thicker than half the box would make the four corners
    // overlap in the middle and the edges take negative size.
    const raw = Number(borderPx)
    const b = Math.max(1, Math.min(Number.isFinite(raw) ? raw : 0, Math.min(W, H) / 2 - 1))

    const midW = Math.max(0, W - 2 * b)
    const midH = Math.max(0, H - 2 * b)
    const cornerImg = b / s // whole source, scaled so its corner cell is b×b
    const far = cornerImg * (1 - s) // how far to slide it to reach the far cell

    const pieces = [
        { key: 'tl', x: 0, y: 0, w: b, h: b, imgW: cornerImg, imgH: cornerImg, imgX: 0, imgY: 0 },
        { key: 'tr', x: W - b, y: 0, w: b, h: b, imgW: cornerImg, imgH: cornerImg, imgX: -far, imgY: 0 },
        { key: 'bl', x: 0, y: H - b, w: b, h: b, imgW: cornerImg, imgH: cornerImg, imgX: 0, imgY: -far },
        { key: 'br', x: W - b, y: H - b, w: b, h: b, imgW: cornerImg, imgH: cornerImg, imgX: -far, imgY: -far },
    ]

    // Edges stretch along their own axis and keep their thickness on the
    // other — the whole reason a frame drawn at 4:3 survives a portrait
    // slot instead of being squashed.
    if (midW > 0) {
        const imgW = midW / (1 - 2 * s)
        const imgH = cornerImg
        pieces.push({ key: 't', x: b, y: 0, w: midW, h: b, imgW, imgH, imgX: -imgW * s, imgY: 0 })
        pieces.push({ key: 'b', x: b, y: H - b, w: midW, h: b, imgW, imgH, imgX: -imgW * s, imgY: -imgH * (1 - s) })
    }
    if (midH > 0) {
        const imgW = cornerImg
        const imgH = midH / (1 - 2 * s)
        pieces.push({ key: 'l', x: 0, y: b, w: b, h: midH, imgW, imgH, imgX: 0, imgY: -imgH * s })
        pieces.push({ key: 'r', x: W - b, y: b, w: b, h: midH, imgW, imgH, imgX: -imgW * (1 - s), imgY: -imgH * s })
    }

    return { border: b, pieces }
}

/**
 * Where the photo goes: the box minus the frame ring on all four sides.
 *
 * The framed block keeps the footprint the layout gave it — the frame
 * eats inward and the photo shrinks — which is the same contract the
 * built-in frames honour, so page composition never moves.
 */
export function nineSliceInner({ boxW, boxH, borderPx } = {}) {
    const W = Number(boxW)
    const H = Number(boxH)
    if (!(W > 0) || !(H > 0)) return null
    const raw = Number(borderPx)
    const b = Math.max(0, Math.min(Number.isFinite(raw) ? raw : 0, Math.min(W, H) / 2 - 1))
    return { border: b, x: b, y: b, w: Math.max(1, W - 2 * b), h: Math.max(1, H - 2 * b) }
}

export default { DEFAULT_SLICE_PCT, MIN_SLICE_PCT, MAX_SLICE_PCT, normalizeSlice, nineSlicePieces, nineSliceInner }
