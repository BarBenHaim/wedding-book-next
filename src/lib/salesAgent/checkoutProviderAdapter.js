import crypto from 'node:crypto'
import { validateOffer, createOfferSnapshot, compareOfferSnapshots, TRUSTED_CHECKOUT_PRODUCTS } from './offerCatalog'
import { checkoutQuoteId } from './checkoutIdentity'
import { createOrderAttributionBinding, orderAttributionBindingId, orderBindingMatchesQuote, ORDER_ATTRIBUTION_COLLECTION } from './orderAttribution'

export const CHECKOUT_PROVIDER_CONTRACT_VERSION = 2
export const CHECKOUT_QUOTES_COLLECTION = 'sales_checkout_quotes'
const MAX_QUOTE_AGE_MS = 5 * 60_000
const MAX_SESSION_MS = 30 * 60_000
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value)
const blocked = reason => ({ status: 'blocked', reason, checkoutUrl: null })
const canonical = value => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value

function offerTermsHash(offer, nowMs) {
    const snapshot = createOfferSnapshot(offer, { nowMs })
    if (!snapshot) return null
    const { capturedAt: _capturedAt, ...terms } = snapshot
    return digest(JSON.stringify(canonical(terms)))
}

// This URL is allowed only together with a v2 independently verified, locked
// provider quote. The standard Woo order-pay URL alone proves no enforcement.
export function trustedProviderCheckoutUrl(value, providerOrderId) {
    const id = orderAttributionBindingId(providerOrderId)
    if (!id || typeof value !== 'string' || value.length > 500) return false
    try {
        const url = new URL(value)
        return url.origin === 'https://weddingtales.co.il' && !url.username && !url.password && !url.hash
            && url.pathname === `/checkout/order-pay/${id}/` && [...url.searchParams].length === 2
            && url.searchParams.get('pay_for_order') === 'true' && /^wc_order_[A-Za-z0-9]{10,100}$/.test(url.searchParams.get('key') || '')
    } catch { return false }
}

export function validateProviderCheckoutQuote({ quote, offer, nowMs = Date.now() } = {}) {
    const validation = validateOffer(offer, { nowMs })
    if (!validation.ok) return { ok: false, reason: 'offer_invalid' }
    const verifiedAt = typeof quote?.verifiedAt === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(quote.verifiedAt) ? Date.parse(quote.verifiedAt) : NaN
    if (quote?.contractVersion !== CHECKOUT_PROVIDER_CONTRACT_VERSION || quote.verified !== true
        || !identifier(quote.checkoutId) || !identifier(quote.verificationRef) || !orderAttributionBindingId(quote.providerOrderId)
        || !Number.isFinite(verifiedAt) || verifiedAt > nowMs || nowMs - verifiedAt > MAX_QUOTE_AGE_MS
        || !Number.isFinite(quote.expiresAtMs) || quote.expiresAtMs <= nowMs
        || quote.expiresAtMs > verifiedAt + MAX_SESSION_MS || quote.expiresAtMs > Date.parse(offer.validUntil)) {
        return { ok: false, reason: 'checkout_not_verified' }
    }
    if (quote.enforcement?.checkoutId !== quote.checkoutId || quote.enforcement?.providerOrderId !== quote.providerOrderId
        || quote.enforcement?.expiresAtMs !== quote.expiresAtMs || quote.enforcement?.totalLocked !== true
        || quote.enforcement?.quantityLocked !== true || quote.enforcement?.taxShippingLocked !== true) {
        return { ok: false, reason: 'checkout_enforcement_unverified' }
    }
    if (!trustedProviderCheckoutUrl(quote.url, quote.providerOrderId)
        || quote.offerId !== offer.offerId || quote.offerVersion !== offer.version || quote.productId !== offer.productId
        || quote.providerProductId !== TRUSTED_CHECKOUT_PRODUCTS[offer.productId] || quote.quantity !== 1
        || quote.offerTermsHash !== offerTermsHash(offer, nowMs) || quote.currency !== offer.price.currency
        || quote.totalMinor !== offer.price.totalMinor || quote.taxMinor !== offer.price.tax.amountMinor
        || quote.shippingMinor !== offer.price.shipping.amountMinor) return { ok: false, reason: 'checkout_offer_mismatch' }
    return { ok: true, reason: null }
}

function safeQuote(value) {
    const fields = ['contractVersion', 'verified', 'checkoutId', 'providerOrderId', 'verificationRef', 'verifiedAt', 'expiresAtMs',
        'url', 'offerId', 'offerVersion', 'offerTermsHash', 'productId', 'providerProductId', 'quantity', 'currency', 'totalMinor', 'taxMinor', 'shippingMinor']
    return { ...Object.fromEntries(fields.map(key => [key, value[key]])), enforcement: {
        checkoutId: value.enforcement.checkoutId, providerOrderId: value.enforcement.providerOrderId,
        expiresAtMs: value.enforcement.expiresAtMs, totalLocked: true, quantityLocked: true, taxShippingLocked: true,
    } }
}

const ready = (record, snapshot, comparison, duplicate) => ({ status: 'ready', reason: null,
    checkoutUrl: record.quote.url, checkoutId: record.quote.checkoutId, bindingId: record.bindingId,
    quote: record.quote, snapshot, comparison, duplicate })

// The application deliberately ships NO network provider and NO enabled
// default. A future trusted server bridge must reserve a Woo order idempotently
// and independently read it back via verifyCheckout. That read must attest the
// SAME checkout session/order and enforce expiry, quantity, tax/shipping, and
// exact payable total until payment. An echoed request or static cart URL is
// insufficient. Never supply provider/db/enablement from a request body/model.
export async function prepareProviderCheckout({ leadId, eventId, offer, attribution, db, provider = null,
    enabled = false, nowMs = Date.now(), previousSnapshot = null, acceptedSnapshot = null } = {}) {
    if (enabled !== true) return blocked('checkout_provider_disabled')
    if (provider?.contractVersion !== CHECKOUT_PROVIDER_CONTRACT_VERSION || !identifier(provider.id)
        || typeof provider.createCheckout !== 'function' || typeof provider.verifyCheckout !== 'function') return blocked('checkout_provider_unconfigured')
    if (!db || typeof db.runTransaction !== 'function' || typeof db.collection !== 'function') return blocked('checkout_source_unavailable')
    const id = checkoutQuoteId({ leadId, eventId, offerId: offer?.offerId, offerVersion: offer?.version })
    if (!id || !Number.isFinite(nowMs) || nowMs <= 0) return blocked('checkout_identity_invalid')
    const validation = validateOffer(offer, { nowMs })
    if (!validation.ok) return { ...blocked('offer_invalid'), errors: validation.errors }
    if (!identifier(offer.offerId) || !identifier(offer.version)) return blocked('checkout_identity_invalid')
    const snapshot = createOfferSnapshot(offer, { nowMs })
    const comparison = compareOfferSnapshots(previousSnapshot, snapshot)
    if (comparison.requiresReconfirmation && (!acceptedSnapshot || compareOfferSnapshots(acceptedSnapshot, snapshot).changed)) {
        return { status: 'reconfirm_required', reason: comparison.priceChanged ? 'price_changed' : 'offer_changed', comparison, snapshot, checkoutUrl: null }
    }
    const identity = { contactHash: digest(leadId), eventIdHash: digest(eventId), idempotencyKey: id }
    const quoteRef = db.collection(CHECKOUT_QUOTES_COLLECTION).doc(id)
    const reuse = async (tx, record) => {
        if (record?.source !== 'checkout_provider' || record.contractVersion !== 2 || record.leadHash !== identity.contactHash
            || record.eventIdHash !== identity.eventIdHash || record.idempotencyKey !== id || !identifier(record.providerReference)
            || record.bindingId !== record.quote?.providerOrderId || record.expiresAtMs !== record.quote?.expiresAtMs) return blocked('checkout_record_conflict')
        const check = validateProviderCheckoutQuote({ quote: record.quote, offer, nowMs })
        if (!check.ok) return blocked(check.reason)
        const bound = await tx.get(db.collection(ORDER_ATTRIBUTION_COLLECTION).doc(record.bindingId))
        if (!bound.exists || !orderBindingMatchesQuote(bound.data(), record.quote, identity)) return blocked('checkout_binding_conflict')
        return ready(record, snapshot, comparison, true)
    }
    try {
        const previous = await db.runTransaction(async tx => {
            const saved = await tx.get(quoteRef)
            return saved.exists ? reuse(tx, saved.data()) : null
        })
        if (previous) return previous
    } catch { return blocked('checkout_source_unavailable') }
    const request = {
        contractVersion: CHECKOUT_PROVIDER_CONTRACT_VERSION, ...identity,
        offerId: offer.offerId, offerVersion: offer.version, offerTermsHash: offerTermsHash(offer, nowMs),
        productId: offer.productId, providerProductId: TRUSTED_CHECKOUT_PRODUCTS[offer.productId], quantity: 1,
        currency: offer.price.currency, totalMinor: offer.price.totalMinor, taxMinor: offer.price.tax.amountMinor,
        shippingMinor: offer.price.shipping.amountMinor, expiresAtMs: Math.min(nowMs + MAX_SESSION_MS, Date.parse(offer.validUntil)),
    }
    let quote
    try {
        const created = await provider.createCheckout(Object.freeze({ ...request }))
        if (!identifier(created?.checkoutId) || !orderAttributionBindingId(created?.providerOrderId)) return blocked('checkout_provider_identity_invalid')
        const verified = await provider.verifyCheckout({ checkoutId: created.checkoutId, providerOrderId: String(created.providerOrderId) })
        if (verified?.verificationSource !== 'provider_api' || verified?.idempotencyKey !== id
            || verified?.checkoutId !== created.checkoutId || verified?.providerOrderId !== String(created.providerOrderId)) return blocked('checkout_provider_identity_mismatch')
        const check = validateProviderCheckoutQuote({ quote: verified, offer, nowMs })
        if (!check.ok) return blocked(check.reason)
        quote = safeQuote(verified)
    } catch { return blocked('checkout_provider_unavailable') }
    const binding = createOrderAttributionBinding({ quote, leadId, eventId, idempotencyKey: id, attribution, providerId: provider.id, nowMs })
    if (!orderBindingMatchesQuote(binding, quote, identity)) return blocked('checkout_binding_invalid')
    const record = { contractVersion: 2, source: 'checkout_provider', providerReference: quote.verificationRef,
        leadHash: identity.contactHash, eventIdHash: identity.eventIdHash, idempotencyKey: id,
        expiresAtMs: quote.expiresAtMs, bindingId: binding.bindingId, quote }
    try {
        return await db.runTransaction(async tx => {
            const [saved, bound] = await Promise.all([tx.get(quoteRef), tx.get(db.collection(ORDER_ATTRIBUTION_COLLECTION).doc(binding.bindingId))])
            if (saved.exists) return reuse(tx, saved.data())
            // Even an otherwise identical order cannot be rebound by another
            // request. Both documents commit atomically using create preconditions.
            if (bound.exists) return blocked('checkout_binding_conflict')
            tx.create(db.collection(ORDER_ATTRIBUTION_COLLECTION).doc(binding.bindingId), binding)
            tx.create(quoteRef, record)
            return ready(record, snapshot, comparison, false)
        })
    } catch { return blocked('checkout_source_unavailable') }
}
