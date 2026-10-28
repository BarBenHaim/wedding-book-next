// src/lib/twins.js
//
// Twins bar mitzvah — one event, one book, two boys.
//
// The guest scans the QR and picks who the blessing is for: one twin,
// the other, or both together. The choice travels as `?for=a|b|both`
// from the landing page to the blessing form, and is stored on the
// entry as `blessFor` so the family (and we, at print time) can see
// who each blessing was written to.
//
// ── Fields on the wedding doc ────────────────────────────────────────
//   eventType:       'twins_bar_mitzvah'
//   celebrantName:   first twin  (the slot every celebrant event uses)
//   celebrantName2:  second twin
//
// ── Field on the entry ───────────────────────────────────────────────
//   blessFor: 'a' | 'b' | 'both'  — written only on twins events, so
//   every other event's entries stay byte-identical to before. One
//   extra short string keeps the entry far below the 12-field ceiling
//   in firestore.rules (isValidEntry).
//
// Pure helpers — no Firebase, no React — so the tests run here.

export const TWINS_EVENT_TYPE = 'twins_bar_mitzvah'

export const BLESS_FOR = ['a', 'b', 'both']

export function isTwinsEvent(eventType) {
    return eventType === TWINS_EVENT_TYPE
}

/**
 * The two names, in admin order. Missing names are ''.
 * celebrantNameHe is deliberately ignored: the twins form has no Hebrew
 * twin field, and an event switched over from a plain bar mitzvah could
 * still carry a stale one that would put the wrong name on a button.
 */
export function twinNames(data = {}) {
    const a = (data?.celebrantName || '').trim()
    const b = (data?.celebrantName2 || '').trim()
    return [a, b]
}

/** A twins event is only "ready" for the picker once both names exist. */
export function hasBothTwinNames(data = {}) {
    const [a, b] = twinNames(data)
    return Boolean(a && b)
}

/** 'a' | 'b' | 'both' | null — anything else (or nothing) is null. */
export function normalizeBlessFor(raw) {
    const v = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    return BLESS_FOR.includes(v) ? v : null
}

/**
 * "דניאל ונועם" / "Daniel & Noam". Hebrew joins with the conjunction
 * prefix ו, the way a person would write it on a card.
 */
export function joinTwinNames(a, b, locale = 'he') {
    if (!a) return b || ''
    if (!b) return a
    return locale === 'he' ? `${a} ו${b}` : `${a} & ${b}`
}

/**
 * Who the blessing form is addressed to, as one display string.
 * Unknown/absent choice on a twins event → both (a blessing to the
 * family is never wrong).
 */
export function blessForName(data, blessFor, locale = 'he') {
    const [a, b] = twinNames(data)
    const v = normalizeBlessFor(blessFor) || 'both'
    if (v === 'a') return a || joinTwinNames(a, b, locale)
    if (v === 'b') return b || joinTwinNames(a, b, locale)
    return joinTwinNames(a, b, locale)
}

/** Short Hebrew tag for admin lists: "לדניאל" / "לשניהם". null when untagged. */
export function blessForTag(data, blessFor) {
    const v = normalizeBlessFor(blessFor)
    if (!v) return null
    const [a, b] = twinNames(data)
    if (v === 'a') return a ? `ל${a}` : 'לתאום הראשון'
    if (v === 'b') return b ? `ל${b}` : 'לתאום השני'
    return 'לשניהם'
}

/** Link from the landing page to the blessing form for one choice. */
export function blessForHref(weddingId, blessFor) {
    const v = normalizeBlessFor(blessFor) || 'both'
    return `/wedding/${weddingId}/photo?for=${v}`
}
