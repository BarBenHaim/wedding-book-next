import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebaseAdmin', () => ({ adminDb: {}, adminAuth: {} }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'SERVER_TIME' } }))

import { isVerifiedWooOrder, recordVerifiedSalesOutcome } from '@/app/api/createWedding/route'

const paidOrder = status => ({
    id: 'woo-order-test', status, total: '117.00',
    billing: { phone: 'non-dialable-route-lead' },
    line_items: [{ product_id: 42, sku: 'bar-mitzvah-book' }],
})

describe('WooCommerce verified sales boundary', () => {
    it.each(['processing', 'completed'])('accepts %s as paid', status => {
        expect(isVerifiedWooOrder(paidOrder(status))).toBe(true)
    })
    it.each(['pending', 'on-hold', 'failed', 'cancelled', 'refunded', 'checkout-draft'])('rejects %s as revenue', status => {
        expect(isVerifiedWooOrder(paidOrder(status))).toBe(false)
    })
    it('closes the lead with normalized order data only after verified payment', async () => {
        const close = vi.fn(async () => {})
        await expect(recordVerifiedSalesOutcome(paidOrder('processing'), close)).resolves.toBe(true)
        expect(close).toHaveBeenCalledWith({
            phone: 'non-dialable-route-lead', orderId: 'woo-order-test', weddingId: 'woo-order-test',
            amount: 117, packageId: 'bar-mitzvah-book',
        })
    })
    it('does not close a pending checkout', async () => {
        const close = vi.fn(async () => {})
        await expect(recordVerifiedSalesOutcome(paidOrder('pending'), close)).resolves.toBe(false)
        expect(close).not.toHaveBeenCalled()
    })
})
