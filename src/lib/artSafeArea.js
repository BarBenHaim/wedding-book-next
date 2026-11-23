// src/lib/artSafeArea.js — pure: how much of a house page background is art, so text never lands on it.
//
// The house backgrounds (public/backgrounds/book) keep their art at the edges and their middle calm.
// pagePadding was tuned by eye for a short blessing; a long one ran down over the skyline, the tallit
// stripes or the arches and was either unreadable or cut off. These are the busy bands measured from
// the images themselves (rows whose central 60% differs from the calm middle), in % of the page
// height, rounded up. They are used only as the limit a page's content may not cross; they never move
// content that already fits.
//
// Keyed by the file name, so every book that stores the URL of one of these backgrounds is covered,
// whether it got the background from a studio preset, the auto design or by picking it by hand.

const BOTTOM = Object.freeze({
    'bd-arches.webp': 19,
    'bd-balloons.webp': 6,
    'bd-splash.webp': 13,
    'bm-jerusalem-gold.webp': 15,
    'bm-jerusalem.webp': 14,
    'bm-tallit.webp': 13.5,
    'cl-indigo-wash.webp': 11,
    'cl-peach-sky.webp': 13,
    'nt-linen.webp': 5.5,
    'wd-silk.webp': 5,
})

const TOP = Object.freeze({
    'bd-arches.webp': 13,
    'bd-balloons.webp': 8.5,
    'bd-splash.webp': 11,
    'bm-jerusalem-gold.webp': 9.5,
    'bm-jerusalem.webp': 8.5,
    'bm-tallit.webp': 13.5,
    'cl-indigo-wash.webp': 11.5,
    'cl-peach-sky.webp': 17,
    'nt-linen.webp': 6.5,
    'wd-silk.webp': 8.5,
})

const base = url => {
    if (typeof url !== 'string') return ''
    const clean = url.split('?')[0].split('#')[0]
    return clean.slice(clean.lastIndexOf('/') + 1)
}

/** Bottom band of the background that is art, in % of the page height (0 for an unknown background). */
export function artSafeBottomPct(backgroundUrl) {
    return BOTTOM[base(backgroundUrl)] || 0
}

/** Top band of the background that is art, in % of the page height (0 for an unknown background). */
export function artSafeTopPct(backgroundUrl) {
    return TOP[base(backgroundUrl)] || 0
}

/**
 * The squeeze ladder for a page whose content does not fit between the art bands: the photo
 * shrinks first, the text column widens a little, and the blessing's font goes a little past the
 * floor the length-based fit already uses. Step 0 is the page exactly as designed.
 */
export const SQUEEZE_STEPS = Object.freeze([
    { photo: 1, text: 1, wide: 1 },
    { photo: 0.88, text: 1, wide: 1 },
    { photo: 0.76, text: 0.95, wide: 1 },
    { photo: 0.64, text: 0.9, wide: 1.1 },
    { photo: 0.52, text: 0.85, wide: 1.2 },
    { photo: 0.44, text: 0.8, wide: 1.3 },
    { photo: 0.34, text: 0.75, wide: 1.3 },
    { photo: 0.26, text: 0.7, wide: 1.35 },
])

/** The text column may widen while squeezed (more characters per line), never past the margins the art needs. */
export const MAX_SQUEEZED_TEXT_WIDTH_PCT = 84

/** Does content spanning [top, bottom] (px, from the page's top edge) fit between the limits? */
export function contentFits({ top, bottom, pageHeight, padTop, padBottom, artTop = 0, artBottom = 0, centered = false, slack = 1 }) {
    const bottomLimit = pageHeight - Math.max(padBottom, artBottom)
    if (bottom > bottomLimit + slack) return false
    // A page that is not centred keeps the top where the design put it; a centred one (text only) grows both ways.
    if (centered && top < Math.max(padTop, artTop) - slack) return false
    return true
}
