import { describe, expect, it } from 'vitest'
import { buildToday } from '@/lib/adminToday'

const row = (id, extra = {}) => ({
    id, title: id, eventType: 'bar_mitzvah', day: '2026-12-10', toEvent: 15, entries: 3, group: 'upcoming',
    next: { key: 'wait_event', label: 'להמתין לאירוע' }, overdue: false, ...extra,
})
const base = extra => ({
    today: '2026-11-25',
    rows: [],
    drafts: [],
    samples: [],
    claude: { alert: null },
    usageDays: [],
    bot: { enabled: true, mode: 'full_sales', model: 'claude-opus-5-5', modelLabel: 'Claude Opus 5.5' },
    switches: { requests: false, samples: false, followups: false },
    ...extra,
})

describe('what waits today', () => {
    it('puts a Claude failure first, then replies to approve, samples, then the books', () => {
        const view = buildToday(base({
            claude: { alert: 'alert-words' },
            drafts: [{ number: 3, status: 'pending', customerName: 'כהן', summary: 'לתקן שם', text: 'קיבלנו', windowOpen: true, tasks: [] }],
            samples: [{ id: 's1', status: 'ready', name: 'דנה', phone: '972500001234', previewUrl: 'u', windowOpen: true }],
            rows: [row('איתמר', { group: 'today', toEvent: 1, next: { key: 'remind', label: 'לשלוח תזכורת' } })],
        }))

        expect(view.tasks.map(task => task.kind)).toEqual(['claude', 'draft', 'sample', 'book'])
        expect(view.tasks[1]).toMatchObject({ id: 3, canApprove: true, detail: expect.stringContaining('קיבלנו') })
        expect(view.tasks[2]).toMatchObject({ id: 's1', canApprove: true, image: 'u' })
        // The customer board is where that step can be finished.
        expect(view.tasks[3]).toMatchObject({ href: '/admin/customers?id=%D7%90%D7%99%D7%AA%D7%9E%D7%A8' })
        expect(view.counts.tasks).toBe(4)
    })

    it('cannot approve a reply whose window closed, or one with nothing to send', () => {
        const view = buildToday(base({ drafts: [
            { number: 1, status: 'pending', text: 'x', windowOpen: false, tasks: [] },
            { number: 2, status: 'needs_owner', text: '', windowOpen: true, tasks: [] },
        ] }))

        expect(view.tasks.map(task => task.canApprove)).toEqual([false, false])
    })

    it('knows whether a reply still waits or only its tasks are open', () => {
        const view = buildToday(base({ drafts: [
            { number: 1, status: 'pending', text: 'x', windowOpen: true, tasks: [] },
            { number: 2, status: 'sent', text: 'x', windowOpen: true, tasks: ['לתקן שם'] },
        ] }))

        expect(view.tasks.map(task => task.waiting)).toEqual([true, false])
    })

    it('does not list the same customer request twice', () => {
        const view = buildToday(base({
            drafts: [{ number: 1, status: 'pending', text: 'x', weddingId: 'w1', windowOpen: true, tasks: [] }],
            rows: [row('w1', { group: 'today', next: { key: 'request', label: 'הלקוח כתב' } })],
        }))

        expect(view.tasks.map(task => task.kind)).toEqual(['draft'])
    })

    it('gathers samples still to draw into one line', () => {
        const view = buildToday(base({ samples: [{ id: 'a', status: 'pending' }, { id: 'b', status: 'receiving' }] }))

        expect(view.tasks).toEqual([expect.objectContaining({ kind: 'draw', title: expect.stringContaining('2') })])
    })

    it('shows a few and says how many more, and mentions old events apart', () => {
        const view = buildToday(base({
            rows: [
                ...Array.from({ length: 9 }, (_, i) => row(`b${i}`, { group: 'today', next: { key: 'x', label: 'לטפל' } })),
                ...Array.from({ length: 50 }, (_, i) => row(`old${i}`, { group: 'triage' })),
            ],
        }))

        expect(view.tasks).toHaveLength(4)
        expect(view.moreTasks).toBe(5)
        expect(view.counts.tasks).toBe(9)
        expect(view.oldEvents).toBe(50)
    })
})

describe('customers, the bot and money', () => {
    it('counts the active customers and the week, nearest event first', () => {
        const view = buildToday(base({ rows: [
            row('later', { toEvent: 40 }),
            row('tomorrow', { toEvent: 1, group: 'today' }),
            row('past', { toEvent: -3 }),
            row('done', { group: 'done', toEvent: 2 }),
            row('old', { group: 'triage', toEvent: -200 }),
        ] }))

        expect(view.counts).toMatchObject({ active: 3, week: 1 })
        expect(view.customers.map(c => c.id)).toEqual(['tomorrow', 'later', 'past'])
        expect(view.customers[0]).toMatchObject({ event: 'בר מצווה', step: 'להמתין לאירוע' })
    })

    it('adds the month by provider and today\'s model calls', () => {
        const view = buildToday(base({ usageDays: [
            { date: '2026-11-24', usd: 2, anthropicUsd: 1.5, openaiUsd: 0.5, calls: 4 },
            { date: '2026-11-25', usd: 1, anthropicUsd: 0.9, geminiUsd: 0.1, calls: 7 },
            { date: '2026-10-31', usd: 9, anthropicUsd: 9, calls: 1 },
        ] }))

        expect(view.spend).toEqual({ month: 3, anthropic: 2.4, openai: 0.5, other: 0.1 })
        expect(view.bot.callsToday).toBe(7)
    })

    it('says when a part could not be read instead of showing zero', () => {
        const view = buildToday(base({ usageDays: null, bot: null, drafts: null }))

        expect(view.spend).toBeNull()
        expect(view.bot).toBeNull()
        expect(view.unread).toEqual(['בקשות לקוחות'])
    })

    it('has no customer counts at all when the customers could not be read', () => {
        const view = buildToday(base({ rows: null }))

        expect(view.counts.active).toBeNull()
        expect(view.counts.week).toBeNull()
        // Nothing found in the sources that did answer is not "nothing to do".
        expect(view.counts.tasks).toBeNull()
        expect(view.unread).toEqual(['לקוחות'])
    })
})
