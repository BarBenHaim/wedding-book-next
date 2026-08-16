import { describe, it, expect } from 'vitest'
import { buildDigest, sanitizeParam, yesterdayISO, heDate } from '@/lib/salesAgent/digest'
import { deriveLead } from '@/lib/salesAgent/leadsView'
import { parseOwnerCommand } from '@/lib/salesAgent/leadsCore'

// The digest arrives every morning whether or not anyone reads it, which
// makes two failures expensive: sending noise on a quiet day (he stops
// reading, then misses the morning that mattered), and producing a
// template parameter WhatsApp silently rejects (it just stops arriving).

const TODAY = '2026-08-08'
const NOW = Date.parse('2026-08-08T06:30:00+03:00')
// Yesterday in Israel: 2026-08-07 00:00 → 24:00 (+03:00)
const YESTERDAY_NOON = Date.parse('2026-08-07T12:00:00+03:00')
const TWO_DAYS_AGO = Date.parse('2026-08-06T12:00:00+03:00')

const mk = over => deriveLead({ phone: '972501234567', stage: 'engaged', ...over }, { todayISO: TODAY, nowMs: NOW })

describe('quiet days', () => {
    it('has no news when nothing is pending and nothing happened', () => {
        const d = buildDigest([mk({ stage: 'closed_won', lastInboundAt: TWO_DAYS_AGO })], { todayISO: TODAY, nowMs: NOW })
        expect(d.hasNews).toBe(false)
    })

    it('has no news for an empty CRM', () => {
        expect(buildDigest([], { todayISO: TODAY, nowMs: NOW }).hasNews).toBe(false)
    })

    it('has news when someone is blocked on you, even if yesterday was dead', () => {
        const d = buildDigest([mk({ stage: 'handoff', lastInboundAt: TWO_DAYS_AGO })], { todayISO: TODAY, nowMs: NOW })
        expect(d.hasNews).toBe(true)
    })

    it('has news when there was activity but nothing pending', () => {
        const d = buildDigest([mk({ lastInboundAt: YESTERDAY_NOON })], { todayISO: TODAY, nowMs: NOW })
        expect(d.hasNews).toBe(true)
    })
})

describe('what the message says', () => {
    it('leads with the people waiting, not with yesterday', () => {
        const d = buildDigest([
            mk({ phone: '1', stage: 'handoff', name: 'דנה', handoffReason: 'ביקשה לדבר עם בן אדם', human: true, humanSince: NOW - 3 * 3600000 }),
            mk({ phone: '2', lastInboundAt: YESTERDAY_NOON }),
        ], { todayISO: TODAY, nowMs: NOW })
        const firstBlock = d.text.split('\n\n')[1]
        expect(firstBlock).toContain('צריכים אותך עכשיו: 1')
        expect(d.text).toContain('דנה')
        expect(d.text).toContain('ביקשה לדבר עם בן אדם')
    })

    it('names people rather than only counting them', () => {
        const d = buildDigest([mk({ phone: '972509998887', stage: 'handoff' })], { todayISO: TODAY, nowMs: NOW })
        expect(d.text).toContain('972509998887')
    })

    it('caps the waiting list so the message stays scannable', () => {
        const many = Array.from({ length: 9 }, (_, i) => mk({ phone: `9725000${i}`, stage: 'handoff' }))
        const d = buildDigest(many, { todayISO: TODAY, nowMs: NOW })
        expect(d.text).toContain('צריכים אותך עכשיו: 9')
        expect(d.text).toContain('ועוד 5')
    })

    it('counts yesterday in Israel time, not UTC', () => {
        // 23:30 Israel on the 7th is still the 7th. In UTC it is 20:30
        // on the 7th too, but a naive UTC day boundary would misplace
        // anything after 21:00 local.
        const lateNight = Date.parse('2026-08-07T23:30:00+03:00')
        const d = buildDigest([mk({ lastInboundAt: lateNight })], { todayISO: TODAY, nowMs: NOW })
        expect(d.counts.activeYesterday).toBe(1)
    })

    it('excludes the day before yesterday', () => {
        const d = buildDigest([mk({ lastInboundAt: TWO_DAYS_AGO })], { todayISO: TODAY, nowMs: NOW })
        expect(d.counts.activeYesterday).toBe(0)
    })

    it('reports new leads separately from returning ones', () => {
        const rows = [
            { ...mk({ phone: '1', lastInboundAt: YESTERDAY_NOON }), createdAtMs: YESTERDAY_NOON },
            { ...mk({ phone: '2', lastInboundAt: YESTERDAY_NOON }), createdAtMs: TWO_DAYS_AGO },
        ]
        const d = buildDigest(rows, { todayISO: TODAY, nowMs: NOW })
        expect(d.counts.activeYesterday).toBe(2)
        expect(d.counts.newYesterday).toBe(1)
    })

    it('reports only verified payments as yesterday sales', () => {
        const rows = [
            { ...mk({ phone: 'manual-close', stage: 'closed_won' }), updatedMs: YESTERDAY_NOON },
            {
                ...mk({ phone: 'verified-close', stage: 'closed_won', paymentVerified: true, verifiedOrderId: 'order-one' }),
                updatedMs: YESTERDAY_NOON,
            },
        ]
        const digest = buildDigest(rows, { todayISO: TODAY, nowMs: NOW })
        expect(digest.counts.wonYesterday).toBe(1)
    })

    it('passes on the experiment verdict without overclaiming', () => {
        const tooClose = buildDigest([mk({ stage: 'handoff' })], {
            todayISO: TODAY, nowMs: NOW, experiments: { verdict: 'too-close', rows: [], needed: 0 },
        })
        expect(tooClose.text).toContain('אל תחליף כלום עדיין')

        const collecting = buildDigest([mk({ stage: 'handoff' })], {
            todayISO: TODAY, nowMs: NOW, experiments: { verdict: 'collecting', rows: [], needed: 47 },
        })
        expect(collecting.text).toContain('47')
    })

    it('mentions a recurring gap but not a one-off', () => {
        const twice = buildDigest([mk({ stage: 'handoff' })], {
            todayISO: TODAY, nowMs: NOW, gaps: [{ reason: 'שאל על חשבונית', count: 3 }],
        })
        expect(twice.text).toContain('שאל על חשבונית')

        const once = buildDigest([mk({ stage: 'handoff' })], {
            todayISO: TODAY, nowMs: NOW, gaps: [{ reason: 'משהו חד פעמי', count: 1 }],
        })
        expect(once.text).not.toContain('משהו חד פעמי')
    })
})

describe('template safety', () => {
    it('never emits a parameter WhatsApp would reject', () => {
        // A newline, a tab, or 5+ spaces in a template parameter makes the
        // send fail — silently, which is how a scheduled digest stops
        // arriving without anyone noticing.
        const d = buildDigest([
            mk({ phone: '1', stage: 'handoff', handoffReason: 'שאל\nעל\tחשבונית' }),
            mk({ phone: '2', lastInboundAt: YESTERDAY_NOON }),
        ], { todayISO: TODAY, nowMs: NOW })
        for (const line of d.lines) {
            expect(line).not.toMatch(/[\n\r\t]/)
            expect(line).not.toMatch(/ {2,}/)
            expect(line.length).toBeGreaterThan(0)
        }
    })

    it('always returns the same number of parameters', () => {
        // A template has a fixed parameter count; a digest that sometimes
        // returns three and sometimes four would fail on the short days.
        const busy = buildDigest([mk({ stage: 'handoff' }), mk({ phone: '2', stage: 'ready_to_pay' })], { todayISO: TODAY, nowMs: NOW })
        const quiet = buildDigest([], { todayISO: TODAY, nowMs: NOW })
        expect(busy.lines).toHaveLength(4)
        expect(quiet.lines).toHaveLength(4)
    })

    it('sanitizes anything thrown at it', () => {
        expect(sanitizeParam('א\nב\tג    ד')).toBe('א ב ג ד')
        expect(sanitizeParam(null)).toBe('')
    })
})

describe('date helpers', () => {
    it('steps back one day, including across a month boundary', () => {
        expect(yesterdayISO('2026-08-08')).toBe('2026-08-07')
        expect(yesterdayISO('2026-08-01')).toBe('2026-07-31')
        expect(yesterdayISO('2026-01-01')).toBe('2025-12-31')
    })

    it('writes the date in Hebrew', () => {
        expect(heDate('2026-08-07')).toBe('7 באוגוסט')
    })
})

describe('the on-demand command', () => {
    it('recognises דוח with no phone number', () => {
        // The whole point: this works today, without waiting days for a
        // WhatsApp template to be approved.
        expect(parseOwnerCommand('דוח')).toEqual({ action: 'digest', phone: null })
        expect(parseOwnerCommand('סיכום').action).toBe('digest')
        expect(parseOwnerCommand('report').action).toBe('digest')
    })

    it('does not fire on an ordinary sentence', () => {
        expect(parseOwnerCommand('תשלח לו דוח')).toBeNull()
    })
})
