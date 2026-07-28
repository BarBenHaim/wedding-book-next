// PATCH /api/guests/[guestId] — owner/super-admin: edit a single guest.
//   Body: { weddingId, patch: { name?, phone?, group?, invitedAt? } }
//   - `invitedAt`: accepts the sentinel string 'server' (mark as invited
//     right now), 'null' (clear), or a JS-parseable date-string.
//
// DELETE /api/guests/[guestId]?weddingId=... — owner/super-admin: remove.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { authorizeWeddingAccess } from '../_auth'
import { normalizeIL } from '@/lib/normalizePhoneIL'

const NAME_MAX = 80
const GROUP_MAX = 40

function coerceTimestamp(v) {
    // 'server' → serverTimestamp sentinel; null / '' → null (clear);
    // a parseable date-string → Date. Unrecognised → undefined (skip).
    if (v === 'server') return FieldValue.serverTimestamp()
    if (v === null || v === '') return null
    if (typeof v === 'string') {
        const d = new Date(v)
        if (!Number.isNaN(d.getTime())) return d
    }
    return undefined
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
    const patch = body?.patch && typeof body.patch === 'object' ? body.patch : null
    if (!weddingId || !patch) {
        return NextResponse.json({ error: 'Missing weddingId or patch' }, { status: 400 })
    }
    if (!guestId || typeof guestId !== 'string') {
        return NextResponse.json({ error: 'Missing guestId' }, { status: 400 })
    }

    const auth = await authorizeWeddingAccess(req, weddingId)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const clean = {}
    if (typeof patch.name === 'string') {
        const n = patch.name.trim().slice(0, NAME_MAX)
        if (n) clean.name = n
    }
    if (typeof patch.phone === 'string') {
        const p = normalizeIL(patch.phone)
        if (p) clean.phone = p
    }
    if (patch.group !== undefined) {
        const g = String(patch.group || '').trim().slice(0, GROUP_MAX)
        clean.group = g || null
    }
    if (patch.invitedAt !== undefined) {
        const t = coerceTimestamp(patch.invitedAt)
        if (t !== undefined) clean.invitedAt = t
    }
    if (patch.wroteAt !== undefined) {
        // Owner shouldn't normally set this — but expose it for admin
        // corrections. Same sentinel semantics.
        const t = coerceTimestamp(patch.wroteAt)
        if (t !== undefined) clean.wroteAt = t
    }
    if (patch.entryId !== undefined) {
        clean.entryId = patch.entryId === null || patch.entryId === '' ? null : String(patch.entryId)
    }

    if (Object.keys(clean).length === 0) {
        return NextResponse.json({ error: 'No valid fields in patch' }, { status: 400 })
    }

    try {
        const ref = auth.weddingRef.collection('guests').doc(guestId)
        const snap = await ref.get()
        if (!snap.exists) return NextResponse.json({ error: 'Guest not found' }, { status: 404 })

        // If phone changed, enforce uniqueness across other guests.
        if (clean.phone && clean.phone !== snap.data()?.phone) {
            const clash = await auth.weddingRef
                .collection('guests')
                .where('phone', '==', clean.phone)
                .limit(1)
                .get()
            if (!clash.empty && clash.docs[0].id !== guestId) {
                return NextResponse.json({ error: 'Phone already used by another guest' }, { status: 409 })
            }
        }

        await ref.set(clean, { merge: true })
        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[api/guests/[id]] PATCH error', err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}

export async function DELETE(req, ctx) {
    const { guestId } = await ctx.params
    const { searchParams } = new URL(req.url)
    const weddingId = searchParams.get('weddingId') || ''

    if (!guestId) return NextResponse.json({ error: 'Missing guestId' }, { status: 400 })

    const auth = await authorizeWeddingAccess(req, weddingId)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    try {
        await auth.weddingRef.collection('guests').doc(guestId).delete()
        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[api/guests/[id]] DELETE error', err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
