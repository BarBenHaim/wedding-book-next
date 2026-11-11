// src/lib/eventImageRules.js
//
// The rules for a picture uploaded INTO an event (a replaced guest photo,
// an album photo, a page background) when it travels through our own
// server instead of straight to Firebase Storage. Pure — shared by the
// browser helper (lib/uploadEventImage.js) and the route
// (api/upload/event-image).
//
// They mirror storage.rules for `weddings/{weddingId}/{filename}`: an
// image, of a bounded size, created under the event's own folder and
// never written over.

// Vercel refuses request bodies above ~4.5MB; leave room for the form
// fields around the file.
export const MAX_SERVER_UPLOAD_BYTES = 4 * 1024 * 1024

const ID = /^[A-Za-z0-9_-]{1,128}$/
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.(jpe?g|png|webp)$/i

export function validWeddingId(id) {
    return typeof id === 'string' && ID.test(id)
}

/** A file name we are willing to create, or null. No folders, no dots-first. */
export function safeImageName(name) {
    const s = String(name || '').trim()
    if (!NAME.test(s) || s.includes('..')) return null
    return s
}

export function eventImagePath(weddingId, filename) {
    const name = safeImageName(filename)
    if (!validWeddingId(weddingId) || !name) return null
    return `weddings/${weddingId}/${name}`
}

/** Why this upload is refused, or null when it is fine. */
export function uploadProblem({ weddingId, filename, size, type }) {
    if (!validWeddingId(weddingId)) return 'bad-wedding'
    if (!safeImageName(filename)) return 'bad-filename'
    if (!/^image\/(jpeg|png|webp)$/i.test(String(type || ''))) return 'not-an-image'
    if (!(Number(size) > 0)) return 'empty'
    if (Number(size) > MAX_SERVER_UPLOAD_BYTES) return 'too-large'
    return null
}

/** The public address of an object in the bucket, the way Firebase writes it. */
export function downloadUrl(bucketName, path, token) {
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`
}
