// POST /api/guest/update-entry — a returning guest edits their OWN blessing.
//
// The guest blessing flow is unauthenticated by design (scan QR → write →
// submit), and the Firestore/Storage rules deliberately forbid CLIENT-side
// updates to entries + photo overwrites — "entry edits go through the admin
// API only". This route IS that path: it lets a guest fix the name / text /
// photo of a blessing they already sent, via the Admin SDK (which bypasses
// the client rules).
//
// PUBLIC route (no super-admin gate) — same trust model as the open create
// flow. Entry IDs are unguessable UUIDs, and the client only surfaces edit
// links for blessings THIS device submitted (localStorage). We still validate
// + cap everything here, and only ever touch name/text/imageUrl of an
// EXISTING entry — never create, never delete, never touch other fields
// (orderIndex, photoPosition, timestamp stay as the admin/owner set them).

import { NextResponse } from 'next/server'
import { adminDb, adminStorage } from '@/lib/firebaseAdmin'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NAME_MAX = 120
const TEXT_MAX = 2600 // generous server cap (matches the super-admin composer ceiling); the client enforces the per-event blessingMaxChars
const IMAGE_MAX_BYTES = 8 * 1024 * 1024

function bad(status, error) {
    return NextResponse.json({ ok: false, error }, { status })
}

function isSafeSegment(s) {
    return typeof s === 'string' && s.length > 0 && s.length < 200 && !s.includes('/') && !s.includes('\\') && !s.includes('..')
}

export async function POST(req) {
    let body
    try {
        body = await req.json()
    } catch {
        return bad(400, 'bad-json')
    }

    const weddingId = String(body?.weddingId || '').trim()
    const entryId = String(body?.entryId || '').trim()
    if (!isSafeSegment(weddingId) || !isSafeSegment(entryId)) return bad(400, 'bad-ids')

    const docRef = adminDb.collection('weddings').doc(weddingId).collection('entries').doc(entryId)
    let snap
    try {
        snap = await docRef.get()
    } catch (err) {
        console.error('[guest/update-entry] read failed', err)
        return bad(502, 'read-failed')
    }
    if (!snap.exists) return bad(404, 'not-found')

    const update = {}
    // No anonymous fallback (owner decision): empty name stays empty —
    // the book simply renders no name line.
    if (typeof body.name === 'string') update.name = body.name.trim().slice(0, NAME_MAX)
    if (typeof body.text === 'string') update.text = body.text.slice(0, TEXT_MAX) || null
    // Per-entry manual split — blessing on one page, photo on the next.
    if (typeof body.forceSplit === 'boolean') update.forceSplit = body.forceSplit

    // ── Photo ─────────────────────────────────────────────────────────
    // Priority: removeImage → replace with provided base64 → leave untouched.
    try {
        if (body.removeImage === true) {
            update.imageUrl = null
        } else if (typeof body.image === 'string' && body.image.startsWith('data:image/')) {
            const m = body.image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
            if (!m) return bad(400, 'bad-image')
            const contentType = m[1]
            const buffer = Buffer.from(m[2], 'base64')
            if (!buffer.length) return bad(400, 'empty-image')
            if (buffer.length > IMAGE_MAX_BYTES) return bad(413, 'image-too-large')

            const bucket = adminStorage.bucket()
            // Overwrite the canonical per-entry object so Storage stays 1:1
            // with the entry. A fresh download token makes the new URL valid
            // and distinct from the previous one (busts any stale CDN cache).
            const path = `weddings/${weddingId}/${entryId}.jpg`
            const file = bucket.file(path)
            const downloadToken = crypto.randomUUID()
            await file.save(buffer, {
                resumable: false,
                contentType,
                metadata: { contentType, metadata: { firebaseStorageDownloadTokens: downloadToken } },
            })
            update.imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`
        }
    } catch (err) {
        console.error('[guest/update-entry] image write failed', err)
        return bad(502, 'image-failed')
    }

    if (Object.keys(update).length === 0) {
        return NextResponse.json({ ok: true, unchanged: true, imageUrl: snap.data()?.imageUrl ?? null })
    }

    try {
        await docRef.update(update)
    } catch (err) {
        console.error('[guest/update-entry] doc update failed', err)
        return bad(502, 'update-failed')
    }

    return NextResponse.json({ ok: true, imageUrl: 'imageUrl' in update ? update.imageUrl : (snap.data()?.imageUrl ?? null) })
}
