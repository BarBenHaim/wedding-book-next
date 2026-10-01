// src/lib/server/entryOrder.js
//
// The one place that writes `orderIndex` on a book's blessings.
//
// Two doors lead here — the no-login arrange link and the owner's
// logged-in admin page — and both used to be in different shape: the
// admin page wrote orderIndex from the browser with the client SDK,
// which firestore.rules (`allow update: if false` on entries) rejects.
// With no catch around it the rejection was invisible: the list looked
// reordered until the next reload. Going through the Admin SDK makes
// the save real, and makes it the same save whichever door it came in.
//
// The requested order is reconciled against the entries that exist at
// write time (see reconcileOrder): deleted ids drop, blessings that
// arrived since the page loaded go to the end, nothing is left without
// an index. Writes are chunked under Firestore's 500-op batch limit.

import { adminDb } from '@/lib/firebaseAdmin'
import { reconcileOrder, sortForArrange } from '@/lib/arrangeLinks'

const BATCH_LIMIT = 450

export async function writeEntryOrder(weddingId, requestedOrder) {
    const col = adminDb.collection('weddings').doc(weddingId).collection('entries')
    const qs = await col.get()
    const existing = sortForArrange(
        qs.docs.map(d => {
            const data = d.data() || {}
            return {
                id: d.id,
                orderIndex: data.orderIndex,
                timestamp: data.timestamp?.toDate ? data.timestamp.toDate().getTime() : (Number.isFinite(data.timestamp) ? data.timestamp : 0),
            }
        }),
    )
    const { order, dropped, appended } = reconcileOrder(requestedOrder, existing)

    for (let start = 0; start < order.length; start += BATCH_LIMIT) {
        const batch = adminDb.batch()
        order.slice(start, start + BATCH_LIMIT).forEach((id, offset) => {
            batch.update(col.doc(id), { orderIndex: start + offset })
        })
        await batch.commit()
    }

    return { count: order.length, dropped, appended, order }
}
