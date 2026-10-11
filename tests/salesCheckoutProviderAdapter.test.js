import { describe, expect, it, vi } from 'vitest'
import { prepareProviderCheckout, trustedProviderCheckoutUrl, validateProviderCheckoutQuote } from '@/lib/salesAgent/checkoutProviderAdapter'
import { ORDER_ATTRIBUTION_COLLECTION, resolveOrderAttribution } from '@/lib/salesAgent/orderAttribution'
import { extractReferralTouch, mergeAttribution } from '@/lib/salesAgent/referralEvidence'
import { createOfferSnapshot } from '@/lib/salesAgent/offerCatalog'
import { FIXTURE_NOW as NOW, syntheticOffer } from './fixtures/salesContractFixtures'

const clone = value => JSON.parse(JSON.stringify(value))
const URL = 'https://weddingtales.co.il/checkout/order-pay/81001/?pay_for_order=true&key=wc_order_synthetic012345'
function database() {
    const docs = new Map(), writes = []
    let queue = Promise.resolve(), failCommit = false
    const ref = key => ({ key, get: async () => ({ exists: docs.has(key), data: () => clone(docs.get(key)) }) })
    const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), runTransaction: work => {
        const result = queue.then(async () => {
            const staged = []
            const answer = await work({ get: target => {
                if (staged.length) throw Error('Read after write')
                return target.get()
            }, create: (target, value) => { staged.push({ key: target.key, value: clone(value) }) } })
            if (failCommit && staged.length) { failCommit = false; throw Error('Synthetic commit failure') }
            if (staged.some(row => docs.has(row.key))) throw Error('Create precondition failed')
            for (const row of staged) { docs.set(row.key, row.value); writes.push(row) }
            return answer
        })
        queue = result.catch(() => {})
        return result
    } }
    return { db, docs, writes, failNextCommit: () => { failCommit = true } }
}
function setup({ patchVerified = {}, patchCreated = {}, providerPatch = {} } = {}) {
    const state = database()
    let request
    const provider = { id: 'synthetic-bridge', contractVersion: 2,
        createCheckout: vi.fn(async input => { request = clone(input); return { checkoutId: 'synthetic-session', providerOrderId: '81001', ...patchCreated } }),
        verifyCheckout: vi.fn(async () => ({ ...request, contractVersion: 2, verified: true,
            verificationSource: 'provider_api', checkoutId: 'synthetic-session', providerOrderId: '81001',
            verificationRef: 'synthetic-readback', verifiedAt: new Date(NOW).toISOString(), expiresAtMs: NOW + 60000, url: URL,
            enforcement: { checkoutId: 'synthetic-session', providerOrderId: '81001', totalLocked: true, quantityLocked: true, taxShippingLocked: true, expiresAtMs: NOW + 60000 },
            ...patchVerified })), ...providerPatch }
    const touch = extractReferralTouch({ referral: { source_type: 'ad', source_id: 'synthetic-ad', campaignId: 'synthetic-campaign', ctwa_clid: 'click-never-in-report' } }, {
        eventId: 'synthetic-inbound', occurredAtMs: NOW - 1000, receivedAtMs: NOW - 1000, transport: { provider: 'make', authenticated: true, structuredPayloadVerified: true },
    })
    const args = { leadId: 'synthetic-contact', eventId: 'synthetic-inbound', offer: syntheticOffer(),
        attribution: mergeAttribution(null, touch), db: state.db, provider, enabled: true, nowMs: NOW }
    return { ...state, provider, args }
}
const paid = patch => ({ id: 81001, status: 'processing', total: '990.00', total_tax: '0.00', shipping_total: '0.00', currency: 'ILS',
    date_paid_gmt: new Date(NOW + 1000).toISOString(), transaction_id: 'synthetic-transaction', payment_method: 'synthetic_gateway',
    line_items: [{ product_id: 6271, variation_id: 0, quantity: 1, total: '990.00' }], ...patch })

describe('disabled-by-default provider checkout seam', () => {
    it('does not read storage or call a provider without explicit activation', async () => {
        const { args, provider, writes } = setup()
        expect(await prepareProviderCheckout({ ...args, enabled: undefined })).toMatchObject({ status: 'blocked', reason: 'checkout_provider_disabled' })
        expect(await prepareProviderCheckout({ ...args, enabled: 'true' })).toMatchObject({ status: 'blocked', reason: 'checkout_provider_disabled' })
        expect(provider.createCheckout).not.toHaveBeenCalled()
        expect(writes).toHaveLength(0)
    })
    it.each([null, {}, { contractVersion: 1 }, { contractVersion: 2, id: 'synthetic', createCheckout: () => {} }])('has no invented live provider: %j', async provider => {
        const { args, writes } = setup()
        expect(await prepareProviderCheckout({ ...args, provider })).toMatchObject({ reason: 'checkout_provider_unconfigured' })
        expect(writes).toHaveLength(0)
    })
    it('requires atomic storage before calling the provider', async () => {
        const { args, provider } = setup()
        expect(await prepareProviderCheckout({ ...args, db: null })).toMatchObject({ reason: 'checkout_source_unavailable' })
        expect(provider.createCheckout).not.toHaveBeenCalled()
    })
    it('validates identity and the approved commercial record before creating a checkout', async () => {
        const { args, provider } = setup()
        expect((await prepareProviderCheckout({ ...args, eventId: '' })).reason).toBe('checkout_identity_invalid')
        args.offer.approval.status = 'pending'
        expect((await prepareProviderCheckout(args)).reason).toBe('offer_invalid')
        expect(provider.createCheckout).not.toHaveBeenCalled()
    })
    it('requires reconfirmation before reserving a changed offer', async () => {
        const { args, provider } = setup()
        const previousSnapshot = createOfferSnapshot(args.offer, { nowMs: NOW })
        args.offer.price.subtotalMinor = args.offer.price.totalMinor = 100000
        expect(await prepareProviderCheckout({ ...args, previousSnapshot })).toMatchObject({ status: 'reconfirm_required', reason: 'price_changed' })
        expect(provider.createCheckout).not.toHaveBeenCalled()
    })
})

describe('independently verified session and order economics', () => {
    it('atomically binds one approved checkout to one order; signed purchase resolves without a phone', async () => {
        const { args, db, docs, provider, writes } = setup()
        const result = await prepareProviderCheckout(args)
        expect(result).toMatchObject({ status: 'ready', checkoutUrl: URL, bindingId: '81001', duplicate: false })
        expect(provider.verifyCheckout).toHaveBeenCalledWith({ checkoutId: 'synthetic-session', providerOrderId: '81001' })
        expect(writes).toHaveLength(2)
        const binding = docs.get(`${ORDER_ATTRIBUTION_COLLECTION}/81001`)
        expect(binding).toMatchObject({ providerOrderId: '81001', quantity: 1, totalMinor: 99000, offerId: 'test-printed' })
        expect(binding.attribution.firstTouch).toMatchObject({ source: 'meta_ad', confidence: 'authenticated_transport', campaignId: 'synthetic-campaign', fieldEvidence: { campaignId: 'transport_mapping' } })
        expect(JSON.stringify(binding)).not.toContain('click-never-in-report')
        expect(JSON.stringify(binding)).not.toContain('wc_order_')
        expect(JSON.stringify(binding)).not.toContain('synthetic-contact')
        const resolved = await resolveOrderAttribution({ order: paid(), db, trustedSource: true, nowMs: NOW + 2000 })
        expect(resolved).toMatchObject({ status: 'bound', confidence: 'verified_checkout_binding', firstTouch: { confidence: 'authenticated_transport' } })
        expect(JSON.stringify(resolved)).not.toContain('wc_order_')
        expect(provider.createCheckout.mock.calls[0][0]).not.toHaveProperty('leadId')
        expect(provider.createCheckout.mock.calls[0][0]).not.toHaveProperty('attribution')
    })
    it.each([
        { verificationSource: 'request_echo' }, { idempotencyKey: 'another-inbound' }, { checkoutId: 'another-session' }, { providerOrderId: '81002' },
        { verified: false }, { verificationRef: '' }, { verifiedAt: new Date(NOW + 1).toISOString() }, { verifiedAt: new Date(NOW - 300001).toISOString() },
        { expiresAtMs: NOW }, { expiresAtMs: NOW + 1800001 }, { contractVersion: 1 }, { enforcement: {} },
        { enforcement: { checkoutId: 'another-session', providerOrderId: '81001', totalLocked: true, quantityLocked: true, taxShippingLocked: true, expiresAtMs: NOW + 60000 } },
        { totalMinor: 98999 }, { taxMinor: 100 }, { shippingMinor: 100 }, { currency: 'USD' }, { quantity: 2 },
        { productId: 'digital' }, { providerProductId: '6258' }, { offerVersion: 'test-v2' }, { offerTermsHash: 'invented' },
        { url: 'https://weddingtales.co.il/checkout/?add-to-cart=6271' },
        { url: `${URL}&leadId=synthetic-contact` },
    ])('blocks invalid independent verification without persisting anything: %j', async patchVerified => {
        const { args, docs } = setup({ patchVerified })
        expect((await prepareProviderCheckout(args)).status).toBe('blocked')
        expect(docs.size).toBe(0)
    })
    it('does not use createCheckout economics or a customer meta_data claim as proof', async () => {
        const { args, docs, provider } = setup({ patchCreated: { verified: true, totalMinor: 99000, meta_data: [{ key: 'verified', value: true }] } })
        provider.verifyCheckout.mockResolvedValue({ verified: true })
        expect((await prepareProviderCheckout(args)).status).toBe('blocked')
        expect(docs.size).toBe(0)
    })
    it('redacts provider failures and stores no partial binding', async () => {
        const { args, docs, provider } = setup()
        provider.verifyCheckout.mockRejectedValue(Error('secret-value-never-returned'))
        expect(await prepareProviderCheckout(args)).toEqual({ status: 'blocked', reason: 'checkout_provider_unavailable', checkoutUrl: null })
        expect(docs.size).toBe(0)
    })
    it('accepts only the exact reserved order-pay URL with bounded opaque key', () => {
        expect(trustedProviderCheckoutUrl(URL, '81001')).toBe(true)
        for (const url of [URL.replace('81001', '81002'), URL.replace('https:', 'http:'), URL.replace('weddingtales.co.il', 'other.invalid'), `${URL}#cart`, `${URL}&key=wc_order_duplicate000`, URL.replace('wc_order_synthetic012345', 'unknown'), URL.replace('/checkout/', '/shop/')]) {
            expect(trustedProviderCheckoutUrl(url, '81001')).toBe(false)
        }
    })
})

describe('immutable and retry-safe protected persistence', () => {
    it('reuses the exact original source snapshot on retry without calling the provider twice', async () => {
        const { args, provider, writes, docs } = setup()
        const first = await prepareProviderCheckout(args)
        const original = clone(docs.get(`${ORDER_ATTRIBUTION_COLLECTION}/81001`))
        args.attribution.firstTouch.adId = 'later-ad'
        const second = await prepareProviderCheckout(args)
        expect(second).toMatchObject({ status: 'ready', duplicate: true, quote: first.quote })
        expect(provider.createCheckout).toHaveBeenCalledTimes(1)
        expect(writes).toHaveLength(2)
        expect(docs.get(`${ORDER_ATTRIBUTION_COLLECTION}/81001`)).toEqual(original)
    })
    it('commits one pair under concurrent duplicate requests', async () => {
        const { args, writes } = setup()
        const results = await Promise.all([prepareProviderCheckout(args), prepareProviderCheckout(args)])
        expect(results.every(value => value.status === 'ready')).toBe(true)
        expect(writes).toHaveLength(2)
    })
    it('never rebinds a reserved Woo order to a second lead or inbound event', async () => {
        const { args, docs, writes } = setup()
        await prepareProviderCheckout(args)
        const original = clone(docs.get(`${ORDER_ATTRIBUTION_COLLECTION}/81001`))
        expect((await prepareProviderCheckout({ ...args, leadId: 'another-contact', eventId: 'another-inbound' })).reason).toBe('checkout_binding_conflict')
        expect(writes).toHaveLength(2)
        expect(docs.get(`${ORDER_ATTRIBUTION_COLLECTION}/81001`)).toEqual(original)
    })
    it('does not expose an unpaid checkout when atomic persistence fails; retry is possible', async () => {
        const { args, docs, failNextCommit } = setup()
        failNextCommit()
        expect(await prepareProviderCheckout(args)).toMatchObject({ status: 'blocked', reason: 'checkout_source_unavailable', checkoutUrl: null })
        expect(docs.size).toBe(0)
        expect((await prepareProviderCheckout(args)).status).toBe('ready')
    })
    it('does not repair a missing binding by trusting a quote alone', async () => {
        const { args, docs, provider } = setup()
        await prepareProviderCheckout(args)
        docs.delete(`${ORDER_ATTRIBUTION_COLLECTION}/81001`)
        expect((await prepareProviderCheckout(args)).reason).toBe('checkout_binding_conflict')
        expect(provider.createCheckout).toHaveBeenCalledTimes(1)
    })
    it('blocks reused expired quotes and same-version terms mutations', async () => {
        const { args, provider } = setup()
        const result = await prepareProviderCheckout(args)
        expect((await prepareProviderCheckout({ ...args, nowMs: NOW + 60000 })).reason).toBe('checkout_not_verified')
        args.offer.policies.refunds.summary = 'A different condition under an unchanged version'
        expect(validateProviderCheckoutQuote({ quote: result.quote, offer: args.offer, nowMs: NOW })).toMatchObject({ ok: false, reason: 'checkout_offer_mismatch' })
        expect((await prepareProviderCheckout(args)).reason).toBe('checkout_offer_mismatch')
        expect(provider.createCheckout).toHaveBeenCalledTimes(1)
    })
})
