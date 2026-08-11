// PATCH /api/entries/photo
//
// Replaces the photo on one page of the book, or restores the original.
//
// The guest's own upload is never touched. The replacement is written to
// `imageUrlOverride` and wins at read time (see lib/entryPhoto.js), so
// "restore" is a field going back to null rather than an act of data
// recovery. This is somebody else's contribution to a keepsake; a
// product that overwrites it has made a decision it has no right to
// make.
//
// A server route for the same reason page-style is one: firestore.rules
// has `allow update: if false` on weddings/{wid}/entries/{eid}, so a
// client write here would work against whichever rules happen to be
// deployed and break the first time anyone runs firebase deploy.
//
// The FILE does not come through here. The browser uploads it straight
// to Storage and posts the resulting URL, which keeps a multi-megabyte
// photo out of a serverless request body.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'

async function authorized(req) {
    const header = req.headers.get('authorization') || ''
    if (!header.startsWith('Bearer ')) return false
    try {
        const decoded = await adminAuth.verifyIdToken(header.slice(7).trim())
        return isSuperAdmin(decoded.email)
    } catch {
        return false
    }
}

// Our own storage only. Without this the field is a way to put an
// arbitrary remote image inside a customer's printed book — and into the
// file the printer receives.
const OUR_ASSET = /^https:\/\/(firebasestorage\.googleapis\.com|storage\.googleapis\.com|app\.weddingtales\.co\.il)\//

export async function PATCH(req) {
    if (!(await authorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'bad-json' }, { status: 400 })
    }

    const weddingId = String(body?.weddingId || '').trim()
    const entryId = String(body?.entryId || '').trim()
    if (!weddingId || !entryId) return NextResponse.json({ error: 'missing-ids' }, { status: 400 })

    const ref = adminDb.collection('weddings').doc(weddingId).collection('entries').doc(entryId)
    const snap = await ref.get()
    if (!snap.exists) return NextResponse.json({ error: 'not-found' }, { status: 404 })

    // Restore — back to whatever the guest sent.
    if (body?.reset === true) {
        await ref.set({ imageUrlOverride: null, imgAspectOverride: null }, { merge: true })
        return NextResponse.json({ ok: true, imageUrlOverride: null, imgAspectOverride: null })
    }

    const url = String(body?.imageUrl || '').trim()
    if (!OUR_ASSET.test(url)) {
        return NextResponse.json({ ok: false, error: 'קישור לא מוכר — העלה דרך המסך' }, { status: 400 })
    }

    // The browser measures the replacement before uploading, so the book
    // can letterboxe it correctly on the first paint instead of after a
    // round trip. A missing or absurd number is simply not stored, and
    // FramedPhoto measures the image itself.
    const raw = Number(body?.imgAspect)
    const imgAspectOverride = Number.isFinite(raw) && raw > 0.05 && raw < 20 ? raw : null

    await ref.set({ imageUrlOverride: url, imgAspectOverride }, { merge: true })
    return NextResponse.json({ ok: true, imageUrlOverride: url, imgAspectOverride })
}

export async function POST(req) {
    return PATCH(req)
}
