export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebaseAdmin'

const SUPER_ADMIN_EMAIL = 'barbenbh@gmail.com'

export async function GET(req) {
    // 1. Extract Bearer token
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.split('Bearer ')[1]

    // 2. Verify token & enforce super-admin email
    let decoded
    try {
        decoded = await adminAuth.verifyIdToken(token)
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (decoded.email !== SUPER_ADMIN_EMAIL) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 3. Fetch all weddings
    try {
        const snapshot = await adminDb.collection('weddings').get()

        const weddings = await Promise.all(
            snapshot.docs.map(async doc => {
                const data = doc.data()

                // Count greetings (entries sub-collection)
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
                    // If entries sub-collection doesn't exist, leave at 0
                    greetingsCount = 0
                }

                // Normalise weddingDate → ISO string (Firestore Timestamp or plain string)
                let weddingDate = null
                if (data.weddingDate) {
                    if (typeof data.weddingDate.toDate === 'function') {
                        weddingDate = data.weddingDate.toDate().toISOString()
                    } else {
                        weddingDate = data.weddingDate
                    }
                }

                return {
                    id: doc.id,
                    brideName: data.brideName ?? null,
                    groomName: data.groomName ?? null,
                    weddingDate,
                    ownerEmail: data.ownerEmail ?? data.email ?? null,
                    orderId: data.orderId ?? null,
                    greetingsCount,
                }
            })
        )

        return NextResponse.json(weddings)
    } catch (err) {
        console.error('[admin/weddings] Error fetching weddings:', err)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
