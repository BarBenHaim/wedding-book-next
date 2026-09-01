import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => {
    const weddings = new Map()
    const setCalls = []
    const verifyIdToken = vi.fn(async () => ({ email: 'admin@example.test' }))
    const reconcileWeddingSale = vi.fn(async () => ({ action: 'closed' }))
    const ref = id => ({
        get: vi.fn(async () => ({ exists: weddings.has(id), data: () => weddings.get(id) })),
        set: vi.fn(async (value, options) => {
            const current = weddings.get(id) || {}
            weddings.set(id, options?.merge ? { ...current, ...value } : value)
            setCalls.push({ id, value, options })
        }),
    })
    return {
        weddings, setCalls, verifyIdToken, reconcileWeddingSale,
        db: { collection: vi.fn(() => ({ doc: ref })) },
        reset() {
            weddings.clear()
            setCalls.length = 0
            verifyIdToken.mockClear()
            reconcileWeddingSale.mockReset()
            reconcileWeddingSale.mockResolvedValue({ action: 'closed' })
        },
    }
})

vi.mock('@/lib/firebaseAdmin', () => ({
    adminDb: harness.db,
    adminAuth: { verifyIdToken: harness.verifyIdToken },
}))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: () => true }))
vi.mock('@/lib/salesAgent/weddingSalesReconciliation', () => ({
    reconcileWeddingSale: harness.reconcileWeddingSale,
}))
vi.mock('@/lib/salesAgent/leads', () => ({ closeLeadOnPurchase: vi.fn() }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'SERVER_TIME' } }))

import { PATCH } from '@/app/api/admin/weddings/route'

function request(body, token = 'admin-token') {
    return new Request('http://localhost/api/admin/weddings', {
        method: 'PATCH',
        headers: token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    })
}

beforeEach(() => {
    harness.reset()
    harness.weddings.set('wed-test-one', {
        ownerName: 'שם ישן', ownerPhone: '0526618184', ownerEmail: 'old@example.test',
        amountPaid: 990, currency: 'ILS', eventType: 'bar_mitzvah', celebrantName: 'אריאל',
    })
})

describe('admin wedding payment reconciliation', () => {
    it('persists owner name and updatedAt, then reconciles the complete stored wedding', async () => {
        const response = await PATCH(request({ weddingId: 'wed-test-one', patch: { ownerName: ' דנה כהן ' } }))
        expect(response.status).toBe(200)
        expect(harness.weddings.get('wed-test-one')).toMatchObject({ ownerName: 'דנה כהן', updatedAt: 'SERVER_TIME' })
        expect(harness.reconcileWeddingSale).toHaveBeenCalledWith('wed-test-one', expect.objectContaining({
            ownerName: 'דנה כהן', ownerPhone: '0526618184', amountPaid: 990, celebrantName: 'אריאל',
        }), expect.objectContaining({ closeLeadOnPurchase: expect.any(Function) }))
        await expect(response.json()).resolves.toEqual({
            success: true, updated: ['ownerName'], reconciliation: 'closed',
        })
    })

    it('keeps the saved edit when reconciliation is temporarily unavailable', async () => {
        harness.reconcileWeddingSale.mockRejectedValueOnce(new Error('private provider body'))
        const response = await PATCH(request({ weddingId: 'wed-test-one', patch: { amountPaid: 1090 } }))
        expect(response.status).toBe(200)
        expect(harness.weddings.get('wed-test-one').amountPaid).toBe(1090)
        await expect(response.json()).resolves.toEqual({
            success: true, updated: ['amountPaid'], reconciliation: 'deferred',
        })
    })

    it('does not write or reconcile an unauthenticated request', async () => {
        const response = await PATCH(request({ weddingId: 'wed-test-one', patch: { amountPaid: 1090 } }, null))
        expect(response.status).toBe(403)
        expect(harness.setCalls).toHaveLength(0)
        expect(harness.reconcileWeddingSale).not.toHaveBeenCalled()
    })
})
