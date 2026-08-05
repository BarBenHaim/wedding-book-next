// POST /api/entries/delete — delete blessings from the book.
//
// Why this is a server route and not a client deleteDoc():
// firestore.rules deliberately says `allow update, delete: if false` on
// /weddings/{wid}/entries/{eid} — "entry edits go through the admin API
// only". A client-side deleteDoc is therefore at the mercy of whatever
// rules are actually deployed, and because the old handler had no catch,
// a rejection surfaced as NOTHING happening: the confirm dialog closed
// and the blessing stayed. This route uses the Admin SDK, which bypasses
// the client rules, so a delete either succeeds or returns a real error
// the UI can show.
//
// AUTHORISATION — destructive, so it goes through the same guard the
// /api/guests/* routes use: a valid Firebase ID token whose uid matches
// the wedding's ownerId, or a super-admin email. Without the ownership
// check any signed-in customer could delete another event's blessings by
// guessing a weddingId.
//
// Deletes are idempotent: an id that no longer exists is reported as
// `missing` rather than failing the whole request, so a double-tap or a
// retry after a flaky network can't leave the UI stuck.
//
// The photo in Storage is deliberately LEFT IN PLACE. duplicateEntry()
// copies an entry's imageUrl without copying the underlying object, so
// two entries can share one file — deleting it with the copy would blank
// the original's photo. Orphaned images cost cents; a blank page in a
// printed book costs a reprint.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import { authorizeWeddingAccess } from '@/app/api/guests/_auth'

// Firestore caps a batch at 500 writes. The UI deletes one card at a
// time today, but the cap is enforced here so a future multi-select (or
// a scripted caller) can't hit an opaque Firestore error instead.
const MAX_IDS = 200

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
    if (!isSafeSegment(weddingId)) return bad(400, 'bad-wedding-id')

    const auth = await authorizeWeddingAccess(req, weddingId)
    if (!auth.ok) return bad(auth.status, auth.error)

    // Accept a single id or a list — the UI deletes one card today, and a
    // multi-select can call the same endpoint tomorrow without a new route.
    const rawIds = Array.isArray(body?.entryIds)
        ? body.entryIds
        : body?.entryId != null
          ? [body.entryId]
          : []
    const entryIds = [...new Set(rawIds.map(id => String(id || '').trim()).filter(isSafeSegment))]
    if (entryIds.length === 0) return bad(400, 'no-entry-ids')
    if (entryIds.length > MAX_IDS) return bad(413, 'too-many-ids')

    const entriesRef = auth.weddingRef.collection('entries')
    const deleted = []
    const missing = []
    try {
        // getAll in one round-trip, then a single atomic batch — either
        // every requested blessing goes or none does, so a partial failure
        // can never leave the book half-edited.
        const snaps = await adminDb.getAll(...entryIds.map(id => entriesRef.doc(id)))
        const batch = adminDb.batch()
        for (const snap of snaps) {
            if (snap.exists) {
                batch.delete(snap.ref)
                deleted.push(snap.id)
            } else {
                missing.push(snap.id)
            }
        }
        if (deleted.length > 0) await batch.commit()
    } catch (err) {
        console.error('[entries/delete] delete failed', err)
        return bad(502, 'delete-failed')
    }

    return NextResponse.json({ ok: true, deleted, missing })
}
