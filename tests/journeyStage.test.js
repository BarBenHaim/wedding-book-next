import { describe, it, expect } from 'vitest'
import { journeyOf, summarize, urgencyOf, eventDay } from '../src/lib/journeyStage'

const NOW = Date.parse('2026-12-10T09:00:00+02:00')
const iso = d => new Date(Date.parse(`${d}T10:00:00+02:00`)).toISOString()
const dep = (o = {}) => ({ createdVia: 'order', paymentStage: 'deposit', amountPaid: 190, createdAt: iso('2026-11-25'), weddingDate: '2026-12-30', greetingsCount: 0, ...o })

describe('journeyOf', () => {
    it('events from before the funnel are legacy and never reach the queue', () => {
        const j = journeyOf({ createdAt: iso('2026-10-20'), amountPaid: 850, weddingDate: '2026-11-01', greetingsCount: 24 }, NOW)
        expect(j.stage).toBe('legacy')
        expect(j.attention).toEqual([])
    })

    it('a free self-serve event after launch is free, not legacy', () => {
        expect(journeyOf({ createdAt: iso('2026-12-01'), createdVia: 'app' }, NOW).stage).toBe('free')
    })

    it('deposit with no blessings is quiet; with blessings it is collecting', () => {
        expect(journeyOf(dep(), NOW).stage).toBe('deposit_quiet')
        expect(journeyOf(dep({ greetingsCount: 3 }), NOW).stage).toBe('collecting')
    })

    it('flags a deposit whose link was never shared after three days', () => {
        const j = journeyOf(dep(), NOW)
        expect(j.attention.map(a => a.key)).toContain('link_unsent')
        const shared = journeyOf(dep({ linkSharedAt: iso('2026-11-26') }), NOW)
        expect(shared.attention.map(a => a.key)).not.toContain('link_unsent')
    })

    it('flags no blessings in the last week before the event', () => {
        const j = journeyOf(dep({ weddingDate: '2026-12-14' }), NOW)
        expect(j.attention.map(a => a.key)).toContain('quiet_close')
    })

    it('the event day itself still counts as collecting, not past', () => {
        expect(journeyOf(dep({ weddingDate: '2026-12-10', greetingsCount: 5 }), NOW).stage).toBe('collecting')
    })

    it('after the event the deposit waits for review, then flags at 14 days', () => {
        expect(journeyOf(dep({ weddingDate: '2026-12-05', greetingsCount: 9 }), NOW).stage).toBe('awaiting_review')
        const late = journeyOf(dep({ weddingDate: '2026-11-20', greetingsCount: 9 }), NOW)
        expect(late.stage).toBe('awaiting_review')
        expect(late.attention.map(a => a.key)).toContain('balance_late')
    })

    it('clicking the pay button is "started paying", not approval', () => {
        const j = journeyOf(dep({ weddingDate: '2026-12-05', greetingsCount: 9, balanceClickAt: iso('2026-12-08') }), NOW)
        expect(j.stage).toBe('balance_started')
    })

    it('a paid balance means print now, flagged after two days', () => {
        const fresh = journeyOf(dep({ paymentStage: 'paid', balancePaidAt: iso('2026-12-10') }), NOW)
        expect(fresh.stage).toBe('print_now')
        expect(fresh.action).toBe('print')
        expect(fresh.attention).toEqual([])
        const old = journeyOf(dep({ paymentStage: 'paid', balancePaidAt: iso('2026-12-05') }), NOW)
        expect(old.attention[0].key).toBe('print_late')
        expect(old.days).toBe(5)
    })

    it('a full-price order after launch goes straight to print now', () => {
        expect(journeyOf({ createdVia: 'order', amountPaid: 990, createdAt: iso('2026-12-02'), weddingDate: '2026-12-20' }, NOW).stage).toBe('print_now')
    })

    it('what Bar records wins: printed, delivered, closed', () => {
        expect(journeyOf(dep({ paymentStage: 'paid', printOrderedAt: iso('2026-12-09') }), NOW).stage).toBe('in_print')
        expect(journeyOf(dep({ paymentStage: 'paid', printOrder: { luluStatus: 'x' } }), NOW).stage).toBe('in_print')
        expect(journeyOf(dep({ paymentStage: 'paid', printOrderedAt: iso('2026-12-09'), deliveredAt: iso('2026-12-10') }), NOW).stage).toBe('delivered')
        expect(journeyOf(dep({ closedAt: iso('2026-12-01') }), NOW).stage).toBe('closed')
        // also for a legacy event Bar marks by hand
        expect(journeyOf({ createdAt: iso('2026-02-01'), deliveredAt: iso('2026-12-01') }, NOW).stage).toBe('delivered')
    })

    it('a deposit with no date is flagged and never passes collecting', () => {
        const j = journeyOf(dep({ weddingDate: null, greetingsCount: 4 }), NOW)
        expect(j.stage).toBe('collecting')
        expect(j.attention.map(a => a.key)).toContain('no_date')
    })

    it('reads a stored timestamp date in Israel time', () => {
        expect(eventDay('2026-12-09T22:00:00.000Z')).toBe('2026-12-10')
        expect(eventDay('2026-12-10')).toBe('2026-12-10')
        expect(eventDay(null)).toBe('')
    })
})

describe('summarize and urgency', () => {
    it('counts stages and the money still owed', () => {
        const list = [
            dep({ weddingDate: '2026-12-05', greetingsCount: 9 }),
            dep({ weddingDate: '2026-12-01', greetingsCount: 9, balanceDue: 800 }),
            dep({ paymentStage: 'paid' }),
            { createdAt: iso('2026-01-01') },
        ]
        const s = summarize(list, NOW)
        expect(s.counts.awaiting_review).toBe(2)
        expect(s.counts.print_now).toBe(1)
        expect(s.counts.legacy).toBe(1)
        expect(s.owed).toBe(1600)
    })

    it('print-now outranks every waiting-on-customer reason', () => {
        const printLate = journeyOf(dep({ paymentStage: 'paid', balancePaidAt: iso('2026-12-07') }), NOW)
        const balLate = journeyOf(dep({ weddingDate: '2026-11-01', greetingsCount: 4 }), NOW)
        expect(urgencyOf(printLate)).toBeGreaterThan(urgencyOf(balLate))
    })
})

import { dailySummary } from '../src/lib/lifecycle'

describe('daily summary carries the print queue', () => {
    it('is sent every day while a paid book waits, even with nothing else new', () => {
        const s = dailySummary({ printNow: [{ title: 'נועם', days: 3 }] })
        expect(s).not.toBeNull()
        expect(s.text).toContain('להדפיס עכשיו')
        expect(s.text).toContain('ממתין 3 ימים')
        expect(s.subject).toContain('להדפיס עכשיו')
    })
    it('stays silent when there is nothing to say', () => {
        expect(dailySummary({})).toBeNull()
    })
    it('caps the queue lines', () => {
        const s = dailySummary({ queueLines: Array.from({ length: 12 }, (_, i) => `אירוע ${i}`) })
        expect(s.text).toContain('ועוד 4 באדמין')
    })
})
