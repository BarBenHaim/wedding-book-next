import crypto from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { readVerifiedCheckout, checkoutQuoteId } from '@/lib/salesAgent/checkoutQuoteStore'
import { createOfferSnapshot } from '@/lib/salesAgent/offerCatalog'
import { createOrderAttributionBinding, ORDER_ATTRIBUTION_COLLECTION } from '@/lib/salesAgent/orderAttribution'
import { FIXTURE_NOW as NOW, syntheticOffer } from './fixtures/salesContractFixtures'
const leadId = 'synthetic-contact', eventId = 'synthetic-inbound'
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
function setup(patch = {}) {
    const offer = syntheticOffer()
    const id = checkoutQuoteId({ leadId, eventId, offerId: offer.offerId, offerVersion: offer.version })
    const { capturedAt: _capturedAt, ...terms } = createOfferSnapshot(offer, { nowMs: NOW })
    const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value
    const quote = { contractVersion: 2, verified: true, checkoutId: 'synthetic-checkout', providerOrderId: '91001', providerProductId: '6271', quantity: 1,
        verificationRef: 'synthetic-ref', verifiedAt: new Date(NOW).toISOString(), expiresAtMs: NOW + 60000,
        url: 'https://weddingtales.co.il/checkout/order-pay/91001/?pay_for_order=true&key=wc_order_syntheticfixture1',
        offerId: offer.offerId, offerVersion: offer.version, offerTermsHash: digest(JSON.stringify(canonical(terms))), productId: offer.productId, currency: 'ILS', totalMinor: 99000, taxMinor: 0, shippingMinor: 0,
        enforcement: { checkoutId: 'synthetic-checkout', providerOrderId: '91001', expiresAtMs: NOW + 60000, totalLocked: true, quantityLocked: true, taxShippingLocked: true } }
    const row = { contractVersion: 2, bindingId: '91001', source: 'checkout_provider', providerReference: 'synthetic-provider-verification', leadHash: digest(leadId), idempotencyKey: id, expiresAtMs: NOW + 60000, quote, ...patch }
    const binding = createOrderAttributionBinding({ quote, leadId, eventId, idempotencyKey: id, attribution: null, providerId: 'synthetic-provider', nowMs: NOW })
    const get = vi.fn(async () => ({ exists: true, data: () => row }))
    const bindingGet = vi.fn(async () => ({ exists: true, data: () => binding }))
    const db = { collection: vi.fn(name => ({ doc: vi.fn(key => { expect(key).toBe(name === ORDER_ATTRIBUTION_COLLECTION ? '91001' : id); return { get: name === ORDER_ATTRIBUTION_COLLECTION ? bindingGet : get } }) })) }
    return { offer, row, get, bindingGet, binding, db }
}
describe('server-owned quote-store boundary', () => {
    it('returns only the independently verified, lead/event/offer-bound quote', async () => {
        const { offer, row, db } = setup()
        const result = await readVerifiedCheckout({ leadId, eventId, offer, db, nowMs: NOW })
        expect(result).toMatchObject({ status: 'ready', checkoutId: 'synthetic-checkout', checkoutUrl: row.quote.url })
        expect(db.collection).toHaveBeenCalledWith('sales_checkout_quotes')
    })
    it.each([{ leadHash: 'different-customer' }, { source: 'customer_message' }, { idempotencyKey: 'different' }, { expiresAtMs: NOW }, { providerReference: '' }])('rejects mismatched/expired authority %j', async patch => {
        const { offer, db } = setup(patch)
        expect((await readVerifiedCheckout({ leadId, eventId, offer, db, nowMs: NOW })).status).toBe('blocked')
    })
    it('rejects price/currency/shipping mismatch even in a trusted collection', async () => {
        const { offer, row, db } = setup()
        row.quote.shippingMinor = 2500
        expect((await readVerifiedCheckout({ leadId, eventId, offer, db, nowMs: NOW })).reason).toBe('checkout_binding_conflict')
    })
    it('requests renewed consent before reading a changed quote', async () => {
        const { offer, get, db } = setup()
        const previous = createOfferSnapshot(offer, { nowMs: NOW })
        offer.price.totalMinor = offer.price.subtotalMinor = 100000
        const result = await readVerifiedCheckout({ leadId, eventId, offer, previousSnapshot: previous, db, nowMs: NOW })
        expect(result.status).toBe('reconfirm_required')
        expect(get).not.toHaveBeenCalled()
    })
    it('never substitutes the static URL when no provider quote exists', async () => {
        const { offer, get, db } = setup()
        get.mockResolvedValue({ exists: false })
        const result = await readVerifiedCheckout({ leadId, eventId, offer, db, nowMs: NOW })
        expect(result).toEqual({ status: 'blocked', reason: 'checkout_not_verified' })
    })
    it('rejects historical static add-to-cart quotes without session binding', async () => {
        const { offer, db } = setup({ contractVersion: 1 })
        expect((await readVerifiedCheckout({ leadId, eventId, offer, db, nowMs: NOW })).reason).toBe('checkout_session_binding_required')
    })
    it('rejects a valid-looking quote when the protected order binding is missing', async () => {
        const { offer, db, bindingGet } = setup()
        bindingGet.mockResolvedValue({ exists: false })
        expect((await readVerifiedCheckout({ leadId, eventId, offer, db, nowMs: NOW })).reason).toBe('checkout_binding_conflict')
    })
})
