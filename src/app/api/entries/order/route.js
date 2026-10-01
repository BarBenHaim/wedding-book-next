// POST /api/entries/order — save the order of a book's blessings from
// the owner's logged-in admin page.
//
// Body: { weddingId, order: [entryId, ...] }
// Auth: Bearer Firebase ID token of the event's owner, or a super-admin
// (same guard as /api/entries/delete and /api/guests/*).
//
// Why a route and not a client writeBatch: firestore.rules blocks
// client updates on entries, so the browser-side batch the admin page
// used to run was rejected — silently, because nothing caught it. The
// write now goes through the Admin SDK (src/lib/server/entryOrder.js),
// the same writer the no-login arrange link uses.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { authorizeWeddingAccess } from '@/app/api/guests/_auth'
import { validateOrderRequest } from '@/lib/arrangeLinks'
import { writeEntryOrder } from '@/lib/server/entryOrder'

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}))
        const weddingId = typeof body.weddingId === 'string' ? body.weddingId.trim() : ''

        const auth = await authorizeWeddingAccess(req, weddingId)
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

        const check = validateOrderRequest(body)
        if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

        const result = await writeEntryOrder(weddingId, check.order)
        return NextResponse.json({ ok: true, count: result.count, dropped: result.dropped, appended: result.appended })
    } catch (err) {
        console.error('[entries/order] failed:', err?.message || err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
