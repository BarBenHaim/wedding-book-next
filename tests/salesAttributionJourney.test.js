import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'node:crypto'
import { FIXTURE_NOW, syntheticCatalog } from './fixtures/salesContractFixtures'

const boundary = vi.hoisted(() => ({
    database: null, provider: null, providerEnabled: true,
    auth: { verifyIdToken: vi.fn(), getUserByEmail: vi.fn(), createUser: vi.fn(), generatePasswordResetLink: vi.fn() },
    isAdmin: vi.fn(), settings: vi.fn(), catalog: vi.fn(), prior: vi.fn(),
    send: vi.fn(), smtp: vi.fn(), fetch: vi.fn(), createCheckout: vi.fn(), verifyCheckout: vi.fn(),
}))
vi.mock('@/lib/firebaseAdmin', async () => {
    const { createSalesAttributionDatabase } = await import('./fixtures/salesAttributionDatabase')
    boundary.database = createSalesAttributionDatabase()
    return { adminDb: boundary.database.db, adminAuth: boundary.auth, adminStorage: {} }
})
vi.mock('firebase-admin/firestore', async () => ({ FieldValue: (await import('./fixtures/salesAttributionDatabase')).syntheticFieldValue }))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: boundary.isAdmin }))
vi.mock('@/lib/salesAgent/settingsStore', () => ({ readSalesSettings: boundary.settings }))
vi.mock('@/lib/salesAgent/offerStore', () => ({ readActiveOfferCatalog: boundary.catalog }))
vi.mock('@/lib/salesAgent/priorContext', () => ({ readPriorConversationContext: boundary.prior }))
vi.mock('@/lib/salesAgent/whatsapp', () => ({ canSendWhatsApp: () => true }))
vi.mock('@/lib/salesAgent/inboundDirectDelivery', () => ({ sendInboundSequenceDirect: boundary.send }))
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: boundary.smtp }) } }))
vi.mock('@/lib/salesAgent/checkoutQuoteStore', async original => {
    const actual = await original()
    // Inject only the external provider at its server-owned seam. Run the real
    // quote reader, provider contract, immutable binding and persistence logic.
    return { ...actual, readVerifiedCheckout: args => actual.readVerifiedCheckout({ ...args,
        db: boundary.database.db, provider: boundary.provider, providerEnabled: boundary.providerEnabled }) }
})

import { POST as reply } from '@/app/api/sales-agent/reply/route'
import { POST as paidWebhook } from '@/app/api/createWedding/route'
import { GET as cohorts } from '@/app/api/sales-agent/cohorts/route'
import { normalizePhone } from '@/lib/salesAgent/agent'
import { validateInboundBeforeSend } from '@/lib/salesAgent/leads'

// More than E.164's 15 digits: synthetic identifiers cannot be real numbers.
const CONTACT = '999000000000000000001'
const OTHER_CONTACT = '999000000000000000002'
const ORDER_ID = '81001'
const SECRET = 'synthetic-journey-webhook-secret'
const TRANSPORT_SECRET = 'synthetic-journey-transport-secret'
const AD_A = '990000000000001', AD_B = '990000000000002', AD_C = '990000000000003'
const CAMPAIGN_A = 'synthetic_campaign_A', CAMPAIGN_B = 'synthetic_campaign_B', CAMPAIGN_C = 'synthetic_campaign_C'
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const lead = (contact = CONTACT) => boundary.database.docs.get(`sales_leads/${contact}`)
const rows = name => boundary.database.rows(name)
const binding = () => boundary.database.docs.get(`sales_order_attribution_bindings/${ORDER_ID}`)
let now, turnNumber

function metaReferral(adId, campaignId) {
    return { source_type: 'ad', source_id: adId, ctwa_clid: `synthetic_click_${adId}`,
        source_url: 'https://www.facebook.com/synthetic-ad?private=synthetic', campaignId }
}
async function inbound(text, { referral, contact = CONTACT, eventId, ...extra } = {}) {
    now += 1_000
    vi.setSystemTime(now)
    const id = eventId || `synthetic-journey-event-${++turnNumber}`
    const body = { eventId: id, phone: contact, text, messageType: 'text', occurredAt: new Date(now).toISOString(),
        entry: [{ changes: [{ field: 'messages', value: { messages: [{ id, from: contact, timestamp: String(Math.floor(now / 1000)), type: 'text',
            text: { body: text }, ...(referral ? { referral } : {}) }] } }] }], ...extra }
    const response = await reply(new Request('https://example.test/api/sales-agent/reply', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-wt-secret': TRANSPORT_SECRET }, body: JSON.stringify(body),
    }))
    return { response, body: await response.json(), payload: body }
}
async function replay(payload) {
    const response = await reply(new Request('https://example.test/api/sales-agent/reply', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-wt-secret': TRANSPORT_SECRET }, body: JSON.stringify(payload),
    }))
    return { status: response.status, body: await response.json() }
}
function paid(overrides = {}) {
    return { id: Number(ORDER_ID), status: 'processing', currency: 'ILS', total: '990.00', total_tax: '0.00', shipping_total: '0.00',
        date_paid_gmt: new Date(now).toISOString().replace(/\.\d{3}Z$/, ''), date_modified_gmt: new Date(now).toISOString().replace(/\.\d{3}Z$/, ''),
        transaction_id: 'synthetic-paid-reference', payment_method: 'synthetic_gateway', refunds: [],
        billing: { email: 'synthetic-buyer@example.invalid', first_name: 'Synthetic', phone: CONTACT },
        line_items: [{ product_id: 6271, variation_id: 0, quantity: 1, total: '990.00' }], ...overrides }
}
async function webhook(order, signature) {
    const body = JSON.stringify(order)
    const response = await paidWebhook(new Request('https://example.test/api/createWedding', { method: 'POST', body,
        headers: { 'x-wc-webhook-signature': signature ?? crypto.createHmac('sha256', SECRET).update(body).digest('base64') } }))
    return { status: response.status, body: await response.json() }
}
async function report(headers = { authorization: 'Bearer synthetic-admin-token' }) {
    vi.setSystemTime(FIXTURE_NOW + 8 * 86400_000)
    const response = await cohorts(new Request('https://example.test/api/sales-agent/cohorts?from=2026-10-05T00:00:00Z&to=2026-10-06T00:00:00Z', { headers }))
    return { status: response.status, body: await response.json() }
}
async function checkoutFromAds() {
    const first = await inbound('כמה עולה?', { referral: metaReferral(AD_A, CAMPAIGN_A) })
    expect(first.response.status).toBe(200)
    expect(first.body).toMatchObject({ ok: true, handoff: false })
    const second = await inbound('אני רוצה להזמין ספר מודפס', { referral: metaReferral(AD_B, CAMPAIGN_B) })
    expect(second.response.status).toBe(200)
    expect(second.body).toMatchObject({ ok: true, handoff: false, stage: 'ready_to_pay' })
    expect(lead()).toMatchObject({ conversationalState: 'CHECKOUT', checkoutSnapshot: { totalMinor: 99000 },
        sourceAttribution: { firstTouch: { adId: AD_A }, latestTouch: { adId: AD_B } } })
    return { first, second }
}

beforeEach(() => {
    vi.clearAllMocks()
    boundary.database.reset()
    vi.useFakeTimers({ toFake: ['Date'] })
    now = FIXTURE_NOW; turnNumber = 0
    vi.setSystemTime(now)
    vi.stubEnv('SALES_CONVERSATIONAL_POLICY_ENABLED', 'true')
    vi.stubEnv('SALES_REFERRAL_TRANSPORT_VERSION', 'structured-v1')
    vi.stubEnv('SALES_AGENT_SECRET', TRANSPORT_SECRET)
    vi.stubEnv('WC_WEBHOOK_SECRET', SECRET)
    vi.stubEnv('MAIL_USER', 'synthetic-sender@example.invalid')
    vi.stubEnv('MAIL_PASS', 'synthetic-mail-password')
    vi.stubGlobal('fetch', boundary.fetch.mockRejectedValue(new Error('External requests are forbidden in synthetic journey tests')))
    boundary.auth.verifyIdToken.mockResolvedValue({ uid: 'synthetic-admin', email: 'synthetic-admin@example.invalid', email_verified: true })
    boundary.auth.getUserByEmail.mockResolvedValue({ uid: 'synthetic-owner' })
    boundary.auth.generatePasswordResetLink.mockResolvedValue('https://synthetic.firebaseapp.com/__/auth/action?oobCode=synthetic')
    boundary.isAdmin.mockReturnValue(true)
    boundary.settings.mockResolvedValue({ revision: 1, enabled: true, mode: 'full_sales', provider: 'anthropic',
        model: 'synthetic-no-model', activeOpeningIds: [], openingMediaSequence: [], businessInstructions: '' })
    boundary.catalog.mockResolvedValue(syntheticCatalog())
    boundary.prior.mockResolvedValue({ state: 'none', hasPriorConversation: false })
    boundary.send.mockImplementation(async ({ parts, validateBeforePart }) => {
        for (const part of parts) expect(await validateBeforePart(part)).toMatchObject({ ok: true })
        return { status: 'accepted', acceptedParts: parts.length, totalParts: parts.length, persistenceDegraded: false }
    })
    boundary.smtp.mockImplementation(async message => ({ accepted: [message.to] }))
    let reserved
    boundary.providerEnabled = true
    boundary.createCheckout.mockImplementation(async request => {
        reserved = { ...request, checkoutId: 'synthetic-checkout-session', providerOrderId: ORDER_ID }
        return { checkoutId: reserved.checkoutId, providerOrderId: ORDER_ID }
    })
    boundary.verifyCheckout.mockImplementation(async () => ({ ...reserved, verificationSource: 'provider_api', verified: true,
        verificationRef: 'synthetic-provider-verification', verifiedAt: new Date(now).toISOString(),
        url: `https://weddingtales.co.il/checkout/order-pay/${ORDER_ID}/?pay_for_order=true&key=wc_order_synthetic123456`,
        enforcement: { checkoutId: reserved.checkoutId, providerOrderId: ORDER_ID, expiresAtMs: reserved.expiresAtMs,
            totalLocked: true, quantityLocked: true, taxShippingLocked: true },
    }))
    boundary.provider = { contractVersion: 2, id: 'synthetic-provider', createCheckout: boundary.createCheckout, verifyCheckout: boundary.verifyCheckout }
})
afterEach(() => {
    expect(boundary.fetch).not.toHaveBeenCalled()
    vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals()
})

describe('synthetic ad → real reply CRM → bound checkout → signed Woo → private report', () => {
    it('freezes first A/latest B at checkout, resists later C and counts signed payment/refund retries once', async () => {
        expect(normalizePhone(CONTACT)).toBe(CONTACT)
        const { first, second } = await checkoutFromAds()
        expect(rows('sales_inbound_events')).toHaveLength(2)
        expect(rows('sales_inbound_events').every(event => event.status === 'completed')).toBe(true)
        expect(lead().userTurns).toBe(2)
        expect(lead().turns.filter(turn => turn.role === 'user').map(turn => turn.text)).toEqual([first.payload.text, second.payload.text])
        expect(rows('sales_conversation_evidence')).toHaveLength(2)
        expect(boundary.verifyCheckout).toHaveBeenCalledWith({ checkoutId: 'synthetic-checkout-session', providerOrderId: ORDER_ID })
        expect(binding()).toMatchObject({ contactHash: hash(CONTACT), providerOrderId: ORDER_ID, totalMinor: 99000,
            attribution: { firstTouch: { adId: AD_A, campaignId: CAMPAIGN_A }, latestTouch: { adId: AD_B, campaignId: CAMPAIGN_B } } })
        const frozenBinding = structuredClone(binding())
        expect(JSON.stringify(frozenBinding)).not.toMatch(/synthetic_click|sourceUrlOrigin|wc_order_|eventId"|phone"/)
        expect((await replay(second.payload)).body).toMatchObject({ duplicate: true, shouldSend: false })
        expect(boundary.createCheckout).toHaveBeenCalledTimes(1)
        expect(lead().userTurns).toBe(2)

        await inbound('איך זה עובד?', { referral: metaReferral(AD_C, CAMPAIGN_C) })
        expect(lead().sourceAttribution).toMatchObject({ firstTouch: { adId: AD_A }, latestTouch: { adId: AD_C } })
        expect(binding()).toEqual(frozenBinding)
        now += 1000; vi.setSystemTime(now)
        const order = paid()
        expect(await webhook(order)).toMatchObject({ status: 200, body: { success: true, bookReady: true } })
        expect(await webhook(order)).toMatchObject({ status: 200, body: { success: true, skipped: true } })
        expect(rows('weddings')).toHaveLength(1)
        expect(rows('sales_order_evidence')).toHaveLength(1)
        expect(boundary.smtp).toHaveBeenCalledTimes(1)
        expect(rows('sales_order_evidence')[0]).toMatchObject({ contactHash: hash(CONTACT), bindingConfidence: 'verified_checkout_binding',
            paymentConfidence: 'verified_paid', grossMinor: 99000, refundedMinor: 0,
            sourceSnapshot: { firstTouch: { adId: AD_A }, latestTouch: { adId: AD_B } } })
        expect(lead()).toMatchObject({ paymentVerified: true, stage: 'closed_won', followUpAt: null })
        const purchased = await report()
        expect(purchased.status).toBe(200)
        expect(purchased.body.purchaseAttribution).toMatchObject({ verifiedOrders: 1, stronglyBoundOrders: 1,
            phoneAssociatedOrders: 0, unlinkedOrders: 0, knownFirstTouchOrders: 1, knownLatestTouchOrders: 1, grossMinor: 99000, refundedMinor: 0 })
        expect(purchased.body.purchaseAttribution.byFirstTouch).toEqual([expect.objectContaining({ adId: AD_A, campaignId: CAMPAIGN_A,
            confidence: 'authenticated_transport', evidence: 'meta_referral', verifiedOrders: 1,
            fieldEvidence: { adId: 'meta_referral', campaignId: 'transport_mapping', adsetId: 'unknown' } })])
        expect(purchased.body.purchaseAttribution.byLatestTouch).toEqual([expect.objectContaining({ adId: AD_B, campaignId: CAMPAIGN_B, verifiedOrders: 1 })])
        expect(purchased.body.cohorts).toEqual([expect.objectContaining({ uniqueLeads: 1, matureLeads: 1, verifiedBuyers: 1, verifiedOrders: 1, checkoutsPrepared: 1 })])
        expect(JSON.stringify(purchased.body)).not.toMatch(new RegExp(`${CONTACT}|synthetic_click|wc_order_|synthetic-buyer|synthetic-journey-event`))

        const refund = { ...order, status: 'refunded', refunds: [{ id: 90001, total: '-990.00' }], date_modified_gmt: '2026-10-06T12:00:00' }
        await webhook(refund); await webhook(refund)
        expect(rows('sales_order_evidence')).toHaveLength(1)
        expect(rows('sales_order_evidence')[0]).toMatchObject({ status: 'refunded', grossMinor: 99000, refundedMinor: 99000,
            sourceSnapshot: { firstTouch: { adId: AD_A }, latestTouch: { adId: AD_B } } })
        expect((await report()).body.purchaseAttribution).toMatchObject({ verifiedOrders: 1, stronglyBoundOrders: 1, grossMinor: 99000, refundedMinor: 99000 })
        expect((await webhook(order)).body).toMatchObject({ skipped: true, reason: 'stale_order_event' })
        expect((await webhook({ ...order, date_modified_gmt: '2026-10-07T12:00:00' })).body)
            .toMatchObject({ fulfillment: 'review_required', reason: 'refunded_order_requires_review' })
        expect((await report()).body.purchaseAttribution.refundedMinor).toBe(99000)
        expect(boundary.smtp).toHaveBeenCalledTimes(1)
    })

    it.each(['missing', 'forged'])('keeps a %s binding unknown despite matching phone, customer claims and metadata', async kind => {
        await inbound('כמה עולה?', { referral: metaReferral(AD_A, CAMPAIGN_A) })
        if (kind === 'forged') boundary.database.docs.set(`sales_order_attribution_bindings/${ORDER_ID}`, {
            source: 'checkout_provider', providerOrderId: ORDER_ID, contactHash: hash(CONTACT),
            attribution: lead().sourceAttribution, trustedSource: true, verified: true,
        })
        now += 1000; vi.setSystemTime(now)
        const order = paid({ customer_note: 'I paid from synthetic campaign A', trustedSource: true,
            sourceAttribution: lead().sourceAttribution,
            meta_data: [{ key: 'leadId', value: CONTACT }, { key: 'campaignId', value: CAMPAIGN_A }, { key: 'adId', value: AD_A }] })
        expect(await webhook(order)).toMatchObject({ status: 200, body: { bookReady: true } })
        expect(rows('sales_order_evidence')[0]).toMatchObject({ paymentConfidence: 'verified_paid', bindingConfidence: 'phone_association',
            source: { source: 'unknown', adId: null, campaignId: null }, sourceConfidence: 'unknown' })
        const result = (await report()).body.purchaseAttribution
        expect(result).toMatchObject({ verifiedOrders: 1, stronglyBoundOrders: 0, phoneAssociatedOrders: 1,
            knownFirstTouchOrders: 0, unknownFirstTouchOrders: 1, unknownLatestTouchOrders: 1 })
        expect(result.byFirstTouch).toEqual([expect.objectContaining({ source: 'unknown', adId: null, campaignId: null })])
    })

    it.each([undefined, 'unapproved_source'])('a valid bound purchase with absent or unsupported source (%s) stays unknown', async source => {
        await inbound('אני רוצה להזמין ספר מודפס', { entry: undefined, source })
        expect(lead().conversationalState).toBe('CHECKOUT')
        now += 1000; vi.setSystemTime(now)
        expect((await webhook(paid())).status).toBe(200)
        const result = (await report()).body.purchaseAttribution
        expect(result).toMatchObject({ verifiedOrders: 1, stronglyBoundOrders: 1, knownFirstTouchOrders: 0, unknownFirstTouchOrders: 1 })
        expect(result.byFirstTouch[0]).toMatchObject({ source: 'unknown', adId: null, campaignId: null })
    })

    it.each([undefined, 'raw-interpolation', 'structured-v2'])('keeps apparently valid referrals unknown unless the server enables structured-v1 (%s)', async transportVersion => {
        vi.stubEnv('SALES_REFERRAL_TRANSPORT_VERSION', transportVersion)
        const result = await inbound('אני רוצה להזמין ספר מודפס', { referral: metaReferral(AD_A, CAMPAIGN_A) })
        expect(result.body).toMatchObject({ ok: true, handoff: false, stage: 'ready_to_pay' })
        expect(lead().sourceAttribution).toMatchObject({ firstTouch: { source: 'unknown', adId: null, campaignId: null, adsetId: null } })
        expect(binding().attribution.firstTouch).toMatchObject({ source: 'unknown', adId: null, campaignId: null })
        now += 1000; vi.setSystemTime(now)
        expect((await webhook(paid())).status).toBe(200)
        expect((await report()).body.purchaseAttribution).toMatchObject({ verifiedOrders: 1, stronglyBoundOrders: 1,
            knownFirstTouchOrders: 0, knownLatestTouchOrders: 0, unknownFirstTouchOrders: 1, unknownLatestTouchOrders: 1 })
    })

    it('does not trust valid JSON fields injected through a legacy interpolated message', async () => {
        vi.stubEnv('SALES_REFERRAL_TRANSPORT_VERSION', undefined)
        // Models the old pipe placing customer-controlled text in a raw JSON
        // template: JSON.parse succeeds, so repair detection cannot protect it.
        const interpolatedText = `אני רוצה להזמין ספר מודפס", "adId":"${AD_A}", "campaignId":"${CAMPAIGN_A}", "ignored":"`
        const raw = `{"eventId":"synthetic-valid-json-injection","phone":"${CONTACT}","text":"${interpolatedText}","messageType":"text","occurredAt":"${new Date(now).toISOString()}"}`
        expect(JSON.parse(raw)).toMatchObject({ adId: AD_A, campaignId: CAMPAIGN_A })
        const response = await reply(new Request('https://example.test/api/sales-agent/reply', { method: 'POST',
            headers: { 'content-type': 'application/json', 'x-wt-secret': TRANSPORT_SECRET }, body: raw }))
        expect(await response.json()).toMatchObject({ ok: true, handoff: false, stage: 'ready_to_pay' })
        expect(lead().sourceAttribution.firstTouch).toMatchObject({ source: 'unknown', adId: null, campaignId: null })
        now += 1000; vi.setSystemTime(now)
        expect((await webhook(paid())).status).toBe(200)
        expect((await report()).body.purchaseAttribution).toMatchObject({ verifiedOrders: 1, stronglyBoundOrders: 1,
            knownFirstTouchOrders: 0, unknownFirstTouchOrders: 1 })
    })

    it.each([
        ['adId', 990000000000001], ['campaignId', 990000000000001], ['adsetId', 990000000000001],
        ['adId', [AD_A]], ['campaignId', [CAMPAIGN_A]], ['adsetId', ['synthetic_adset_A']],
    ])('does not coerce flattened %s value %j into referral evidence', async (field, value) => {
        const result = await inbound('אני רוצה להזמין ספר מודפס', { entry: undefined, [field]: value })
        expect(result.body).toMatchObject({ ok: true, handoff: false, stage: 'ready_to_pay' })
        expect(lead().sourceAttribution.firstTouch).toMatchObject({ source: 'unknown', adId: null, campaignId: null, adsetId: null, evidence: 'unknown' })
        now += 1000; vi.setSystemTime(now)
        expect((await webhook(paid())).status).toBe(200)
        const attribution = (await report()).body.purchaseAttribution
        expect(attribution).toMatchObject({ verifiedOrders: 1, stronglyBoundOrders: 1, knownFirstTouchOrders: 0, unknownFirstTouchOrders: 1 })
        expect(attribution.byFirstTouch[0]).toMatchObject({ source: 'unknown', adId: null, campaignId: null, adsetId: null })
    })

    it('joins payment to the reserved lead even when the signed billing phone differs', async () => {
        const { second } = await checkoutFromAds()
        await boundary.database.db.collection('sales_leads').doc(CONTACT).set({
            followUpAt: '2026-10-06', followUpSchedule: { status: 'scheduled', dueAtMs: now + 3600_000 },
            deliveryRequestOutboundId: 'synthetic-pending-request', deliveryRequestAttemptId: 'synthetic-request-attempt', deliveryRequestUntilMs: now + 3600_000,
            deliveryPendingOutboundId: 'synthetic-pending-delivery', deliveryPendingAttemptId: 'synthetic-delivery-attempt', deliveryPendingUntilMs: now + 3600_000,
            pendingDeliveryMessages: { 'synthetic-pending-delivery': { text: 'synthetic queued reminder' } },
        }, { merge: true })
        now += 1000; vi.setSystemTime(now)
        expect((await webhook(paid({ billing: { email: 'synthetic-buyer@example.invalid', phone: OTHER_CONTACT } }))).status).toBe(200)
        expect(rows('sales_order_evidence')[0]).toMatchObject({ contactHash: hash(CONTACT), bindingConfidence: 'verified_checkout_binding',
            sourceSnapshot: { firstTouch: { adId: AD_A }, latestTouch: { adId: AD_B } } })
        expect(lead()).toMatchObject({ followUpAt: null, followUpSchedule: null,
            boundCheckoutPaid: true, boundCheckoutOrderId: ORDER_ID, marketingSuppressed: true,
            deliveryRequestOutboundId: null, deliveryRequestAttemptId: null, deliveryRequestUntilMs: null,
            deliveryPendingOutboundId: null, deliveryPendingAttemptId: null, deliveryPendingUntilMs: null,
            pendingDeliveryMessages: {},
        })
        expect(lead().pendingDeliveryMessages).toEqual({})
        expect(await validateInboundBeforeSend({ phone: CONTACT, eventId: second.payload.eventId }))
            .toMatchObject({ ok: false, reason: 'payment-state-changed' })
        expect(lead()).not.toHaveProperty('weddingId')
        expect(lead()).not.toHaveProperty('paymentVerified')
        expect(lead()).not.toHaveProperty('ownerId')
        expect(lead()).not.toHaveProperty('ownerEmail')
        expect(rows('weddings')[0]).toMatchObject({ ownerId: 'synthetic-owner', ownerPhone: OTHER_CONTACT })
        const result = (await report()).body
        expect(result.purchaseAttribution).toMatchObject({ verifiedOrders: 1, stronglyBoundOrders: 1, phoneAssociatedOrders: 0 })
        expect(result.cohorts[0]).toMatchObject({ verifiedBuyers: 1, verifiedOrders: 1 })
    })

    it('fences a real in-flight sales reply when the bound checkout is paid by another phone', async () => {
        await checkoutFromAds()
        const turnsBeforePayment = structuredClone(lead().turns)
        const sendCount = boundary.send.mock.calls.length
        let releaseCatalog, signalCatalog
        const catalogGate = new Promise(resolve => { releaseCatalog = resolve })
        const catalogReached = new Promise(resolve => { signalCatalog = resolve })
        boundary.catalog.mockImplementationOnce(async () => {
            signalCatalog()
            await catalogGate
            return syntheticCatalog()
        })
        // Pause only the external catalog read. The real route has already
        // claimed the event and loaded its pre-payment conversation state.
        const inFlight = inbound('איך זה עובד?', { eventId: 'synthetic-inflight-before-payment' })
        await catalogReached
        expect(boundary.database.docs.get('sales_inbound_events/synthetic-inflight-before-payment'))
            .toMatchObject({ status: 'processing', paymentVerifiedAtClaim: false })
        try {
            now += 1000; vi.setSystemTime(now)
            expect((await webhook(paid({ billing: { email: 'synthetic-buyer@example.invalid', phone: OTHER_CONTACT } }))).status).toBe(200)
            expect(lead()).toMatchObject({ boundCheckoutPaid: true, marketingSuppressed: true, stage: 'closed_won' })
        } finally {
            releaseCatalog()
        }
        const finished = await inFlight
        expect(finished.response.status).toBe(200)
        expect(finished.body).toMatchObject({ ok: true, skipped: 'payment-changed', shouldSend: false, sendText: '' })
        expect(boundary.send).toHaveBeenCalledTimes(sendCount)
        expect(lead().turns).toEqual(turnsBeforePayment)
        expect(lead().userTurns).toBe(2)
        expect(lead()).not.toHaveProperty('paymentVerified')
        expect(lead()).not.toHaveProperty('weddingId')
        expect(rows('sales_conversation_evidence')).toHaveLength(2)
        expect((await report()).body.purchaseAttribution).toMatchObject({ verifiedOrders: 1, stronglyBoundOrders: 1 })
    })

    it('rejects provider economics changes before sending any checkout link or creating a binding', async () => {
        const verify = boundary.verifyCheckout.getMockImplementation()
        boundary.verifyCheckout.mockImplementation(async identity => ({ ...await verify(identity), totalMinor: 1 }))
        const result = await inbound('אני רוצה להזמין ספר מודפס', { referral: metaReferral(AD_A, CAMPAIGN_A) })
        expect(result.body).toMatchObject({ ok: true, handoff: true })
        expect(rows('sales_checkout_quotes')).toHaveLength(0)
        expect(rows('sales_order_attribution_bindings')).toHaveLength(0)
        expect(lead().checkoutSnapshot).toBeUndefined()
        expect(boundary.send.mock.calls.flatMap(([request]) => request.parts).map(part => part.text).join(' ')).not.toContain('/checkout/')
        expect((await report()).body.purchaseAttribution.verifiedOrders).toBe(0)
    })

    it('never turns a signed pending order or an unverified refund into purchase evidence', async () => {
        await inbound('כמה עולה?', { referral: metaReferral(AD_A, CAMPAIGN_A) })
        expect((await webhook(paid({ status: 'pending', customer_note: 'I paid', paymentVerified: true }))).body)
            .toMatchObject({ skipped: true, reason: 'wrong_status' })
        expect((await webhook(paid({ status: 'refunded' }))).body).toMatchObject({ skipped: true, reason: 'wrong_status' })
        expect(rows('sales_order_evidence')).toHaveLength(0)
        expect(rows('weddings')).toHaveLength(0)
        expect(boundary.smtp).not.toHaveBeenCalled()
        expect((await report()).body.purchaseAttribution.verifiedOrders).toBe(0)
    })

    it('has no ad attribution for an unlinked purchase and refuses unsigned purchase/report claims', async () => {
        const unauthenticatedInbound = await reply(new Request('https://example.test/api/sales-agent/reply', { method: 'POST',
            headers: { 'x-wt-secret': 'incorrect-synthetic-secret' }, body: JSON.stringify({ phone: CONTACT, eventId: 'synthetic-forged-transport',
                text: 'כמה עולה?', occurredAt: new Date(now).toISOString(), referral: metaReferral(AD_A, CAMPAIGN_A) }) }))
        expect(unauthenticatedInbound.status).toBe(401)
        expect(boundary.database.docs.size).toBe(0)
        const unsigned = await webhook(paid({ billing: { email: 'synthetic-other@example.invalid', phone: OTHER_CONTACT } }), 'invalid-signature')
        expect(unsigned.status).toBe(401)
        expect(boundary.database.docs.size).toBe(0)
        const unauthorizedReads = boundary.database.reads.length
        expect((await report({})).status).toBe(401)
        boundary.isAdmin.mockReturnValue(false)
        expect((await report()).status).toBe(403)
        expect(boundary.database.reads).toHaveLength(unauthorizedReads)
        boundary.isAdmin.mockReturnValue(true)
        vi.setSystemTime(now)
        expect((await webhook(paid({ billing: { email: 'synthetic-other@example.invalid', phone: OTHER_CONTACT } }))).status).toBe(200)
        expect((await report()).body.purchaseAttribution).toMatchObject({ verifiedOrders: 1, stronglyBoundOrders: 0,
            phoneAssociatedOrders: 0, unlinkedOrders: 1, unknownFirstTouchOrders: 1 })
        expect(boundary.auth.verifyIdToken).toHaveBeenCalledWith('synthetic-admin-token', true)
    })
})
