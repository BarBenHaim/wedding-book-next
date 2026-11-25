import { describe, expect, it } from 'vitest'
import { bookLabel, expiredItems, groupOpenItems, itemsForPhone, withLeadBooks } from '../scripts/lib/inbox-view.mjs'

const DAY = 86_400_000
const item = overrides => ({
    id: 'a', phone: '972501234567', customerName: 'דנה', weddingId: 'w1', weddingIds: ['w1'],
    status: 'new', receivedAtMs: 1000, ...overrides,
})
const weddings = new Map([['w1', { brideName: 'דנה', groomName: 'יואב' }], ['w2', { ownerName: 'דנה כהן' }]])

describe('groupOpenItems', () => {
    it('groups open messages by customer, oldest waiting first, in order of arrival', () => {
        const groups = groupOpenItems([
            item({ id: 'late', receivedAtMs: 3000 }),
            item({ id: 'other', phone: '972521111111', receivedAtMs: 2000, weddingId: 'w2', weddingIds: ['w2'] }),
            item({ id: 'early', receivedAtMs: 1000 }),
            item({ id: 'closed', status: 'handled', receivedAtMs: 1 }),
        ], weddings)

        expect(groups.map(group => group.phone)).toEqual(['972501234567', '972521111111'])
        expect(groups[0].items.map(entry => entry.id)).toEqual(['early', 'late'])
        expect(groups[0].books).toEqual([{ id: 'w1', label: 'דנה ו-יואב' }])
    })

    it('shows every candidate book when the phone has two', () => {
        const [group] = groupOpenItems([item({ weddingId: null, weddingIds: ['w1', 'w2'] })], weddings)

        expect(group.books.map(book => book.id)).toEqual(['w1', 'w2'])
    })
})

describe('withLeadBooks', () => {
    it('links an item with no book to the book recorded on the customer, and leaves linked ones alone', () => {
        const [unlinked, linked, unknown] = withLeadBooks([
            item({ id: 'unlinked', weddingId: null, weddingIds: [] }),
            item({ id: 'linked' }),
            item({ id: 'unknown', phone: '972529999999', weddingId: null, weddingIds: [] }),
        ], new Map([['972501234567', 'w2']]))

        expect(unlinked).toMatchObject({ weddingId: 'w2', weddingIds: ['w2'] })
        expect(linked).toMatchObject({ weddingId: 'w1', weddingIds: ['w1'] })
        expect(unknown).toMatchObject({ weddingId: null, weddingIds: [] })
    })
})

describe('bookLabel', () => {
    it('falls back from the couple to the owner and then to the id', () => {
        expect(bookLabel('w2', weddings.get('w2'))).toBe('דנה כהן')
        expect(bookLabel('w9', undefined)).toBe('w9')
    })
})

describe('expiredItems', () => {
    it('picks only handled items older than 90 days', () => {
        const now = 200 * DAY
        const found = expiredItems([
            item({ id: 'old', status: 'handled', handledAtMs: now - 91 * DAY }),
            item({ id: 'recent', status: 'handled', handledAtMs: now - 89 * DAY }),
            item({ id: 'open', status: 'new', receivedAtMs: 1 }),
            item({ id: 'no-date', status: 'handled', handledAtMs: null }),
        ], now)

        expect(found.map(entry => entry.id)).toEqual(['old'])
    })
})

describe('itemsForPhone', () => {
    const all = [item({ id: 'mine' }), item({ id: 'other', phone: '972501234568' })]

    it('matches one whole number however it is typed', () => {
        expect(itemsForPhone(all, '050-123-4567').map(entry => entry.id)).toEqual(['mine'])
    })

    it('matches nothing for a partial or empty number', () => {
        expect(itemsForPhone(all, '050123')).toEqual([])
        expect(itemsForPhone(all, '')).toEqual([])
    })
})
