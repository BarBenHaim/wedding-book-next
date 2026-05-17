// /api/admin/qrcodes — super-admin CRUD for dynamic QR codes.
//
//   GET    /api/admin/qrcodes               → list every QR (with weddingId, target, scans, label)
//   POST   /api/admin/qrcodes               → create a new QR
//   PATCH  /api/admin/qrcodes               → update target / label / active / weddingId
//   DELETE /api/admin/qrcodes?code=xxx      → delete a QR doc
//
// The model: each QR is a short random code stored in `qrcodes/{code}`
// with a `targetUrl`. The printed QR encodes
// `https://<origin>/q/{code}` — see /q/[code]/route.js for the
// redirector. Super-admin can change `targetUrl` at any time
// without re-issuing the QR sticker.
//
// All ops require Bearer ID token + isSuperAdmin email check.

import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'
import { isSuperAdmin } from '@/lib/superAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function authenticate(req) {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Unauthorized' }
    try {
        const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1])
        if (!isSuperAdmin(decoded.email)) return { ok: false, status: 403, error: 'Forbidden' }
        return { ok: true, email: decoded.email, uid: decoded.uid }
    } catch {
        return { ok: false, status: 401, error: 'Invalid token' }
    }
}

// Short, URL-safe random code. 8 base36 chars = ~41 bits of entropy,
// plenty for a few thousand active QR codes without collisions.
function newCode() {
    const a = Math.random().toString(36).slice(2, 6)
    const b = Math.random().toString(36).slice(2, 6)
    return (a + b).slice(0, 8)
}

// Default target URL for a brand-new QR — the wedding's /photo flow.
// Admin can change it later through PATCH.
function defaultTarget(weddingId) {
    return weddingId ? `/wedding/${weddingId}/photo` : '/'
}

// GET — list QRs (optionally filtered by weddingId)
export async function GET(req) {
    const auth = await authenticate(req)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { searchParams } = new URL(req.url)
    const weddingId = searchParams.get('weddingId')

    try {
        let q = adminDb.collection('qrcodes')
        if (weddingId) q = q.where('weddingId', '==', weddingId)
        const snap = await q.get()
        const list = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        return NextResponse.json({ list })
    } catch (err) {
        console.error('[qrcodes GET] failed:', err?.message || err)
        return NextResponse.json({ error: 'Query failed' }, { status: 500 })
    }
}

// POST — create. Body: { weddingId?, targetUrl?, label? }
// If weddingId is provided and targetUrl is missing, we default the
// target to /wedding/{weddingId}/photo so the QR works out of the box.
export async function POST(req) {
    const auth = await authenticate(req)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    let body
    try { body = await req.json() } catch { body = {} }

    const weddingId = typeof body.weddingId === 'string' ? body.weddingId.trim() : ''
    const targetUrl = (typeof body.targetUrl === 'string' && body.targetUrl.trim()) || defaultTarget(weddingId)
    const label = (typeof body.label === 'string' ? body.label : '').slice(0, 100)

    // Generate a unique code. Loops on collision (rare with 8 chars but
    // possible at scale). Caps at 5 tries — beyond that something's
    // seriously wrong and the user should retry.
    let code = ''
    for (let i = 0; i < 5; i++) {
        const candidate = newCode()
        const existing = await adminDb.collection('qrcodes').doc(candidate).get()
        if (!existing.exists) {
            code = candidate
            break
        }
    }
    if (!code) {
        return NextResponse.json({ error: 'Could not generate unique code' }, { status: 500 })
    }

    try {
        const doc = {
            code,
            weddingId: weddingId || null,
            targetUrl,
            label,
            active: true,
            scans: 0,
            createdBy: auth.email || 'unknown',
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        }
        await adminDb.collection('qrcodes').doc(code).set(doc)
        return NextResponse.json({ ok: true, code, ...doc })
    } catch (err) {
        console.error('[qrcodes POST] failed:', err?.message || err)
        return NextResponse.json({ error: 'Create failed' }, { status: 500 })
    }
}

// PATCH — update an existing QR. Body: { code, targetUrl?, label?, active?, weddingId? }
export async function PATCH(req) {
    const auth = await authenticate(req)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    let body
    try { body = await req.json() } catch { body = {} }
    const code = typeof body.code === 'string' ? body.code.trim() : ''
    if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })

    const patch = { updatedAt: FieldValue.serverTimestamp() }
    if (typeof body.targetUrl === 'string') patch.targetUrl = body.targetUrl.trim()
    if (typeof body.label === 'string') patch.label = body.label.slice(0, 100)
    if (typeof body.active === 'boolean') patch.active = body.active
    if (typeof body.weddingId === 'string') patch.weddingId = body.weddingId.trim() || null

    try {
        await adminDb.collection('qrcodes').doc(code).update(patch)
        return NextResponse.json({ ok: true, code, ...patch })
    } catch (err) {
        console.error('[qrcodes PATCH] failed:', err?.message || err)
        return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }
}

// DELETE — remove a QR doc entirely. The printed sticker still
// resolves but the redirect handler will fall back to /.
export async function DELETE(req) {
    const auth = await authenticate(req)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { searchParams } = new URL(req.url)
    const code = (searchParams.get('code') || '').trim()
    if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })

    try {
        await adminDb.collection('qrcodes').doc(code).delete()
        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[qrcodes DELETE] failed:', err?.message || err)
        return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
    }
}
