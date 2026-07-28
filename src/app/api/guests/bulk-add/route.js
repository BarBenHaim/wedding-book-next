// POST /api/guests/bulk-add — owner/super-admin: batch add guests.
//
// Body: { weddingId, guests: [{ name, phone, group? }, ...] }
//
// For every incoming row:
//   1. Normalize phone via normalizeIL().
//   2. Skip rows with no valid name OR no phone left after normalization.
//   3. Skip rows whose (normalized) phone already exists on the wedding —
//      guests are identified by phone; re-uploading a spreadsheet shouldn't
//      double-add anyone.
//
// Returns { added, skipped, total } so the UI can show a proper toast.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { authorizeWeddingAccess } from '../_auth'
import { normalizeIL } from '@/lib/normalizePhoneIL'

const NAME_MAX = 80
const GROUP_MAX = 40
const MAX_BULK = 2000 // hard cap so one bad paste can't blow the doc

export async function POST(req) {
    let body
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Bad JSON' }, { status: 400 })
    }

    const weddingId = String(body?.weddingId || '').trim()
    const rows = Array.isArray(body?.guests) ? body.guests : null
    if (!weddingId || !rows) {
        return NextResponse.json({ error: 'Missing weddingId or guests[]' }, { status: 400 })
    }
    if (rows.length > MAX_BULK) {
        return NextResponse.json({ error: `Too many rows (max ${MAX_BULK})` }, { status: 413 })
    }

    const auth = await authorizeWeddingAccess(req, weddingId)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    try {
        // Load existing phones so we can dedupe cheaply. For MVP scale
        // (weddings peak at ~800 guests) an in-memory Set is fine.
        const existingSnap = await auth.weddingRef.collection('guests').get()
        const existingPhones = new Set(
            existingSnap.docs.map(d => (d.data()?.phone || '').trim()).filter(Boolean),
        )

        // Dedupe within THIS payload too — someone pasting the same guest
        // twice shouldn't create two docs.
        const seenInBatch = new Set()

        // Firestore batched writes cap at 500 ops — chunk if needed.
        const toAdd = []
        let skipped = 0

        for (const raw of rows) {
            const name = String(raw?.name || '').trim().slice(0, NAME_MAX)
            const phone = normalizeIL(raw?.phone)
            const group = String(raw?.group || '').trim().slice(0, GROUP_MAX)

            if (!name || !phone) {
                skipped++
                continue
            }
            if (existingPhones.has(phone) || seenInBatch.has(phone)) {
                skipped++
                continue
            }
            seenInBatch.add(phone)
            toAdd.push({ name, phone, group })
        }

        let added = 0
        // Chunk writes into batches of 400 (well under the 500 limit).
        for (let i = 0; i < toAdd.length; i += 400) {
            const chunk = toAdd.slice(i, i + 400)
            const batch = auth.weddingRef.firestore.batch()
            for (const g of chunk) {
                const docRef = auth.weddingRef.collection('guests').doc()
                batch.set(docRef, {
                    name: g.name,
                    phone: g.phone,
                    group: g.group || null,
                    createdAt: FieldValue.serverTimestamp(),
                    invitedAt: null,
                    wroteAt: null,
                    entryId: null,
                })
                added++
            }
            await batch.commit()
        }

        return NextResponse.json({ added, skipped, total: rows.length })
    } catch (err) {
        console.error('[api/guests/bulk-add] error', err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
