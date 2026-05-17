// /api/admin/stats-tokens
//
// Generate / revoke "stats tokens" — short codes the couple uses to
// view their wedding's stats page (/wedding/[id]/stats/[token])
// WITHOUT needing an admin login. Pattern mirrors the digital-edition
// token system: an array of allowed tokens stored on the wedding
// doc; the stats page checks the token before rendering.
//
//   POST   /api/admin/stats-tokens   body { weddingId }   → mint token
//   DELETE /api/admin/stats-tokens   body { weddingId, token } → revoke
//
// Both ops require super-admin auth.

import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'
import { isSuperAdmin } from '@/lib/superAdmin'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function authenticate(req) {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Unauthorized' }
    try {
        const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1])
        if (!isSuperAdmin(decoded.email)) return { ok: false, status: 403, error: 'Forbidden' }
        return { ok: true, email: decoded.email }
    } catch {
        return { ok: false, status: 401, error: 'Invalid token' }
    }
}

export async function POST(req) {
    const auth = await authenticate(req)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    let body
    try { body = await req.json() } catch { body = {} }
    const weddingId = typeof body.weddingId === 'string' ? body.weddingId.trim() : ''
    if (!weddingId) return NextResponse.json({ error: 'Missing weddingId' }, { status: 400 })

    try {
        const token = randomUUID()
        await adminDb.collection('weddings').doc(weddingId).update({
            statsTokens: FieldValue.arrayUnion(token),
            statsTokensIssuedAt: FieldValue.arrayUnion({
                token,
                at: new Date(),
                by: auth.email || 'unknown',
            }),
        })
        const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || new URL(req.url).origin
        return NextResponse.json({
            ok: true,
            token,
            link: `${origin}/wedding/${weddingId}/stats/${token}`,
        })
    } catch (err) {
        console.error('[stats-tokens POST] failed:', err?.message || err)
        return NextResponse.json({ error: 'Mint failed' }, { status: 500 })
    }
}

export async function DELETE(req) {
    const auth = await authenticate(req)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    let body
    try { body = await req.json() } catch { body = {} }
    const weddingId = typeof body.weddingId === 'string' ? body.weddingId.trim() : ''
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    if (!weddingId || !token) return NextResponse.json({ error: 'Missing weddingId or token' }, { status: 400 })

    try {
        await adminDb.collection('weddings').doc(weddingId).update({
            statsTokens: FieldValue.arrayRemove(token),
        })
        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[stats-tokens DELETE] failed:', err?.message || err)
        return NextResponse.json({ error: 'Revoke failed' }, { status: 500 })
    }
}
