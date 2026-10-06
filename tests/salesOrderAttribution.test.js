import crypto from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createOrderAttributionBinding, orderAttributionBindingId, resolveOrderAttribution, ORDER_ATTRIBUTION_COLLECTION } from '@/lib/salesAgent/orderAttribution'
import { extractReferralTouch, mergeAttribution } from '@/lib/salesAgent/referralEvidence'
import { FIXTURE_NOW as NOW } from './fixtures/salesContractFixtures'

const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const paid = patch => ({ id: 81001, status: 'processing', total: '990.00', total_tax: '0.00', shipping_total: '0.00', currency: 'ILS',
    date_paid_gmt: new Date(NOW + 1000).toISOString(), transaction_id: 'synthetic-transaction', payment_method: 'synthetic_gateway',
    line_items: [{ product_id: 6271, variation_id: 0, quantity: 1, total: '990.00' }], ...patch })
function setup(patch = {}) {
    const attribution = mergeAttribution(null, extractReferralTouch({ referral: { source_type: 'ad', source_id: 'synthetic-ad', campaignId: 'connector-campaign', ctwa_clid: 'private-click', source_url: 'https://facebook.com/private-path' } }, {
        eventId: 'synthetic-event', occurredAtMs: NOW - 1000, receivedAtMs: NOW - 1000, transport: { provider: 'make', authenticated: true, structuredPayloadVerified: true },
    }))
    const quote = { checkoutId: 'synthetic-session', providerOrderId: '81001', offerId: 'synthetic-offer', offerVersion: 'test-v1', offerTermsHash: digest('synthetic-terms'),
        productId: 'printed', providerProductId: '6271', quantity: 1, currency: 'ILS', totalMinor: 99000, taxMinor: 0, shippingMinor: 0,
        verifiedAt: new Date(NOW).toISOString(), expiresAtMs: NOW + 60000,
        enforcement: { checkoutId: 'synthetic-session', providerOrderId: '81001', expiresAtMs: NOW + 60000, totalLocked: true, quantityLocked: true, taxShippingLocked: true } }
    const binding = { ...createOrderAttributionBinding({ quote, leadId: 'synthetic-contact', eventId: 'synthetic-event', idempotencyKey: digest('synthetic-idempotency'), attribution, providerId: 'synthetic-provider', nowMs: NOW }), ...patch }
    const get = vi.fn(async () => ({ exists: true, data: () => binding }))
    const reference = { get }
    const db = { collection: vi.fn(name => { expect(name).toBe(ORDER_ATTRIBUTION_COLLECTION); return { doc: vi.fn(id => { expect(id).toBe('81001'); return reference }) } }) }
    return { binding, get, db, reference, args: { order: paid(), db, trustedSource: true, nowMs: NOW + 2000 } }
}

describe('paid order attribution authority', () => {
    it('resolves a paid Woo identity using only protected immutable evidence', async () => {
        const { args } = setup()
        expect(await resolveOrderAttribution(args)).toMatchObject({ status: 'bound', confidence: 'verified_checkout_binding',
            contactHash: digest('synthetic-contact'), firstTouch: { source: 'meta_ad', confidence: 'authenticated_transport', fieldEvidence: { campaignId: 'transport_mapping' } } })
    })
    it('keeps source evidence unknown when the verified order has no observed referral', async () => {
        const { args } = setup({ attribution: null })
        expect(await resolveOrderAttribution(args)).toMatchObject({ status: 'bound', confidence: 'verified_checkout_binding', firstTouch: null, latestTouch: null })
    })
    it('ignores customer metadata, free text, checkout flags and billing phone as attribution authority', async () => {
        const { args, get } = setup()
        get.mockResolvedValue({ exists: false })
        args.order.billing = { phone: 'a-phone-matching-another-lead' }
        args.order.meta_data = [{ key: 'leadId', value: 'synthetic-contact' }, { key: 'verified', value: true }, { key: 'attribution', value: { source: 'facebook_ad' } }]
        args.order.customer_note = 'I paid after clicking your ad'
        args.order.checkout_url = '?add-to-cart=6271&campaignId=claimed'
        expect(await resolveOrderAttribution(args)).toMatchObject({ status: 'unattributed', reason: 'order_binding_missing', contactHash: null })
    })
    it('requires server authentication separately from all order fields', async () => {
        const { args, get } = setup()
        args.order.trustedSource = args.order.signatureVerified = true
        expect(await resolveOrderAttribution({ ...args, trustedSource: false })).toMatchObject({ reason: 'untrusted_order_source' })
        expect(await resolveOrderAttribution({ ...args, trustedSource: undefined })).toMatchObject({ reason: 'untrusted_order_source' })
        expect(get).not.toHaveBeenCalled()
    })
    it.each([
        { status: 'pending' }, { status: 'refunded' }, { total: '0.00' }, { currency: 'USD' }, { transaction_id: '' },
        { payment_method: 'bacs' }, { date_paid_gmt: null, date_paid: null },
        { line_items: [{ product_id: 6271, quantity: 2, total: '990.00' }] },
        { line_items: [{ product_id: 6271, variation_id: 1, quantity: 1, total: '990.00' }] },
        { line_items: [{ product_id: 111, quantity: 1, total: '990.00' }] },
    ])('does not attribute unverified payment or a refund as a new sale: %j', async patch => {
        const { args } = setup()
        expect((await resolveOrderAttribution({ ...args, order: paid(patch) })).status).toBe('unattributed')
    })
    it.each([
        { total: '1000.00' }, { total_tax: '10.00' }, { total_tax: undefined }, { shipping_total: '25.00' }, { shipping_total: undefined },
        { line_items: [{ product_id: 6258, quantity: 1, total: '990.00' }] },
    ])('refuses mismatched paid economics without guessing from the current lead: %j', async patch => {
        const { args } = setup()
        expect(await resolveOrderAttribution({ ...args, order: paid(patch) })).toMatchObject({ status: 'unattributed', reason: 'order_binding_mismatch' })
    })
    it.each([
        { schemaVersion: 2 }, { source: 'customer_message' }, { provider: 'customer' }, { providerOrderId: '81002' },
        { contactHash: 'unhashed' }, { eventIdHash: '' }, { idempotencyKey: '' }, { quantity: 2 }, { offerTermsHash: '' },
        { enforcement: {} }, { quoteVerifiedAtMs: NOW + 1 }, { checkoutExpiresAtMs: NOW },
    ])('rejects a malformed protected record: %j', async patch => {
        const { args } = setup(patch)
        expect(await resolveOrderAttribution(args)).toMatchObject({ status: 'unattributed', reason: 'order_binding_invalid' })
    })
    it('rejects a binding created after the payment or a payment after checkout expiry', async () => {
        const { args } = setup()
        expect(await resolveOrderAttribution({ ...args, order: paid({ date_paid_gmt: new Date(NOW - 1000).toISOString() }) })).toMatchObject({ reason: 'payment_outside_bound_session' })
        expect(await resolveOrderAttribution({ ...args, order: paid({ date_paid_gmt: new Date(NOW + 60000).toISOString() }), nowMs: NOW + 61000 })).toMatchObject({ reason: 'payment_outside_bound_session' })
    })
    it('does not compare a timezone-less shop-local paid date as UTC proof', async () => {
        const { args } = setup()
        expect(await resolveOrderAttribution({ ...args, order: paid({ date_paid_gmt: null, date_paid: new Date(NOW + 1000).toISOString().slice(0, 19) }) })).toMatchObject({ reason: 'paid_time_unverified' })
    })
    it('returns a useful missing-source result on a storage outage without leaking the error', async () => {
        const { args, get } = setup()
        get.mockRejectedValue(Error('private provider information'))
        expect(await resolveOrderAttribution(args)).toMatchObject({ status: 'unattributed', reason: 'binding_source_unavailable', retryable: true })
    })
    it('can share the ledger transaction and does not read outside it', async () => {
        const { args, get, reference, binding } = setup()
        const transaction = { get: vi.fn(async () => ({ exists: true, data: () => binding })) }
        expect((await resolveOrderAttribution({ ...args, transaction })).status).toBe('bound')
        expect(transaction.get).toHaveBeenCalledWith(reference)
        expect(get).not.toHaveBeenCalled()
    })
    it('never returns operational click/event identifiers, private fields, or checkout keys', async () => {
        const { args, binding } = setup()
        binding.attribution.firstTouch.billing = { phone: 'private-phone' }
        binding.attribution.firstTouch.ctwaClid = 'private-click'
        binding.attribution.firstTouch.eventId = 'private-inbound'
        binding.attribution.firstTouch.sourceUrlOrigin = 'https://facebook.com'
        binding.checkoutUrl = 'https://weddingtales.co.il/checkout/order-pay/81001/?key=wc_order_private'
        const result = await resolveOrderAttribution(args)
        expect(result.status).toBe('bound')
        for (const secret of ['private-phone', 'private-click', 'private-inbound', 'https://facebook.com', 'wc_order_']) expect(JSON.stringify(result)).not.toContain(secret)
    })
    it('rejects nonnumeric or unsafe provider identities', () => {
        expect(orderAttributionBindingId(81001)).toBe('81001')
        for (const id of ['../81001', '081001', 'synthetic-string-id', '81001/another', '9007199254740993', -1, 0, 1.5, null]) expect(orderAttributionBindingId(id)).toBeNull()
    })
})
