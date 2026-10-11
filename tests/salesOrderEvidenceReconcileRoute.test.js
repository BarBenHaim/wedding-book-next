import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ verify: vi.fn(), admin: vi.fn(), get: vi.fn(), record: vi.fn(), collection: vi.fn(), suppress: vi.fn() }))
vi.mock('@/lib/firebaseAdmin', () => ({ adminAuth: { verifyIdToken: mocks.verify }, adminDb: { collection: mocks.collection } }))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: mocks.admin }))
vi.mock('@/lib/salesAgent/salesEvidence', async original => ({ ...(await original()), recordVerifiedOrderEvidence: mocks.record }))
vi.mock('@/lib/salesAgent/leads', () => ({ suppressBoundCheckoutLead: mocks.suppress }))
import { GET, POST } from '@/app/api/sales-agent/order-evidence/reconcile/route'
const request = (body = { action: 'reconcile', orderId: '91001' }, token = 'synthetic-admin') => new Request('https://app.example.invalid/api/sales-agent/order-evidence/reconcile', {
    method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: typeof body === 'string' ? body : JSON.stringify(body),
})
beforeEach(() => {
    vi.clearAllMocks()
    mocks.verify.mockResolvedValue({ uid: 'synthetic-admin', email: 'admin@example.invalid', email_verified: true })
    mocks.admin.mockReturnValue(true)
    mocks.collection.mockImplementation(() => ({ doc: () => ({ get: mocks.get }) }))
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ signatureVerified: true, body: { id: 91001, status: 'processing', privateNote: 'must not be returned' } }) })
    mocks.record.mockResolvedValue({ recorded: true, duplicate: true, deferred: false })
    mocks.suppress.mockResolvedValue({ suppressed: true })
})
describe('authenticated manual order evidence recovery', () => {
    it('exposes a bounded single-order attribution audit without contact, click or URL credentials', async () => {
        mocks.get.mockResolvedValue({ exists: true, data: () => ({ provider: 'woocommerce_signed_webhook', paymentConfidence: 'verified_paid',
            status: 'paid', currency: 'ILS', grossMinor: 99000, refundedMinor: 0, paidAtMs: Date.now() + 60000,
            bindingConfidence: 'verified_checkout_binding', contactHash: 'private-contact',
            sourceSnapshot: { firstTouch: { source: 'meta_ad', adId: 'synthetic-ad', confidence: 'authenticated_transport', ctwaClid: 'private-click', url: 'private-key' } },
        }) })
        const response = await GET(new Request('https://app.example.invalid/api/sales-agent/order-evidence/reconcile?orderId=91001', { headers: { authorization: 'Bearer synthetic-admin' } }))
        const result = await response.json()
        expect(result).toMatchObject({ ok: true, orderId: '91001', purchaseAttribution: { verifiedOrders: 1, stronglyBoundOrders: 1, knownFirstTouchAdOrders: 1 } })
        expect(JSON.stringify(result)).not.toMatch(/private-contact|private-click|private-key/)
        expect(mocks.record).not.toHaveBeenCalled()
        expect(mocks.suppress).not.toHaveBeenCalled()
    })
    it('does not expose single-order evidence without authorization', async () => {
        expect((await GET(new Request('https://app.example.invalid/api/sales-agent/order-evidence/reconcile?orderId=91001'))).status).toBe(401)
        expect(mocks.collection).not.toHaveBeenCalled()
    })
    it('requires authentication before reading stored payment data', async () => {
        expect((await POST(request(undefined, null))).status).toBe(401)
        expect(mocks.collection).not.toHaveBeenCalled()
    })
    it.each([{ email_verified: false }, { uid: '' }])('rejects insufficient verified identity %j', async patch => {
        mocks.verify.mockResolvedValue({ uid: 'synthetic-admin', email: 'admin@example.invalid', email_verified: true, ...patch })
        expect((await POST(request())).status).toBe(403)
        expect(mocks.collection).not.toHaveBeenCalled()
    })
    it('requires superadmin and checks token revocation', async () => {
        mocks.admin.mockReturnValue(false)
        expect((await POST(request())).status).toBe(403)
        expect(mocks.verify).toHaveBeenCalledWith('synthetic-admin', true)
    })
    it.each([{ orderId: '91001' }, { action: 'reconcile', orderId: '../private' }, { action: 'reconcile', orderId: '91001', order: { paid: true } }, '{bad'])('rejects payload or arbitrary order data %j', async body => {
        expect((await POST(request(body))).status).toBe(400)
        expect(mocks.collection).not.toHaveBeenCalled()
    })
    it.each([null, { signatureVerified: false, body: { id: 91001 } }, { signatureVerified: true, body: { id: 91002 } }])('requires the matching previously signed snapshot %j', async raw => {
        mocks.get.mockResolvedValue({ exists: !!raw, data: () => raw })
        expect((await POST(request())).status).toBe(409)
        expect(mocks.record).not.toHaveBeenCalled()
    })
    it('replays only the analytical boundary and returns no order/customer content', async () => {
        const response = await POST(request())
        expect(response.headers.get('cache-control')).toBe('private, no-store')
        expect(await response.json()).toEqual({ recorded: true, duplicate: true, deferred: false, reason: null, salesSuppressed: true })
        expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ trustedSource: true, order: expect.objectContaining({ id: 91001 }) }))
    })
    it('reports durable pending recovery honestly', async () => {
        mocks.record.mockResolvedValue({ recorded: true, duplicate: true, deferred: true, reason: 'binding_source_unavailable' })
        expect(await (await POST(request())).json()).toMatchObject({ recorded: true, deferred: true })
    })
    it('withholds private exception details on failure', async () => {
        mocks.record.mockRejectedValue(new Error('private provider detail'))
        const response = await POST(request())
        expect(response.status).toBe(503)
        expect(await response.json()).toEqual({ error: 'order_evidence_unavailable' })
    })
})
