// src/lib/defaultCovers.js — pure: the cover a book has when nobody made one.
//
// A book must never come out with a blank cover. Every event type has a finished cover in
// /public/covers (title and ornaments baked into the art, same family as the two covers the
// studio already held for bar mitzvah and wedding). The art lives in the repo, not in Storage:
// same origin, so the digital book, the print exports and the share card load it without CORS or
// blocked-storage trouble.
//
// "Nobody made one" is judged by the same cascade BookCoverTemplate paints with:
//   - a cover photo (coverImage),
//   - a cover background (coverTexture), where the string 'none' is an explicit choice and counts,
//   - a book texture (texture),
//   - or a typed title or subtitle.
// Any of these means the owner (or a preset) already dressed the cover, and it is left exactly as is.

export const DEFAULT_COVER_KEYS = Object.freeze(['bar_mitzvah', 'bat_mitzvah', 'wedding', 'birthday', 'poker', 'travel', 'other'])

// The twins' book is a bar mitzvah book. An unknown or missing type gets the neutral cover.
const KEY_BY_TYPE = Object.freeze({
    bar_mitzvah: 'bar_mitzvah',
    twins_bar_mitzvah: 'bar_mitzvah',
    bat_mitzvah: 'bat_mitzvah',
    wedding: 'wedding',
    birthday: 'birthday',
    poker: 'poker',
    travel: 'travel',
})

export function defaultCoverKey(eventType) {
    // No normalising through eventTypes.js: that one turns an unknown type into 'wedding', and a book
    // of unknown kind must not say "from the wedding" on its cover.
    return (typeof eventType === 'string' && Object.prototype.hasOwnProperty.call(KEY_BY_TYPE, eventType) && KEY_BY_TYPE[eventType]) || 'other'
}

/** Site-relative path of the default cover for an event type. */
export function defaultCoverUrl(eventType) {
    return `/covers/${defaultCoverKey(eventType)}.webp`
}

const filled = v => typeof v === 'string' && v.trim() !== ''

/**
 * True when nothing has dressed the cover yet. `settings` is the merged cover/book style the
 * template paints with (coverImage, coverTexture, texture, coverTitle, coverSubtitle ...).
 */
export function coverIsUndressed(settings) {
    const s = settings || {}
    if (filled(s.coverImage)) return false
    if (s.coverTexture !== null && s.coverTexture !== undefined) return false // a URL, or the explicit 'none'
    if (filled(s.texture)) return false
    if (filled(s.coverTitle) || filled(s.coverSubtitle)) return false
    return true
}

/** The cover background to paint for these settings and event type, or null when the cover is already dressed. */
export function fallbackCoverTexture(settings, eventType) {
    return coverIsUndressed(settings) ? defaultCoverUrl(eventType) : null
}
