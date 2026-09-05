// src/lib/pageStyle.js
//
// Per-page design overrides.
//
// A book's design is one object on the wedding, and that is right almost
// all of the time - it is what makes fifty pages look like one book. But
// "almost all" is doing real work in that sentence. One photo is a
// panorama and needs the whole width. One blessing is four lines and
// floats in the middle of an empty page. One page wants a darker
// background because the photo on it is nearly white. Today the only way
// to fix any of those is to change the design for all fifty pages, which
// trades one bad page for forty-nine.
//
// So: a page may override the global design, and the override is SPARSE.
// It holds only the keys that were deliberately changed, and everything
// else keeps inheriting. That is the whole design, and it is what makes
// the feature safe: switching the book's preset still re-styles every
// page, including the ones with overrides, in every respect the operator
// did not explicitly pin.
//
// ── What must never be overridable ──────────────────────────────────
//
// Pagination. `autoSplit`, `splitThreshold`, `entriesPerPage` and
// `photoLayout` decide which pages EXIST, and they are consumed by
// expandBookPages long before any page object is built. A per-page
// override of those would be circular - the page asking to be paginated
// differently does not exist until pagination has already run - and the
// value would either be silently ignored or, worse, applied on the
// second render and change the page count under the operator's cursor.
// They are excluded by whitelist rather than by documentation.

const PAGE_SURFACE_KEYS = [
    'backgroundColor', 'backgroundUrl', 'texture', 'frame',
    'pagePadding', 'borderRadius',
]

const PHOTO_KEYS = [
    'photoFit', 'imageStyle', 'imageMarginTop', 'imageMarginBottom',
    'imageAlign', 'photoFrame', 'photoFrameUrl', 'photoFrameInset',
    'photoFrameSlice',
    'windowOverlayUrl', 'windowShowName', 'windowNameBottom', 'windowNameColor',
    'albumPhoto',
]

const TEXT_KEYS = [
    'fontClass', 'fontClassLatin', 'nameFontClass', 'fontColor', 'nameColor',
    'fontSizePercent', 'nameFontSizePercent', 'fontWeight', 'nameFontWeight',
    'textAlign', 'nameAlign', 'nameMarginTop', 'nameMarginBottom', 'nameMaxWidth',
    'textMaxWidth', 'textMarginTop', 'textLineHeight',
    'fontFitTarget', 'fontMinFactor',
]

// `template` and `blessingTemplate` are in: they choose a layout
// component, not a page count, so a single page can safely be a polaroid
// in an otherwise classic book.
const STRUCTURE_KEYS = ['template', 'blessingTemplate']

export const PAGE_OVERRIDABLE_KEYS = [
    ...PAGE_SURFACE_KEYS, ...PHOTO_KEYS, ...TEXT_KEYS, ...STRUCTURE_KEYS,
]

// The four that decide which pages exist. Named so the test can assert
// they stay out rather than trusting the list above to stay correct.
export const PAGINATION_KEYS = ['autoSplit', 'splitThreshold', 'entriesPerPage', 'photoLayout']

const ALLOWED = new Set(PAGE_OVERRIDABLE_KEYS)

const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Keep only what a page is allowed to override, and drop anything empty.
 *
 * `undefined` is dropped because Firestore rejects it. An explicitly
 * stored `null` is KEPT, because null is a meaningful value in this
 * schema - `backgroundUrl: null` means "no background image", which is a
 * real thing to want on one page of a book whose global design has one.
 */
export function sanitizePageStyle(raw) {
    if (!isPlainObject(raw)) return {}
    const out = {}
    for (const [key, value] of Object.entries(raw)) {
        if (!ALLOWED.has(key)) continue
        if (value === undefined) continue
        if (key === 'imageStyle' || key === 'albumPhoto') {
            if (value === null) { out[key] = null; continue }
            if (!isPlainObject(value)) continue
            const nested = {}
            for (const [k, v] of Object.entries(value)) {
                if (v !== undefined) nested[k] = v
            }
            if (Object.keys(nested).length) out[key] = nested
            continue
        }
        out[key] = value
    }
    return out
}

/**
 * The style this specific page renders with.
 *
 * `imageStyle` merges one level deep for the same reason applyPresetClean
 * does: a page that only pins the photo width must keep the book's corner
 * radius, and vice versa. Everything else replaces wholesale.
 *
 * Applied AFTER the global resolution, including after the wedding's
 * no-crop flag, so a page can deliberately crop inside an album-mode book
 * - which is exactly the case the feature exists for. The more specific
 * instruction wins; that is what "per page" means.
 */
export function mergePageStyle(globalStyle, pageStyle) {
    const clean = sanitizePageStyle(pageStyle)
    if (!Object.keys(clean).length) return globalStyle
    const base = globalStyle || {}
    const out = { ...base, ...clean }
    if (clean.imageStyle && isPlainObject(base.imageStyle)) {
        out.imageStyle = { ...base.imageStyle, ...clean.imageStyle }
    }
    if (clean.albumPhoto && isPlainObject(base.albumPhoto)) {
        out.albumPhoto = { ...base.albumPhoto, ...clean.albumPhoto }
    }
    return out
}

/** The override carried by a page object, wherever expandBookPages put it. */
export function pageStyleOf(entry) {
    if (!entry) return null
    // A duo or photo-pair page holds two blessings and one surface. The
    // first one that has an override wins, because a page cannot have two
    // backgrounds and picking the first is at least predictable.
    if (Array.isArray(entry._duo) || Array.isArray(entry._photoPair)) {
        const pair = entry._duo || entry._photoPair
        for (const e of pair) {
            const s = sanitizePageStyle(e?.pageStyle)
            if (Object.keys(s).length) return s
        }
        return null
    }
    const s = sanitizePageStyle(entry.pageStyle)
    return Object.keys(s).length ? s : null
}

/** Does this page depart from the book's design at all? */
export function hasOverrides(pageStyle) {
    return Object.keys(sanitizePageStyle(pageStyle)).length > 0
}

/** Which keys depart, for the "N settings overridden" badge and the reset. */
export function overriddenKeys(pageStyle) {
    return Object.keys(sanitizePageStyle(pageStyle)).sort()
}

export default {
    PAGE_OVERRIDABLE_KEYS, PAGINATION_KEYS,
    sanitizePageStyle, mergePageStyle, pageStyleOf, hasOverrides, overriddenKeys,
}
