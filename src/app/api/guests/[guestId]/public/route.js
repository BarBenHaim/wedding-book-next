// GET /api/guests/[guestId]/public?weddingId=... — PUBLIC.
//
// Returns only { name } for the guest. Called from the /photo page to
// prefill the "your name" input when a guest arrives via a personalised
// WhatsApp link (?g=<guestId>). Phone / group / timestamps are NEVER
// exposed here — those are owner-only.
//
// No auth: the guestId is unguessable Firestore-generated. The wedding
// owner shares this URL in WhatsApp with the specific guest; the guest's
// name is the same information the owner is already texting them.
//
// PATCH /api/guests/[guestId]/public — PUBLIC, narrow-purpose:
//   Body: { weddingId, entryId }
// Called by the /photo page after a successful submission so the owner's
// guests table can flip the pill to "כתב ✓". Only writes wroteAt +
// entryId — nothing else. Idempotent.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'

export async function GET(req, ctx) {
    const { guestId } = await ctx.params
    const { searchParams } = new URL(req.url)
    const weddingId = searchParams.get('weddingId') || ''

    if (!weddingId || !guestId) {
        return NextResponse.json({ error: 'Missing weddingId or guestId' }, { status: 400 })
    }

    try {
        const snap = await adminDb
            .collection('weddings')
            .doc(weddingId)
            .collection('guests')
            .doc(guestId)
            .get()
        if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        const data = snap.data() || {}
        return NextResponse.json({ name: data.name || '' })
    } catch (err) {
        console.error('[api/guests/[id]/public] GET error', err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}

export async function PATCH(req, ctx) {
    const { guestId } = await ctx.params
    let body
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Bad JSON' }, { status: 400 })
    }
    const weddingId = String(body?.weddingId || '').trim()
    const entryId = body?.entryId ? String(body.entryId).slice(0, 200) : null
    if (!weddingId || !guestId) {
        return NextResponse.json({ error: 'Missing weddingId or guestId' }, { status: 400 })
    }

    try {
        const ref = adminDb.collection('weddings').doc(weddingId).collection('guests').doc(guestId)
        const snap = await ref.get()
        if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        await ref.set(
            {
                wroteAt: FieldValue.serverTimestamp(),
                entryId: entryId || snap.data()?.entryId || null,
            },
            { merge: true },
        )
        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[api/guests/[id]/public] PATCH error', err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
