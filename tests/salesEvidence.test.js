import { describe, expect, it, vi } from 'vitest'
import { buildSalesCohortReport, decimalMinor, recordConversationEvidence, recordVerifiedOrderEvidence } from '@/lib/salesAgent/salesEvidence'
const FROM = Date.parse('2026-10-01T00:00:00Z'), DAY = 86400000
const conversation = (contactHash, overrides = {}) => ({ contactHash, inboundAtMs: FROM, source: { source: 'synthetic_source' }, route: 'paid', ...overrides })
const order = (id, contactHash, overrides = {}) => ({ id, contactHash, provider: 'woocommerce_signed_webhook', verifiedAtMs: FROM + DAY, currency: 'ILS', grossMinor: 99000, refundedMinor: 0, ...overrides })
const report = args => buildSalesCohortReport({ fromMs: FROM, toMs: FROM + DAY * 2, asOfMs: FROM + DAY * 10, maturityHours: 168, ...args })
function database() {
    const rows = new Map()
    const db = { collection: name => ({ doc: id => ({ key: `${name}/${id}` }) }), runTransaction: async fn => fn({
        get: async ref => ({ exists: rows.has(ref.key), data: () => rows.get(ref.key) }),
        set: (ref, value) => rows.set(ref.key, { ...(rows.get(ref.key) || {}), ...value }),
    }) }
    return { db, rows }
}
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
        const costs = [{ verified: true, source: 'synthetic_source', campaignId: null, route: 'paid', fromMs: FROM, toMs: FROM + DAY * 2, currency: 'ILS', adCostMinor: 12000, botCostMinor: 500, messageCostMinor: 100, productCostMinor: 30000, shippingCostMinor: 2500, processingCostMinor: 1000 }]
        const result = report({ conversations: [conversation('one')], orders: [order('A', 'one', { refundedMinor: 9000 })], costs })
        expect(result.cohorts[0]).toMatchObject({ adAcquisitionMinor: 12000, fullAcquisitionMinor: 12600, contributionMinor: 56500, comparison: 'insufficient_sample' })
        expect(result.cohorts[0].conversion95.low).toBeLessThan(1)
        expect(report({ conversations: [conversation('one')], orders: [order('A', 'one', { refundedMinor: null })], costs }).cohorts[0].contributionMinor).toBeNull()
    })
    it('writes idempotent prepared evidence without text, names or phone', async () => {
        const { db, rows } = database()
        const args = { db, eventId: 'synthetic-event', leadId: 'synthetic-contact', nowMs: FROM, contract: { conversationalPolicyVersion: 'test-policy', conversationRevision: 1, conversationalState: 'CHECKOUT', sourceAttribution: { source: 'synthetic_source' }, checkoutSnapshot: { checkoutId: 'synthetic' } }, outcome: { sendText: 'private message must never be copied' } }
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
        expect(await recordVerifiedOrderEvidence({ db, order: { id: 'synthetic', status: 'pending', total: '990', currency: 'ILS', billing: { phone: 'not-a-number' } } })).toMatchObject({ recorded: false })
        expect(rows.size).toBe(0)
    })
    it('rejects invalid windows instead of silently changing the cohort', () => {
        expect(() => report({ fromMs: FROM + 5 * DAY })).toThrow('INVALID_COHORT_WINDOW')
    })
})
