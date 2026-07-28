// src/lib/normalizePhoneIL.js
//
// Normalizes an Israeli phone number to E.164-ish `+972...` form so
// wa.me links, dedupe checks, and stored guest phone fields all agree
// on a single canonical shape.
//
// Rules (in order):
//   1. Strip everything that isn't a digit (spaces, dashes, dots, parens,
//      leading '+' — all gone).
//   2. If the digits already start with `972`, keep as-is.
//   3. If they start with `0`, drop that `0` and prepend `972` (classic
//      Israeli mobile/landline: 050… → 97250…).
//   4. If they start with `5` (a mobile prefix typed without the leading 0),
//      prepend `972`.
//   5. Fallback: if the result is 9–10 digits, prepend `972` anyway.
//      Anything shorter is left alone (returned as `+<digits>`), which the
//      caller can treat as invalid.
//
// Returns the canonical form as `+972…` (or `+<digits>` for the fallback
// short-string case). Returns null for empty / non-string input.

export function normalizeIL(phone) {
    if (phone == null) return null
    const raw = String(phone).trim()
    if (!raw) return null

    let digits = raw.replace(/\D+/g, '')
    if (!digits) return null

    if (digits.startsWith('972')) {
        // Already normalized (may or may not have had the '+').
    } else if (digits.startsWith('0')) {
        digits = '972' + digits.slice(1)
    } else if (digits.startsWith('5')) {
        digits = '972' + digits
    } else if (digits.length >= 9 && digits.length <= 10) {
        digits = '972' + digits
    }

    return '+' + digits
}

// Cheap sanity check for the normalized form. Israeli mobile numbers
// end up 12 chars including the '+' (e.g. +972501234567). Landlines
// can be 11–12. Anything wildly off gets flagged so we don't try to
// wa.me it.
export function isPlausibleIL(normalized) {
    if (typeof normalized !== 'string') return false
    if (!normalized.startsWith('+972')) return false
    const rest = normalized.slice(4)
    return /^\d{8,9}$/.test(rest)
}
