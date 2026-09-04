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


// ── Which rows need looking at ──────────────────────────────────────
//
// "Colour the row if the event is in the next two weeks, and colour the
// ones with no date differently."
//
// Both halves are the same question — what has to be dealt with now —
// asked from opposite ends. An event fourteen days out is the last
// moment to chase blessings and send the book to print. An event with
// no date at all is worse than urgent: it is invisible. Every deadline
// this system knows how to compute runs off `weddingDate`, so a missing
// one silently opts that customer out of the status badge, the upcoming
// filter, the follow-up ladder and the date sort. It does not look
// late. It looks fine, right up until it is not.
//
// So a missing date gets its own colour rather than being lumped in
// with the calm rows. It is a to-do, not a state.

/** How far ahead counts as "coming up". */
// Where an event came from, and whether the app is on it.
//
// Provenance is written at creation and never edited, so the table can
// trust it. 'unknown' is not a fourth kind of event - it is a legacy row
// created before provenance was recorded, and saying so is better than
// guessing 'order' and being wrong on the ones that were not.
export const ORIGIN_LABEL = {
    order: 'הזמנה',
    self_serve: 'אתר',
    app: 'אפליקציה',
    unknown: '—',
}

export function originOf(w) {
    const v = w?.createdVia
    return v === 'order' || v === 'self_serve' || v === 'app' ? v : 'unknown'
}

export function originLabel(w) {
    return ORIGIN_LABEL[originOf(w)]
}

/**
 * Whether the mobile app is on this event, and when it was last used.
 *
 * `devices` counts the Expo push tokens the app registered on the doc -
 * one per phone that signed in. Above zero means the app is installed
 * and connected, whether or not anyone has opened the book since.
 *
 * The two timestamps are separate on purpose: opening the app and
 * opening the BOOK inside it are different signals, and the second is
 * the one that says the customer looked at what they bought.
 */
export function appPresence(w) {
    const devices = Array.isArray(w?.pushTokens)
        ? w.pushTokens.filter(t => typeof t === 'string' && t.startsWith('ExponentPushToken')).length
        : Number.isFinite(w?.appDevices) ? w.appDevices : 0
    const openedMs = toMs(w?.lastAppOpenAt)
    const bookMs = toMs(w?.lastAppBookOpenAt)
    return {
        devices,
        connected: devices > 0 || openedMs != null,
        openedMs,
        bookMs,
        // Opening the book is the strongest state, then the app merely
        // being connected, then nothing.
        state: bookMs != null ? 'book' : (devices > 0 || openedMs != null) ? 'connected' : 'none',
    }
}

function toMs(v) {
    if (!v) return null
    if (typeof v === 'number') return Number.isFinite(v) ? v : null
    const t = Date.parse(v)
    return Number.isFinite(t) ? t : null
}

export const SOON_WINDOW_DAYS = 14

/**
 * The event date as a local-midnight timestamp, or null.
 *
 * Accepts the shapes this field actually arrives in: an ISO string from
 * the API, a Date, epoch millis, and a Firestore Timestamp — whether it
 * still has `toDate()` or has been through JSON and is down to
 * `{ seconds }`. Anything else is null rather than a guess, because a
 * guessed date here paints a row the wrong colour and a wrong colour is
 * worse than no colour: it gets trusted.
 *
 * Normalised the same way getWeddingStatus() does it, deliberately. A
 * row tinted "coming up" while the badge beside it says something else
 * would be a worse bug than either behaviour on its own.
 */
export function eventDateMs(w) {
    const raw = w?.weddingDate
    if (raw === null || raw === undefined || raw === '') return null

    let d = null
    if (raw instanceof Date) d = new Date(raw.getTime())
    else if (typeof raw === 'number') d = new Date(raw)
    else if (typeof raw === 'string') d = new Date(raw)
    else if (typeof raw?.toDate === 'function') { try { d = raw.toDate() } catch { return null } }
    else if (Number.isFinite(raw?.seconds)) d = new Date(raw.seconds * 1000)
    else if (Number.isFinite(raw?._seconds)) d = new Date(raw._seconds * 1000)
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null

    d.setHours(0, 0, 0, 0)
    return d.getTime()
}

/**
 * Whole days from today to the event. Negative is past, null is unknown.
 *
 * Rounded, not floored: a clock change makes one day 23 or 25 hours
 * long, and flooring turns "in exactly 7 days" into 6 twice a year.
 */
export function daysUntilEvent(w, nowMs = Date.now()) {
    const ms = eventDateMs(w)
    if (ms === null) return null
    const today = new Date(nowMs)
    today.setHours(0, 0, 0, 0)
    return Math.round((ms - today.getTime()) / 86400000)
}

/**
 * 'soon' | 'nodate' | null — what colour this row deserves.
 *
 * Past events are null on purpose. They are done; tinting them would
 * spend the strongest signal on the table on the rows that need nothing.
 */
export function rowUrgency(w, nowMs = Date.now()) {
    const days = daysUntilEvent(w, nowMs)
    if (days === null) return 'nodate'
    if (days < 0 || days > SOON_WINDOW_DAYS) return null
    return 'soon'
}

/**
 * A short Hebrew countdown, or null when there is nothing to count to.
 *
 * The colour says "this one", the countdown says "this one first" —
 * without it, fourteen amber rows all look equally urgent.
 */
export function countdownLabel(w, nowMs = Date.now()) {
    const days = daysUntilEvent(w, nowMs)
    if (days === null) return 'בלי תאריך'
    if (days < 0) return null
    if (days === 0) return 'היום'
    if (days === 1) return 'מחר'
    if (days === 2) return 'מחרתיים'
    return `בעוד ${days} ימים`
}

export { EVENT_TYPES }
export default {
    EVENT_TYPES, EVENT_TYPE_LABEL, eventTypeOf, eventTypeLabel,
    searchableText, matchesSearch, amountOf, isPaid, compareByAmount,
    filterEvents, countByEventType,
    SOON_WINDOW_DAYS, eventDateMs, daysUntilEvent, rowUrgency, countdownLabel,
}
