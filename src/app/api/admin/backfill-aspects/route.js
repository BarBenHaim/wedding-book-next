// POST /api/admin/backfill-aspects — one-time janitor (super-admin only).
//
// Measures imgAspect for EXISTING entries that have a photo but no
// stored aspect (photos uploaded before the measurement era). Fetches
// each image, reads its dimensions with sharp, writes the twin field.
// Processes up to LIMIT per call and reports {remaining} — click again
// until remaining is 0. Idempotent and safe to re-run.
import { NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import sharp from 'sharp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const LIMIT = 120

export async function POST(req) {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    try {
        const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1])
        if (!isSuperAdmin(decoded.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    try {
        const weddings = await adminDb.collection('weddings').get()
        let measured = 0
        let failed = 0
        let remaining = 0

        for (const wd of weddings.docs) {
            const entries = await wd.ref.collection('entries').get()
            for (const e of entries.docs) {
                const d = e.data()
                const url = d.imageUrl || d.photoUrl
                if (!url || Number(d.imgAspect) > 0) continue
                if (measured + failed >= LIMIT) { remaining++; continue }
                try {
                    const res = await fetch(url)
                    if (!res.ok) throw new Error(`HTTP ${res.status}`)
                    const buf = Buffer.from(await res.arrayBuffer())
                    const meta = await sharp(buf).metadata()
                    if (meta?.width > 0 && meta?.height > 0) {
                        await e.ref.update({ imgAspect: Math.round((meta.width / meta.height) * 1000) / 1000 })
                        measured++
                    } else {
                        failed++
                    }
                } catch {
                    failed++
                }
            }
        }

        return NextResponse.json({ ok: true, measured, failed, remaining })
    } catch (err) {
        console.error('[backfill-aspects] failed', err)
        return NextResponse.json({ error: 'Internal' }, { status: 500 })
    }
}
