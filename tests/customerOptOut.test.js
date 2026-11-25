import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ byPhone: [], lead: null, writes: [] }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'now' } }))
vi.mock('@/lib/firebaseAdmin', () => ({
    adminDb: {
        collection: name => ({
            where: () => ({ limit: () => ({ get: async () => ({ docs: state.byPhone.map(id => ({ id })) }) }) }),
            doc: id => ({ path: `${name}/${id}`, get: async () => ({ data: () => state.lead }) }),
        }),
        batch: () => ({ set: (ref, data) => state.writes.push([ref.path, data]), commit: async () => {} }),
    },
}))

import { optOutCustomer } from '@/lib/customerData'

beforeEach(() => Object.assign(state, { byPhone: [], lead: null, writes: [] }))

describe('optOutCustomer', () => {
    it('stops every book of the phone, from the book or from the customer list, once each', async () => {
        state.byPhone = ['w1']
        state.lead = { weddingId: 'w1' }

        expect(await optOutCustomer('972501234567')).toBe(1)
        expect(state.writes).toEqual([['weddings/w1', { lifecycleOff: true, lifecycleOffAt: 'now' }]])
    })

    it('finds the book through the customer list when the book has no phone', async () => {
        state.lead = { weddingId: 'w2' }

        expect(await optOutCustomer('972501234567')).toBe(1)
        expect(state.writes[0][0]).toBe('weddings/w2')
    })

    it('does nothing for somebody with no book', async () => {
        expect(await optOutCustomer('972501234567')).toBe(0)
        expect(state.writes).toEqual([])
    })
})
