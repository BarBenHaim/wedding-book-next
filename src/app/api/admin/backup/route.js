export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebaseAdmin'

const SUPER_ADMIN_EMAIL = 'barbenbh@gmail.com'

export async function GET(req) {
    // Auth check
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    try {
        const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1])
        if (decoded.email !== SUPER_ADMIN_EMAIL) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        // Fetch all weddings with their full data + entries
        const weddingsSnap = await adminDb.collection('weddings').get()

        const backup = {
            exportedAt: new Date().toISOString(),
            version: '1.0',
            weddings: [],
            stats: {
                totalWeddings: 0,
                totalEntries: 0,
            },
        }

        for (const doc of weddingsSnap.docs) {
            const data = doc.data()

            // Fetch all entries for this wedding
            const entriesSnap = await adminDb
                .collection('weddings')
                .doc(doc.id)
                .collection('entries')
                .get()

            const entries = entriesSnap.docs.map(entryDoc => {
                const entryData = entryDoc.data()
                return {
                    id: entryDoc.id,
                    name: entryData.name ?? null,
                    text: entryData.text ?? null,
                    imageUrl: entryData.imageUrl ?? null,
                    timestamp: entryData.timestamp?.toDate?.()?.toISOString() ?? null,
                    orderIndex: entryData.orderIndex ?? null,
                }
            })

            // Normalize timestamps
            let createdAt = null
            if (data.createdAt?.toDate) createdAt = data.createdAt.toDate().toISOString()

            let weddingDate = null
            if (data.weddingDate?.toDate) {
                weddingDate = data.weddingDate.toDate().toISOString()
            } else if (data.weddingDate) {
                weddingDate = data.weddingDate
            }

            backup.weddings.push({
                id: doc.id,
                brideName: data.brideName ?? null,
                groomName: data.groomName ?? null,
                weddingDate,
                ownerEmail: data.ownerEmail ?? null,
                ownerId: data.ownerId ?? null,
                orderId: data.orderId ?? null,
                slug: data.slug ?? null,
                createdAt,
                coverDesign: data.coverDesign ?? null,
                entries,
                entriesCount: entries.length,
            })

            backup.stats.totalEntries += entries.length
        }

        backup.stats.totalWeddings = backup.weddings.length

        console.log(`📦 Backup exported: ${backup.stats.totalWeddings} weddings, ${backup.stats.totalEntries} entries`)

        return new NextResponse(JSON.stringify(backup, null, 2), {
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename=wedding-tales-backup-${new Date().toISOString().split('T')[0]}.json`,
            },
        })
    } catch (err) {
        console.error('[admin/backup] Error:', err)
        return NextResponse.json({ error: 'Failed to create backup' }, { status: 500 })
    }
}
