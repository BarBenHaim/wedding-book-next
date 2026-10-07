// src/lib/arrangeLinks.js
//
// The "arrange the blessings" link.
//
// The super-admin mints a link for one event and sends it to the book
// owner over WhatsApp. Whoever opens it can put the blessings in the
// order they want the printed book to have — no account, no password,
// no app login. The owner's own admin page already has this screen,
// but it sits behind a login most customers never set up; the link is
// the same job without the wall.
//
// ── Where the token lives ────────────────────────────────────────────
// NOT on the wedding doc. `digitalTokens` and `statsTokens` sit on
// /weddings/{id}, and that document is readable by anyone who has the
// event id (it is in every guest QR link). A token that lets someone
// REWRITE the order of a family's keepsake must not be one `getDoc`
// away. So each link is a document in its own collection,
// `arrange_links/{token}`, which firestore.rules closes to clients
// entirely; only the Admin SDK on the server reads it.
//
// The token itself is the document id: 32 random bytes, base64url.
// Unguessable, and the lookup is a single point read.
//
// ── Pure helpers ─────────────────────────────────────────────────────
// Everything here is free of Firebase so it can be unit-tested; the
// routes do the I/O.

import { randomBytes } from 'crypto'

export const ARRANGE_LINKS_COLLECTION = 'arrange_links'

// 32 bytes → 43 url-safe chars. Not a UUID on purpose: a UUID carries
// 122 bits and a predictable shape; this is 256 bits and looks like
// nothing in particular.
export function newArrangeToken() {
    return randomBytes(32).toString('base64url')
}

// What a token has to look like before we even go to the database:
// base64url alphabet, 40–64 chars. Anything else is a 404 without a
// read — keeps junk and probes off Firestore.
export function isArrangeTokenShape(token) {
    return typeof token === 'string' && /^[A-Za-z0-9_-]{40,64}$/.test(token)
}

export function arrangeLinkUrl(origin, token) {
    const base = String(origin || '').replace(/\/$/, '')
    return `${base}/arrange/${token}`
}

// A link document is usable when it exists, has an event, and nobody
// revoked it. There is deliberately no expiry: the owner may come back
// to the order the week the book goes to print, months after the link
// was sent, and a dead link at that moment is a support call.
export function isArrangeLinkActive(data) {
    if (!data || typeof data !== 'object') return false
    if (typeof data.weddingId !== 'string' || !data.weddingId) return false
    if (data.revokedAt) return false
    return true
}

// The order the client sends is a list of entry ids. We turn it into a
// full orderIndex map against the entries that exist RIGHT NOW:
//
//   • unknown ids are dropped (a blessing deleted meanwhile),
//   • duplicates are collapsed to their first position,
//   • entries the client never saw (a guest wrote a blessing while the
//     owner was arranging) keep their relative order and go to the end,
//     so a save never silently pushes a new blessing to the front or
//     leaves it without an index.
//
// `existing` is the current list in its current display order.
// Returns { order: [ids], dropped: n, appended: n }.
export function reconcileOrder(requested, existing) {
    const existingIds = existing.map(e => e.id)
    const known = new Set(existingIds)
    const seen = new Set()
    const order = []
    let dropped = 0
    for (const raw of Array.isArray(requested) ? requested : []) {
        const id = typeof raw === 'string' ? raw : ''
        if (!id || !known.has(id)) { dropped += 1; continue }
        if (seen.has(id)) continue
        seen.add(id)
        order.push(id)
    }
    let appended = 0
    for (const id of existingIds) {
        if (!seen.has(id)) { order.push(id); appended += 1 }
    }
    return { order, dropped, appended }
}

// Hard cap on a single save. A book is a few hundred blessings at the
// very most; a request with thousands of ids is not a customer.
export const MAX_ORDER_LENGTH = 2000

export function validateOrderRequest(body) {
    const order = body && body.order
    if (!Array.isArray(order)) return { ok: false, error: 'order must be an array' }
    if (order.length === 0) return { ok: false, error: 'order is empty' }
    if (order.length > MAX_ORDER_LENGTH) return { ok: false, error: 'order too long' }
    if (!order.every(id => typeof id === 'string' && id.length > 0 && id.length <= 128)) {
        return { ok: false, error: 'order must contain entry ids' }
    }
    return { ok: true, order }
}

// The entry as the arrange page needs it — and nothing more. The page
// is public to whoever holds the link, so it gets the fields that help
// someone recognise a blessing (name, a snippet, the photo) and not
// the moderation internals.
export function publicArrangeEntry(entry) {
    return {
        id: entry.id,
        kind: entry.kind === 'blank' ? 'blank' : null,
        name: typeof entry.name === 'string' ? entry.name : '',
        text: typeof entry.text === 'string' ? entry.text : '',
        imageUrl: typeof entry.imageUrl === 'string' ? entry.imageUrl : null,
        photoPosition: typeof entry.photoPosition === 'string' ? entry.photoPosition : null,
        photoRotation: Number.isFinite(entry.photoRotation) ? entry.photoRotation : 0,
        timestamp: Number.isFinite(entry.timestamp) ? entry.timestamp : null,
        orderIndex: Number.isInteger(entry.orderIndex) ? entry.orderIndex : null,
    }
}

// Same sort every reader of the book uses (getEntries): explicit order
// first, then time. Entries without an index go LAST — the admin page
// that put them first was the odd one out.
export function sortForArrange(entries) {
    return [...entries].sort((a, b) => {
        const ao = Number.isInteger(a.orderIndex) ? a.orderIndex : Infinity
        const bo = Number.isInteger(b.orderIndex) ? b.orderIndex : Infinity
        if (ao !== bo) return ao - bo
        return (a.timestamp || 0) - (b.timestamp || 0)
    })
}

// The WhatsApp message the admin sends with the link. First name only,
// the event in the owner's words, the link on its own line so WhatsApp
// makes it tappable.
export function arrangeLinkMessage({ ownerName, eventLabel, link }) {
    const first = String(ownerName || '').trim().split(/\s+/)[0]
    const hi = first ? `היי ${first}` : 'היי'
    const what = eventLabel ? `של ${eventLabel}` : 'שלכם'
    return [
        `${hi}, כאן בר מ-Wedding Tales 💛`,
        `הברכות ${what} נאספו ואפשר לקבוע את הסדר שלהן בספר.`,
        'פותחים את הקישור מהנייד, גוררים כל ברכה למקום שבא לכם, וזה נשמר לבד. בלי התחברות ובלי סיסמה:',
        link,
        'כשתסיימו, כתבו לי ואני ממשיך להדפסה.',
    ].join('\n')
}

