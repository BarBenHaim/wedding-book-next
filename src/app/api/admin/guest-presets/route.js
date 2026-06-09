export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { FieldValue } from 'firebase-admin/firestore'

// Saved presets for the guest /photo page design (the analogue of the
// book's `studio_presets`). Each doc holds a full `design` object
// (colours + uploaded bg/button/corner image URLs) plus optional `copy`
// overrides, so a saved preset reproduces a complete look — images and
// all — on any event. Writes go through this Admin-SDK route so no
// Firestore-rules change/deploy is needed; the route gates on a valid
// super-admin ID token.
const COL = 'guest_design_presets'

async function verifySuperAdmin(req) {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null
    const token = authHeader.split('Bearer ')[1]
    try {
        const decoded = await adminAuth.verifyIdToken(token)
        if (!isSuperAdmin(decoded.email)) return null
        return decoded
    } catch {
        return null
    }
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v)

export async function POST(req) {
    const admin = await verifySuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let body
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Bad JSON' }, { status: 400 })
    }
    const op = body?.op

    try {
        if (op === 'list') {
            const snap = await adminDb.collection(COL).get()
            const presets = snap.docs
                .map(d => {
                    const x = d.data() || {}
                    return {
                        id: d.id,
                        name: x.name || '',
                        swatch: x.swatch || '#c9a44e',
                        design: isObj(x.design) ? x.design : {},
                        copy: isObj(x.copy) ? x.copy : {},
                        ownerType: x.ownerType || 'studio',
                        _ts: x.createdAt?.toMillis?.() || 0,
                    }
                })
                .sort((a, b) => b._ts - a._ts)
                .map(({ _ts, ...p }) => p)
            return NextResponse.json({ presets })
        }

        if (op === 'save') {
            const p = body.preset || {}
            if (!p.name || !isObj(p.design)) {
                return NextResponse.json({ error: 'Missing name/design' }, { status: 400 })
            }
            const data = {
                name: String(p.name).slice(0, 80),
                swatch: typeof p.swatch === 'string' ? p.swatch : '#c9a44e',
                design: p.design,
                copy: isObj(p.copy) ? p.copy : {},
                ownerType: p.ownerType === 'system' ? 'system' : 'studio',
                updatedAt: FieldValue.serverTimestamp(),
            }
            if (JSON.stringify(data).length > 14000) {
                return NextResponse.json({ error: 'Preset too large' }, { status: 400 })
            }
            const id = p.id || 'gd_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
            const ref = adminDb.collection(COL).doc(id)
            const existed = (await ref.get()).exists
            if (!existed) data.createdAt = FieldValue.serverTimestamp()
            await ref.set(data, { merge: true })
            return NextResponse.json({
                preset: { id, name: data.name, swatch: data.swatch, design: data.design, copy: data.copy, ownerType: data.ownerType },
            })
        }

        if (op === 'delete') {
            if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
            await adminDb.collection(COL).doc(String(body.id)).delete()
            return NextResponse.json({ ok: true })
        }

        return NextResponse.json({ error: 'Unknown op' }, { status: 400 })
    } catch (err) {
        console.error('[guest-presets] error:', err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
