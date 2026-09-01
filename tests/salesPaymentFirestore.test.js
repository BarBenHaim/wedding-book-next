import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => {
    const docs = new Map()
    const writes = []
    const ref = key => ({
        key,
        get: async () => ({ exists: docs.has(key), data: () => docs.get(key) }),
        set: async (value, options) => {
            const old = docs.get(key) || {}
            docs.set(key, options?.merge ? { ...old, ...value } : value)
            writes.push({ key, value })
        },
    })
    const db = {
        collection: name => ({ doc: id => ref(`${name}/${id}`) }),
        runTransaction: async work => {
            const staged = []
            const result = await work({
                get: async target => ({ exists: docs.has(target.key), data: () => docs.get(target.key) }),
                set: (target, value, options) => staged.push({ target, value, options }),
            })
            for (const { target, value, options } of staged) {
                const old = docs.get(target.key) || {}
                docs.set(target.key, options?.merge ? { ...old, ...value } : value)
                writes.push({ key: target.key, value })
            }
            return result
        },
        batch: () => ({ set: vi.fn(), commit: vi.fn(async () => {}) }),
    }
    return {
        db,
        reset() { docs.clear(); writes.length = 0 },
        get(key) { return docs.get(key) },
        set(key, value) { docs.set(key, value) },
        writes() { return [...writes] },
    }
})

vi.mock('@/lib/firebaseAdmin', () => ({ adminDb: store.db }))
vi.mock('@/lib/salesAgent/agent', () => ({ normalizePhone: value => String(value || '').trim() }))
vi.mock('firebase-admin/firestore', () => ({
    FieldValue: {
        serverTimestamp: () => 'SERVER_TIME',
        increment: value => ({ operation: 'increment', value }),
        arrayUnion: (...items) => ({ operation: 'arrayUnion', items }),
    },
}))

import { closeLeadOnPurchase } from '@/lib/salesAgent/leads'

beforeEach(() => store.reset())

describe('verified sales payment persistence', () => {
    it('stores an explicit verified payment fact on the matching lead', async () => {
        await closeLeadOnPurchase({
            phone: 'non-dialable-payment-lead-one', orderId: 'order-test-one',
            weddingId: 'wedding-test-one', amount: 117, packageId: 'bar-mitzvah-book',
        })
        expect(store.get('sales_leads/non-dialable-payment-lead-one')).toMatchObject({
            stage: 'closed_won', paymentVerified: true, paymentVerifiedAt: 'SERVER_TIME',
            verifiedOrderId: 'order-test-one', weddingId: 'wedding-test-one', amount: 117,
            packageInterest: 'bar-mitzvah-book', followUpAt: null,
        })
    })

    it('requires an order identity before it can claim payment verification', async () => {
        await closeLeadOnPurchase({ phone: 'non-dialable-payment-lead-two', amount: 117 })
        expect(store.get('sales_leads/non-dialable-payment-lead-two')).toMatchObject({ stage: 'closed_won' })
        expect(store.get('sales_leads/non-dialable-payment-lead-two')).not.toHaveProperty('paymentVerified')
    })

    it('attributes the same paid order only once when its webhook is replayed', async () => {
        store.set('sales_leads/non-dialable-payment-lead-three', { mediaSent: ['demo-book'] })
        const order = { phone: 'non-dialable-payment-lead-three', orderId: 'order-replayed', amount: 117 }
        await closeLeadOnPurchase(order)
        await closeLeadOnPurchase(order)
        expect(store.writes().filter(write => write.key.startsWith('sales_verified_orders/'))).toHaveLength(1)
        expect(store.get('sales_leads/non-dialable-payment-lead-three')).toMatchObject({
            paymentVerified: true, verifiedOrderId: 'order-replayed',
        })
    })

    it('refreshes mutable Wedding facts on replay without crediting the order twice', async () => {
        const initial = {
            phone: 'non-dialable-payment-lead-four', orderId: 'manual-wedding:wedding-test-four',
            weddingId: 'wedding-test-four', amount: 990, buyerName: 'דנה', paymentSource: 'wedding_app_manual',
        }
        await closeLeadOnPurchase(initial)
        await closeLeadOnPurchase({ ...initial, amount: 1090, buyerName: 'דנה כהן' })

        expect(store.get('sales_leads/non-dialable-payment-lead-four')).toMatchObject({
            stage: 'closed_won', followUpAt: null, amount: 1090, name: 'דנה כהן',
            weddingId: 'wedding-test-four', paymentSource: 'wedding_app_manual',
            paymentVerified: true, verifiedOrderId: 'manual-wedding:wedding-test-four',
        })
        expect(store.writes().filter(write => write.key.startsWith('sales_verified_orders/'))).toHaveLength(1)
    })

    it('does not replace a useful lead name with an empty buyer name', async () => {
        store.set('sales_leads/non-dialable-payment-lead-five', { name: 'לקוחה קיימת' })
        await closeLeadOnPurchase({
            phone: 'non-dialable-payment-lead-five', orderId: 'manual-wedding:wedding-test-five',
            weddingId: 'wedding-test-five', amount: 990, buyerName: '   ', paymentSource: 'wedding_app_manual',
        })
        expect(store.get('sales_leads/non-dialable-payment-lead-five')).toMatchObject({ name: 'לקוחה קיימת' })
    })
})
