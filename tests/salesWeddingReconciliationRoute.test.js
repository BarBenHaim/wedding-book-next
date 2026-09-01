import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => {
    const rows = []
    const closeLeadOnPurchase = vi.fn(async ({ phone }) => phone)
    return {
        rows,
        closeLeadOnPurchase,
        db: {
            collection: vi.fn(() => ({
                limit: vi.fn(() => ({
                    get: vi.fn(async () => ({
                        docs: rows.map(row => ({ id: row.id, data: () => row.data })),
                    })),
                })),
            })),
        },
        reset() {
            rows.splice(0, rows.length,
                { id: 'wed-route-paid', data: { amountPaid: 990, currency: 'ILS', ownerPhone: '0526618184' } },
                { id: 'wed-route-unmatched', data: { amountPaid: 990, currency: 'ILS', ownerPhone: '' } },
                { id: 'wed-route-woo', data: { amountPaid: 990, currency: 'ILS', ownerPhone: '0526618184', orderId: 'woo-route-one' } },
                { id: 'wed-route-unpaid', data: { amountPaid: 0, currency: 'ILS', ownerPhone: '0526618184' } },
            )
            closeLeadOnPurchase.mockReset()
            closeLeadOnPurchase.mockImplementation(async ({ phone }) => phone)
        },
    }
})

vi.mock('@/lib/firebaseAdmin', () => ({
    adminDb: harness.db,
    adminAuth: { verifyIdToken: vi.fn(async () => ({ email: 'admin@example.test' })) },
}))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: () => true }))
vi.mock('@/lib/salesAgent/leads', () => ({ closeLeadOnPurchase: harness.closeLeadOnPurchase }))

import { POST } from '@/app/api/sales-agent/wedding-sales-reconcile/route'

function request(mode = 'dry', secret = 'route-secret') {
    return new Request(`http://localhost/api/sales-agent/wedding-sales-reconcile?mode=${mode}`, {
        method: 'POST',
        headers: secret ? { 'x-wt-secret': secret } : {},
    })
}

beforeEach(() => {
    process.env.SALES_AGENT_SECRET = 'route-secret'
    harness.reset()
})

describe('Wedding sales reconciliation route', () => {
    it('rejects requests before reading Firestore', async () => {
        const response = await POST(request('dry', null))
        expect(response.status).toBe(401)
        expect(harness.db.collection).not.toHaveBeenCalled()
    })

    it('reports aggregate dry-run truth without closing leads', async () => {
        const response = await POST(request('dry'))
        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({
            scanned: 4, eligible: 2, closed: 0, unmatchedPhone: 1,
            linkedWoo: 1, notPaid: 1, unsupportedCurrency: 0, failed: 0,
        })
        expect(harness.closeLeadOnPurchase).not.toHaveBeenCalled()
    })

    it('applies exact-phone closures and remains private', async () => {
        const response = await POST(request('apply'))
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body).toEqual({
            scanned: 4, eligible: 2, closed: 1, unmatchedPhone: 1,
            linkedWoo: 1, notPaid: 1, unsupportedCurrency: 0, failed: 0,
        })
        expect(JSON.stringify(body)).not.toMatch(/052|972|wed-route|woo-route/)
        expect(harness.closeLeadOnPurchase).toHaveBeenCalledTimes(1)
    })

    it('rejects unsupported modes', async () => {
        const response = await POST(request('erase'))
        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toEqual({ error: 'INVALID_MODE' })
    })
})
