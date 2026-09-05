// src/lib/albumTreatments.js
//
// How a photograph meets the page.
//
// The same picture in the same rectangle can read as a snapshot taped to
// a scrapbook, as a plate in an art book, or as the page itself. That
// choice — the TREATMENT — carries more of the design than the geometry
// does, and it is the cheapest variety in the system: twelve layouts
// times six treatments is not eighteen pages, it is seventy-two.
//
// Every function here is pure and returns STYLE DESCRIPTORS, never
// markup. The renderer decides how to paint them; the planner can reason
// about them without a DOM; the tests can assert on them.
//
// ── Two decisions that look wrong until you print something ──────────
//
// 1. NO CSS MASKS. `mask-image` is the obvious way to fade a photo into
//    the page, and html2canvas — which rasterises every page for the
//    printed PDF — does not implement it. A masked photo would look
//    perfect on screen and come out as a hard-edged rectangle in the
//    book. So a fade is an OVERLAY: a gradient from transparent to the
//    paper colour, painted on top. On a flat paper ground the result is
//    pixel-identical to a mask, and it survives the print pass.
//
// 2. NO BLUR. Same reason — html2canvas cannot blur, so a blurred
//    backdrop would silently vanish from the PDF. Where a page wants a
//    photograph to fill it without cropping the photograph, the backdrop
//    is built from the picture's OWN AVERAGE COLOUR, sampled once in the
//    studio and stored as `tone`. It is not a compromise: a two-stop
//    wash in the photo's own colour reads as deliberate art direction,
//    while a blurred enlargement reads as a phone wallpaper.
//
// Both rules come from the same discipline as the rest of the album: the
// screen and the printed page render in different passes and must agree
// exactly, so anything one of them cannot do, neither of them uses.

export const TREATMENTS = [
    'plain',        // the photograph, nothing added
    'framed',       // a paper border, a hairline, a whisper of a shadow
    'card',         // framed, with a mat — deeper, for a hero
    'soft-edge',    // fades into the paper on one or more sides
    'vignette',     // fades on all sides, radially
    'bleed',        // fills its area exactly; the ONE treatment that crops
]

/** Which edges a soft-edge treatment eats into. */
export const FADE_SIDES = ['right', 'left', 'bottom', 'top', 'sides', 'all']

const clamp01 = n => Math.min(1, Math.max(0, Number(n) || 0))

/**
 * A photograph's own colour, as two stops for a wash.
 *
 * `tone` is sampled in the studio (a 1×1 canvas draw) and stored with
 * the photo, so this never touches a bitmap at plan time.
 */
export function toneWash(tone, paper, strength = 0.5) {
    const t = typeof tone === 'string' && /^#[0-9a-fA-F]{6}$/.test(tone) ? tone : null
    if (!t) return `linear-gradient(180deg, ${paper} 0%, ${paper} 100%)`
    const s = clamp01(strength)
    return `linear-gradient(160deg, ${t}${alpha(0.85 * s)} 0%, ${t}${alpha(0.35 * s)} 55%, ${paper} 100%)`
}

/** 0..1 → a two-digit hex alpha suffix. */
function alpha(a) {
    const v = Math.round(clamp01(a) * 255)
        .toString(16)
        .padStart(2, '0')
    return v
}

/**
 * Resolve a treatment into things a renderer can paint.
 *
 * @returns {{
 *   photo: object,          // styles for the <img> itself
 *   frame: object|null,     // styles for a wrapper drawn behind/around it
 *   overlays: Array<object>,// absolutely-positioned gradients ON TOP
 *   rotate: number,         // degrees
 *   crops: boolean,         // true only for 'bleed'
 * }}
 */
export function resolveTreatment(kind, opts = {}) {
    const {
        paper = '#ffffff',
        ink = '#1a1a1a',
        accent = '#aa8840',
        rotate = 0,
        fade = 'right',
        fadeDepth = 0.42,
        scale = 1, // page width / 1000, so borders stay proportional
    } = opts

    const px = n => `${(n * scale).toFixed(2)}px`
    const base = { photo: {}, frame: null, overlays: [], rotate, crops: false }

    switch (kind) {
        case 'framed':
            return {
                ...base,
                frame: {
                    background: paper,
                    padding: px(10),
                    boxShadow: `0 ${px(2)} ${px(10)} rgba(0,0,0,0.10)`,
                    border: `${px(1)} solid ${hexA(ink, 0.07)}`,
                },
            }

        case 'card':
            return {
                ...base,
                frame: {
                    background: paper,
                    padding: `${px(16)} ${px(16)} ${px(30)}`,
                    boxShadow: `0 ${px(3)} ${px(16)} rgba(0,0,0,0.13)`,
                    border: `${px(1)} solid ${hexA(accent, 0.28)}`,
                },
            }

        case 'soft-edge': {
            // The fade is painted ON the photo in the paper's colour, not
            // cut out of it — see the note at the top of this file.
            const d = Math.round(clamp01(fadeDepth) * 100)
            const stops = {
                right:  `linear-gradient(to right,  transparent ${100 - d}%, ${paper} 100%)`,
                left:   `linear-gradient(to left,   transparent ${100 - d}%, ${paper} 100%)`,
                bottom: `linear-gradient(to bottom, transparent ${100 - d}%, ${paper} 100%)`,
                top:    `linear-gradient(to top,    transparent ${100 - d}%, ${paper} 100%)`,
            }
            // 'sides' exists because 'all' on a wide photograph eats it
            // from four directions at once and the result reads as a
            // smudge rather than a picture dissolving into paper. A
            // panorama wants its short edges softened and nothing else.
            const sides = fade === 'all' ? ['right', 'left', 'bottom', 'top']
                : fade === 'sides' ? ['right', 'left']
                : [fade]
            return {
                ...base,
                overlays: sides.filter(s => stops[s]).map(s => ({ backgroundImage: stops[s] })),
            }
        }

        case 'vignette':
            return {
                ...base,
                overlays: [{
                    backgroundImage: `radial-gradient(ellipse at center, transparent 52%, ${paper} 100%)`,
                }],
            }

        case 'bleed':
            // The only treatment that may crop, and it is never applied to
            // a photograph the album is showing — only to an ambient copy
            // behind one. See albumScene.js.
            return { ...base, photo: { objectFit: 'cover' }, crops: true }

        case 'plain':
        default:
            return base
    }
}

/** #rrggbb + alpha → rgba(). Keeps the descriptors readable in tests. */
export function hexA(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex))
    if (!m) return `rgba(0,0,0,${a})`
    const n = parseInt(m[1], 16)
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/**
 * Pick a treatment for a photo in a slot.
 *
 * The recipe offers a shortlist; the photo's own shape decides among
 * them. A panorama wants its edges to dissolve, a portrait wants a
 * frame to stand in, a square is happiest as a card. Deterministic:
 * same slot, same photo, same answer.
 */
export function chooseTreatment(allowed, aspect, seedIndex = 0) {
    const list = (Array.isArray(allowed) ? allowed : []).filter(t => TREATMENTS.includes(t))
    if (!list.length) return 'plain'
    if (list.length === 1) return list[0]
    const a = Number(aspect) || 1.5
    const wants = a >= 2.2 ? 'soft-edge' : a <= 0.85 ? 'framed' : a <= 1.15 ? 'card' : 'plain'
    if (list.includes(wants)) return wants
    // No preference available — rotate through what there is, by
    // position, so a page of four does not get four identical treatments.
    return list[seedIndex % list.length]
}
