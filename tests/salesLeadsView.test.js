import { describe, it, expect } from 'vitest'
import {
    deriveLead, sortLeads, filterLeads, summarizeLeads, stageMeta,
    ATTENTION_BUCKETS, STAGE_META, eventTypeLabel, relativeHe, isoInIsrael,
} from '@/lib/salesAgent/leadsView'
import { STAGES } from '@/lib/salesAgent/catalog'

// The leads table exists to answer "who do I talk to next". These tests
// pin that answer, because the failure mode is silent: a lead that lands
// in the wrong bucket is not an error anyone sees, it is a customer who
// waits and then buys somewhere else.

const TODAY = '2026-08-07'
const NOW = Date.parse('2026-08-07T12:00:00Z')
const HOUR = 3600000
const DAY = 86400000

const lead = (over = {}) => deriveLead({ phone: '972500000001', stage: 'engaged', ...over }, { todayISO: TODAY, nowMs: NOW })

describe('stage metadata', () => {
    it('labels every stage the agent can emit', () => {
        // A stage with no label renders as a raw enum in front of the
        // owner, which is how you learn the funnel changed by accident.
        for (const s of STAGES) {
            expect(STAGE_META[s], `missing label for stage "${s}"`).toBeTruthy()
            expect(STAGE_META[s].label).toBeTruthy()
        }
    })

    it('falls back rather than crashing on an unknown stage', () => {
        expect(stageMeta('something_new').label).toBe('something_new')
        expect(stageMeta(undefined).label).toBe('חדש')
    })

    it('translates every event type the agent can return', () => {
        expect(eventTypeLabel('bar_mitzvah')).toBe('בר מצווה')
        expect(eventTypeLabel('brit')).toBe('ברית')
        expect(eventTypeLabel(null)).toBe('')
    })
})

describe('attention buckets', () => {
    it('puts a handoff first, above everything else', () => {
        const l = lead({ stage: 'handoff', followUpAt: TODAY, callbackPromised: TODAY })
        expect(l.attention).toBe('handoff')
        expect(l.attentionRank).toBe(0)
    })

    it('treats a paused lead as a handoff even if the stage says otherwise', () => {
        // `human: true` is what actually freezes the bot. If the stage
        // field disagrees, the freeze is the truth worth surfacing.
        const l = lead({ stage: 'offer_sent', human: true, humanSince: NOW - 3 * HOUR })
        expect(l.paused).toBe(true)
        expect(l.attention).toBe('handoff')
        expect(l.waitingHours).toBe(3)
    })

    it('stops treating a stale handoff as paused once the 48h window lapses', () => {
        const l = lead({ stage: 'offer_sent', human: true, humanSince: NOW - 49 * HOUR })
        expect(l.paused).toBe(false)
        expect(l.attention).toBeNull()
        // …but still reports how long they were left, because that is
        // the number that should sting.
        expect(l.waitingHours).toBe(49)
    })

    it('treats human:true with no timestamp as paused, not as fine', () => {
        const l = lead({ human: true })
        expect(l.paused).toBe(true)
        expect(l.attention).toBe('handoff')
    })

    it('ranks ready_to_pay above a due callback and a due follow-up', () => {
        const pay = lead({ stage: 'ready_to_pay', followUpAt: TODAY })
        const cb = lead({ stage: 'engaged', callbackPromised: TODAY, followUpAt: TODAY })
        const fu = lead({ stage: 'engaged', followUpAt: TODAY })
        expect(pay.attention).toBe('ready_to_pay')
        expect(cb.attention).toBe('callback_due')
        expect(fu.attention).toBe('followup_due')
        expect(pay.attentionRank).toBeLessThan(cb.attentionRank)
        expect(cb.attentionRank).toBeLessThan(fu.attentionRank)
    })

    it('counts an overdue follow-up, not just one dated exactly today', () => {
        expect(lead({ followUpAt: '2026-08-01' }).attention).toBe('followup_due')
        expect(lead({ followUpAt: '2026-08-07' }).attention).toBe('followup_due')
    })

    it('leaves a future follow-up alone', () => {
        expect(lead({ followUpAt: '2026-08-20' }).attention).toBeNull()
    })

    it('never nags about a lead that already paid', () => {
        // The single most damaging thing this screen could do is tell the
        // owner to chase someone who has already given him money.
        const l = lead({ stage: 'closed_won', followUpAt: TODAY, callbackPromised: TODAY })
        expect(l.terminal).toBe(true)
        expect(l.attention).toBeNull()
        expect(l.attentionRank).toBe(99)
    })

    it('never nags about a lead that was closed as lost', () => {
        expect(lead({ stage: 'closed_lost', followUpAt: TODAY }).attention).toBeNull()
    })

    it('covers every bucket key it advertises in the UI', () => {
        const produced = new Set([
            lead({ stage: 'handoff' }).attention,
            lead({ stage: 'ready_to_pay' }).attention,
            lead({ callbackPromised: TODAY }).attention,
            lead({ followUpAt: TODAY }).attention,
        ])
        for (const b of ATTENTION_BUCKETS) expect(produced.has(b.key), `no lead can reach bucket "${b.key}"`).toBe(true)
    })
})

describe('derived display fields', () => {
    it('prefers a real name, then the WhatsApp profile name, then the number', () => {
        expect(lead({ name: 'דנה', profileName: 'Dana K' }).displayName).toBe('דנה')
        expect(lead({ profileName: 'Dana K' }).displayName).toBe('Dana K')
        expect(lead({}).displayName).toBe('972500000001')
    })

    it('builds a wa.me link that opens the real chat', () => {
        expect(lead({}).waLink).toBe('https://wa.me/972500000001')
    })

    it('reads Firestore timestamp shapes as well as plain ms', () => {
        const asObj = lead({ lastInboundAt: { seconds: (NOW - 2 * DAY) / 1000 } })
        const asMs = lead({ lastInboundAt: NOW - 2 * DAY })
        const asApi = lead({ lastInboundAt: { toMillis: () => NOW - 2 * DAY } })
        expect(asObj.silentDays).toBe(2)
        expect(asMs.silentDays).toBe(2)
        expect(asApi.silentDays).toBe(2)
    })

    it('survives a lead with almost nothing on it', () => {
        const l = deriveLead({ phone: '972500000009' }, { todayISO: TODAY, nowMs: NOW })
        expect(l.stage).toBe('new')
        expect(l.attention).toBeNull()
        expect(l.silentDays).toBeNull()
        expect(l.turnCount).toBe(0)
    })
})

describe('sorting', () => {
    it('puts urgent leads above recent ones', () => {
        const urgent = lead({ phone: '972500000002', stage: 'handoff', updatedAt: NOW - 10 * DAY })
        const fresh = lead({ phone: '972500000003', stage: 'engaged', updatedAt: NOW })
        const [first] = sortLeads([fresh, urgent])
        expect(first.phone).toBe('972500000002')
    })

    it('breaks ties inside a bucket by who moved most recently', () => {
        const older = lead({ phone: '972500000004', stage: 'handoff', updatedAt: NOW - 5 * DAY })
        const newer = lead({ phone: '972500000005', stage: 'handoff', updatedAt: NOW - 1 * HOUR })
        expect(sortLeads([older, newer])[0].phone).toBe('972500000005')
    })

    it('does not mutate the array it was given', () => {
        const input = [lead({ phone: '972500000006' }), lead({ phone: '972500000007', stage: 'handoff' })]
        const snapshot = input.map(l => l.phone)
        sortLeads(input)
        expect(input.map(l => l.phone)).toEqual(snapshot)
    })
})

describe('filtering', () => {
    const rows = [
        lead({ phone: '972501111111', name: 'דנה כהן', stage: 'offer_sent', eventType: 'bar_mitzvah' }),
        lead({ phone: '972502222222', name: 'יוסי לוי', stage: 'handoff', eventType: 'wedding', notes: 'שאל על חשבונית' }),
        lead({ phone: '972503333333', profileName: 'Moshe', stage: 'closed_won', eventType: 'bar_mitzvah' }),
    ]

    it('filters by bucket', () => {
        expect(filterLeads(rows, { bucket: 'handoff' }).map(r => r.phone)).toEqual(['972502222222'])
    })

    it('filters by stage and by event type', () => {
        expect(filterLeads(rows, { stage: 'closed_won' })).toHaveLength(1)
        expect(filterLeads(rows, { eventType: 'bar_mitzvah' })).toHaveLength(2)
    })

    it('searches names, phone numbers and the notes the bot wrote', () => {
        expect(filterLeads(rows, { q: 'דנה' })).toHaveLength(1)
        expect(filterLeads(rows, { q: '2222' })).toHaveLength(1)
        expect(filterLeads(rows, { q: 'חשבונית' })).toHaveLength(1)
        expect(filterLeads(rows, { q: 'moshe' })).toHaveLength(1) // case-insensitive
    })

    it('returns everything when nothing is asked for', () => {
        expect(filterLeads(rows, {})).toHaveLength(3)
        expect(filterLeads(rows, { q: '   ' })).toHaveLength(3)
    })
})

describe('summary', () => {
    const rows = [
        lead({ phone: '1', stage: 'closed_won', amount: 950, updatedAt: NOW - 1 * DAY }),
        lead({
            phone: '2', stage: 'closed_won', amount: 690, updatedAt: NOW - 2 * DAY,
            paymentVerified: true, verifiedOrderId: 'verified-order-two',
        }),
        lead({ phone: '3', stage: 'closed_lost', updatedAt: NOW - 3 * DAY }),
        lead({ phone: '4', stage: 'offer_sent', followUpAt: TODAY, updatedAt: NOW - 1 * DAY }),
        lead({ phone: '5', stage: 'handoff', updatedAt: NOW - 40 * DAY }),
    ]

    it('counts the buckets regardless of the window', () => {
        const s = summarizeLeads(rows, { sinceMs: NOW - 7 * DAY })
        // The handoff is 40 days old but still frozen — it must still be
        // counted, or the strip would quietly drop the oldest neglect.
        expect(s.buckets.handoff).toBe(1)
        expect(s.buckets.followup_due).toBe(1)
    })

    it('scopes the funnel to the window', () => {
        const s = summarizeLeads(rows, { sinceMs: NOW - 7 * DAY })
        expect(s.inWindow).toBe(4)
        expect(s.byStage.handoff).toBe(0)
        expect(s.won).toBe(1)
        expect(s.unverifiedWon).toBe(1)
        expect(s.lost).toBe(1)
    })

    it('sums revenue from verified paid leads only', () => {
        expect(summarizeLeads(rows, { sinceMs: NOW - 7 * DAY }).revenue).toBe(690)
    })

    it('computes the close rate over decided leads, not over everyone', () => {
        // 1 verified win, 1 loss → 50%. The manual close is unresolved
        // financially and cannot make the business look healthier.
        expect(summarizeLeads(rows, { sinceMs: NOW - 7 * DAY }).closeRate).toBe(50)
    })

    it('returns null rather than 0% when nothing has been decided yet', () => {
        const s = summarizeLeads([lead({ stage: 'engaged', updatedAt: NOW })], { sinceMs: NOW - 7 * DAY })
        expect(s.closeRate).toBeNull()
    })

    it('counts open leads across all time', () => {
        expect(summarizeLeads(rows).openLeads).toBe(2) // offer_sent + handoff
        expect(summarizeLeads(rows).total).toBe(5)
    })

    it('handles an empty CRM without dividing by zero', () => {
        const s = summarizeLeads([])
        expect(s.total).toBe(0)
        expect(s.closeRate).toBeNull()
        expect(s.buckets.handoff).toBe(0)
    })
})

describe('small helpers', () => {
    it('formats relative time in Hebrew', () => {
        expect(relativeHe(NOW - 30000, NOW)).toBe('הרגע')
        expect(relativeHe(NOW - 5 * 60000, NOW)).toBe('לפני 5 דק׳')
        expect(relativeHe(NOW - 3 * HOUR, NOW)).toBe('לפני 3 שע׳')
        expect(relativeHe(NOW - 4 * DAY, NOW)).toBe('לפני 4 ימים')
        expect(relativeHe(NOW - 70 * DAY, NOW)).toBe('לפני 2 חוד׳')
        expect(relativeHe(null)).toBe('')
    })

    it('reads today in the business timezone, not the server one', () => {
        // 22:30 UTC on the 6th is already the 7th in Israel. A server
        // that used its own clock would schedule follow-ups a day early.
        expect(isoInIsrael(Date.parse('2026-08-06T22:30:00Z'))).toBe('2026-08-07')
    })
})
