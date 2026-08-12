import { describe, it, expect } from 'vitest'
import {
    eventTypeOf, eventTypeLabel, matchesSearch, searchableText,
    amountOf, isPaid, compareByAmount, filterEvents, countByEventType,
} from '@/lib/adminEventsView'

const barMitzvah = {
    id: 'abc123',
    eventType: 'bar_mitzvah',
    celebrantName: 'נועם',
    ownerName: 'רונית שרוני',
    ownerEmail: 'ronit@example.com',
    ownerPhone: '0526618184',
    orderId: '6271',
    amountPaid: 950,
}
const wedding = {
    id: 'def456',
    eventType: 'wedding',
    brideName: 'דנה',
    groomName: 'יוסי',
    amountPaid: 1490,
}
const unset = { id: 'ghi789', celebrantName: 'אריאל' }

describe('eventTypeOf', () => {
    it('reads a real type', () => {
        expect(eventTypeOf(barMitzvah)).toBe('bar_mitzvah')
        expect(eventTypeOf(wedding)).toBe('wedding')
    })

    it('refuses to guess when nobody set one', () => {
        // The bug behind "make me labels": normalizeEventType returned
        // 'wedding' for missing, so unclassified events wore a confident
        // and wrong badge — worse than no badge, because you cannot tell
        // the real weddings from the blanks.
        expect(eventTypeOf(unset)).toBeNull()
        expect(eventTypeOf({ eventType: '' })).toBeNull()
        expect(eventTypeOf({ eventType: 'nonsense' })).toBeNull()
        expect(eventTypeOf(null)).toBeNull()
    })

    it('says so on the label', () => {
        expect(eventTypeLabel(barMitzvah)).toBe('בר מצווה')
        expect(eventTypeLabel(unset)).toBe('לא הוגדר')
    })
})

describe('matchesSearch', () => {
    it('finds the celebrant by name', () => {
        // The single most likely search, and the one the old code could
        // not see at all: for a bar mitzvah the celebrant IS the event.
        expect(matchesSearch(barMitzvah, 'נועם')).toBe(true)
    })

    it('still finds bride, groom, owner, email and ids', () => {
        expect(matchesSearch(wedding, 'דנה')).toBe(true)
        expect(matchesSearch(barMitzvah, 'רונית')).toBe(true)
        expect(matchesSearch(barMitzvah, 'ronit@example')).toBe(true)
        expect(matchesSearch(barMitzvah, 'abc123')).toBe(true)
    })

    it('narrows as you add words instead of widening', () => {
        // AND, not OR. Two words the user remembers should get closer to
        // one row, never further.
        expect(matchesSearch(barMitzvah, 'נועם רונית')).toBe(true)
        expect(matchesSearch(barMitzvah, 'נועם דנה')).toBe(false)
    })

    it('matches a phone the way people type it', () => {
        expect(matchesSearch(barMitzvah, '052-661')).toBe(true)
        expect(matchesSearch(barMitzvah, '0526618184')).toBe(true)
        expect(matchesSearch(barMitzvah, '661 8184')).toBe(true)
    })

    it('does not match a two-digit fragment against every phone', () => {
        // Short digit runs appear in every number; matching them turns
        // the search into a no-op.
        expect(matchesSearch(barMitzvah, '52')).toBe(false)
    })

    it('finds by the event type in Hebrew', () => {
        expect(matchesSearch(barMitzvah, 'בר מצווה')).toBe(true)
        expect(matchesSearch(unset, 'לא הוגדר')).toBe(true)
    })

    it('is case-insensitive and returns everything for an empty query', () => {
        expect(matchesSearch(barMitzvah, 'RONIT@EXAMPLE.COM')).toBe(true)
        expect(matchesSearch(barMitzvah, '   ')).toBe(true)
        expect(matchesSearch(barMitzvah, '')).toBe(true)
    })

    it('survives junk', () => {
        expect(searchableText(null)).toBe('')
        expect(matchesSearch(null, 'x')).toBe(false)
    })
})

describe('amountOf / isPaid', () => {
    it('reads a real payment', () => {
        expect(amountOf(barMitzvah)).toBe(950)
        expect(isPaid(barMitzvah)).toBe(true)
    })

    it('treats missing, zero and junk as unpaid', () => {
        for (const v of [undefined, null, '', 0, -5, 'free', NaN]) {
            expect(amountOf({ amountPaid: v }), String(v)).toBe(0)
            expect(isPaid({ amountPaid: v }), String(v)).toBe(false)
        }
    })

    it('reads a numeric string, because that is how it is often stored', () => {
        expect(amountOf({ amountPaid: '950' })).toBe(950)
    })
})

describe('compareByAmount', () => {
    const paid = { amountPaid: 950 }
    const more = { amountPaid: 1490 }
    const none = { amountPaid: 0 }

    it('orders real payments by the direction asked for', () => {
        expect(compareByAmount(more, paid, 'desc')).toBeLessThan(0)
        expect(compareByAmount(more, paid, 'asc')).toBeGreaterThan(0)
    })

    it('sinks the unpaid in BOTH directions', () => {
        // The asymmetry is the point: flipping the arrow reorders real
        // payments and never promotes the zeros to the first screen.
        for (const dir of ['asc', 'desc']) {
            expect(compareByAmount(none, paid, dir), dir).toBeGreaterThan(0)
            expect(compareByAmount(paid, none, dir), dir).toBeLessThan(0)
        }
    })

    it('leaves two unpaid rows in whatever order they were', () => {
        expect(compareByAmount(none, { amountPaid: null }, 'asc')).toBe(0)
    })

    it('sorts a real list with every zero at the bottom', () => {
        const list = [none, more, { amountPaid: null }, paid]
        const sorted = [...list].sort((a, b) => compareByAmount(a, b, 'asc'))
        expect(sorted.map(amountOf)).toEqual([950, 1490, 0, 0])
    })
})

describe('filterEvents', () => {
    const all = [barMitzvah, wedding, unset]

    it('filters by type', () => {
        expect(filterEvents(all, { eventType: 'bar_mitzvah' })).toEqual([barMitzvah])
        expect(filterEvents(all, { eventType: 'wedding' })).toEqual([wedding])
    })

    it('can isolate the ones nobody classified', () => {
        // The reason the honest null matters: this list is a to-do.
        expect(filterEvents(all, { eventType: 'unset' })).toEqual([unset])
    })

    it('combines text and type', () => {
        expect(filterEvents(all, { query: 'נועם', eventType: 'bar_mitzvah' })).toEqual([barMitzvah])
        expect(filterEvents(all, { query: 'נועם', eventType: 'wedding' })).toEqual([])
    })

    it('returns everything with no filters, and survives junk', () => {
        expect(filterEvents(all, {})).toHaveLength(3)
        expect(filterEvents(all)).toHaveLength(3)
        expect(filterEvents(null)).toEqual([])
    })
})

describe('countByEventType', () => {
    it('counts each type and the unclassified', () => {
        const c = countByEventType([barMitzvah, wedding, unset, unset])
        expect(c.all).toBe(4)
        expect(c.bar_mitzvah).toBe(1)
        expect(c.wedding).toBe(1)
        expect(c.unset).toBe(2)
        expect(c.birthday).toBe(0)
    })

    it('survives junk', () => {
        expect(countByEventType(null).all).toBe(0)
    })
})
