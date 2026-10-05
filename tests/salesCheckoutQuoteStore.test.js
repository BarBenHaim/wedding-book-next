import crypto from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { readVerifiedCheckout, checkoutQuoteId } from '@/lib/salesAgent/checkoutQuoteStore'
import { createOfferSnapshot } from '@/lib/salesAgent/offerCatalog'
import { FIXTURE_NOW as NOW, syntheticOffer } from './fixtures/salesContractFixtures'
const leadId = 'synthetic-contact', eventId = 'synthetic-inbound'
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
function setup(patch = {}) {
    const offer = syntheticOffer()
    const id = checkoutQuoteId({ leadId, eventId, offerId: offer.offerId, offerVersion: offer.version })
    const row = { source: 'checkout_provider', providerReference: 'synthetic-provider-verification', leadHash: digest(leadId), idempotencyKey: id, expiresAtMs: NOW + 60000,
        quote: { verified: true, checkoutId: 'synthetic-checkout', verificationRef: 'synthetic-ref', verifiedAt: new Date(NOW).toISOString(), url: offer.checkoutUrl, offerId: offer.offerId, offerVersion: offer.version, productId: offer.productId, currency: 'ILS', totalMinor: 99000, taxMinor: 0, shippingMinor: 0 }, ...patch }
    const get = vi.fn(async () => ({ exists: true, data: () => row }))
    const db = { collection: vi.fn(() => ({ doc: vi.fn(key => { expect(key).toBe(id); return { get } }) })) }
    return { offer, row, get, db }
}
describe('server-owned quote-store boundary', () => {
    it('returns only the independently verified, lead/event/offer-bound quote', async () => {
        const { offer, db } = setup()
        const result = await readVerifiedCheckout({ leadId, eventId, offer, db, nowMs: NOW })
        expect(result).toMatchObject({ status: 'ready', checkoutId: 'synthetic-checkout', checkoutUrl: offer.checkoutUrl })
        expect(db.collection).toHaveBeenCalledWith('sales_checkout_quotes')
    })
    it.each([{ leadHash: 'different-customer' }, { source: 'customer_message' }, { idempotencyKey: 'different' }, { expiresAtMs: NOW }, { providerReference: '' }])('rejects mismatched/expired authority %j', async patch => {
        const { offer, db } = setup(patch)
        expect((await readVerifiedCheckout({ leadId, eventId, offer, db, nowMs: NOW })).status).toBe('blocked')
    })
    it('rejects price/currency/shipping mismatch even in a trusted collection', async () => {
        const { offer, row, db } = setup()
        row.quote.shippingMinor = 2500
        expect((await readVerifiedCheckout({ leadId, eventId, offer, db, nowMs: NOW })).reason).toBe('checkout_offer_mismatch')
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
})
