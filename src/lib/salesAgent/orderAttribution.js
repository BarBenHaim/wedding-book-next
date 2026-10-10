import crypto from 'node:crypto'
import { TRUSTED_CHECKOUT_PRODUCTS } from './offerCatalog'
import { moneyMinor, validateWooPayment } from './paymentTruth'
import { sanitizeAttributionSnapshot } from './referralEvidence'

export const ORDER_ATTRIBUTION_COLLECTION = 'sales_order_attribution_bindings'
export const ORDER_ATTRIBUTION_SCHEMA_VERSION = 1
export const CHECKOUT_BINDING_FIELDS = Object.freeze([
    'checkoutId', 'providerOrderId', 'offerId', 'offerVersion', 'offerTermsHash',
    'productId', 'providerProductId', 'quantity', 'currency', 'totalMinor', 'taxMinor', 'shippingMinor',
])
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value)
const money = value => Number.isSafeInteger(value) && value >= 0

// Woo order IDs are independently returned numeric identities, never customer
// metadata, checkout query flags, a phone number, or a free-form purchase claim.
export function orderAttributionBindingId(value) {
    const id = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value
    return typeof id === 'string' && /^[1-9][0-9]{0,14}$/.test(id) && Number.isSafeInteger(Number(id)) ? id : null
}

export function validOrderAttributionBinding(binding) {
    return !!binding && binding.schemaVersion === ORDER_ATTRIBUTION_SCHEMA_VERSION
        && binding.source === 'checkout_provider' && binding.provider === 'woocommerce'
        && identifier(binding.providerId) && !!orderAttributionBindingId(binding.providerOrderId)
        && orderAttributionBindingId(binding.providerOrderId) === binding.bindingId
        && identifier(binding.checkoutId) && identifier(binding.offerId) && identifier(binding.offerVersion)
        && hash(binding.contactHash) && hash(binding.eventIdHash) && hash(binding.idempotencyKey) && hash(binding.offerTermsHash)
        && TRUSTED_CHECKOUT_PRODUCTS[binding.productId] === binding.providerProductId && binding.quantity === 1
        && binding.currency === 'ILS' && money(binding.totalMinor) && binding.totalMinor > 0
        && money(binding.taxMinor) && money(binding.shippingMinor)
        && binding.taxMinor + binding.shippingMinor <= binding.totalMinor
        && Number.isFinite(binding.boundAtMs) && binding.boundAtMs > 0
        && Number.isFinite(binding.quoteVerifiedAtMs) && binding.quoteVerifiedAtMs <= binding.boundAtMs
        && binding.boundAtMs - binding.quoteVerifiedAtMs <= 5 * 60_000
        && Number.isFinite(binding.checkoutExpiresAtMs) && binding.checkoutExpiresAtMs > binding.boundAtMs
        && binding.enforcement?.checkoutId === binding.checkoutId
        && binding.enforcement?.providerOrderId === binding.providerOrderId
        && binding.enforcement?.expiresAtMs === binding.checkoutExpiresAtMs
        && binding.enforcement?.totalLocked === true && binding.enforcement?.quantityLocked === true
        && binding.enforcement?.taxShippingLocked === true
}

export function orderBindingMatchesQuote(binding, quote, { contactHash, eventIdHash, idempotencyKey } = {}) {
    return validOrderAttributionBinding(binding)
        && CHECKOUT_BINDING_FIELDS.every(key => binding[key] === quote?.[key])
        && binding.checkoutExpiresAtMs === quote?.expiresAtMs
        && (!contactHash || binding.contactHash === contactHash)
        && (!eventIdHash || binding.eventIdHash === eventIdHash)
        && (!idempotencyKey || binding.idempotencyKey === idempotencyKey)
}

export function createOrderAttributionBinding({ quote, leadId, eventId, idempotencyKey, attribution, providerId, nowMs }) {
    const sanitized = sanitizeAttributionSnapshot(attribution, { includeOperationalIds: false })
    return {
        schemaVersion: ORDER_ATTRIBUTION_SCHEMA_VERSION,
        source: 'checkout_provider', provider: 'woocommerce', providerId,
        bindingId: quote.providerOrderId, contactHash: digest(leadId), eventIdHash: digest(eventId), idempotencyKey,
        ...Object.fromEntries(CHECKOUT_BINDING_FIELDS.map(key => [key, quote[key]])),
        boundAtMs: nowMs, quoteVerifiedAtMs: Date.parse(quote.verifiedAt), checkoutExpiresAtMs: quote.expiresAtMs,
        enforcement: { ...quote.enforcement },
        attribution: { ...sanitized, firstTouch: sanitized?.firstTouch || null, latestTouch: sanitized?.latestTouch || null },
    }
}

const unattributed = reason => ({ status: 'unattributed', confidence: 'unattributed', reason, contactHash: null, firstTouch: null, latestTouch: null })

// Call only after authenticating the raw Woo webhook. trustedSource is a
// server-owned argument; order.trustedSource / order.meta_data never grant it.
// The immutable binding verifies the order-to-lead join. It does NOT upgrade
// the independently labeled confidence of an ad/referral source snapshot.
export async function resolveOrderAttribution({ order, db, transaction, trustedSource = false, nowMs = Date.now() } = {}) {
    if (trustedSource !== true) return unattributed('untrusted_order_source')
    const payment = validateWooPayment(order, { strict: true, trustedSource: true, nowMs })
    if (!payment.ok) return unattributed(payment.reason)
    const id = orderAttributionBindingId(order?.id)
    if (!id) return unattributed('invalid_order_id')
    let binding
    try {
        const database = db || (await import('@/lib/firebaseAdmin')).adminDb
        const reference = database.collection(ORDER_ATTRIBUTION_COLLECTION).doc(id)
        const snapshot = await (transaction ? transaction.get(reference) : reference.get())
        binding = snapshot.exists ? snapshot.data() : null
    } catch { return { ...unattributed('binding_source_unavailable'), retryable: true } }
    if (!binding) return unattributed('order_binding_missing')
    if (!validOrderAttributionBinding(binding) || binding.bindingId !== id || binding.providerOrderId !== id) return unattributed('order_binding_invalid')
    if (binding.totalMinor !== payment.amountMinor || binding.currency !== payment.currency
        || binding.providerProductId !== payment.productId || binding.quantity !== order.line_items[0].quantity
        || binding.taxMinor !== moneyMinor(order.total_tax) || binding.shippingMinor !== moneyMinor(order.shipping_total)) {
        return unattributed('order_binding_mismatch')
    }
    // Shop-local dates without a timezone cannot prove that this binding
    // preceded payment. A late-created binding never backfills attribution.
    if (!order.date_paid_gmt && !/(?:Z|[+-]\d{2}:\d{2})$/.test(order.date_paid || '')) return unattributed('paid_time_unverified')
    // Woo timestamps can omit milliseconds: permit only that precision loss.
    if (binding.boundAtMs > payment.paidAtMs + 999 || payment.paidAtMs >= binding.checkoutExpiresAtMs) return unattributed('payment_outside_bound_session')
    const attribution = sanitizeAttributionSnapshot(binding.attribution, { includeOperationalIds: false })
    return {
        status: 'bound', confidence: 'verified_checkout_binding', reason: null,
        contactHash: binding.contactHash, firstTouch: attribution?.firstTouch || null, latestTouch: attribution?.latestTouch || null,
        bindingId: binding.bindingId, checkoutId: binding.checkoutId, offerId: binding.offerId, offerVersion: binding.offerVersion,
        eventIdHash: binding.eventIdHash, boundAtMs: binding.boundAtMs,
    }
}
