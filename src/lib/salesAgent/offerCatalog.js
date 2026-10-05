// Commercial contract for the opt-in conversational sales runtime.
// Only server-owned, explicitly approved records may enter this boundary.
// Public-site observations and the historical catalog are NOT approvals.
export const OFFER_SCHEMA_VERSION = 1
export const TRUSTED_CHECKOUT_PRODUCTS = Object.freeze({ digital: '6258', printed: '6271' })
export const TRUSTED_POLICY_ORIGINS = Object.freeze(['https://weddingtales.co.il', 'https://app.weddingtales.co.il'])
export const OBSERVED_BASE_PRICES = Object.freeze({ digital: 690, printed: 990 })

const text = value => typeof value === 'string' && value.trim().length > 0
const money = value => Number.isSafeInteger(value) && value >= 0
const timestamp = value => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key)
const clone = value => JSON.parse(JSON.stringify(value))

export function trustedCheckoutUrl(value, productId) {
    try {
        const url = new URL(value)
        const product = TRUSTED_CHECKOUT_PRODUCTS[productId]
        return !!product && url.origin === 'https://weddingtales.co.il'
            && url.pathname === '/checkout/' && !url.username && !url.password && !url.hash
            && [...url.searchParams].length === 1 && url.searchParams.get('add-to-cart') === product
    } catch { return false }
}

export function trustedPolicyUrl(value) {
    try {
        const url = new URL(value)
        return TRUSTED_POLICY_ORIGINS.includes(url.origin) && !url.username && !url.password && !url.hash
    } catch { return false }
}

export function validApproval(approval, nowMs = Date.now()) {
    return approval?.status === 'approved' && text(approval.approvedBy)
        && text(approval.evidenceRef) && Number.isFinite(timestamp(approval.approvedAt))
        && timestamp(approval.approvedAt) <= nowMs
        && !approval.revokedAt
}

export function validateOffer(offer, { nowMs = Date.now(), customerContext = {} } = {}) {
    const errors = []
    if (!offer || typeof offer !== 'object') return { ok: false, errors: ['offer_missing'] }
    if (JSON.stringify(offer).length > 6000) return { ok: false, errors: ['offer_too_large'] }
    if (offer.schemaVersion !== OFFER_SCHEMA_VERSION) errors.push('schema_version')
    for (const key of ['offerId', 'version', 'productId', 'name']) if (!text(offer[key])) errors.push(key)
    if (!validApproval(offer.approval, nowMs) || offer.approval.offerVersion !== offer.version) errors.push('approval')
    const start = timestamp(offer.validFrom), end = timestamp(offer.validUntil)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || nowMs < start || nowMs >= end) errors.push('validity')
    const price = offer.price || {}
    if (price.currency !== 'ILS') errors.push('currency')
    if (!money(price.totalMinor) || !money(price.subtotalMinor)) errors.push('total')
    if (!money(price.tax?.amountMinor) || !text(price.tax?.summary)) errors.push('tax')
    if (!money(price.shipping?.amountMinor) || !text(price.shipping?.summary)) errors.push('shipping')
    if (!Array.isArray(price.additionalCharges) || price.additionalCharges.some(c => !text(c?.name) || !money(c?.amountMinor))) errors.push('additional_charges')
    const sum = price.subtotalMinor + price.tax?.amountMinor + price.shipping?.amountMinor
        + (Array.isArray(price.additionalCharges) ? price.additionalCharges.reduce((n, c) => n + c.amountMinor, 0) : NaN)
    if (!Number.isSafeInteger(sum) || sum !== price.totalMinor) errors.push('price_breakdown')
    if (offer.productId === 'printed' && !text(price.shipping?.destinationCountry)) errors.push('shipping_destination')
    if (customerContext.country && price.shipping?.destinationCountry && customerContext.country !== price.shipping.destinationCountry) errors.push('destination_mismatch')
    if (price.shipping?.destinationRegion && customerContext.region !== price.shipping.destinationRegion) errors.push('destination_mismatch')
    const scope = offer.scope || {}
    if (!Array.isArray(scope.includes) || !scope.includes.length || scope.includes.some(x => !text(x))) errors.push('inclusions')
    if (!Array.isArray(scope.excludes) || scope.excludes.some(x => !text(x))) errors.push('exclusions')
    if (!text(scope.bookType) || !Number.isInteger(scope.copies) || scope.copies < 0) errors.push('book_scope')
    if (offer.productId === 'printed' && (!text(scope.dimensions) || scope.copies < 1)) errors.push('printed_scope')
    // null means explicitly not applicable. Omitted or undefined means unknown.
    for (const key of ['dimensions', 'pageLimit', 'blessingLimit', 'photoLimit', 'accessPeriod']) {
        if (!own(scope, key) || (scope[key] !== null && !text(scope[key]))) errors.push(`scope_${key}`)
    }
    for (const key of ['design', 'editing', 'approval', 'humanAssistance']) if (!text(offer.process?.[key])) errors.push(`process_${key}`)
    for (const key of ['production', 'delivery', 'startsFrom']) if (!text(offer.timing?.[key])) errors.push(`timing_${key}`)
    for (const key of ['service', 'dateChange', 'cancellation', 'refunds']) {
        const policy = offer.policies?.[key]
        if (!text(policy?.version) || !text(policy?.summary) || !trustedPolicyUrl(policy?.url)) errors.push(`policy_${key}`)
    }
    if (!trustedCheckoutUrl(offer.checkoutUrl, offer.productId)) errors.push('checkout_url')
    // These are separate commercial offers, never arithmetic on the base packages.
    for (const key of ['upgradeOfferId', 'additionalCopyOfferId']) {
        if (!own(offer, key) || (offer[key] !== null && !text(offer[key]))) errors.push(key)
    }
    if (offer.coupon != null) {
        if (!text(offer.coupon.code) || !text(offer.coupon.eligibility) || !validApproval(offer.coupon.approval, nowMs)
            || !(timestamp(offer.coupon.expiresAt) > nowMs)) errors.push('coupon')
    }
    if (offer.free != null) {
        if (!text(offer.free.scope) || !text(offer.free.limitations) || !text(offer.free.paidScope)
            || !trustedPolicyUrl(offer.free.startUrl) || !trustedPolicyUrl(offer.free.termsUrl)) errors.push('free_scope')
    }
    return { ok: errors.length === 0, errors: [...new Set(errors)] }
}

export function validateOfferCatalog(catalog, { nowMs = Date.now() } = {}) {
    if (!catalog || catalog.schemaVersion !== OFFER_SCHEMA_VERSION || !text(catalog.catalogId)
        || !text(catalog.version) || !validApproval(catalog.approval, nowMs) || catalog.approval.catalogVersion !== catalog.version || !Array.isArray(catalog.offers)) {
        return { ok: false, offers: [], reason: 'catalog_unapproved' }
    }
    const offers = [], rejected = []
    const identities = new Set()
    for (const offer of catalog.offers) {
        const validation = validateOffer(offer, { nowMs })
        const identity = `${offer?.offerId}:${offer?.version}`
        if (!validation.ok || identities.has(identity)) {
            rejected.push({ offerId: offer?.offerId || null, errors: validation.ok ? ['duplicate_offer'] : validation.errors })
        } else { identities.add(identity); offers.push(clone(offer)) }
    }
    // A partially corrupt approved catalog cannot silently select another offer.
    if (rejected.length) return { ok: false, offers: [], reason: 'catalog_invalid', rejected }
    return { ok: true, catalogId: catalog.catalogId, version: catalog.version, offers, reason: offers.length ? null : 'no_active_offers' }
}

export function getActiveOffer({ catalog, productId, campaignId = null, customerContext = {}, nowMs = Date.now() } = {}) {
    const validated = validateOfferCatalog(catalog, { nowMs })
    if (!validated.ok) return { ok: false, offer: null, reason: validated.reason }
    const matches = validated.offers.filter(o => o.productId === productId && (o.campaignId || null) === campaignId)
    if (matches.length !== 1) return { ok: false, offer: null, reason: matches.length ? 'ambiguous_offer' : 'offer_not_found' }
    if (matches[0].coupon && !customerContext.approvedCouponCodes?.includes(matches[0].coupon.code)) return { ok: false, offer: null, reason: 'coupon_eligibility_unverified' }
    const validation = validateOffer(matches[0], { nowMs, customerContext })
    return validation.ok ? { ok: true, offer: matches[0], reason: null } : { ok: false, offer: null, reason: validation.errors[0] }
}

export function createOfferSnapshot(offer, { nowMs = Date.now() } = {}) {
    const validation = validateOffer(offer, { nowMs })
    if (!validation.ok) return null
    return clone({
        schemaVersion: OFFER_SCHEMA_VERSION, offerId: offer.offerId, version: offer.version,
        productId: offer.productId, name: offer.name, price: offer.price, scope: offer.scope,
        process: offer.process, timing: offer.timing, policies: offer.policies,
        checkoutUrl: offer.checkoutUrl, validFrom: offer.validFrom, validUntil: offer.validUntil,
        upgradeOfferId: offer.upgradeOfferId, additionalCopyOfferId: offer.additionalCopyOfferId,
        campaignId: offer.campaignId || null, coupon: offer.coupon || null, free: offer.free || null,
        capturedAt: new Date(nowMs).toISOString(),
    })
}

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical)
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    return value
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))

export function compareOfferSnapshots(previous, current) {
    if (!current) return { changed: true, priceChanged: false, requiresReconfirmation: true, reasons: ['current_offer_missing'] }
    if (!previous) return { changed: false, priceChanged: false, requiresReconfirmation: false, reasons: ['first_offer'] }
    const fields = ['offerId', 'version', 'productId', 'name', 'price', 'scope', 'process', 'timing', 'policies', 'checkoutUrl', 'validFrom', 'validUntil', 'upgradeOfferId', 'additionalCopyOfferId', 'campaignId', 'coupon', 'free']
    const reasons = fields.filter(key => !same(previous[key], current[key]))
    return { changed: reasons.length > 0, priceChanged: !same(previous.price, current.price), requiresReconfirmation: reasons.length > 0, reasons }
}

export function formatOfferTotal(offer) {
    const price = offer?.price
    if (!money(price?.totalMinor) || !/^[A-Z]{3}$/.test(price?.currency || '')) return null
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: price.currency }).format(price.totalMinor / 100)
}

export function formatOfferQuote(offer, { nowMs = Date.now(), includeCheckout = false } = {}) {
    if (!validateOffer(offer, { nowMs }).ok) return null
    const lines = [`${offer.name}: ${formatOfferTotal(offer)}.`, `כולל: ${offer.scope.includes.join(', ')}.`, offer.price.tax.summary, offer.price.shipping.summary]
    if (offer.scope.excludes.length) lines.push(`לא כלול: ${offer.scope.excludes.join(', ')}.`)
    // The chat quote alone never verifies the current amount payable in checkout.
    if (includeCheckout) lines.push('קישור התשלום יוצג לאחר אימות הסכום בקופה.')
    return lines.filter(Boolean).join('\n')
}

export function offerFulfillmentFacts(offer, { nowMs = Date.now() } = {}) {
    if (!validateOffer(offer, { nowMs }).ok) return null
    return clone({ scope: offer.scope, process: offer.process, timing: offer.timing, policies: offer.policies,
        upgradeOfferId: offer.upgradeOfferId, additionalCopyOfferId: offer.additionalCopyOfferId })
}

export function freezeCommercialRecord(value) {
    if (!value || typeof value !== 'object') return value
    const copy = clone(value)
    const freeze = node => {
        Object.values(node).forEach(child => { if (child && typeof child === 'object') freeze(child) })
        return Object.freeze(node)
    }
    return freeze(copy)
}
