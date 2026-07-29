// POST /api/admin/cleanup-anon — one-time janitor (super-admin only).
//
// History: guest uploads used to default an empty name to the literal
// string 'אורח אנונימי', and those strings still print in books. The
// product decision is now "empty stays empty" — this route sweeps every
// entry in every wedding and blanks the legacy literal. Idempotent:
// running it twice finds nothing the second time.
import { NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
        let scanned = 0
        let cleaned = 0
        for (const wd of weddings.docs) {
            const entries = await wd.ref.collection('entries').where('name', '==', 'אורח אנונימי').get()
            scanned++
            if (entries.empty) continue
            const batch = adminDb.batch()
            entries.forEach(e => batch.update(e.ref, { name: '' }))
            await batch.commit()
            cleaned += entries.size
        }
        return NextResponse.json({ ok: true, weddingsScanned: scanned, entriesCleaned: cleaned })
    } catch (err) {
        console.error('[cleanup-anon] failed', err)
        return NextResponse.json({ error: 'Internal' }, { status: 500 })
    }
}
