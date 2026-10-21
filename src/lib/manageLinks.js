// src/lib/manageLinks.js
//
// The "manage the blessings" link — the arrange link's big sibling.
//
// The super-admin mints it for one event and sends it to the book owner
// on WhatsApp. Whoever opens it can fix the book without an account:
// correct a name or a typo, swap or add a photo, take a blessing out,
// and put everything in order. It is the owner's admin screen minus the
// login most customers never set up.
//
// ── Same token, same collection, one more word ───────────────────────
// A manage link is an `arrange_links/{token}` document with
// `scope: 'manage'`. Everything the arrange link already got right is
// inherited for free: 256-bit token as the document id, a collection
// firestore.rules closes to clients, revocation from /admin, the drag
// page at /arrange/[token] (which accepts any active link — ordering is
// a subset of managing). Documents written before this existed carry no
// scope and are arrange links, which is what they always were.
//
// ── What a link can NOT do ───────────────────────────────────────────
// • Overwrite the guest's own photo. A new photo is written to
//   `imageUrlOverride` (lib/entryPhoto.js), so "restore" is one field.
// • Delete for good. A deleted blessing is moved to
//   `weddings/{id}/entries_trash/{entryId}` first, so a forwarded link,
//   a mis-tap or a family argument is recoverable by us.
// • Touch blank pages. They are ours (super-admin layout pages); the
//   link can move them, not edit or remove them.
// • Point the book at someone else's picture. A photo URL must be our
//   own storage AND inside this event's folder.
//
// Pure helpers only — the route does the I/O, and the tests run here.

export const MANAGE_SCOPE = 'manage'
export const ARRANGE_SCOPE = 'arrange'
export const TRASH_SUBCOLLECTION = 'entries_trash'

export const MAX_NAME_LENGTH = 120
export const MAX_TEXT_LENGTH = 4000

/** 'manage' | 'arrange' — a link with no scope predates manage links. */
export function linkScope(data) {
    return data && data.scope === MANAGE_SCOPE ? MANAGE_SCOPE : ARRANGE_SCOPE
}

export function canManage(data) {
    return linkScope(data) === MANAGE_SCOPE
}

export function manageLinkUrl(origin, token) {
    const base = String(origin || '').replace(/\/$/, '')
    return `${base}/manage/${token}`
}

// Only our Firebase Storage, and only this event's folder. Upload paths
// look like .../o/weddings%2F<weddingId>%2F<file>?alt=media&token=...
export function isOwnEventPhotoUrl(weddingId, url) {
    if (typeof url !== 'string' || typeof weddingId !== 'string' || !weddingId) return false
    let u
    try {
        u = new URL(url)
    } catch {
        return false
    }
    if (u.protocol !== 'https:' || u.hostname !== 'firebasestorage.googleapis.com') return false
    const marker = `/o/${encodeURIComponent(`weddings/${weddingId}/`)}`
    // URL normalises %2F casing inconsistently across clients; compare
    // case-insensitively on the encoded slashes only.
    return u.pathname.toLowerCase().includes(marker.toLowerCase())
}

function clean(s, max) {
    return String(s ?? '').replace(/\r\n/g, '\n').trim().slice(0, max)
}

// One edit request → the fields to write, or why not.
export function validateEdit(body) {
    if (!body || typeof body !== 'object') return { ok: false, error: 'bad-body' }
    const out = {}
    if (body.name !== undefined) {
        if (typeof body.name !== 'string') return { ok: false, error: 'bad-name' }
        out.name = clean(body.name, MAX_NAME_LENGTH)
    }
    if (body.text !== undefined) {
        if (typeof body.text !== 'string') return { ok: false, error: 'bad-text' }
        out.text = clean(body.text, MAX_TEXT_LENGTH)
    }
    if (!Object.keys(out).length) return { ok: false, error: 'nothing-to-change' }
    return { ok: true, fields: out }
}

export const MANAGE_ACTIONS = ['edit', 'photo', 'restorePhoto', 'delete', 'undoDelete', 'order']

export function isManageAction(a) {
    return MANAGE_ACTIONS.includes(a)
}

// Blank pages are layout pages the super-admin placed. A manage link may
// move them (the order action) but not edit, re-photo or delete them.
export function actionAllowedOn(action, entry) {
    if (!entry) return false
    if (entry.kind === 'blank') return action === 'order'
    return true
}

// What the page needs to show and edit one blessing — nothing more.
export function publicManageEntry(entry) {
    return {
        id: entry.id,
        kind: entry.kind === 'blank' ? 'blank' : null,
        name: typeof entry.name === 'string' ? entry.name : '',
        text: typeof entry.text === 'string' ? entry.text : '',
        imageUrl: typeof entry.imageUrl === 'string' ? entry.imageUrl : null,
        photoPosition: typeof entry.photoPosition === 'string' ? entry.photoPosition : null,
        photoRotation: Number.isFinite(entry.photoRotation) ? entry.photoRotation : 0,
        // The photo was swapped (by us or by the owner) and the guest's
        // original can be brought back.
        photoReplaced: typeof entry.imageUrlOverride === 'string' && entry.imageUrlOverride.trim().length > 0,
        // Whether "restore" brings back the guest's photo or simply takes
        // away one that was added to a text-only blessing.
        guestHadPhoto: typeof entry.originalImageUrl === 'string' && entry.originalImageUrl.length > 0,
        preserveLineBreaks: entry.preserveLineBreaks === true,
        timestamp: Number.isFinite(entry.timestamp) ? entry.timestamp : null,
        orderIndex: Number.isInteger(entry.orderIndex) ? entry.orderIndex : null,
    }
}

// The WhatsApp message the admin sends with the link.
export function manageLinkMessage({ ownerName, eventLabel, link }) {
    const first = String(ownerName || '').trim().split(/\s+/)[0]
    const hi = first ? `היי ${first}` : 'היי'
    const what = eventLabel ? `של ${eventLabel}` : 'שלכם'
    return [
        `${hi}, כאן בר מ-Wedding Tales 💛`,
        `זה הקישור לניהול ספר הברכות ${what}.`,
        'אפשר לתקן שם או טעות בברכה, להחליף או להוסיף תמונה, להוציא ברכה מהספר ולסדר את הסדר. בלי התחברות ובלי סיסמה:',
        link,
        'הקישור אישי — כדאי לא להעביר אותו הלאה. כשתסיימו, כתבו לי ואני ממשיך להדפסה.',
    ].join('\n')
}
