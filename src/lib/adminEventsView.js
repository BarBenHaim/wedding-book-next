// src/lib/adminEventsView.js
//
// Finding one event among hundreds, in the super-admin table.
//
// Three separate complaints from Lord, one root cause each.
//
// ── The labels lie ──────────────────────────────────────────────────
//
// The event badge already existed, which is why "make me labels for
// what type each event is" reads like a strange request until you look
// at normalizeEventType: it returns 'wedding' for anything unknown OR
// MISSING. So an event whose type was never set displays a confident
// "חתונה" badge. Not a missing label — a wrong one, which is worse,
// because you cannot tell the eight real weddings from the eight
// unclassified events by looking.
//
// `eventTypeOf` returns null instead of guessing. The badge says so.
//
// ── The search misses ───────────────────────────────────────────────
//
// It looked at the couple label, email, order id and doc id. Not the
// celebrant's name — which for a bar mitzvah IS the event's name and
// the thing you actually remember — not the Hebrew name fields, not the
// phone, not the custom title. Searching for the boy you spoke to
// yesterday returned nothing.
//
// Now every field a human would remember is searchable, tokens are
// AND-ed (so "נועם בר" narrows rather than widens), and a phone query
// is compared digits-only so "052-661" finds "0526618184".
//
// ── Sorting by money puts the wrong rows on top ─────────────────────
//
// A plain ascending sort by amount fills the first screen with every
// unpaid event — the exact rows you are not looking at when you sort by
// revenue. Unpaid sinks in BOTH directions here. That is deliberate
// asymmetry: the direction toggle controls the order of real payments,
// not whether zero is interesting.

const EVENT_TYPES = ['wedding', 'bar_mitzvah', 'bat_mitzvah', 'birthday', 'brit']

export const EVENT_TYPE_LABEL = {
    wedding: 'חתונה',
    bar_mitzvah: 'בר מצווה',
    bat_mitzvah: 'בת מצווה',
    birthday: 'יום הולדת',
    brit: 'ברית',
}

/**
 * The event's real type, or null when nobody set one.
 *
 * Never defaults. A guess rendered as a badge is indistinguishable from
 * a fact, and this table is where Lord decides what to work on.
 */
export function eventTypeOf(w) {
    const raw = typeof w?.eventType === 'string' ? w.eventType.trim() : ''
    return EVENT_TYPES.includes(raw) ? raw : null
}

export function eventTypeLabel(w) {
    const t = eventTypeOf(w)
    return t ? EVENT_TYPE_LABEL[t] : 'לא הוגדר'
}

const digits = s => String(s || '').replace(/\D+/g, '')

/** Everything about an event a person might type into a search box. */
export function searchableText(w) {
    if (!w) return ''
    return [
        w.brideName, w.groomName, w.brideNameHe, w.groomNameHe,
        // The celebrant is the event's name at a bar/bat mitzvah or a
        // birthday — the single most likely thing to be searched, and
        // the one the old search could not see.
        w.celebrantName, w.celebrantNameHe,
        w.customTitle, w.customSubtitle,
        w.ownerName, w.ownerEmail,
        // Phone and order id are deliberately NOT here. They live in the
        // digits haystack below, behind a three-character floor: as text,
        // "52" is inside almost every Israeli mobile number, so matching
        // it here turned a two-character query into "show me everything".
        w.id, w.slug,
        eventTypeLabel(w),
    ].filter(Boolean).join(' ').toLowerCase()
}

/**
 * Does this event match the query?
 *
 * Tokens are AND-ed: typing more words narrows the result, which is
 * what everyone expects and the opposite of what OR does. A token made
 * of digits also matches against the digits of the phone and order id,
 * so "052-661" finds a number stored as "0526618184".
 */
export function matchesSearch(w, query) {
    const q = String(query || '').toLowerCase().trim()
    if (!q) return true
    const hay = searchableText(w)
    const hayDigits = digits(`${w?.ownerPhone || ''} ${w?.orderId || ''} ${w?.id || ''}`)
    return q.split(/\s+/).filter(Boolean).every(token => {
        if (hay.includes(token)) return true
        const d = digits(token)
        return d.length >= 3 && hayDigits.includes(d)
    })
}

/** What was actually paid, as a number. Anything unparseable is zero. */
export function amountOf(w) {
    const n = Number(w?.amountPaid)
    return Number.isFinite(n) && n > 0 ? n : 0
}

export const isPaid = w => amountOf(w) > 0

/**
 * Sort by money with the unpaid pinned to the bottom.
 *
 * The asymmetry is the feature: flipping the arrow reorders the real
 * payments and never promotes the zeros, because "sort by amount" is
 * always a question about revenue and never a question about which
 * events have none. The unpaid filter chip answers that one.
 */
export function compareByAmount(a, b, dir = 'desc') {
    const pa = amountOf(a)
    const pb = amountOf(b)
    if (pa <= 0 && pb <= 0) return 0
    if (pa <= 0) return 1
    if (pb <= 0) return -1
    return dir === 'asc' ? pa - pb : pb - pa
}

/** The whole pipeline: filter by text, by type, then order. */
export function filterEvents(list, { query = '', eventType = 'all' } = {}) {
    let out = Array.isArray(list) ? list : []
    if (query) out = out.filter(w => matchesSearch(w, query))
    if (eventType && eventType !== 'all') {
        out = eventType === 'unset'
            ? out.filter(w => eventTypeOf(w) === null)
            : out.filter(w => eventTypeOf(w) === eventType)
    }
    return out
}

/** How many events of each type, for the filter chips' counters. */
export function countByEventType(list) {
    const counts = { all: 0, unset: 0 }
    for (const t of EVENT_TYPES) counts[t] = 0
    for (const w of Array.isArray(list) ? list : []) {
        counts.all++
        const t = eventTypeOf(w)
        if (t) counts[t]++
        else counts.unset++
    }
    return counts
}

export { EVENT_TYPES }
export default {
    EVENT_TYPES, EVENT_TYPE_LABEL, eventTypeOf, eventTypeLabel,
    searchableText, matchesSearch, amountOf, isPaid, compareByAmount,
    filterEvents, countByEventType,
}
