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
// • Lose a photo. Taking a photo out of the book (the photos-only page,
//   /manage/[token]/photos) moves it into `removedPhoto` on the same
//   entry, and "return" moves it back.
// • Delete for good. A deleted blessing is moved to
//   `weddings/{id}/entries_trash/{entryId}` first, so a forwarded link,
//   a mis-tap or a family argument is recoverable by us.
// • Touch blank pages. They are ours (super-admin layout pages); the
//   link can move them, not edit or remove them.
// • Point the book at someone else's picture. A photo URL must be our
//   own storage AND inside this event's folder.
//
// Pure helpers only — the route does the I/O, and the tests run here.

import { normalizeBlessFor } from './twins'

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

/** The photos-only view of the same link. */
export function managePhotosUrl(origin, token) {
    return `${manageLinkUrl(origin, token)}/photos`
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

export const MANAGE_ACTIONS = ['edit', 'photo', 'restorePhoto', 'removePhoto', 'returnPhoto', 'delete', 'undoDelete', 'order']

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

// ── Taking a photo out of the book, and putting it back ──────────────
//
// The photos-only page lets the owner go through the pictures and decide
// which ones stay. Two things can happen to a photo that goes out:
//
//   • The blessing has words. The words stay in the book, on a page
//     without a picture. The photo fields move into `removedPhoto` on
//     the same entry.
//   • The page is only a photo (an album page, or a guest who sent a
//     picture and nothing else). Without the photo there is nothing to
//     print, so the whole page goes to the trash, like "delete".
//
// Why the fields MOVE instead of a "hidden" flag beside them: half the
// app reads `imageUrl` straight from the document (the portal, the
// public gallery, the mobile app) and five different doors write a new
// photo to it. A flag would have to be honoured by every reader and
// cleared by every writer, and the first one that forgot would either
// print a photo the family took out or swallow one they added. With
// `imageUrl: null` the entry simply IS a blessing without a photo,
// everywhere, and the picture waits in `removedPhoto`.

function str(v) {
    return typeof v === 'string' && v.trim() ? v.trim() : null
}

function aspect(v) {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : null
}

/** Does this entry have words of its own (so it survives without a photo)? */
export function hasBlessingText(entry) {
    return typeof entry?.text === 'string' && entry.text.trim().length > 0
}

/** The photo the book shows for this entry right now, or null. */
export function shownPhotoUrl(entry) {
    return str(entry?.imageUrlOverride) || str(entry?.imageUrl)
}

/** The photo that was taken out and is waiting in `removedPhoto`, or null. */
export function removedPhotoUrl(entry) {
    const r = entry?.removedPhoto
    if (!r || typeof r !== 'object') return null
    return str(r.imageUrlOverride) || str(r.imageUrl)
}

/**
 * What "take this photo out" does to an entry.
 *
 *   { ok: false, error }                 nothing to take out
 *   { ok: true, mode: 'page' }           photo-only page → the caller trashes it
 *   { ok: true, mode: 'photo', fields }  write `fields` (the caller adds timestamps)
 */
export function planPhotoRemoval(entry) {
    if (!entry || entry.kind === 'blank') return { ok: false, error: 'no-photo' }
    if (!shownPhotoUrl(entry)) return { ok: false, error: 'no-photo' }
    if (!hasBlessingText(entry)) return { ok: true, mode: 'page' }
    return {
        ok: true,
        mode: 'photo',
        fields: {
            removedPhoto: {
                imageUrl: str(entry.imageUrl),
                imgAspect: aspect(entry.imgAspect),
                imageUrlOverride: str(entry.imageUrlOverride),
                imgAspectOverride: aspect(entry.imgAspectOverride),
            },
            imageUrl: null,
            // A stale number here would frame the NEXT photo someone adds
            // to a box it does not fit; null makes the book measure it.
            imgAspect: null,
            imageUrlOverride: null,
            imgAspectOverride: null,
        },
    }
}

/**
 * What "put the photo back" writes.
 *
 *   { ok: false, error: 'nothing-removed' }   no photo is waiting
 *   { ok: false, error: 'entry-has-photo' }   a different photo was added since — not ours to overwrite
 *   { ok: true, fields }                      write `fields` and delete `removedPhoto`
 */
export function planPhotoReturn(entry) {
    if (!removedPhotoUrl(entry)) return { ok: false, error: 'nothing-removed' }
    if (shownPhotoUrl(entry)) return { ok: false, error: 'entry-has-photo' }
    const r = entry.removedPhoto
    return {
        ok: true,
        fields: {
            imageUrl: str(r.imageUrl),
            imgAspect: aspect(r.imgAspect),
            imageUrlOverride: str(r.imageUrlOverride),
            imgAspectOverride: aspect(r.imgAspectOverride),
        },
    }
}

/**
 * A trashed page as the photos page lists it under "taken out" — only
 * pages that were nothing but a photo. A trashed blessing with words is
 * a decision about a blessing, and belongs to the main manage page.
 */
export function publicRemovedPage(entry) {
    if (!entry || entry.kind === 'blank' || hasBlessingText(entry)) return null
    const url = shownPhotoUrl(entry)
    if (!url) return null
    return {
        id: entry.id,
        name: typeof entry.name === 'string' ? entry.name : '',
        imageUrl: url,
        photoRotation: Number.isFinite(entry.photoRotation) ? entry.photoRotation : 0,
    }
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
        // A photo taken out on the photos page, waiting to be put back.
        removedPhotoUrl: removedPhotoUrl(entry),
        // Whether the page survives without its photo (photos page copy).
        hasText: hasBlessingText(entry),
        preserveLineBreaks: entry.preserveLineBreaks === true,
        // Twins bar mitzvah: which boy the guest wrote to ('a'|'b'|'both').
        blessFor: normalizeBlessFor(entry.blessFor),
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
