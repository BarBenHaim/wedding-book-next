// src/lib/stickers.js — pure: the stickers a page can carry.
//
// A sticker is a small painted picture (flower, star, ribbon, balloons...)
// the operator places on ONE page of the book from the page editor. It
// is stored with the page (`pageStyle.stickers`), drawn on top of
// whatever the page shows, and printed with it, because every surface
// that renders a page goes through BookPageTemplate, which draws them.
//
//   { k: 'peony', x: 82, y: 14, s: 22, r: -12, f: 0 }
//
//   k  which sticker (an id from STICKER_LIBRARY; unknown ids are dropped)
//   x  centre, % of the page width      y  centre, % of the page height
//   s  width, % of the page width       r  rotation in degrees
//   f  1 = mirrored left-right
//
// Everything is a percentage of the page, so one placement is right at
// the thumbnail, on screen and at 300 DPI in the print export.
//
// Pictures are small transparent PNGs in public/stickers/, painted with
// Codex. They are files rather than SVG because they are painted, not
// drawn; each is ~512px, which is 4 cm at 300 DPI before it looks soft.

export const STICKER_LIBRARY = [
    // flowers and greenery
    { id: 'peony', label: 'peony', group: 'flowers' },
    { id: 'rose', label: 'rose', group: 'flowers' },
    { id: 'daisy', label: 'daisy', group: 'flowers' },
    { id: 'olive', label: 'olive', group: 'flowers' },
    { id: 'eucalyptus', label: 'eucalyptus', group: 'flowers' },
    { id: 'lavender', label: 'lavender', group: 'flowers' },
    // shine and hearts
    { id: 'gold-stars', label: 'stars', group: 'shine' },
    { id: 'gold-heart', label: 'gold heart', group: 'shine' },
    { id: 'blue-heart', label: 'blue heart', group: 'shine' },
    { id: 'sparkles', label: 'sparkles', group: 'shine' },
    { id: 'navy-bow', label: 'bow', group: 'shine' },
    { id: 'butterfly', label: 'butterfly', group: 'shine' },
    // celebration
    { id: 'confetti', label: 'confetti', group: 'party' },
    { id: 'balloons', label: 'balloons', group: 'party' },
    { id: 'cake', label: 'cake', group: 'party' },
    { id: 'champagne', label: 'champagne', group: 'party' },
    { id: 'rings', label: 'rings', group: 'party' },
    { id: 'magen-david', label: 'star of david', group: 'party' },
    // tape, to hold a photo down
    { id: 'tape-blush', label: 'tape pink', group: 'tape' },
    { id: 'tape-blue', label: 'tape blue', group: 'tape' },
].map(s => ({ ...s, url: `/stickers/${s.id}.png` }))

/** Hebrew labels and group titles, kept apart from the ids. */
export const STICKER_LABELS_HE = {
    peony: 'אדמונית', rose: 'ורד', daisy: 'חרציות', olive: 'ענף זית', eucalyptus: 'אקליפטוס', lavender: 'לבנדר',
    'gold-stars': 'כוכבי זהב', 'gold-heart': 'לב זהב', 'blue-heart': 'לב כחול', sparkles: 'נצנצים', 'navy-bow': 'פפיון', butterfly: 'פרפר',
    confetti: 'קונפטי', balloons: 'בלונים', cake: 'עוגה', champagne: 'שמפניה', rings: 'טבעות', 'magen-david': 'מגן דוד',
    'tape-blush': 'דבק ורוד', 'tape-blue': 'דבק כחול',
}
export const STICKER_GROUPS_HE = { flowers: 'פרחים', shine: 'נצנוץ ולבבות', party: 'חגיגה', tape: 'דבק נייר' }

export const STICKER_LIMITS = Object.freeze({ max: 12, minSize: 4, maxSize: 70, minRot: -180, maxRot: 180 })

const BY_ID = new Map(STICKER_LIBRARY.map(s => [s.id, s]))
export const stickerById = id => BY_ID.get(id) || null

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback)
const round1 = n => Math.round(n * 10) / 10

/**
 * Whatever came out of Firestore or the browser, as a clean list: only
 * known stickers, numbers kept in range, at most STICKER_LIMITS.max. The
 * same function runs in the editor, the API and the renderer, so a bad
 * value can never reach a page.
 */
export function sanitizeStickers(raw) {
    if (!Array.isArray(raw)) return []
    const out = []
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue
        if (!stickerById(item.k)) continue
        out.push({
            k: item.k,
            x: round1(clamp(num(item.x, 50), -10, 110)),
            y: round1(clamp(num(item.y, 50), -10, 110)),
            s: round1(clamp(num(item.s, 20), STICKER_LIMITS.minSize, STICKER_LIMITS.maxSize)),
            r: Math.round(clamp(num(item.r, 0), STICKER_LIMITS.minRot, STICKER_LIMITS.maxRot)),
            f: item.f ? 1 : 0,
        })
        if (out.length >= STICKER_LIMITS.max) break
    }
    return out
}

/** The nine places the editor offers, as % of the page: corners, edges, centre. */
export const STICKER_ANCHORS = [
    { id: 'tl', label: 'למעלה, שמאל', x: 14, y: 14 },
    { id: 'tc', label: 'למעלה', x: 50, y: 10 },
    { id: 'tr', label: 'למעלה, ימין', x: 86, y: 14 },
    { id: 'ml', label: 'שמאל', x: 10, y: 50 },
    { id: 'mc', label: 'מרכז', x: 50, y: 50 },
    { id: 'mr', label: 'ימין', x: 90, y: 50 },
    { id: 'bl', label: 'למטה, שמאל', x: 14, y: 86 },
    { id: 'bc', label: 'למטה', x: 50, y: 90 },
    { id: 'br', label: 'למטה, ימין', x: 86, y: 86 },
]

/** A new sticker, dropped in a corner so it does not land on the blessing. */
export function newSticker(kind, anchor = 'tr') {
    const a = STICKER_ANCHORS.find(p => p.id === anchor) || STICKER_ANCHORS[2]
    return sanitizeStickers([{ k: kind, x: a.x, y: a.y, s: kind.startsWith('tape-') ? 26 : 20, r: kind.startsWith('tape-') ? -14 : 0, f: 0 }])[0] || null
}

/** CSS for one placed sticker (the layer positions it absolutely). */
export function stickerStyle(st) {
    return {
        position: 'absolute',
        left: `${st.x}%`,
        top: `${st.y}%`,
        width: `${st.s}%`,
        height: 'auto',
        transform: `translate(-50%, -50%) rotate(${st.r}deg)${st.f ? ' scaleX(-1)' : ''}`,
        transformOrigin: 'center',
        pointerEvents: 'none',
        userSelect: 'none',
    }
}
