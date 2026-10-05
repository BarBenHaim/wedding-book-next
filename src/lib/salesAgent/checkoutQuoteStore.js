import crypto from 'node:crypto'
import { prepareCheckout } from './checkoutContract'

export function checkoutQuoteId({ leadId, offerId, offerVersion, eventId }) {
    if (![leadId, offerId, offerVersion, eventId].every(v => typeof v === 'string' && v.length > 0 && v.length < 500)) return null
    return crypto.createHash('sha256').update(JSON.stringify([leadId, offerId, offerVersion, eventId])).digest('hex')
}

// Integration boundary for a server-side checkout provider. No model/customer
// payload may populate this collection. No static URL is treated as a quote.
// Production activation requires the provider to issue these short-lived rows;
// this app deliberately has no unauthenticated quote-write endpoint.
export async function readVerifiedCheckout({ leadId, eventId, offer, previousSnapshot, acceptedSnapshot, db, nowMs = Date.now() }) {
    const id = checkoutQuoteId({ leadId, eventId, offerId: offer?.offerId, offerVersion: offer?.version })
    if (!id) return { status: 'blocked', reason: 'checkout_identity_invalid' }
    const initial = prepareCheckout({ offer, previousSnapshot, acceptedSnapshot, nowMs })
    if (initial.status === 'reconfirm_required') return initial
    const database = db || (await import('@/lib/firebaseAdmin')).adminDb
    let record
    try {
        const snapshot = await database.collection('sales_checkout_quotes').doc(id).get()
        record = snapshot.exists ? snapshot.data() : null
    } catch { return { status: 'blocked', reason: 'checkout_source_unavailable' } }
    const leadHash = crypto.createHash('sha256').update(leadId).digest('hex')
    if (record?.leadHash !== leadHash || record?.idempotencyKey !== id
        || record?.source !== 'checkout_provider' || !record?.providerReference
        || !Number.isFinite(record?.expiresAtMs) || record.expiresAtMs <= nowMs) {
        return { status: 'blocked', reason: 'checkout_not_verified' }
    }
    return prepareCheckout({ offer, previousSnapshot, acceptedSnapshot, checkoutResult: record.quote, nowMs })
}
