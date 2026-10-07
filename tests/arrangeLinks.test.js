import { describe, expect, it } from 'vitest'
import {
    newArrangeToken,
    isArrangeTokenShape,
    arrangeLinkUrl,
    isArrangeLinkActive,
    reconcileOrder,
    validateOrderRequest,
    publicArrangeEntry,
    sortForArrange,
    arrangeLinkMessage,
} from '@/lib/arrangeLinks'

describe('arrange link tokens', () => {
    it('mints a url-safe 256-bit token that passes its own shape check', () => {
        const t = newArrangeToken()
        expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/)
        expect(isArrangeTokenShape(t)).toBe(true)
        expect(newArrangeToken()).not.toBe(t)
    })

    it('rejects anything that is not a token before touching the database', () => {
        expect(isArrangeTokenShape('')).toBe(false)
        expect(isArrangeTokenShape('abc')).toBe(false)
        expect(isArrangeTokenShape('../weddings/x')).toBe(false)
        expect(isArrangeTokenShape('a'.repeat(65))).toBe(false)
        expect(isArrangeTokenShape(null)).toBe(false)
    })

    it('builds the link under /arrange without a double slash', () => {
        expect(arrangeLinkUrl('https://app.weddingtales.co.il/', 'tok')).toBe('https://app.weddingtales.co.il/arrange/tok')
    })

    it('a revoked or malformed link document is not active', () => {
        expect(isArrangeLinkActive({ weddingId: 'w1', revokedAt: null })).toBe(true)
        expect(isArrangeLinkActive({ weddingId: 'w1', revokedAt: new Date() })).toBe(false)
        expect(isArrangeLinkActive({ revokedAt: null })).toBe(false)
        expect(isArrangeLinkActive(null)).toBe(false)
    })
})

describe('reconcileOrder', () => {
    const existing = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

    it('keeps the requested order when it covers every entry', () => {
        expect(reconcileOrder(['d', 'b', 'a', 'c'], existing)).toEqual({ order: ['d', 'b', 'a', 'c'], dropped: 0, appended: 0 })
    })

    it('drops ids that no longer exist and appends blessings the client never saw, in their current order', () => {
        const out = reconcileOrder(['c', 'gone', 'a'], existing)
        expect(out.order).toEqual(['c', 'a', 'b', 'd'])
        expect(out.dropped).toBe(1)
        expect(out.appended).toBe(2)
    })

    it('collapses duplicates to their first position and ignores junk', () => {
        const out = reconcileOrder(['b', 'b', 7, null, 'a'], existing)
        expect(out.order).toEqual(['b', 'a', 'c', 'd'])
    })
})

describe('validateOrderRequest', () => {
    it('accepts a list of ids', () => {
        expect(validateOrderRequest({ order: ['a', 'b'] })).toEqual({ ok: true, order: ['a', 'b'] })
    })
    it('rejects a missing, empty, oversized or non-string list', () => {
        expect(validateOrderRequest({}).ok).toBe(false)
        expect(validateOrderRequest({ order: [] }).ok).toBe(false)
        expect(validateOrderRequest({ order: [1] }).ok).toBe(false)
        expect(validateOrderRequest({ order: new Array(2001).fill('x') }).ok).toBe(false)
    })
})

describe('what the page sees', () => {
    it('exposes only the fields needed to recognise a blessing', () => {
        const entry = publicArrangeEntry({
            id: 'e1', name: 'סבתא', text: 'מזל טוב', imageUrl: 'https://x/y.jpg', photoPosition: '50% 20%',
            photoRotation: 90, timestamp: 1700000000000, orderIndex: 3,
            imageUrlOverride: 'secret', pageStyle: { x: 1 }, forceSplit: true,
        })
        expect(entry).toEqual({
            id: 'e1', kind: null, name: 'סבתא', text: 'מזל טוב', imageUrl: 'https://x/y.jpg', photoPosition: '50% 20%',
            photoRotation: 90, timestamp: 1700000000000, orderIndex: 3,
        })
    })

    it('names a blank page as one, so the owner can place it', () => {
        expect(publicArrangeEntry({ id: 'b', kind: 'blank', name: '', text: '' })).toMatchObject({ id: 'b', kind: 'blank', name: '', text: '' })
    })

    it('sorts like the book: explicit order first, unindexed last by time', () => {
        const sorted = sortForArrange([
            { id: 'new', orderIndex: null, timestamp: 5 },
            { id: 'second', orderIndex: 1, timestamp: 9 },
            { id: 'older-new', orderIndex: undefined, timestamp: 2 },
            { id: 'first', orderIndex: 0, timestamp: 9 },
        ])
        expect(sorted.map(e => e.id)).toEqual(['first', 'second', 'older-new', 'new'])
    })
})

describe('the WhatsApp message', () => {
    it('greets by first name, names the event, and puts the link on its own line', () => {
        const msg = arrangeLinkMessage({ ownerName: 'דנה כהן', eventLabel: 'בר מצווה של אריאל', link: 'https://app/arrange/t' })
        expect(msg.startsWith('היי דנה,')).toBe(true)
        expect(msg).toContain('הברכות של בר מצווה של אריאל')
        expect(msg.split('\n')).toContain('https://app/arrange/t')
        expect(msg).toContain('בלי התחברות ובלי סיסמה')
    })
    it('still reads well with no name and no event', () => {
        const msg = arrangeLinkMessage({ link: 'https://app/arrange/t' })
        expect(msg.startsWith('היי,')).toBe(true)
        expect(msg).toContain('הברכות שלכם')
    })
})
