import { beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'node:crypto'

const state = vi.hoisted(() => {
    const docs = new Map(), writes = []
    let queue = Promise.resolve(), failWrite = null
    const snap = key => ({ id: key.split('/').at(-1), exists: docs.has(key), data: () => docs.get(key) })
    const put = (key, value, opts) => {
        docs.set(key, opts?.merge ? { ...(docs.get(key) || {}), ...value } : value)
        writes.push({ key, value })
    }
    const ref = key => ({ key, id: key.split('/').at(-1), get: async () => snap(key), set: async (value, opts) => put(key, value, opts) })
    const query = (name, field, value, max = Infinity) => ({
        query: true, name, field, value, max,
        limit: n => query(name, field, value, n),
        get: async () => {
            const matches = [...docs.keys()].filter(key => key.startsWith(`${name}/`) && !key.slice(name.length + 1).includes('/') && docs.get(key)?.[field] === value).slice(0, max).map(snap)
            return { docs: matches, empty: !matches.length, size: matches.length }
        },
    })
    const db = {
        collection: name => ({ doc: id => ref(`${name}/${id}`), where: (field, op, value) => {
            if (op !== '==') throw Error('Unsupported fake query')
            return query(name, field, value)
        } }),
        runTransaction: work => {
            const run = queue.then(async () => {
                const staged = []
                let hasWritten = false
                const result = await work({
                    get: async target => {
                        if (hasWritten) throw Error('Read after transaction write')
                        return target.get()
                    },
                    set: (target, value, opts) => { hasWritten = true; staged.push({ target, value, opts }) },
                })
                if (failWrite && staged.some(w => failWrite(w.target.key, w.value))) { failWrite = null; throw Error('Synthetic commit failure') }
                for (const { target, value, opts } of staged) put(target.key, value, opts)
                return result
            })
            queue = run.catch(() => {})
            return run
        },
    }
    return {
        db, docs, writes,
        reset: () => { docs.clear(); writes.length = 0; queue = Promise.resolve(); failWrite = null },
        failNext: fn => { failWrite = fn },
        auth: { getUserByEmail: vi.fn(), createUser: vi.fn(), generatePasswordResetLink: vi.fn(), verifyIdToken: vi.fn() },
        sendMail: vi.fn(), createTransport: vi.fn(), closeLead: vi.fn(), recordEvidence: vi.fn(),
    }
})
vi.mock('@/lib/firebaseAdmin', () => ({ adminDb: state.db, adminAuth: state.auth }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'SERVER_TIME' } }))
vi.mock('nodemailer', () => ({ default: { createTransport: state.createTransport } }))
vi.mock('@/lib/salesAgent/leads', () => ({ closeLeadOnPurchase: state.closeLead, suppressBoundCheckoutLead: vi.fn(async () => ({ suppressed: false })) }))
vi.mock('@/lib/salesAgent/salesEvidence', () => ({ recordVerifiedOrderEvidence: state.recordEvidence }))

import { POST } from '@/app/api/createWedding/route'
import { GET } from '@/app/api/sales-agent/order-status/route'
import { claimOrderFulfillment, commitOrderBook, bindOrderOwner, ORDER_LEASE_MS } from '@/lib/salesAgent/orderFulfillment'
import { validateWooPayment, isVerifiedPayment, MAX_WOO_BODY_BYTES } from '@/lib/salesAgent/paymentTruth'
import { verifyWooSignature } from '@/lib/salesAgent/wooWebhook'

const SECRET = 'synthetic-webhook-secret-never-live'
const EMAIL = 'owner@example.invalid'
const UID = 'synthetic-owner'
const paid = (overrides = {}) => ({
    id: 81001, status: 'processing', total: '990.00', currency: 'ILS',
    date_paid_gmt: '2026-01-01T10:00:00', transaction_id: 'synthetic-transaction', payment_method: 'synthetic_gateway',
    billing: { email: EMAIL, first_name: '<not html>', phone: 'synthetic-non-dialable' },
    line_items: [{ product_id: 6271, variation_id: 0, quantity: 1, total: '990.00' }], ...overrides,
})
function request(body, signature = undefined) {
    const raw = typeof body === 'string' ? body : JSON.stringify(body)
    return new Request('https://app.weddingtales.co.il/api/createWedding', { method: 'POST', body: raw,
        headers: { 'x-wc-webhook-signature': signature ?? crypto.createHmac('sha256', SECRET).update(raw).digest('base64') },
    })
}
const statusReq = (orderId = '81001', token = UID, extra = '') => new Request(`https://app.weddingtales.co.il/api/sales-agent/order-status?orderId=${encodeURIComponent(orderId)}${extra}`, { headers: token ? { authorization: `Bearer ${token}` } : {} })
const books = () => [...state.docs.entries()].filter(([key]) => key.startsWith('weddings/'))

beforeEach(() => {
    state.reset()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv('WC_WEBHOOK_SECRET', SECRET)
    vi.stubEnv('SALES_CONVERSATIONAL_POLICY_ENABLED', 'true')
    vi.stubEnv('MAIL_USER', 'sender@example.invalid')
    vi.stubEnv('MAIL_PASS', 'synthetic-test-password')
    state.auth.getUserByEmail.mockReset().mockResolvedValue({ uid: UID })
    state.auth.createUser.mockReset().mockResolvedValue({ uid: UID })
    state.auth.generatePasswordResetLink.mockReset().mockResolvedValue('https://synthetic.firebaseapp.com/__/auth/action?oobCode=private-setup-token')
    state.auth.verifyIdToken.mockReset().mockImplementation(async token => ({ uid: token }))
    state.createTransport.mockReset().mockReturnValue({ sendMail: state.sendMail })
    state.sendMail.mockReset().mockImplementation(async message => {
        expect(state.docs.get('weddings/81001')).toBeTruthy()
        expect(state.docs.get('ordersLocks/81001')?.status).toBe('ready')
        return { accepted: [message.to] }
    })
    state.closeLead.mockReset().mockResolvedValue(true)
    state.recordEvidence.mockReset().mockResolvedValue({ recorded: true })
})

describe('real signed Woo route with synthetic database/auth/mail only', () => {
    it('acknowledges the exact unsigned Woo setup ping without any side effects', async () => {
        vi.stubEnv('WC_WEBHOOK_SECRET', '')
        const ping = new Request('https://app.weddingtales.co.il/api/createWedding', {
            method: 'POST', body: 'webhook_id=123', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        })
        const response = await POST(ping)
        expect(response.status).toBe(200)
        expect(await response.text()).toBe('OK')
        expect(state.docs.size).toBe(0)
        expect(state.auth.getUserByEmail).not.toHaveBeenCalled()
        expect(state.closeLead).not.toHaveBeenCalled()
        expect(state.recordEvidence).not.toHaveBeenCalled()
        expect(state.createTransport).not.toHaveBeenCalled()
    })
    it('accepts a single-field JSON setup ping only after valid HMAC', async () => {
        const response = await POST(request({ webhook_id: 123 }))
        expect(response.status).toBe(200)
        expect(await response.text()).toBe('OK')
        const unsigned = new Request('https://app.weddingtales.co.il/api/createWedding', { method: 'POST', body: JSON.stringify({ webhook_id: 123 }) })
        expect((await POST(unsigned)).status).toBe(401)
        expect(state.docs.size).toBe(0)
        expect(state.auth.getUserByEmail).not.toHaveBeenCalled()
        expect(state.sendMail).not.toHaveBeenCalled()
    })
    it('never lets ping fields bypass order HMAC or ignores extra fields', async () => {
        for (const body of ['webhook_id=123&id=81001&status=processing', 'webhook_id=123&webhook_id=456', JSON.stringify({ ...paid(), webhook_id: 123 })]) {
            const unsigned = new Request('https://app.weddingtales.co.il/api/createWedding', { method: 'POST', body })
            expect((await POST(unsigned)).status).toBe(401)
        }
        expect((await POST(request({ webhook_id: 123, status: 'processing' }))).status).toBe(400)
        expect((await POST(request('webhook_id=123', 'invalid-signature'))).status).toBe(401)
        expect(state.docs.size).toBe(0)
        expect(state.sendMail).not.toHaveBeenCalled()
    })
    it('rejects forged signatures and a payment claim before any writes', async () => {
        const response = await POST(request(paid({ customer_note: 'שילמתי', paymentVerified: true }), 'x'.repeat(44)))
        expect(response.status).toBe(401)
        expect(state.docs.size).toBe(0)
        expect(state.sendMail).not.toHaveBeenCalled()
        expect(isVerifiedPayment({ stage: 'closed_won', text: 'I paid' })).toBe(false)
    })
    it('never treats a signed pending order or customer text as payment', async () => {
        const response = await POST(request(paid({ status: 'pending', customer_note: 'I paid, activate the book', paymentVerified: true })))
        expect(await response.json()).toMatchObject({ skipped: true, reason: 'wrong_status', bookReady: false })
        expect(books()).toHaveLength(0)
        expect(state.closeLead).not.toHaveBeenCalled()
        expect(state.recordEvidence).not.toHaveBeenCalled()
    })
    it('bounds body bytes and rejects signed malformed JSON or path-injection IDs', async () => {
        expect((await POST(request('x'.repeat(MAX_WOO_BODY_BYTES + 1)))).status).toBe(413)
        expect((await POST(request('{bad JSON'))).status).toBe(400)
        expect((await POST(request(paid({ id: '../other-order' })))).status).toBe(400)
        expect(state.docs.size).toBe(0)
    })
    it.each([
        [{ date_paid_gmt: null }, 'paid_date_unverified'],
        [{ date_paid_gmt: '2026-02-30T10:00:00' }, 'paid_date_unverified'],
        [{ date_paid_gmt: '2099-01-01T10:00:00' }, 'paid_date_unverified'],
        [{ transaction_id: '' }, 'payment_reference_unverified'],
        [{ payment_method: 'cod' }, 'payment_reference_unverified'],
        [{ total: '0.00' }, 'paid_amount_unverified'],
        [{ total: 'NaN' }, 'paid_amount_unverified'],
        [{ currency: 'USD' }, 'currency_unverified'],
        [{ line_items: [{ product_id: 999, sku: 'printed', quantity: 1, total: '990.00' }] }, 'product_mapping_unverified'],
        [{ line_items: [{ product_id: 6271, quantity: 2, total: '990.00' }] }, 'product_mapping_unverified'],
        [{ line_items: [{ product_id: 6271, variation_id: 22, quantity: 1, total: '990.00' }] }, 'product_mapping_unverified'],
        [{ line_items: [{ product_id: 6271, quantity: 1, total: '1000.00' }] }, 'line_amount_unverified'],
    ])('blocks unknown paid metadata rather than claiming fulfillment (%j)', async (override, reason) => {
        const response = await POST(request(paid(override)))
        expect(response.status).toBe(202)
        expect(await response.json()).toMatchObject({ fulfillment: 'review_required', reason, bookReady: false })
        expect(state.docs.get('order_fulfillment_reviews/81001')).toMatchObject({ reason, status: 'pending' })
        expect(books()).toHaveLength(0)
        expect(state.closeLead).not.toHaveBeenCalled()
        expect(state.recordEvidence).not.toHaveBeenCalled()
        expect(state.sendMail).not.toHaveBeenCalled()
    })
    it('resolves an earlier metadata review only after a valid payment creates the book', async () => {
        await POST(request(paid({ transaction_id: '' })))
        expect(state.docs.get('order_fulfillment_reviews/81001').status).toBe('pending')
        expect(books()).toHaveLength(0)
        expect(await (await POST(request(paid()))).json()).toMatchObject({ success: true, bookReady: true })
        expect(state.docs.get('order_fulfillment_reviews/81001').status).toBe('resolved')
        expect(await (await GET(statusReq())).json()).toMatchObject({ paymentVerified: true, bookReady: true })
    })
    it('keeps legacy paid checkout compatible when the rollout flag is off', async () => {
        vi.stubEnv('SALES_CONVERSATIONAL_POLICY_ENABLED', 'false')
        const response = await POST(request(paid({ date_paid_gmt: null, transaction_id: '', line_items: [{ product_id: 42 }] })))
        expect(await response.json()).toMatchObject({ success: true, weddingId: '81001', bookReady: true, confirmation: 'accepted' })
        expect(books()).toHaveLength(1)
    })
    it('creates a stable book before one confirmation, with separate owner/guest links', async () => {
        const response = await POST(request(paid()))
        expect(await response.json()).toMatchObject({ success: true, weddingId: '81001', bookReady: true, confirmation: 'accepted' })
        expect(books()).toHaveLength(1)
        expect(state.docs.get('ordersLocks/81001')).toMatchObject({ ownerId: UID, status: 'ready', payment: { verified: true, strict: true } })
        expect(state.docs.get('order_confirmation_outbox/81001')).toMatchObject({ state: 'accepted' })
        expect(state.closeLead.mock.calls.map(([input]) => input.weddingId)).toEqual([null, '81001'])
        expect(state.recordEvidence).toHaveBeenCalledWith({ order: paid(), db: state.db, trustedSource: true })
        expect(state.sendMail).toHaveBeenCalledTimes(1)
        const mail = state.sendMail.mock.calls[0][0]
        expect(mail.html).toContain('/wedding/81001/admin')
        expect(mail.html).toContain('/wedding/81001/photo')
        expect(mail.html).not.toContain('/book/')
        expect(mail.html).not.toContain('<not html>')
        expect(mail.messageId).toMatch(/^<order-[a-f0-9]{64}@app\.weddingtales\.co\.il>$/)
    })
    it('handles sequential and simultaneous duplicate webhooks with one book and one confirmation', async () => {
        const responses = await Promise.all(Array.from({ length: 8 }, () => POST(request(paid()))))
        expect(responses.every(r => [200, 202].includes(r.status))).toBe(true)
        const initial = structuredClone(state.docs.get('weddings/81001'))
        await POST(request(paid()))
        await POST(request(paid({ status: 'completed' })))
        expect(books()).toHaveLength(1)
        expect(state.docs.get('weddings/81001')).toEqual(initial)
        expect(state.writes.filter(w => w.key === 'weddings/81001')).toHaveLength(1)
        expect(state.sendMail).toHaveBeenCalledTimes(1)
    })
    it('does not recreate a book or resend a historical unrecorded confirmation', async () => {
        const legacy = { orderId: '81001', ownerId: UID, ownerEmail: EMAIL, digitalTokens: ['original-secret'], slug: 'old-slug' }
        state.docs.set('weddings/legacy-book', legacy)
        const response = await POST(request(paid()))
        expect(await response.json()).toMatchObject({ success: true, weddingId: 'legacy-book', skipped: true, confirmation: 'legacy_unknown' })
        expect(books()).toEqual([['weddings/legacy-book', legacy]])
        expect(state.sendMail).not.toHaveBeenCalled()
    })
    it('blocks an existing book owned by someone else and changed billing identity on replay', async () => {
        state.docs.set('weddings/81001', { orderId: '81001', ownerId: 'foreign', ownerEmail: 'foreign@example.invalid' })
        expect(await (await POST(request(paid()))).json()).toMatchObject({ fulfillment: 'review_required', bookReady: false })
        expect(state.sendMail).not.toHaveBeenCalled()
        state.reset()
        await POST(request(paid()))
        const response = await POST(request(paid({ billing: { email: 'other@example.invalid' } })))
        expect(await response.json()).toMatchObject({ fulfillment: 'review_required', reason: 'order_identity_changed' })
        expect(state.sendMail).toHaveBeenCalledTimes(1)
    })
    it('does not adopt an owner-editable book as proof of billing-email ownership', async () => {
        state.docs.set('weddings/attacker-book', { orderId: '81001', ownerId: 'attacker', ownerEmail: EMAIL })
        expect(await (await POST(request(paid()))).json()).toMatchObject({ fulfillment: 'review_required', reason: 'book_owner_conflict' })
        expect(state.docs.get('ordersLocks/81001')).toBeUndefined()
        expect(state.sendMail).not.toHaveBeenCalled()
        expect((await GET(statusReq('81001', 'attacker'))).status).toBe(404)
    })
    it('recovers Auth errors without creating a user for arbitrary failures', async () => {
        state.auth.getUserByEmail.mockRejectedValueOnce(Object.assign(Error('Synthetic outage'), { code: 'auth/internal-error' }))
        expect((await POST(request(paid()))).status).toBe(500)
        expect(state.auth.createUser).not.toHaveBeenCalled()
        expect(state.closeLead).toHaveBeenCalledWith(expect.objectContaining({ orderId: '81001', weddingId: null }))
        expect(state.docs.get('ordersLocks/81001')).toBeUndefined()
        expect(state.sendMail).not.toHaveBeenCalled()
        expect(await (await POST(request(paid()))).json()).toMatchObject({ success: true })
        expect(books()).toHaveLength(1)
        expect(state.sendMail).toHaveBeenCalledTimes(1)
    })
    it('recovers old permanent locks and handles an Auth create email race', async () => {
        state.docs.set('ordersLocks/81001', { createdAt: 'legacy' })
        state.auth.getUserByEmail.mockRejectedValueOnce(Object.assign(Error('absent'), { code: 'auth/user-not-found' }))
        state.auth.createUser.mockRejectedValueOnce(Object.assign(Error('race'), { code: 'auth/email-already-exists' }))
        expect(await (await POST(request(paid()))).json()).toMatchObject({ success: true })
        expect(state.auth.createUser).toHaveBeenCalledTimes(1)
        expect(state.auth.getUserByEmail).toHaveBeenCalledTimes(2)
        expect(state.auth.createUser.mock.calls[0][0].password.length).toBeGreaterThanOrEqual(32)
        expect(state.sendMail.mock.calls[0][0].html).not.toContain(state.auth.createUser.mock.calls[0][0].password)
    })
    it('never emails before book commit and recovers a failed book transaction', async () => {
        state.failNext(key => key === 'weddings/81001')
        expect((await POST(request(paid()))).status).toBe(500)
        expect(books()).toHaveLength(0)
        expect(state.docs.get('ordersLocks/81001')).toMatchObject({ status: 'failed' })
        expect(state.sendMail).not.toHaveBeenCalled()
        expect(state.docs.get('order_confirmation_outbox/81001')).toBeUndefined()
        // Payment is true but a prepared URL is not a created book.
        expect(await (await GET(statusReq())).json()).toMatchObject({ paymentVerified: true, bookReady: false, bookStatus: 'preparing', ownerUrl: null, guestUrl: null })
        expect(await (await POST(request(paid()))).json()).toMatchObject({ success: true, confirmation: 'accepted' })
        expect(books()).toHaveLength(1)
        expect(state.sendMail).toHaveBeenCalledTimes(1)
    })
    it('fences an expired worker after a newer lease is claimed', async () => {
        const order = paid(), payment = validateWooPayment(order, { strict: true, trustedSource: true })
        state.docs.set('ordersRaw/81001', { body: order, signatureVerified: true })
        const first = await claimOrderFulfillment(state.db, order, payment, { nowMs: 1000, leaseToken: 'first', verifiedOwnerId: UID })
        const second = await claimOrderFulfillment(state.db, order, payment, { nowMs: 1001 + ORDER_LEASE_MS, leaseToken: 'second', verifiedOwnerId: UID })
        expect(second.fence).toBe(first.fence + 1)
        const book = { orderId: '81001', ownerId: UID, ownerEmail: EMAIL }
        expect(await bindOrderOwner(state.db, first, UID, { nowMs: 1002 + ORDER_LEASE_MS })).toBe(false)
        expect(await commitOrderBook(state.db, first, book, { nowMs: 1002 + ORDER_LEASE_MS })).toEqual({ status: 'lost_claim' })
        expect(books()).toHaveLength(0)
        expect(await commitOrderBook(state.db, second, book, { nowMs: 1002 + ORDER_LEASE_MS })).toMatchObject({ status: 'ready' })
        expect(books()).toHaveLength(1)
    })
    it('does not repeat SMTP after an ambiguous error or receipt persistence failure', async () => {
        state.sendMail.mockRejectedValueOnce(Error('synthetic timeout after possible acceptance'))
        expect(await (await POST(request(paid()))).json()).toMatchObject({ success: true, confirmation: 'uncertain' })
        await POST(request(paid()))
        expect(state.sendMail).toHaveBeenCalledTimes(1)
        state.reset(); state.sendMail.mockClear()
        state.failNext((key, value) => key === 'order_confirmation_outbox/81001' && value.state === 'accepted')
        expect(await (await POST(request(paid()))).json()).toMatchObject({ success: true, confirmation: 'uncertain' })
        await POST(request(paid()))
        expect(state.sendMail).toHaveBeenCalledTimes(1)
    })
    it('retries preparation/configuration failures because SMTP was not attempted', async () => {
        vi.stubEnv('MAIL_PASS', '')
        expect(await (await POST(request(paid()))).json()).toMatchObject({ confirmation: 'pending_configuration' })
        expect(state.sendMail).not.toHaveBeenCalled()
        vi.stubEnv('MAIL_PASS', 'synthetic')
        state.auth.generatePasswordResetLink.mockRejectedValueOnce(Error('synthetic preparation error'))
        expect(await (await POST(request(paid()))).json()).toMatchObject({ confirmation: 'pending_preparation' })
        expect(state.sendMail).not.toHaveBeenCalled()
        expect(await (await POST(request(paid()))).json()).toMatchObject({ confirmation: 'accepted' })
        expect(state.sendMail).toHaveBeenCalledTimes(1)
    })
    it('blocks book creation when a refund arrives during owner lookup', async () => {
        let entered, resume
        const started = new Promise(resolve => { entered = resolve })
        state.auth.getUserByEmail.mockImplementationOnce(() => {
            entered()
            return new Promise(resolve => { resume = resolve })
        })
        const creating = POST(request(paid()))
        await started
        await POST(request(paid({ status: 'refunded' })))
        resume({ uid: UID })
        expect(await (await creating).json()).toMatchObject({ fulfillment: 'review_required', reason: 'payment_snapshot_changed', bookReady: false })
        expect(books()).toHaveLength(0)
        expect(state.sendMail).not.toHaveBeenCalled()
    })
    it('rechecks payment after book creation and before claiming confirmation dispatch', async () => {
        let entered, resume
        const started = new Promise(resolve => { entered = resolve })
        state.auth.generatePasswordResetLink.mockImplementationOnce(() => {
            entered()
            return new Promise(resolve => { resume = resolve })
        })
        const creating = POST(request(paid()))
        await started
        expect(books()).toHaveLength(1)
        await POST(request(paid({ status: 'refunded' })))
        resume('https://synthetic.firebaseapp.com/__/auth/action?oobCode=private-setup-token')
        expect(await (await creating).json()).toMatchObject({ fulfillment: 'review_required', reason: 'payment_or_book_state_changed', bookReady: false })
        expect(state.sendMail).not.toHaveBeenCalled()
        expect(await (await GET(statusReq())).json()).toMatchObject({ paymentVerified: false, bookReady: false, ownerUrl: null, guestUrl: null })
    })
    it('does not resurrect a refunded order or process older provider revisions', async () => {
        await POST(request(paid({ status: 'refunded', date_modified_gmt: '2026-01-03T10:00:00' })))
        const stale = await POST(request(paid({ date_modified_gmt: '2026-01-02T10:00:00' })))
        expect(await stale.json()).toMatchObject({ skipped: true, reason: 'stale_order_event' })
        const unknownRevision = await POST(request(paid()))
        expect(await unknownRevision.json()).toMatchObject({ fulfillment: 'review_required', reason: 'refunded_order_requires_review' })
        expect(state.docs.get('ordersRaw/81001').body.status).toBe('refunded')
        expect(books()).toHaveLength(0)
        expect(state.sendMail).not.toHaveBeenCalled()
    })
    it('does not recreate a book removed after a ready order', async () => {
        await POST(request(paid()))
        state.docs.delete('weddings/81001')
        expect(await (await POST(request(paid()))).json()).toMatchObject({ fulfillment: 'review_required', reason: 'book_missing_after_ready', bookReady: false })
        expect(books()).toHaveLength(0)
        expect(state.sendMail).toHaveBeenCalledTimes(1)
    })
})

describe('authenticated minimal order status', () => {
    it('requires owner UID and order/book match; email/phone/query identity is insufficient', async () => {
        await POST(request(paid()))
        expect((await GET(statusReq('81001', null))).status).toBe(401)
        expect((await GET(statusReq('81001', 'other-owner', `&verifiedCustomerId=${UID}&email=${EMAIL}`))).status).toBe(404)
        expect((await GET(statusReq('81002', UID))).status).toBe(404)
        const response = await GET(statusReq())
        expect(response.status).toBe(200)
        expect(response.headers.get('cache-control')).toContain('no-store')
        expect(await response.json()).toEqual({
            ok: true, orderId: '81001', paymentVerified: true, paymentStatus: 'verified', bookReady: true, bookStatus: 'ready',
            ownerUrl: 'https://app.weddingtales.co.il/wedding/81001/admin', ownerUrlRequiresAuth: true,
            guestUrl: 'https://app.weddingtales.co.il/wedding/81001/photo',
        })
        expect(state.auth.verifyIdToken).toHaveBeenCalledWith(UID, true)
        state.docs.get('weddings/81001').ownerId = 'other-owner'
        expect((await GET(statusReq())).status).toBe(404)
    })
    it('rejects revoked/invalid tokens without querying an order', async () => {
        state.auth.verifyIdToken.mockRejectedValueOnce(Error('revoked'))
        expect((await GET(statusReq())).status).toBe(401)
        expect(state.docs.size).toBe(0)
    })
    it('does not leak capability URLs, tokens, contact data or private guest content', async () => {
        await POST(request(paid()))
        state.docs.get('weddings/81001').guestContent = 'private blessing'
        state.docs.get('weddings/81001').arrangeToken = 'private-arrange'
        const result = await (await GET(statusReq())).text()
        for (const value of [EMAIL, 'private blessing', 'private-arrange', 'digitalTokens', 'private-setup-token', 'ownerPhone', 'amountPaid']) expect(result).not.toContain(value)
        expect(result).not.toContain('/book/')
        expect(result).not.toContain('/arrange/')
    })
    it('withholds ready URLs if trusted current payment is missing or refunded', async () => {
        await POST(request(paid()))
        state.docs.get('ordersRaw/81001').signatureVerified = false
        expect(await (await GET(statusReq())).json()).toMatchObject({ paymentVerified: false, bookReady: false, ownerUrl: null, guestUrl: null })
        await POST(request(paid({ status: 'refunded' })))
        expect(state.recordEvidence).toHaveBeenCalledWith({ order: paid({ status: 'refunded' }), db: state.db, trustedSource: true })
        expect(await (await GET(statusReq())).json()).toMatchObject({ paymentVerified: false, bookReady: false, ownerUrl: null, guestUrl: null })
    })
})

describe('payment proof helpers', () => {
    it('validates canonical bounded HMAC and demands trusted source in strict mode', () => {
        const buffer = Buffer.from(JSON.stringify(paid()))
        const signature = crypto.createHmac('sha256', SECRET).update(buffer).digest('base64')
        expect(verifyWooSignature(buffer, signature, SECRET)).toBe(true)
        for (const malformed of ['', signature.slice(0, -1), `${signature} `, 'A'.repeat(1000)]) expect(verifyWooSignature(buffer, malformed, SECRET)).toBe(false)
        expect(verifyWooSignature(Buffer.from('different'), signature, SECRET)).toBe(false)
        expect(validateWooPayment(paid(), { strict: true }).reason).toBe('untrusted_payment_source')
    })
})
