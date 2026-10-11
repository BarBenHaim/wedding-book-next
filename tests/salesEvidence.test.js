import crypto from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const resolveBinding = vi.hoisted(() => vi.fn())
vi.mock('@/lib/salesAgent/orderAttribution', () => ({ resolveOrderAttribution: resolveBinding }))
import { buildSalesCohortReport, decimalMinor, recordConversationEvidence, recordVerifiedOrderEvidence } from '@/lib/salesAgent/salesEvidence'
const FROM = Date.parse('2026-10-01T00:00:00Z'), DAY = 86400000
const conversation = (contactHash, overrides = {}) => ({ contactHash, inboundAtMs: FROM, source: { source: 'meta_ad', confidence: 'authenticated_transport' }, route: 'paid', ...overrides })
const order = (id, contactHash, overrides = {}) => ({ id, contactHash, provider: 'woocommerce_signed_webhook', paymentConfidence: 'verified_paid', status: 'paid', bindingConfidence: 'phone_association', verifiedAtMs: FROM + DAY, currency: 'ILS', grossMinor: 99000, refundedMinor: 0, ...overrides })
const report = args => buildSalesCohortReport({ fromMs: FROM, toMs: FROM + DAY * 2, asOfMs: FROM + DAY * 10, maturityHours: 168, ...args })
function database() {
    const rows = new Map()
    const db = { collection: name => ({ doc: id => ({ key: `${name}/${id}` }) }), runTransaction: async fn => fn({
        get: async ref => ({ exists: rows.has(ref.key), data: () => rows.get(ref.key) }),
        set: (ref, value) => rows.set(ref.key, { ...(rows.get(ref.key) || {}), ...value }),
    }) }
    return { db, rows }
}
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const PHONE = '972500000901'
const paidOrder = (overrides = {}) => ({ id: 'synthetic-order', status: 'processing', total: '990.00', currency: 'ILS',
    date_paid_gmt: '2026-10-01T12:00:00', transaction_id: 'synthetic-transaction', payment_method: 'stripe',
    billing: { phone: PHONE }, line_items: [{ product_id: 6271, quantity: 1, total: '990.00' }], refunds: [], ...overrides })
const touch = (adId, overrides = {}) => ({ source: 'meta_ad', adId, campaignId: 'synthetic-campaign', adsetId: 'synthetic-adset',
    confidence: 'authenticated_transport', evidence: 'meta_referral', fieldEvidence: { adId: 'meta_referral', campaignId: 'transport_mapping', adsetId: 'transport_mapping' }, ...overrides })
const bound = (overrides = {}) => ({ status: 'bound', confidence: 'verified_checkout_binding', contactHash: digest(PHONE),
    bindingId: 'synthetic-binding', checkoutId: 'synthetic-checkout', offerId: 'synthetic-offer', offerVersion: 1,
    firstTouch: touch('first-ad'), latestTouch: touch('latest-ad'), ...overrides })
const ledgerRows = rows => [...rows].filter(([key]) => key.startsWith('sales_order_evidence/')).map(([key, value]) => ({ id: key.split('/')[1], ...value }))
beforeEach(() => {
    resolveBinding.mockReset()
    resolveBinding.mockResolvedValue({ status: 'unattributed', confidence: 'unattributed', reason: 'missing_checkout_binding' })
})
describe('source-grounded sales ledger and cohort measurements', () => {
    it('keeps a decimal-money contract without floating point rounding', () => {
        expect(decimalMinor('990.25')).toBe(99025)
        for (const value of ['1.999', '-2', 'NaN', '1e3', null]) expect(decimalMinor(value)).toBeNull()
    })
    it('counts unique contacts and verified orders once; checkout is not payment', () => {
        const result = report({ conversations: [conversation('one', { checkoutPrepared: true }), conversation('one', { inboundAtMs: FROM + 100 }), conversation('two')], orders: [order('A', 'one'), order('A', 'one'), order('B', 'one')] })
        expect(result.cohorts[0]).toMatchObject({ uniqueLeads: 2, matureLeads: 2, verifiedBuyers: 1, verifiedOrders: 2, grossMinor: 198000, checkoutsPrepared: 1, conversion: 0.5 })
        expect(result.cohorts[0].fullAcquisitionMinor).toBeNull()
        expect(result.cohorts[0].contributionMinor).toBeNull()
        expect(result.unavailableMetrics).toContain('link_clicks')
    })
    it('uses equal maturation windows and excludes late purchases from comparison', () => {
        const result = report({ conversations: [conversation('one'), conversation('two', { inboundAtMs: FROM + DAY })], orders: [order('A', 'one', { verifiedAtMs: FROM + DAY * 8 })], asOfMs: FROM + DAY * 7.5 })
        expect(result.cohorts[0]).toMatchObject({ uniqueLeads: 2, matureLeads: 1, verifiedBuyers: 0 })
    })
    it('does not convert free activation or untrusted assertions to revenue', () => {
        const result = report({ conversations: [conversation('free', { route: 'free', state: 'FREE_ACTIVATION' })], orders: [order('fake', 'free', { provider: 'customer_claim' })] })
        expect(result.cohorts[0]).toMatchObject({ route: 'free', verifiedBuyers: 0, grossMinor: 0 })
    })
    it('requires all compatible known costs and refund evidence for monetary metrics', () => {
        const costs = [{ verified: true, source: 'meta_ad', campaignId: null, route: 'paid', fromMs: FROM, toMs: FROM + DAY * 2, currency: 'ILS', adCostMinor: 12000, botCostMinor: 500, messageCostMinor: 100, productCostMinor: 30000, shippingCostMinor: 2500, processingCostMinor: 1000 }]
        const result = report({ conversations: [conversation('one')], orders: [order('A', 'one', { refundedMinor: 9000 })], costs })
        expect(result.cohorts[0]).toMatchObject({ adAcquisitionMinor: 12000, fullAcquisitionMinor: 12600, contributionMinor: 56500, comparison: 'insufficient_sample' })
        expect(result.cohorts[0].conversion95.low).toBeLessThan(1)
        expect(report({ conversations: [conversation('one')], orders: [order('A', 'one', { refundedMinor: null })], costs }).cohorts[0].contributionMinor).toBeNull()
    })
    it('writes idempotent prepared evidence without text, names or phone', async () => {
        const { db, rows } = database()
        const args = { db, eventId: 'synthetic-event', leadId: 'synthetic-contact', nowMs: FROM, contract: { conversationalPolicyVersion: 'test-policy', conversationRevision: 1, conversationalState: 'CHECKOUT', sourceAttribution: { source: 'meta_ad' }, checkoutSnapshot: { checkoutId: 'synthetic' } }, outcome: { sendText: 'private message must never be copied' } }
        await recordConversationEvidence(args)
        await recordConversationEvidence({ ...args, delivery: { status: 'accepted', acceptedParts: 1 } })
        expect(rows.size).toBe(1)
        const value = [...rows.values()][0]
        expect(value).toMatchObject({ checkoutPrepared: true, transportStatus: 'accepted' })
        expect(JSON.stringify(value)).not.toMatch(/private message|synthetic-contact|sendText/)
        expect(value).not.toHaveProperty('clicked')
        expect(value).not.toHaveProperty('delivered')
    })
    it('refuses unsupported order data and unmatched refunds before writing', async () => {
        const { db, rows } = database()
        expect(await recordVerifiedOrderEvidence({ db, trustedSource: true, order: { id: 'synthetic', status: 'pending', total: '990', currency: 'ILS', billing: { phone: 'not-a-number' } } })).toMatchObject({ recorded: false })
        expect(rows.size).toBe(0)
    })
    it('rejects invalid windows instead of silently changing the cohort', () => {
        expect(() => report({ fromMs: FROM + 5 * DAY })).toThrow('INVALID_COHORT_WINDOW')
    })
})


describe('verified purchase identity and immutable source snapshots', () => {
    it('requires server-owned trust and strict payment truth before any evidence write', async () => {
        const { db, rows } = database()
        expect(await recordVerifiedOrderEvidence({ db, order: paidOrder(), nowMs: FROM + DAY })).toMatchObject({ recorded: false, reason: 'untrusted_payment_source' })
        for (const order of [paidOrder({ transaction_id: '' }), paidOrder({ date_paid_gmt: null }), paidOrder({ status: 'pending' }),
            paidOrder({ payment_method: 'cod' }), paidOrder({ line_items: [{ product_id: 9999, quantity: 1, total: '990' }] }), paidOrder({ total: '0' })]) {
            expect(await recordVerifiedOrderEvidence({ db, order, trustedSource: true, nowMs: FROM + DAY })).toMatchObject({ recorded: false })
        }
        expect(rows.size).toBe(0)
        expect(resolveBinding).not.toHaveBeenCalled()
    })
    it('uses the protected binding instead of billing phone and strips private referral details', async () => {
        const { db, rows } = database()
        const firstTouch = touch('first-ad', { ctwaClid: 'private-click-id', eventId: 'private-event-id', headline: 'private customer quote', sourceUrlOrigin: 'https://private.example' })
        resolveBinding.mockResolvedValue(bound({ firstTouch }))
        await recordVerifiedOrderEvidence({ db, order: paidOrder({ billing: { phone: '972500000902' } }), trustedSource: true, nowMs: FROM + DAY })
        const [row] = ledgerRows(rows)
        expect(row).toMatchObject({ contactHash: digest(PHONE), bindingConfidence: 'verified_checkout_binding', paymentConfidence: 'verified_paid', sourceConfidence: 'authenticated_transport',
            source: { adId: 'first-ad' }, sourceSnapshot: { firstTouch: { adId: 'first-ad', confidence: 'authenticated_transport' }, latestTouch: { adId: 'latest-ad' } } })
        expect(resolveBinding).toHaveBeenCalledWith(expect.objectContaining({ db, transaction: expect.any(Object), trustedSource: true }))
        expect(JSON.stringify(row)).not.toMatch(/private-|private customer|97250000090|ctwaClid|eventId|sourceUrl|headline/)
    })
    it('keeps phone matches as association and ignores metadata and current lead ads', async () => {
        const { db, rows } = database()
        rows.set(`sales_leads/${PHONE}`, { createdAt: FROM, sourceAttribution: touch('current-ad'), conversationalState: 'FREE_ACTIVATION' })
        await recordVerifiedOrderEvidence({ db, order: paidOrder({ meta_data: [{ key: 'adId', value: 'forged-ad' }, { key: 'leadHash', value: 'forged-lead' }] }), trustedSource: true, nowMs: FROM + DAY })
        expect(ledgerRows(rows)[0]).toMatchObject({ contactHash: digest(PHONE), bindingConfidence: 'phone_association', route: 'paid', source: { source: 'unknown', adId: null },
            sourceSnapshot: { firstTouch: { source: 'unknown' }, latestTouch: { source: 'unknown' } } })
        expect(JSON.stringify(ledgerRows(rows))).not.toMatch(/current-ad|forged-ad|forged-lead/)
    })
    it('records strictly verified unlinked revenue even when billing has no phone', async () => {
        const { db, rows } = database()
        expect(await recordVerifiedOrderEvidence({ db, order: paidOrder({ billing: {} }), trustedSource: true, nowMs: FROM + DAY })).toMatchObject({ recorded: true })
        expect(ledgerRows(rows)[0]).toMatchObject({ contactHash: null, bindingConfidence: 'unlinked', grossMinor: 99000, source: { source: 'unknown' } })
    })
    it('freezes first/latest checkout sources and reconciles duplicate and out-of-order refunds monotonically', async () => {
        const { db, rows } = database()
        resolveBinding.mockResolvedValue(bound())
        const write = (order, at = FROM + DAY) => recordVerifiedOrderEvidence({ db, order, trustedSource: true, nowMs: at })
        await write(paidOrder())
        resolveBinding.mockResolvedValue(bound({ firstTouch: touch('later-first-ad'), latestTouch: touch('later-ad') }))
        rows.set(`sales_leads/${PHONE}`, { sourceAttribution: touch('even-later-ad') })
        await write(paidOrder({ refunds: [{ total: '-90.00' }] }), FROM + 2 * DAY)
        await write(paidOrder({ refunds: [] }), FROM + 3 * DAY)
        expect(ledgerRows(rows)[0]).toMatchObject({ refundedMinor: 9000, sourceSnapshot: { firstTouch: { adId: 'first-ad' }, latestTouch: { adId: 'latest-ad' } } })
        await write(paidOrder({ status: 'refunded' }), FROM + 4 * DAY)
        await write(paidOrder(), FROM + 5 * DAY)
        const [row] = ledgerRows(rows)
        expect(row).toMatchObject({ status: 'refunded', grossMinor: 99000, refundedMinor: 99000, verifiedAtMs: FROM + DAY, paidAtMs: FROM + DAY / 2 })
        expect(resolveBinding).toHaveBeenCalledTimes(1)
        expect(report({ orders: [row, row] }).purchaseAttribution).toMatchObject({ verifiedOrders: 1, stronglyBoundOrders: 1, grossMinor: 99000, refundedMinor: 99000 })
    })
    it('does not add a later binding to an earlier unattributed purchase', async () => {
        const { db, rows } = database()
        await recordVerifiedOrderEvidence({ db, order: paidOrder(), trustedSource: true, nowMs: FROM + DAY })
        resolveBinding.mockResolvedValue(bound())
        await recordVerifiedOrderEvidence({ db, order: paidOrder(), trustedSource: true, nowMs: FROM + 2 * DAY })
        expect(ledgerRows(rows)[0]).toMatchObject({ bindingConfidence: 'unlinked', source: { source: 'unknown' } })
        expect(resolveBinding).toHaveBeenCalledTimes(1)
    })
    it('requires an existing strictly verified purchase for a refund', async () => {
        const { db, rows } = database()
        const args = { db, order: paidOrder({ status: 'refunded' }), trustedSource: true, nowMs: FROM + DAY }
        expect(await recordVerifiedOrderEvidence(args)).toEqual({ recorded: false, reason: 'refund_without_verified_purchase' })
        rows.set(`sales_order_evidence/${digest('synthetic-order')}`, { provider: 'woocommerce_signed_webhook', grossMinor: 99000 })
        expect(await recordVerifiedOrderEvidence(args)).toEqual({ recorded: false, reason: 'refund_without_verified_purchase' })
        expect(resolveBinding).not.toHaveBeenCalled()
    })
    it('retains verified payment during an outage and recovers only its original identity and paid time', async () => {
        const { db, rows } = database()
        resolveBinding.mockResolvedValue({ status: 'unattributed', reason: 'binding_source_unavailable', retryable: true })
        const args = { db, order: paidOrder(), trustedSource: true, nowMs: FROM + DAY }
        await expect(recordVerifiedOrderEvidence(args)).resolves.toMatchObject({ recorded: true, deferred: true })
        const original = ledgerRows(rows)[0]
        expect(original).toMatchObject({ grossMinor: 99000, paidAtMs: FROM + DAY / 2, bindingConfidence: 'pending', attributionStatus: 'pending', source: { source: 'unknown' } })
        expect(original.bindingPaymentSnapshot).not.toHaveProperty('billing')
        expect(report({ orders: [original] }).purchaseAttribution).toMatchObject({ verifiedOrders: 1, pendingOrders: 1, unlinkedOrders: 0, grossMinor: 99000 })
        resolveBinding.mockResolvedValue(bound())
        await expect(recordVerifiedOrderEvidence({ ...args, order: paidOrder({ total: '1990', date_paid_gmt: '2026-10-02T12:00:00', billing: { phone: '972500000902' } }), nowMs: FROM + 3 * DAY })).resolves.toMatchObject({ recorded: true, deferred: false })
        expect(resolveBinding.mock.lastCall[0].order).toEqual(original.bindingPaymentSnapshot)
        expect(ledgerRows(rows)[0]).toMatchObject({ bindingConfidence: 'verified_checkout_binding', contactHash: digest(PHONE), grossMinor: 99000, paidAtMs: FROM + DAY / 2, verifiedAtMs: FROM + DAY, bindingPaymentSnapshot: null })
    })
    it('can reconcile pending attribution after refund without losing refunds or re-creating paid status', async () => {
        const { db, rows } = database()
        resolveBinding.mockResolvedValue({ status: 'unattributed', reason: 'binding_source_unavailable', retryable: true })
        const args = { db, trustedSource: true, nowMs: FROM + DAY }
        await recordVerifiedOrderEvidence({ ...args, order: paidOrder() })
        const refund = paidOrder({ status: 'refunded', date_paid_gmt: null, transaction_id: null, payment_method: null })
        await expect(recordVerifiedOrderEvidence({ ...args, order: refund })).resolves.toMatchObject({ deferred: true })
        expect(ledgerRows(rows)[0]).toMatchObject({ status: 'refunded', refundedMinor: 99000, bindingConfidence: 'pending' })
        resolveBinding.mockResolvedValue(bound())
        await expect(recordVerifiedOrderEvidence({ ...args, order: refund })).resolves.toMatchObject({ deferred: false })
        expect(resolveBinding.mock.lastCall[0].order).toMatchObject({ status: 'processing', transaction_id: 'synthetic-transaction', date_paid_gmt: '2026-10-01T12:00:00.000Z' })
        expect(ledgerRows(rows)[0]).toMatchObject({ status: 'refunded', refundedMinor: 99000, bindingConfidence: 'verified_checkout_binding' })
    })
    it('finalizes an authoritative missing binding with the original phone association and never adopts a later binding', async () => {
        const { db, rows } = database()
        rows.set(`sales_leads/${PHONE}`, { createdAt: FROM })
        resolveBinding.mockResolvedValue({ status: 'unattributed', reason: 'binding_source_unavailable', retryable: true })
        const args = { db, trustedSource: true, nowMs: FROM + DAY, order: paidOrder() }
        await recordVerifiedOrderEvidence(args)
        rows.set('sales_leads/972500000902', { createdAt: FROM })
        resolveBinding.mockResolvedValue({ status: 'unattributed', reason: 'order_binding_missing' })
        await recordVerifiedOrderEvidence({ ...args, order: paidOrder({ billing: { phone: '972500000902' } }) })
        expect(ledgerRows(rows)[0]).toMatchObject({ bindingConfidence: 'phone_association', contactHash: digest(PHONE), source: { source: 'unknown' }, attributionStatus: 'resolved' })
        resolveBinding.mockResolvedValue(bound())
        await recordVerifiedOrderEvidence(args)
        expect(resolveBinding).toHaveBeenCalledTimes(2)
        expect(ledgerRows(rows)[0].bindingConfidence).toBe('phone_association')
    })
    it('rejects a real binding created after the original payment even if a retry claims a later payment', async () => {
        const { db, rows } = database()
        const real = await vi.importActual('@/lib/salesAgent/orderAttribution')
        const paidAt = FROM + DAY / 2, lateAt = paidAt + 60000
        const quote = { checkoutId: 'synthetic-session', providerOrderId: '81001', offerId: 'synthetic-offer', offerVersion: 'test-v1', offerTermsHash: digest('synthetic-terms'),
            productId: 'printed', providerProductId: '6271', quantity: 1, currency: 'ILS', totalMinor: 99000, taxMinor: 0, shippingMinor: 0,
            verifiedAt: new Date(lateAt).toISOString(), expiresAtMs: lateAt + DAY,
            enforcement: { checkoutId: 'synthetic-session', providerOrderId: '81001', expiresAtMs: lateAt + DAY, totalLocked: true, quantityLocked: true, taxShippingLocked: true } }
        resolveBinding.mockResolvedValue({ status: 'unattributed', reason: 'binding_source_unavailable', retryable: true })
        const args = { db, trustedSource: true, nowMs: FROM + DAY, order: paidOrder({ id: 81001, total_tax: '0.00', shipping_total: '0.00' }) }
        await recordVerifiedOrderEvidence(args)
        rows.set('sales_order_attribution_bindings/81001', real.createOrderAttributionBinding({ quote, leadId: PHONE, eventId: 'synthetic-event', idempotencyKey: digest('synthetic-key'), attribution: null, providerId: 'synthetic-provider', nowMs: lateAt }))
        resolveBinding.mockImplementation(real.resolveOrderAttribution)
        await recordVerifiedOrderEvidence({ ...args, order: { ...args.order, date_paid_gmt: new Date(lateAt + 1000).toISOString() } })
        expect(ledgerRows(rows)[0]).toMatchObject({ bindingConfidence: 'unlinked', attributionReason: 'payment_outside_bound_session', source: { source: 'unknown' } })
    })
    it.each([{}, { attributionStatus: 'pending', bindingConfidence: 'pending', bindingPaymentSnapshot: { id: 'forged-legacy-order' } }])('does not upgrade unverified historical payment fields or pending attribution: %j', async legacyPatch => {
        const { db, rows } = database()
        rows.set(`sales_order_evidence/${digest('synthetic-order')}`, { provider: 'woocommerce_signed_webhook', contactHash: digest(PHONE),
            grossMinor: 500000, paidAtMs: FROM - 20 * DAY, verifiedAtMs: FROM - 19 * DAY, status: 'refunded', refundedMinor: 500000,
            source: touch('legacy-ad'), bindingConfidence: 'verified_checkout_binding', bindingId: 'legacy-binding', ...legacyPatch })
        resolveBinding.mockResolvedValue(bound())
        const args = { db, order: paidOrder({ refunds: [{ total: '-90.00' }] }), trustedSource: true, nowMs: FROM + DAY }
        expect(await recordVerifiedOrderEvidence(args)).toMatchObject({ recorded: true, deferred: false })
        expect(resolveBinding).not.toHaveBeenCalled()
        expect(ledgerRows(rows)[0]).toMatchObject({ paymentConfidence: 'verified_paid', grossMinor: 99000, paidAtMs: FROM + DAY / 2, verifiedAtMs: FROM + DAY,
            status: 'paid', refundedMinor: 9000, bindingConfidence: 'phone_association', attributionStatus: 'resolved', source: { source: 'unknown', adId: null },
            bindingId: null, bindingPaymentSnapshot: null, phoneAssociationHash: null })
    })
    it('keeps missing current refund data unknown when replacing unverified historical payment fields', async () => {
        const { db, rows } = database()
        rows.set(`sales_order_evidence/${digest('synthetic-order')}`, { provider: 'woocommerce_signed_webhook', grossMinor: 99000, refundedMinor: 99000, status: 'refunded' })
        await recordVerifiedOrderEvidence({ db, order: paidOrder({ refunds: undefined }), trustedSource: true, nowMs: FROM + DAY })
        expect(ledgerRows(rows)[0]).toMatchObject({ status: 'paid', refundedMinor: null, bindingConfidence: 'unlinked' })
    })
    it('keeps missing refund data unknown rather than inferring zero', async () => {
        const { db, rows } = database()
        await recordVerifiedOrderEvidence({ db, order: paidOrder({ refunds: undefined }), trustedSource: true, nowMs: FROM + DAY })
        expect(ledgerRows(rows)[0].refundedMinor).toBeNull()
        expect(report({ orders: ledgerRows(rows) }).purchaseAttribution.refundDataComplete).toBe(false)
    })
})

describe('purchase attribution separate from cohort association', () => {
    it('reports bound, phone-associated, and unlinked purchases separately, with independently grounded source confidence', () => {
        const orders = [order('bound', 'one', { bindingConfidence: 'verified_checkout_binding', sourceSnapshot: { firstTouch: touch('first-ad'), latestTouch: touch('latest-ad') } }),
            order('phone', 'two', { source: touch('untrusted-current-ad') }), order('unlinked', null, { bindingConfidence: 'unlinked' })]
        const result = report({ conversations: [conversation('one'), conversation('two')], orders })
        expect(result.purchaseAttribution).toMatchObject({ verifiedOrders: 3, stronglyBoundOrders: 1, phoneAssociatedOrders: 1, unlinkedOrders: 1,
            knownFirstTouchOrders: 1, unknownFirstTouchOrders: 2, grossMinor: 297000 })
        expect(result.purchaseAttribution.byFirstTouch).toContainEqual(expect.objectContaining({ adId: 'first-ad', campaignId: 'synthetic-campaign', confidence: 'authenticated_transport',
            fieldEvidence: { adId: 'meta_referral', campaignId: 'transport_mapping', adsetId: 'transport_mapping' } }))
        expect(result.purchaseAttribution.byLatestTouch).toContainEqual(expect.objectContaining({ adId: 'latest-ad' }))
        expect(result.cohorts[0]).toMatchObject({ verifiedOrders: 2, stronglyBoundOrders: 1, phoneAssociatedOrders: 1 })
        expect(result.definition).toContain('does not establish ad attribution')
        expect(JSON.stringify(result)).not.toContain('untrusted-current-ad')
    })
    it('distinguishes a known source label from an observed exact first or latest ad ID', () => {
        const result = report({ orders: [order('source-only', 'one', { bindingConfidence: 'verified_checkout_binding',
            sourceSnapshot: { firstTouch: touch(null), latestTouch: touch('latest-ad') } }),
        order('unlinked', null, { bindingConfidence: 'unlinked' })] })
        expect(result.purchaseAttribution).toMatchObject({ knownFirstTouchOrders: 1, unknownFirstTouchOrders: 1,
            knownLatestTouchOrders: 1, unknownLatestTouchOrders: 1,
            knownFirstTouchAdOrders: 0, unknownFirstTouchAdOrders: 2, knownLatestTouchAdOrders: 1, unknownLatestTouchAdOrders: 1 })
        expect(result.purchaseAttribution.definition).toContain('known ad counts require an observed ad ID')
    })
    it('never upgrades unverified source metadata when the lead/order binding is strong', () => {
        const result = report({ orders: [order('bound', 'one', { bindingConfidence: 'verified_checkout_binding',
            sourceSnapshot: { firstTouch: touch('unsupported-ad', { confidence: 'unverified_transport' }), latestTouch: null } })] })
        expect(result.purchaseAttribution).toMatchObject({ stronglyBoundOrders: 1, knownFirstTouchOrders: 0, unknownFirstTouchOrders: 1 })
        expect(result.purchaseAttribution.byFirstTouch[0]).toMatchObject({ source: 'unknown', adId: null, confidence: 'unverified_transport' })
    })
    it('excludes legacy status-only revenue and counts it explicitly without backfill', () => {
        const result = report({ conversations: [conversation('one')], orders: [order('legacy', 'one', { paymentConfidence: undefined, source: touch('legacy-ad') })] })
        expect(result.cohorts[0]).toMatchObject({ verifiedOrders: 0, grossMinor: 0 })
        expect(result.purchaseAttribution).toMatchObject({ verifiedOrders: 0, grossMinor: 0, legacyUnverifiedOrders: 1 })
    })
    it('uses provider paid time for purchase windows and keeps delayed verification from moving revenue', () => {
        const result = report({ orders: [order('old', 'one', { paidAtMs: FROM - DAY }), order('current', 'two', { paidAtMs: FROM + DAY / 2, verifiedAtMs: FROM + DAY * 10 })] })
        expect(result.purchaseAttribution).toMatchObject({ verifiedOrders: 1, grossMinor: 99000 })
    })
})
