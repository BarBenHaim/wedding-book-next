import crypto from 'crypto'
import { safeOrderId, moneyMinor, validateWooPayment } from './paymentTruth'

export const ORDER_LEASE_MS = 2 * 60_000
const snapshotData = snap => snap.exists ? snap.data() || {} : null
const normalEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : ''
const fingerprint = order => crypto.createHash('sha256').update(JSON.stringify({
    orderId: safeOrderId(order.id), email: normalEmail(order.billing?.email), total: moneyMinor(order.total),
    currency: order.currency || null,
    items: (Array.isArray(order.line_items) ? order.line_items : []).map(i => [i.product_id || null, i.variation_id || null, i.quantity || null]),
})).digest('hex')
const refs = (db, orderId, weddingId = orderId) => ({
    order: db.collection('ordersLocks').doc(orderId),
    book: db.collection('weddings').doc(weddingId),
    outbox: db.collection('order_confirmation_outbox').doc(orderId),
})
function ownsLease(lock, claim, nowMs) {
    return lock?.status === 'processing' && lock.leaseToken === claim.leaseToken
        && lock.fence === claim.fence && lock.leaseUntilMs > nowMs
}
export function isAuthorizedOrderSnapshot(raw, lock) {
    return raw?.signatureVerified === true && safeOrderId(raw.body?.id) === lock?.orderId
        && lock?.payment?.verified === true && lock.payment.source === 'woocommerce_signed_webhook'
        && lock.paymentFingerprint === fingerprint(raw.body)
        && validateWooPayment(raw.body, { strict: lock.payment.strict === true, trustedSource: true }).ok
}
function bookMatches(book, orderId, email, ownerId = null) {
    return book?.orderId === orderId && !!book.ownerId
        && normalEmail(book.ownerEmail) === normalEmail(email)
        && (!ownerId || book.ownerId === ownerId)
}

// Transaction callbacks contain only Firestore reads/writes. Auth and SMTP must
// never run in a callback which Firestore is allowed to retry.
export async function claimOrderFulfillment(db, order, paymentCheck, { nowMs = Date.now(), leaseToken = crypto.randomUUID(), verifiedOwnerId } = {}) {
    const orderId = safeOrderId(order?.id)
    if (!orderId || !paymentCheck?.ok) throw new Error('UNVERIFIED_ORDER')
    if (typeof verifiedOwnerId !== 'string' || !verifiedOwnerId) throw new Error('UNVERIFIED_OWNER')
    const orderRef = refs(db, orderId).order
    const paymentFingerprint = fingerprint(order)
    return db.runTransaction(async tx => {
        const lock = snapshotData(await tx.get(orderRef))
        const raw = snapshotData(await tx.get(db.collection('ordersRaw').doc(orderId)))
        if (!isAuthorizedOrderSnapshot(raw, { orderId, paymentFingerprint, payment: { verified: true, source: 'woocommerce_signed_webhook', strict: paymentCheck.strict === true } })) return { status: 'review_required', reason: 'payment_snapshot_changed' }
        if (lock?.ownerId && lock.ownerId !== verifiedOwnerId) return { status: 'review_required', reason: 'order_owner_conflict' }
        if (lock?.paymentFingerprint && lock.paymentFingerprint !== paymentFingerprint) return { status: 'review_required', reason: 'order_identity_changed' }
        // Accommodate historical book IDs, but ambiguity is never repaired by
        // choosing an arbitrary customer's book. Future creations use orderId.
        const matching = await tx.get(db.collection('weddings').where('orderId', '==', orderId).limit(2))
        if (matching.docs.length > 1) return { status: 'review_required', reason: 'multiple_order_books' }
        const weddingId = lock?.weddingId || matching.docs[0]?.id || orderId
        if (!safeOrderId(weddingId)) return { status: 'review_required', reason: 'invalid_book_mapping' }
        const target = refs(db, orderId, weddingId)
        const book = snapshotData(await tx.get(target.book))
        const outbox = snapshotData(await tx.get(target.outbox))
        if (book && !bookMatches(book, orderId, order.billing.email, verifiedOwnerId)) return { status: 'review_required', reason: 'book_owner_conflict' }
        if (!book && matching.docs.length) return { status: 'review_required', reason: 'book_mapping_conflict' }
        if (!book && lock?.status === 'ready') return { status: 'review_required', reason: 'book_missing_after_ready' }
        if (!book && lock?.status === 'processing' && lock.leaseUntilMs > nowMs) return { status: 'busy', reason: 'processing' }
        const payment = {
            verified: true, source: 'woocommerce_signed_webhook', strict: paymentCheck.strict === true,
            orderId, amountMinor: moneyMinor(order.total), currency: typeof order.currency === 'string' ? order.currency : null,
            verifiedAtMs: nowMs,
        }
        if (book) {
            tx.set(orderRef, { ...(lock || {}), orderId, weddingId, ownerId: book.ownerId,
                status: 'ready', payment, paymentFingerprint, leaseUntilMs: null, updatedAtMs: nowMs })
            // An old handler may already have emailed this owner. Do not invent
            // delivery truth or send an unsolicited duplicate on migration.
            if (!outbox) tx.set(target.outbox, { orderId, weddingId, ownerId: book.ownerId, state: 'legacy_unknown', createdAtMs: nowMs })
            return { status: 'ready', weddingId, ownerId: book.ownerId, created: false }
        }
        const fence = Number.isSafeInteger(lock?.fence) ? lock.fence + 1 : 1
        tx.set(orderRef, { ...(lock || {}), orderId, weddingId, ownerId: verifiedOwnerId, status: 'processing', payment, paymentFingerprint,
            fence, leaseToken, leaseUntilMs: nowMs + ORDER_LEASE_MS, updatedAtMs: nowMs })
        return { status: 'claimed', orderId, weddingId, fence, leaseToken }
    })
}

export async function commitOrderBook(db, claim, book, { nowMs = Date.now() } = {}) {
    const target = refs(db, claim.orderId, claim.weddingId)
    return db.runTransaction(async tx => {
        const lock = snapshotData(await tx.get(target.order))
        const existing = snapshotData(await tx.get(target.book))
        const outbox = snapshotData(await tx.get(target.outbox))
        const raw = snapshotData(await tx.get(db.collection('ordersRaw').doc(claim.orderId)))
        if (!isAuthorizedOrderSnapshot(raw, lock)) return { status: 'review_required', reason: 'payment_snapshot_changed' }
        if (!ownsLease(lock, claim, nowMs)) return { status: 'lost_claim' }
        if (book.ownerId !== lock.ownerId || !bookMatches(book, claim.orderId, book.ownerEmail, book.ownerId)
            || existing && !bookMatches(existing, claim.orderId, book.ownerEmail, book.ownerId)) return { status: 'review_required', reason: 'book_owner_conflict' }
        // Create-only. A retry must never merge new capabilities or overwrite
        // owner edits in a previously created book.
        if (!existing) tx.set(target.book, book)
        tx.set(target.order, { ...lock, status: 'ready', ownerId: book.ownerId, leaseUntilMs: null, updatedAtMs: nowMs, bookReadyAtMs: nowMs })
        if (!outbox) tx.set(target.outbox, {
            orderId: claim.orderId, weddingId: claim.weddingId, ownerId: book.ownerId,
            recipient: book.ownerEmail, state: existing ? 'legacy_unknown' : 'pending', createdAtMs: nowMs,
        })
        return { status: 'ready', weddingId: claim.weddingId, ownerId: book.ownerId, created: !existing }
    })
}

export async function failOrderClaim(db, claim, { nowMs = Date.now() } = {}) {
    if (!claim?.orderId) return
    const target = refs(db, claim.orderId, claim.weddingId)
    return db.runTransaction(async tx => {
        const lock = snapshotData(await tx.get(target.order))
        if (!ownsLease(lock, claim, nowMs)) return false
        tx.set(target.order, { ...lock, status: 'failed', leaseUntilMs: null, updatedAtMs: nowMs, reason: 'fulfillment_failed' })
        return true
    })
}

// SMTP has no idempotency API. Once dispatch might have begun we MUST NOT
// automatically lease/retry it. Crash/timeout states require reconciliation;
// a stable Message-ID is useful evidence but is not an exactly-once promise.
export async function claimOrderConfirmation(db, orderId, { nowMs = Date.now(), token = crypto.randomUUID() } = {}) {
    const orderRef = refs(db, orderId).order
    const outboxRef = refs(db, orderId).outbox
    return db.runTransaction(async tx => {
        const lock = snapshotData(await tx.get(orderRef))
        const outbox = snapshotData(await tx.get(outboxRef))
        const raw = snapshotData(await tx.get(db.collection('ordersRaw').doc(orderId)))
        if (!isAuthorizedOrderSnapshot(raw, lock)) return { status: 'payment_unverified' }
        if (!lock?.weddingId || !outbox || lock.status !== 'ready') return { status: 'not_ready' }
        const book = snapshotData(await tx.get(refs(db, orderId, lock.weddingId).book))
        if (!bookMatches(book, orderId, outbox.recipient, lock.ownerId)
            || outbox.ownerId !== lock.ownerId || outbox.weddingId !== lock.weddingId) return { status: 'not_ready' }
        if (outbox.state !== 'pending') return { status: outbox.state }
        tx.set(outboxRef, { ...outbox, state: 'dispatching', dispatchToken: token, dispatchStartedAtMs: nowMs })
        return { status: 'claimed', token, weddingId: lock.weddingId, recipient: outbox.recipient }
    })
}

export async function finishOrderConfirmation(db, orderId, token, state, { nowMs = Date.now() } = {}) {
    if (!['accepted', 'uncertain'].includes(state)) throw new Error('INVALID_CONFIRMATION_STATE')
    const target = refs(db, orderId).outbox
    return db.runTransaction(async tx => {
        const outbox = snapshotData(await tx.get(target))
        if (outbox?.state !== 'dispatching' || outbox.dispatchToken !== token) return false
        tx.set(target, { ...outbox, state, completedAtMs: nowMs })
        return true
    })
}

export function orderConfirmationMessageId(orderId) {
    return `<order-${crypto.createHash('sha256').update(orderId).digest('hex')}@app.weddingtales.co.il>`
}

export async function bindOrderOwner(db, claim, ownerId, { nowMs = Date.now() } = {}) {
    const target = refs(db, claim.orderId, claim.weddingId).order
    return db.runTransaction(async tx => {
        const lock = snapshotData(await tx.get(target))
        if (!ownsLease(lock, claim, nowMs) || typeof ownerId !== 'string' || !ownerId
            || lock.ownerId && lock.ownerId !== ownerId) return false
        tx.set(target, { ...lock, ownerId, updatedAtMs: nowMs })
        return true
    })
}
