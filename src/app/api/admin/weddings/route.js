export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebaseAdmin'

const SUPER_ADMIN_EMAIL = 'barbenbh@gmail.com'

// ─── Auth helper ─────────────────────────────────────────────────────────────
async function verifySuperAdmin(req) {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null

    const token = authHeader.split('Bearer ')[1]
    try {
        const decoded = await adminAuth.verifyIdToken(token)
        if (decoded.email !== SUPER_ADMIN_EMAIL) return null
        return decoded
    } catch {
        return null
    }
}

// ─── GET: Fetch all weddings ─────────────────────────────────────────────────
export async function GET(req) {
    const admin = await verifySuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    try {
        const snapshot = await adminDb.collection('weddings').get()

        const weddings = await Promise.all(
            snapshot.docs.map(async doc => {
                const data = doc.data()

                let greetingsCount = 0
                try {
                    const entriesSnap = await adminDb
                        .collection('weddings')
                        .doc(doc.id)
                        .collection('entries')
                        .count()
                        .get()
                    greetingsCount = entriesSnap.data().count
                } catch {
                    greetingsCount = 0
                }

                let weddingDate = null
                if (data.weddingDate) {
                    if (typeof data.weddingDate.toDate === 'function') {
                        weddingDate = data.weddingDate.toDate().toISOString()
                    } else {
                        weddingDate = data.weddingDate
                    }
                }

                let createdAt = null
                if (data.createdAt) {
                    if (typeof data.createdAt.toDate === 'function') {
                        createdAt = data.createdAt.toDate().toISOString()
                    }
                }

                return {
                    id: doc.id,
                    brideName: data.brideName ?? null,
                    groomName: data.groomName ?? null,
                    weddingDate,
                    ownerEmail: data.ownerEmail ?? data.email ?? null,
                    ownerId: data.ownerId ?? null,
                    orderId: data.orderId ?? null,
                    slug: data.slug ?? null,
                    greetingsCount,
                    createdAt,
                }
            })
        )

        return NextResponse.json(weddings)
    } catch (err) {
        console.error('[admin/weddings] Error fetching weddings:', err)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

// ─── DELETE: Delete a wedding (and all its entries) ──────────────────────────
export async function DELETE(req) {
    const admin = await verifySuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    try {
        const { weddingId } = await req.json()
        if (!weddingId) return NextResponse.json({ error: 'Missing weddingId' }, { status: 400 })

        // Delete all entries in sub-collection
        const entriesSnap = await adminDb
            .collection('weddings')
            .doc(weddingId)
            .collection('entries')
            .get()

        const batch = adminDb.batch()
        entriesSnap.docs.forEach(doc => batch.delete(doc.ref))

        // Delete the wedding document itself
        batch.delete(adminDb.collection('weddings').doc(weddingId))

        // Clean up related locks/raw data
        const lockRef = adminDb.collection('ordersLocks').doc(weddingId)
        const lockSnap = await lockRef.get()
        if (lockSnap.exists) batch.delete(lockRef)

        const rawRef = adminDb.collection('ordersRaw').doc(weddingId)
        const rawSnap = await rawRef.get()
        if (rawSnap.exists) batch.delete(rawRef)

        await batch.commit()

        console.log(`🗑️ Wedding ${weddingId} deleted by super admin (${entriesSnap.size} entries removed)`)
        return NextResponse.json({ success: true, entriesDeleted: entriesSnap.size })
    } catch (err) {
        console.error('[admin/weddings] DELETE error:', err)
        return NextResponse.json({ error: 'Failed to delete wedding' }, { status: 500 })
    }
}
