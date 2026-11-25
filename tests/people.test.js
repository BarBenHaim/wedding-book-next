import { describe, expect, it } from 'vitest'
import { buildPeople } from '@/lib/people'

// 2026-12-09 is a Wednesday.
const TODAY = '2026-12-09'
const NOW = Date.parse('2026-12-09T09:00:00+02:00')
const DAY = 86_400_000
const ago = days => NOW - days * DAY
const iso = day => new Date(`${day}T10:00:00+02:00`).toISOString()
const book = (weddingDate, extra = {}, facts = {}) => ({
    w: {
        id: 'w1', createdVia: 'order', createdAt: iso('2026-11-30'), amountPaid: 990, weddingDate, slug: 's',
        ownerName: 'דנה כהן', eventType: 'bar_mitzvah', celebrantName: 'איתמר', ownerPhone: '0501234567', digitalTokens: ['t'], ...extra,
    },
    facts: { entries: 10, openRequests: 0, sends: {}, ...facts },
})
const lead = (extra = {}) => ({ phone: '972521111111', stage: 'engaged', profileName: 'מיכל', lastInboundAt: ago(1), createdAt: ago(20), ...extra })
const build = (input = {}) => buildPeople({ today: TODAY, nowMs: NOW, books: [], leads: [], ...input })
const only = input => {
    const { rows } = build(input)
    expect(rows).toHaveLength(1)
    return rows[0]
}

describe('one person, one row', () => {
    it('joins a lead to the book that carries the same phone', () => {
        const row = only({ books: [book('2027-01-20')], leads: [lead({ phone: '972501234567', stage: 'closed_won' })] })
        expect(row).toMatchObject({ kind: 'book', key: 'b:w1', weddingId: 'w1', leadPhone: '972501234567', phone: '972501234567' })
    })

    it('joins a lead to the book it is linked to, even without a phone on the book', () => {
        const row = only({
            books: [book('2027-01-20', { ownerPhone: '' }, { phone: '972521111111' })],
            leads: [lead({ weddingId: 'w1', stage: 'closed_won' })],
        })
        expect(row).toMatchObject({ kind: 'book', leadPhone: '972521111111', phone: '972521111111' })
    })

    it('keeps one row per book and attaches the conversation to the nearest event', () => {
        const { rows } = build({
            books: [book('2027-05-01'), book('2026-12-20', { id: 'w2' })],
            leads: [lead({ phone: '972501234567', stage: 'closed_won' })],
        })
        expect(rows.map(row => row.kind)).toEqual(['book', 'book'])
        expect(rows.find(row => row.weddingId === 'w2').leadPhone).toBe('972501234567')
        expect(rows.find(row => row.weddingId === 'w1').leadPhone).toBeNull()
    })

    it('treats a link to a book that is gone as a lead of its own', () => {
        expect(only({ leads: [lead({ weddingId: 'gone' })] })).toMatchObject({ kind: 'lead', weddingId: null })
    })

    it('leaves out test phones, the owner and demo books', () => {
        const { rows } = build({
            books: [book('2027-01-20', { isDemo: true })],
            leads: [lead({ phone: '972500000901' }), lead({ phone: '972541234567' })],
            ownerPhone: '054-1234567',
        })
        expect(rows).toEqual([])
    })

    it('lists a book without a phone and says the phone is missing', () => {
        const row = only({ books: [book('2026-12-10', { ownerPhone: '' })] })
        expect(row).toMatchObject({ phone: null, next: { key: 'reach', action: 'phone' }, inToday: true })
    })
})

describe('stages', () => {
    it.each([
        ['an event ahead', book('2027-01-20'), 'collect'],
        ['an event of this week', book('2026-12-05'), 'collect'],
        ['a week after the event', book('2026-12-02'), 'print'],
        ['an order at the printer', book('2026-11-20', { printOrderedAt: iso('2026-12-08') }), 'way'],
        ['a shipped book', book('2026-11-20', { shippedAt: iso('2026-12-08') }), 'way'],
        ['a delivered book', book('2026-11-20', { deliveredAt: iso('2026-12-01') }), 'done'],
        ['a closed book', book('2027-01-20', { closedAt: iso('2026-12-01') }), 'done'],
        ['a trial with blessings and no payment', book('2026-11-01', { amountPaid: 0 }), 'collect'],
        ['a past book with nothing on it', book('2026-11-01', { amountPaid: 0 }, { entries: 0 }), 'done'],
    ])('places %s', (_, one, stage) => {
        expect(only({ books: [one] }).stage).toBe(stage)
    })

    it.each([['engaged', 'talk'], ['closed_lost', 'done'], ['closed_won', 'done']])('places a %s lead', (stage, expected) => {
        expect(only({ leads: [lead({ stage })] }).stage).toBe(expected)
    })
})

describe('the next step', () => {
    it('marks printing in one tap after the event', () => {
        expect(only({ books: [book('2026-11-25', { lifecycleSent: { post_1: 1, post_3: 1 } })] }))
            .toMatchObject({ stage: 'print', next: { key: 'approve_print', action: 'mark', field: 'printOrderedAt' }, inToday: true, overdue: true })
    })

    it('marks shipping and arrival the same way', () => {
        expect(only({ books: [book('2026-11-20', { printOrderedAt: iso('2026-11-20') })] }).next).toMatchObject({ action: 'mark', field: 'shippedAt' })
        expect(only({ books: [book('2026-11-20', { shippedAt: iso('2026-12-01') })] }).next).toMatchObject({ action: 'mark', field: 'deliveredAt' })
    })

    it('hands over the words of a message that is his to send', () => {
        const row = only({ books: [book('2026-12-10')] })
        expect(row.next).toMatchObject({ key: 'message', action: 'whatsapp' })
        expect(row.next.text).toContain('דנה')
    })

    it('shows a later step without calling it work for today', () => {
        expect(only({ books: [book('2027-01-20')] })).toMatchObject({ inToday: false, due: '2027-01-06' })
    })

    it('puts a customer message first, even on a finished book', () => {
        expect(only({ books: [book('2026-11-01', { deliveredAt: iso('2026-11-20') }, { openRequests: 1 })] }))
            .toMatchObject({ stage: 'done', next: { key: 'request' }, inToday: true })
    })

    it('shows a waiting draft on the row of its phone', () => {
        const row = only({ leads: [lead({ lastInboundAt: ago(40) })], drafts: [{ number: 3, status: 'pending', phone: '972521111111' }] })
        expect(row).toMatchObject({ resting: false, next: { key: 'request' }, inToday: true, draft: 3 })
    })

    it('gives a draft or a sample of an unknown number a row of its own', () => {
        const { rows } = build({
            drafts: [{ number: 5, status: 'pending', phone: '972527777777', customerName: 'רון' }],
            samples: [{ id: 's9', status: 'ready', phone: '972528888888', name: 'טל' }],
        })
        expect(rows).toMatchObject([
            { key: 'l:972527777777', name: 'רון', next: { key: 'request' }, inToday: true, draft: 5 },
            { key: 'l:972528888888', name: 'טל', next: { key: 'sample' }, inToday: true, sample: 's9' },
        ])
    })

    it('shows a sample that waits for approval on the lead', () => {
        const row = only({ leads: [lead()], samples: [{ id: 's1', status: 'ready', phone: '972521111111' }] })
        expect(row).toMatchObject({ next: { key: 'sample' }, inToday: true, sample: 's1' })
    })

    it.each([
        ['asked for him', { stage: 'handoff' }, 'handoff'],
        ['is in his hands', { human: true }, 'handoff'],
        ['is ready to pay', { stage: 'ready_to_pay' }, 'ready_to_pay'],
        ['promised to come back today', { callbackPromised: TODAY }, 'callback_due'],
    ])('asks him to act on a lead that %s', (_, extra, key) => {
        expect(only({ leads: [lead(extra)] })).toMatchObject({ next: { key, action: 'whatsapp' }, inToday: true })
    })

    it('does not make the agent\'s own follow-up his task', () => {
        expect(only({ leads: [lead({ followUpAt: TODAY })] })).toMatchObject({ next: null, inToday: false, resting: false })
    })

    it('asks to check a recent payment that has no book', () => {
        expect(only({ leads: [lead({ stage: 'closed_won', closedAt: ago(2) })] }))
            .toMatchObject({ stage: 'collect', next: { key: 'no_book', action: 'open' }, inToday: true })
        expect(only({ leads: [lead({ stage: 'closed_won', closedAt: ago(30) })] })).toMatchObject({ stage: 'done', next: null })
    })

    it('leaves a balance to be settled before anything is marked', () => {
        expect(only({ books: [book('2026-11-25', { paymentStage: 'deposit', amountPaid: 190, lifecycleSent: { post_1: 1, post_3: 1 } })] }).next)
            .toMatchObject({ key: 'balance', action: 'open' })
    })

    it('keeps a deferred book quiet until its day', () => {
        const row = only({
            books: [book('2026-11-25', { boardDeferUntil: '2026-12-20' })],
            leads: [lead({ phone: '972501234567', stage: 'handoff' })],
        })
        expect(row).toMatchObject({ inToday: false, due: '2026-12-20' })
    })
})

describe('resting', () => {
    const silent = extra => lead({ lastInboundAt: ago(15), ...extra })

    it('rests a lead after fourteen silent days, old calls for him included', () => {
        for (const extra of [{}, { stage: 'handoff' }, { human: true }, { followUpAt: TODAY }]) {
            expect(only({ leads: [silent(extra)] })).toMatchObject({ resting: true, inToday: false })
        }
    })

    it.each([
        ['an event ahead', { eventDate: '2027-02-10' }],
        ['a date to come back on', { callbackPromised: '2026-12-15' }],
        ['a promise that just came due', { callbackPromised: '2026-12-05' }],
    ])('keeps a silent lead with %s', (_, extra) => {
        expect(only({ leads: [silent(extra)] }).resting).toBe(false)
    })

    it('rests an old past event that was never sorted, unless the customer wrote', () => {
        const old = { createdAt: iso('2026-09-01'), createdVia: undefined }
        expect(only({ books: [book('2026-10-01', old)] })).toMatchObject({ resting: true, inToday: false })
        expect(only({ books: [book('2026-10-01', old, { openRequests: 1 })] })).toMatchObject({ resting: false, inToday: true })
    })

    it('counts only the living in the stages', () => {
        const { counts } = build({
            books: [book('2027-01-20')],
            leads: [lead(), silent({ phone: '972522222222' }), lead({ phone: '972523333333', stage: 'ready_to_pay' }), lead({ phone: '972524444444', stage: 'closed_lost' })],
        })
        expect(counts).toEqual({ today: 1, talk: 2, collect: 1, print: 0, way: 0, resting: 1, done: 1 })
    })
})

describe('order', () => {
    it('puts what is late first, then today, then what comes later', () => {
        const { rows } = build({
            books: [book('2027-01-20'), book('2026-11-25', { id: 'late', ownerPhone: '0509999999', lifecycleSent: { post_1: 1, post_3: 1 } })],
            leads: [lead({ stage: 'ready_to_pay' })],
        })
        expect(rows.map(row => row.key)).toEqual(['b:late', 'l:972521111111', 'b:w1'])
    })
})
