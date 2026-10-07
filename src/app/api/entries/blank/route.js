// POST /api/entries/blank — insert an empty page into the book.
//
// Body: { weddingId, afterEntryId }   afterEntryId null → at the end
// Auth: super-admin ID token (same door as /api/entries/page-style).
//
// Creates an entry of kind 'blank' (src/lib/entryKinds.js) with the
// Admin SDK — firestore.rules forbids client writes on entries, and a
// page the operator inserts into a customer's keepsake must not depend
// on whatever rules happen to be deployed. The order is written in the
// same request through the one orderIndex writer (entryOrder.js), from
// the entries as they are NOW, so a stale browser list cannot push the
// new page somewhere else.
//
// Removing a blank page is an ordinary /api/entries/delete.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { blankPageDoc, insertAfter } from '@/lib/entryKinds'
import { sortForArrange } from '@/lib/arrangeLinks'
import { writeEntryOrder } from '@/lib/server/entryOrder'

async function authorized(req) {
    const header = req.headers.get('authorization') || ''
    if (!header.startsWith('Bearer ')) return null
    try {
        const decoded = await adminAuth.verifyIdToken(header.slice(7).trim())
        return isSuperAdmin(decoded.email) ? (decoded.email || 'super-admin') : null
    } catch {
        return null
    }
}

export async function POST(req) {
    const who = await authorized(req)
    if (!who) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const weddingId = String(body?.weddingId || '').trim()
    const afterEntryId = typeof body?.afterEntryId === 'string' && body.afterEntryId.trim()
        ? body.afterEntryId.trim()
        : null
    if (!weddingId) return NextResponse.json({ error: 'missing-weddingId' }, { status: 400 })

    try {
        const weddingRef = adminDb.collection('weddings').doc(weddingId)
        const weddingSnap = await weddingRef.get()
        if (!weddingSnap.exists) return NextResponse.json({ error: 'wedding-not-found' }, { status: 404 })

        const col = weddingRef.collection('entries')
        const snap = await col.get()
        const existing = sortForArrange(snap.docs.map(d => {
            const data = d.data() || {}
            return {
                id: d.id,
                orderIndex: data.orderIndex,
                timestamp: data.timestamp?.toDate ? data.timestamp.toDate().getTime() : (Number.isFinite(data.timestamp) ? data.timestamp : 0),
            }
        }))
        if (afterEntryId && !existing.some(e => e.id === afterEntryId)) {
            return NextResponse.json({ error: 'after-entry-not-found' }, { status: 404 })
        }

        const created = await col.add(blankPageDoc({ createdBy: who }))
        const order = insertAfter(existing.map(e => e.id), afterEntryId, created.id)
        const result = await writeEntryOrder(weddingId, order)

        return NextResponse.json({ ok: true, id: created.id, order: result.order })
    } catch (err) {
        console.error('[entries/blank] failed:', err?.message || err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
