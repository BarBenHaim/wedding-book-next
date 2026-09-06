import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
    eventTypeOf, eventTypeLabel, matchesSearch, searchableText,
    amountOf, isPaid, compareByAmount, filterEvents, countByEventType,
    eventDateMs, daysUntilEvent, rowUrgency, countdownLabel,
    originOf,
    originLabel,
    appPresence,
    countByOrigin,
    createdAtMs,
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

describe('admin wedding buyer editor contract', () => {
    const source = readFileSync(new URL('../src/app/admin/page.js', import.meta.url), 'utf8')

    it('lets the owner edit the buyer name and sends it in the patch', () => {
        expect(source).toContain("ownerName: w.ownerName || ''")
        expect(source).toContain('patch.ownerName = draft.ownerName')
        expect(source).toContain('שם הקונה')
    })

    it('labels the entered amount as money actually paid', () => {
        expect(source).toContain('סכום ששולם בפועל')
    })
})

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

describe('rowUrgency / daysUntilEvent', () => {
    // A fixed local "now" so the maths is deterministic wherever the
    // suite runs. Local Date construction (not an ISO string) on both
    // sides, so no test depends on the runner's timezone.
    const NOW = new Date(2026, 7, 24, 14, 30).getTime()
    const at = (y, m, d) => ({ weddingDate: new Date(y, m, d) })

    it('counts whole days from today, not from now', () => {
        // 14:30 today to 09:00 tomorrow is 18 hours and still "1 day".
        expect(daysUntilEvent({ weddingDate: new Date(2026, 7, 25, 9, 0) }, NOW)).toBe(1)
        expect(daysUntilEvent({ weddingDate: new Date(2026, 7, 24, 23, 59) }, NOW)).toBe(0)
    })

    it('colours everything inside the two-week window', () => {
        for (const day of [24, 25, 30, 31]) {
            expect(rowUrgency(at(2026, 7, day), NOW), `aug ${day}`).toBe('soon')
        }
        // Day 14 is the last one in.
        expect(daysUntilEvent(at(2026, 8, 7), NOW)).toBe(14)
        expect(rowUrgency(at(2026, 8, 7), NOW)).toBe('soon')
    })

    it('leaves day 15 and beyond alone', () => {
        expect(daysUntilEvent(at(2026, 8, 8), NOW)).toBe(15)
        expect(rowUrgency(at(2026, 8, 8), NOW)).toBeNull()
        expect(rowUrgency(at(2026, 11, 1), NOW)).toBeNull()
    })

    it('leaves past events alone — they are done, not urgent', () => {
        expect(rowUrgency(at(2026, 7, 23), NOW)).toBeNull()
        expect(rowUrgency(at(2025, 1, 1), NOW)).toBeNull()
    })

    it('flags a missing date as its own thing, not as calm', () => {
        // The reason it gets a colour at all: every deadline in this
        // system is computed from weddingDate, so a missing one opts the
        // customer out of the status badge, the upcoming filter and the
        // date sort at once. It does not look late. It looks fine.
        for (const v of [undefined, null, '', 'לא ידוע', {}, NaN]) {
            expect(rowUrgency({ weddingDate: v }, NOW), String(v)).toBe('nodate')
        }
        expect(rowUrgency({}, NOW)).toBe('nodate')
        expect(rowUrgency(null, NOW)).toBe('nodate')
    })

    it('reads the shapes the date actually arrives in', () => {
        const target = new Date(2026, 7, 29)
        const ms = target.getTime()
        expect(daysUntilEvent({ weddingDate: ms }, NOW)).toBe(5)
        expect(daysUntilEvent({ weddingDate: target }, NOW)).toBe(5)
        expect(daysUntilEvent({ weddingDate: { toDate: () => target } }, NOW)).toBe(5)
        expect(daysUntilEvent({ weddingDate: { seconds: Math.floor(ms / 1000) } }, NOW)).toBe(5)
        expect(daysUntilEvent({ weddingDate: { _seconds: Math.floor(ms / 1000) } }, NOW)).toBe(5)
    })

    it('reads the ISO string the admin form stores', () => {
        // Asserted as a classification rather than an exact count: an
        // ISO date parses as UTC midnight, so the local calendar day can
        // land either side depending on the runner's offset. Both are
        // inside the window, and the window is what the colour means.
        expect(rowUrgency({ weddingDate: '2026-08-29' }, NOW)).toBe('soon')
        expect(rowUrgency({ weddingDate: '2026-08-29T18:00:00Z' }, NOW)).toBe('soon')
        expect(rowUrgency({ weddingDate: '2026-12-01' }, NOW)).toBeNull()
    })

    it('does not mistake an unparseable date for a real one', () => {
        expect(eventDateMs({ weddingDate: 'בקרוב' })).toBeNull()
        expect(eventDateMs({ weddingDate: { toDate: () => { throw new Error('x') } } })).toBeNull()
        expect(rowUrgency({ weddingDate: 'בקרוב' }, NOW)).toBe('nodate')
    })
})

describe('countdownLabel', () => {
    const NOW = new Date(2026, 7, 24, 14, 30).getTime()

    it('names the near days instead of counting them', () => {
        expect(countdownLabel({ weddingDate: new Date(2026, 7, 24) }, NOW)).toBe('היום')
        expect(countdownLabel({ weddingDate: new Date(2026, 7, 25) }, NOW)).toBe('מחר')
        expect(countdownLabel({ weddingDate: new Date(2026, 7, 26) }, NOW)).toBe('מחרתיים')
        expect(countdownLabel({ weddingDate: new Date(2026, 7, 31) }, NOW)).toBe('בעוד 7 ימים')
    })

    it('says nothing for a past event and says so for a missing date', () => {
        expect(countdownLabel({ weddingDate: new Date(2026, 7, 20) }, NOW)).toBeNull()
        expect(countdownLabel({}, NOW)).toBe('בלי תאריך')
    })
})

describe('originOf', () => {
    it('reads the three provenances written at their own doors', () => {
        expect(originOf({ createdVia: 'order' })).toBe('order')
        expect(originOf({ createdVia: 'self_serve' })).toBe('self_serve')
        expect(originOf({ createdVia: 'app' })).toBe('app')
    })

    it('calls a legacy row unknown rather than guessing', () => {
        // Before provenance was recorded, a paid order was identifiable
        // only by the ABSENCE of the field. Guessing 'order' here would
        // be right for the old rows and wrong for every future one.
        expect(originOf({})).toBe('unknown')
        expect(originOf(null)).toBe('unknown')
        expect(originOf({ createdVia: 'something-else' })).toBe('unknown')
    })

    it('labels every case in Hebrew', () => {
        for (const via of ['order', 'self_serve', 'app', undefined]) {
            expect(typeof originLabel({ createdVia: via })).toBe('string')
        }
    })
})

describe('appPresence', () => {
    const TOKEN = 'ExponentPushToken[abc123]'

    it('counts only real Expo tokens as devices', () => {
        expect(appPresence({ pushTokens: [TOKEN, TOKEN] }).devices).toBe(2)
        expect(appPresence({ pushTokens: ['garbage', null, 42] }).devices).toBe(0)
        expect(appPresence({}).devices).toBe(0)
    })

    it('falls back to the count the API sends when tokens are withheld', () => {
        // The list never leaves the server — the table gets a count.
        expect(appPresence({ appDevices: 3 }).devices).toBe(3)
    })

    it('ranks having opened the book above merely having the app', () => {
        expect(appPresence({ pushTokens: [TOKEN] }).state).toBe('connected')
        expect(appPresence({ pushTokens: [TOKEN], lastAppBookOpenAt: '2026-09-01T10:00:00Z' }).state).toBe('book')
        expect(appPresence({}).state).toBe('none')
    })

    it('treats a recorded app open as presence even with no token left', () => {
        // A customer can revoke notifications and still use the app.
        const p = appPresence({ lastAppOpenAt: '2026-09-01T10:00:00Z' })
        expect(p.connected).toBe(true)
        expect(p.devices).toBe(0)
    })

    it('accepts ISO strings and epoch millis, and ignores nonsense', () => {
        expect(appPresence({ lastAppOpenAt: '2026-09-01T10:00:00Z' }).openedMs).toBe(Date.parse('2026-09-01T10:00:00Z'))
        expect(appPresence({ lastAppOpenAt: 1756720800000 }).openedMs).toBe(1756720800000)
        expect(appPresence({ lastAppOpenAt: 'not a date' }).openedMs).toBe(null)
        expect(appPresence({ lastAppOpenAt: null }).openedMs).toBe(null)
    })
})

// ── Acquisition channel as a cohort ─────────────────────────────────
//
// The per-row badge answers "where did THIS event come from". These two
// answer "show me everyone who opened a book themselves through /start,
// and when" - which is a different question and needs the whole list.

const viaStart = (id, createdAt) => ({ id, createdVia: 'self_serve', createdAt })
const viaApp = id => ({ id, createdVia: 'app' })
const viaOrder = id => ({ id, createdVia: 'order' })
const legacy = id => ({ id })

describe('countByOrigin', () => {
    it('counts each channel and totals them', () => {
        const c = countByOrigin([viaStart('a'), viaStart('b'), viaApp('c'), viaOrder('d'), legacy('e')])
        expect(c).toEqual({ all: 5, self_serve: 2, app: 1, order: 1, unknown: 1 })
    })
    it('every channel is present at zero, so a chip never reads undefined', () => {
        expect(countByOrigin([])).toEqual({ all: 0, order: 0, self_serve: 0, app: 0, unknown: 0 })
    })
    it('counts a row with a junk createdVia as unknown, not as its own bucket', () => {
        const c = countByOrigin([{ id: 'x', createdVia: 'facebook' }, { id: 'y', createdVia: null }])
        expect(c.unknown).toBe(2)
        expect(c.all).toBe(2)
    })
    it('survives a non-array', () => {
        for (const v of [null, undefined, 'x', 7]) expect(countByOrigin(v).all).toBe(0)
    })
    it('the buckets always sum to all', () => {
        const list = [viaStart('a'), viaApp('b'), viaOrder('c'), legacy('d'), viaStart('e')]
        const c = countByOrigin(list)
        expect(c.self_serve + c.app + c.order + c.unknown).toBe(c.all)
    })
})

describe('filterEvents by origin', () => {
    const list = [viaStart('a'), viaApp('b'), viaOrder('c'), legacy('d')]

    it('isolates the /start signups', () => {
        expect(filterEvents(list, { origin: 'self_serve' }).map(w => w.id)).toEqual(['a'])
    })
    it('"unknown" is selectable, because legacy rows are a real cohort', () => {
        expect(filterEvents(list, { origin: 'unknown' }).map(w => w.id)).toEqual(['d'])
    })
    it('defaults to everything, so existing callers are unaffected', () => {
        expect(filterEvents(list, {})).toHaveLength(4)
        expect(filterEvents(list)).toHaveLength(4)
        expect(filterEvents(list, { origin: 'all' })).toHaveLength(4)
    })
    it('combines with the other filters rather than replacing them', () => {
        const mixed = [
            { id: 'a', createdVia: 'self_serve', eventType: 'wedding' },
            { id: 'b', createdVia: 'self_serve', eventType: 'bar_mitzvah' },
            { id: 'c', createdVia: 'order', eventType: 'wedding' },
        ]
        expect(filterEvents(mixed, { origin: 'self_serve', eventType: 'wedding' }).map(w => w.id)).toEqual(['a'])
    })
})

describe('createdAtMs', () => {
    it('reads an ISO string', () => {
        expect(createdAtMs({ createdAt: '2026-09-04T10:00:00.000Z' })).toBe(Date.parse('2026-09-04T10:00:00.000Z'))
    })
    it('passes a number through', () => {
        expect(createdAtMs({ createdAt: 1757000000000 })).toBe(1757000000000)
    })
    it('is null when absent or unparseable, so a legacy row can be parked rather than dropped', () => {
        for (const v of [undefined, null, '', 'not a date', {}]) {
            expect(createdAtMs({ createdAt: v })).toBeNull()
        }
        expect(createdAtMs(undefined)).toBeNull()
    })
    it('orders signups newest-first independently of the party date', () => {
        // A signup today for a wedding next June must sort first by signup
        // and last by event date. That is the whole point of the column.
        const older = viaStart('older', '2026-01-01T00:00:00.000Z')
        const newer = viaStart('newer', '2026-09-04T00:00:00.000Z')
        const byCreated = [older, newer].sort((a, b) => createdAtMs(b) - createdAtMs(a))
        expect(byCreated.map(w => w.id)).toEqual(['newer', 'older'])
    })
})
