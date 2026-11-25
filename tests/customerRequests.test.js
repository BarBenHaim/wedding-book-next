import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ wedding: null, leads: [], inbox: [], closed: [] }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'now' } }))
vi.mock('@/lib/firebaseAdmin', () => ({
    adminDb: {
        collection: name => ({
            doc: () => ({ get: async () => ({ data: () => state.wedding }) }),
            where: () => ({
                limit: () => ({ get: async () => ({ docs: state.leads.map(id => ({ id })) }) }),
                get: async () => ({
                    docs: name === 'customer_inbox' ? state.inbox.map(data => ({
                        data: () => data, ref: { set: async () => state.closed.push(data.id) },
                    })) : [],
                }),
            }),
        }),
    },
}))

import { closeOpenRequests, isOpenItemFor } from '@/lib/customerData'

beforeEach(() => Object.assign(state, { wedding: {}, leads: [], inbox: [], closed: [] }))

describe('whose open message it is', () => {
    it('matches by book, or by phone only when the message has no book', () => {
        expect(isOpenItemFor({ weddingIds: ['w1'], phone: 'p' }, 'w1', 'other')).toBe(true)
        expect(isOpenItemFor({ weddingIds: [], phone: '972501234567' }, 'w1', '972501234567')).toBe(true)
        expect(isOpenItemFor({ weddingIds: ['w2'], phone: '972501234567' }, 'w1', '972501234567')).toBe(false)
        expect(isOpenItemFor({ weddingIds: [], phone: '' }, 'w1', null)).toBe(false)
    })
})

describe('closeOpenRequests', () => {
    it('closes the messages of a customer known only through the private list', async () => {
        state.leads = ['972501234567']
        state.inbox = [
            { id: 'mine', weddingIds: [], phone: '972501234567' },
            { id: 'other', weddingIds: [], phone: '972529999999' },
        ]

        expect(await closeOpenRequests('w1')).toBe(1)
        expect(state.closed).toEqual(['mine'])
    })
})
