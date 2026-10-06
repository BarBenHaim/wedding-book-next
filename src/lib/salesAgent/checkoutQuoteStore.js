import crypto from 'node:crypto'
import { prepareCheckout } from './checkoutContract'
import { checkoutQuoteId } from './checkoutIdentity'
import { prepareProviderCheckout } from './checkoutProviderAdapter'
import { ORDER_ATTRIBUTION_COLLECTION, orderBindingMatchesQuote } from './orderAttribution'
export { checkoutQuoteId } from './checkoutIdentity'

// Integration boundary for a server-side checkout provider. No model/customer
// payload may populate this collection. No static URL is treated as a quote.
// Production activation requires the provider to issue these short-lived rows;
// this app deliberately has no unauthenticated quote-write endpoint.
export async function readVerifiedCheckout({ leadId, eventId, offer, previousSnapshot, acceptedSnapshot, attribution, db,
    provider = null, providerEnabled = false, nowMs = Date.now() }) {
    const id = checkoutQuoteId({ leadId, eventId, offerId: offer?.offerId, offerVersion: offer?.version })
    if (!id) return { status: 'blocked', reason: 'checkout_identity_invalid' }
    const initial = prepareCheckout({ offer, previousSnapshot, acceptedSnapshot, nowMs })
    if (initial.status === 'reconfirm_required') return initial
    const database = db || (await import('@/lib/firebaseAdmin')).adminDb
    // Only trusted server composition may inject a provider. No request field
    // or model output enables this path; the shipped route has no real provider.
    if (providerEnabled === true) {
        const issued = await prepareProviderCheckout({ leadId, eventId, offer, previousSnapshot, acceptedSnapshot,
            attribution, db: database, provider, enabled: true, nowMs })
        if (issued.status !== 'ready') return issued
    }
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
    // Historical static-link quotes cannot establish the buyer's exact cart.
    if (record.contractVersion !== 2 || record.quote?.contractVersion !== 2
        || record.bindingId !== record.quote?.providerOrderId || record.expiresAtMs !== record.quote?.expiresAtMs) {
        return { status: 'blocked', reason: 'checkout_session_binding_required' }
    }
    try {
        const binding = await database.collection(ORDER_ATTRIBUTION_COLLECTION).doc(record.bindingId).get()
        if (!binding.exists || !orderBindingMatchesQuote(binding.data(), record.quote, {
            contactHash: leadHash, eventIdHash: crypto.createHash('sha256').update(eventId).digest('hex'), idempotencyKey: id,
        })) return { status: 'blocked', reason: 'checkout_binding_conflict' }
    } catch { return { status: 'blocked', reason: 'checkout_source_unavailable' } }
    return prepareCheckout({ offer, previousSnapshot, acceptedSnapshot, checkoutResult: record.quote, nowMs })
}
