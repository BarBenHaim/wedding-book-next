import { safeOrderId } from './paymentTruth'
import { isAuthorizedOrderSnapshot } from './orderFulfillment'

const APP_ORIGIN = 'https://app.weddingtales.co.il'
export function orderAccessLinks(weddingId) {
    if (!safeOrderId(weddingId)) return null
    return {
        // Owner access uses the existing authentication-required management
        // page; this status endpoint does not grant a bearer capability.
        ownerUrl: `${APP_ORIGIN}/wedding/${encodeURIComponent(weddingId)}/admin`,
        ownerUrlRequiresAuth: true,
        guestUrl: `${APP_ORIGIN}/wedding/${encodeURIComponent(weddingId)}/photo`,
    }
}

// verifiedCustomerId must come from verifyIdToken, never the query/body/model.
// A book link, phone match, email assertion, or closed_won is not authorization.
export async function getOrderStatus({ db, verifiedCustomerId, orderId }) {
    if (typeof verifiedCustomerId !== 'string' || !verifiedCustomerId.trim()) return { ok: false, status: 401, error: 'auth_required' }
    if (!safeOrderId(orderId)) return { ok: false, status: 400, error: 'invalid_order_id' }
    const lockSnap = await db.collection('ordersLocks').doc(orderId).get()
    const lock = lockSnap.exists ? lockSnap.data() : null
    if (!lock || !lock.ownerId || lock.ownerId !== verifiedCustomerId || lock.orderId !== orderId || !safeOrderId(lock.weddingId)) {
        return { ok: false, status: 404, error: 'order_not_found' }
    }
    const bookSnap = await db.collection('weddings').doc(lock.weddingId).get()
    const book = bookSnap.exists ? bookSnap.data() : null
    // A missing book can truthfully be pending, but an existing foreign book
    // must never reveal anything even if the order record itself is owned.
    if (book && (book.ownerId !== verifiedCustomerId || book.orderId !== orderId)) return { ok: false, status: 404, error: 'order_not_found' }
    const rawSnap = await db.collection('ordersRaw').doc(orderId).get()
    const raw = rawSnap.exists ? rawSnap.data() : null
    const review = await db.collection('order_fulfillment_reviews').doc(orderId).get()
    const requiresReview = review.exists && review.data()?.status === 'pending'
    const paid = !requiresReview && isAuthorizedOrderSnapshot(raw, lock)
    const ready = paid && lock.status === 'ready' && !!book
    return {
        ok: true, orderId, paymentVerified: paid, paymentStatus: paid ? 'verified' : 'unverified',
        bookReady: ready, bookStatus: ready ? 'ready' : paid ? 'preparing' : 'unavailable',
        ownerUrl: null, ownerUrlRequiresAuth: true, guestUrl: null,
        ...(ready ? orderAccessLinks(lock.weddingId) : {}),
    }
}
