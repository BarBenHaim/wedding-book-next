// /api/arrange/[token] — the no-login "arrange the blessings" API.
//
//   GET   → { ok, wedding: { id, title, eventType }, entries: [...] }
//   POST  { order: [entryId, ...] } → { ok, count, dropped, appended }
//
// The token in the path is the whole authorisation: it is the id of a
// document in the closed `arrange_links` collection (see
// src/lib/arrangeLinks.js). A link that was revoked, or never existed,
// is a 404 — the same answer for both, so a probe learns nothing.
//
// Writes go through the Admin SDK on purpose: firestore.rules says
// `allow update: if false` on entries, so the order can only be set
// from here (or from the owner's own admin page, which now calls the
// same writer).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebaseAdmin'
import { resolveEntryPhoto } from '@/lib/entryPhoto'
import {
    ARRANGE_LINKS_COLLECTION,
    isArrangeTokenShape,
    isArrangeLinkActive,
    publicArrangeEntry,
    sortForArrange,
    validateOrderRequest,
} from '@/lib/arrangeLinks'
import { writeEntryOrder } from '@/lib/server/entryOrder'

const NOT_FOUND = () => NextResponse.json({ error: 'Link not found' }, { status: 404 })

async function loadLink(token) {
    if (!isArrangeTokenShape(token)) return null
    const ref = adminDb.collection(ARRANGE_LINKS_COLLECTION).doc(token)
    const snap = await ref.get()
    if (!snap.exists) return null
    const data = snap.data() || {}
    if (!isArrangeLinkActive(data)) return null
    return { ref, data }
}

// How the page names the event at the top: the celebrant, the couple,
// or nothing — the page has its own neutral fallback.
function titleOf(w) {
    const celebrant = (w.celebrantNameHe || w.celebrantName || '').trim()
    if (celebrant) return celebrant
    const bride = (w.brideNameHe || w.brideName || '').trim()
    const groom = (w.groomNameHe || w.groomName || '').trim()
    if (bride && groom) return `${bride} ו${groom}`
    return bride || groom || ''
}

async function loadEntries(weddingId) {
    const qs = await adminDb.collection('weddings').doc(weddingId).collection('entries').get()
    const entries = qs.docs.map(d => {
        const data = d.data() || {}
        return resolveEntryPhoto({
            id: d.id,
            ...data,
            timestamp: data.timestamp?.toDate ? data.timestamp.toDate().getTime() : (Number.isFinite(data.timestamp) ? data.timestamp : null),
        })
    })
    return sortForArrange(entries)
}

export async function GET(_req, { params }) {
    try {
        const { token } = await params
        const link = await loadLink(token)
        if (!link) return NOT_FOUND()

        const weddingId = link.data.weddingId
        const wSnap = await adminDb.collection('weddings').doc(weddingId).get()
        if (!wSnap.exists) return NOT_FOUND()
        const w = wSnap.data() || {}

        const entries = await loadEntries(weddingId)
        return NextResponse.json({
            ok: true,
            wedding: { id: weddingId, title: titleOf(w), eventType: w.eventType || null },
            entries: entries.map(publicArrangeEntry),
        })
    } catch (err) {
        console.error('[arrange GET] failed:', err?.message || err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}

export async function POST(req, { params }) {
    try {
        const { token } = await params
        const link = await loadLink(token)
        if (!link) return NOT_FOUND()

        const body = await req.json().catch(() => ({}))
        const check = validateOrderRequest(body)
        if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

        const weddingId = link.data.weddingId
        const result = await writeEntryOrder(weddingId, check.order)

        // Bookkeeping for the admin panel: when the owner last touched
        // the order, and how many times. Best-effort; a failure here
        // must not turn a saved order into an error on screen.
        link.ref.set({ lastUsedAt: FieldValue.serverTimestamp(), saves: FieldValue.increment(1) }, { merge: true }).catch(() => {})

        return NextResponse.json({ ok: true, ...result })
    } catch (err) {
        console.error('[arrange POST] failed:', err?.message || err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
