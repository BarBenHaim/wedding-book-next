import { describe, expect, it } from 'vitest'
import { buildToday } from '@/lib/adminToday'

// A row of the list of people, as lib/people.js builds it.
const row = (key, extra = {}) => ({
    key, name: key, what: 'בר מצווה', day: '2026-12-10', toEvent: 15, stage: 'collect', resting: false,
    next: { key: 'wait_event', label: 'להמתין לאירוע', action: null }, inToday: false, overdue: false, draft: null, sample: null, ...extra,
})
const due = (key, extra = {}) => row(key, { inToday: true, next: { key: 'approve_print', label: 'לטפל', action: 'mark' }, ...extra })
const people = (rows, extra = {}) => ({
    rows, unread: [],
    counts: {
        today: rows.filter(item => item.inToday).length,
        ...Object.fromEntries(['talk', 'collect', 'print', 'way'].map(stage => [stage, rows.filter(item => !item.resting && item.stage === stage).length])),
    },
    ...extra,
})
const base = extra => ({
    today: '2026-11-25',
    people: people([]),
    drafts: [],
    samples: [],
    claude: { alert: null },
    usageDays: [],
    bot: { enabled: true, mode: 'full_sales', model: 'claude-opus-5-5', modelLabel: 'Claude Opus 5.5' },
    switches: { requests: false, samples: false, followups: false },
    ...extra,
})

describe('what waits today', () => {
    it('puts a Claude failure first, then replies to approve, samples, then the people', () => {
        const view = buildToday(base({
            claude: { alert: 'alert-words' },
            drafts: [{ number: 3, status: 'pending', customerName: 'כהן', summary: 'לתקן שם', text: 'קיבלנו', windowOpen: true, tasks: [] }],
            samples: [{ id: 's1', status: 'ready', name: 'דנה', phone: '972500001234', previewUrl: 'u', windowOpen: true }],
            people: people([due('b:w1', { name: 'איתמר', overdue: true })]),
        }))

        expect(view.tasks.map(task => task.kind)).toEqual(['claude', 'draft', 'sample', 'person'])
        expect(view.tasks[1]).toMatchObject({ id: 3, canApprove: true, detail: expect.stringContaining('קיבלנו') })
        expect(view.tasks[2]).toMatchObject({ id: 's1', canApprove: true, image: 'u' })
        // The person's own window is where that step is finished.
        expect(view.tasks[3]).toMatchObject({ id: 'b:w1', title: 'איתמר', detail: 'לטפל · באיחור', row: { key: 'b:w1' } })
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

    it('does not list the same request or sample twice', () => {
        const view = buildToday(base({
            drafts: [{ number: 1, status: 'pending', text: 'x', weddingId: 'w1', windowOpen: true, tasks: [] }],
            samples: [{ id: 's1', status: 'ready', phone: '972500001234', windowOpen: true }],
            people: people([due('b:w1', { draft: 1 }), due('l:972500001234', { sample: 's1' })]),
        }))

        expect(view.tasks.map(task => task.kind)).toEqual(['draft', 'sample'])
    })

    it('gathers samples still to draw into one line', () => {
        const view = buildToday(base({ samples: [{ id: 'a', status: 'pending' }, { id: 'b', status: 'receiving' }] }))

        expect(view.tasks).toEqual([expect.objectContaining({ kind: 'draw', title: expect.stringContaining('2') })])
    })

    it('shows a few and says how many more, with the same count as the list', () => {
        const view = buildToday(base({ people: people([
            ...Array.from({ length: 9 }, (_, i) => due(`b:${i}`)),
            ...Array.from({ length: 50 }, (_, i) => row(`l:${i}`, { resting: true })),
        ]) }))

        expect(view.tasks).toHaveLength(4)
        expect(view.moreTasks).toBe(5)
        expect(view.counts.today).toBe(9)
    })
})

describe('customers, the bot and money', () => {
    it('counts the active customers and the week, nearest event first', () => {
        const view = buildToday(base({ people: people([
            row('later', { toEvent: 40 }),
            row('tomorrow', { toEvent: 1 }),
            row('past', { toEvent: -3 }),
            row('undated', { toEvent: null, stage: 'talk', what: '', next: null }),
            row('done', { stage: 'done', toEvent: 2 }),
            row('asleep', { resting: true, toEvent: 3 }),
        ]) }))

        expect(view.counts).toMatchObject({ active: 4, week: 1 })
        expect(view.customers.map(c => c.id)).toEqual(['tomorrow', 'later', 'past', 'undated'])
        expect(view.customers[0]).toMatchObject({ event: 'בר מצווה', step: 'להמתין לאירוע' })
        expect(view.customers[3]).toMatchObject({ event: 'אירוע', step: 'בשיחה' })
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

    it('has no customer counts at all when the books or the leads could not be read', () => {
        for (const unread of [['ספרים'], ['לידים']]) {
            const view = buildToday(base({ people: people([row('a')], { unread }) }))
            expect(view.counts).toEqual({ today: null, active: null, week: null })
            expect(view.unread).toEqual(unread)
        }
        const view = buildToday(base({ people: null }))
        // Nothing found in the sources that did answer is not "nothing to do".
        expect(view.counts).toEqual({ today: null, active: null, week: null })
        expect(view.unread).toEqual(['לקוחות'])
    })
})
