import { validateOffer, createOfferSnapshot, compareOfferSnapshots, trustedCheckoutUrl } from './offerCatalog'

// Pure pre-send gate. checkoutResult MUST originate from a verified server-side
// checkout adapter, never from customer text, the model, or a query parameter.
// No such adapter is invented here. Missing verification blocks the link.
export function prepareCheckout({ offer, previousSnapshot = null, acceptedSnapshot = null, checkoutResult = null, nowMs = Date.now() } = {}) {
    const validation = validateOffer(offer, { nowMs })
    if (!validation.ok) return { status: 'blocked', reason: 'offer_invalid', errors: validation.errors, checkoutUrl: null }
    const snapshot = createOfferSnapshot(offer, { nowMs })
    const comparison = compareOfferSnapshots(previousSnapshot, snapshot)
    if (comparison.requiresReconfirmation && (!acceptedSnapshot || compareOfferSnapshots(acceptedSnapshot, snapshot).changed)) {
        return { status: 'reconfirm_required', reason: comparison.priceChanged ? 'price_changed' : 'offer_changed', comparison, snapshot, checkoutUrl: null }
    }
    if (!checkoutResult || checkoutResult.verified !== true || !checkoutResult.checkoutId
        || !checkoutResult.verificationRef || !Number.isFinite(Date.parse(checkoutResult.verifiedAt))
        || Date.parse(checkoutResult.verifiedAt) > nowMs || nowMs - Date.parse(checkoutResult.verifiedAt) > 5 * 60_000) {
        return { status: 'blocked', reason: 'checkout_not_verified', snapshot, checkoutUrl: null }
    }
    if (!trustedCheckoutUrl(checkoutResult.url, offer.productId) || checkoutResult.url !== offer.checkoutUrl
        || checkoutResult.offerId !== offer.offerId || checkoutResult.offerVersion !== offer.version
        || checkoutResult.productId !== offer.productId || checkoutResult.currency !== offer.price.currency
        || checkoutResult.totalMinor !== offer.price.totalMinor || checkoutResult.taxMinor !== offer.price.tax.amountMinor
        || checkoutResult.shippingMinor !== offer.price.shipping.amountMinor) {
        return { status: 'blocked', reason: 'checkout_offer_mismatch', snapshot, checkoutUrl: null }
    }
    return { status: 'ready', reason: null, checkoutUrl: checkoutResult.url, checkoutId: checkoutResult.checkoutId, snapshot, comparison }
}
