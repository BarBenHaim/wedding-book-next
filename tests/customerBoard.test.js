import { describe, expect, it } from 'vitest'
import { boardRow, buildCustomerBoard } from '@/lib/customerBoard'

// 2026-12-09 is a Wednesday.
const TODAY = '2026-12-09'
const iso = day => new Date(`${day}T10:00:00+02:00`).toISOString()
const book = (weddingDate, extra = {}) => ({
    id: 'w1', createdVia: 'order', createdAt: iso('2026-11-30'), amountPaid: 990, weddingDate, slug: 's',
    ownerName: 'דנה', eventType: 'bar_mitzvah', celebrantName: 'איתמר', ownerPhone: '0501234567', digitalTokens: ['t'], ...extra,
})
const row = (w, facts = {}, enabledDay = null) => boardRow({ w, facts: { entries: 10, ...facts }, today: TODAY, enabledDay })

describe('boardRow', () => {
    it('leaves demo events out', () => {
        expect(row(book('2026-12-20', { isDemo: true }))).toBeNull()
    })

    it('asks Lord to send a due message by hand while automatic sending is off', () => {
        expect(row(book('2026-12-10'))).toMatchObject({ group: 'today', next: { key: 'message', message: 'eve' }, due: TODAY, auto: false })
    })

    it('shows the same message as scheduled, not as his task, once sending is on', () => {
        expect(row(book('2026-12-10'), {}, '2026-12-01')).toMatchObject({ group: 'upcoming', next: { key: 'message', message: 'eve' }, auto: true })
    })

    it('hands back to him what cannot go by itself', () => {
        expect(row(book('2026-12-10', { ownerPhone: '' }), {}, '2026-12-01'))
            .toMatchObject({ group: 'today', next: { key: 'reach' }, blocked: 'no_phone' })
    })

    it('puts a waiting customer request first', () => {
        expect(row(book('2027-01-20'), { openRequests: 2 })).toMatchObject({ group: 'today', next: { key: 'request' } })
    })

    it('flags a close event with no blessings', () => {
        expect(row(book('2026-12-14'), { entries: 0 })).toMatchObject({ group: 'today', next: { key: 'no_blessings' } })
    })

    it('schedules the next message of a far event', () => {
        expect(row(book('2027-01-20'))).toMatchObject({ group: 'upcoming', next: { key: 'message', message: 'share_14' }, due: '2027-01-06' })
    })

    it('asks for approval and print a week after the event, and marks it overdue after that', () => {
        const late = row(book('2026-11-25', { lifecycleSent: { post_1: 1, post_3: 1 } }))
        expect(late).toMatchObject({ group: 'today', next: { key: 'approve_print' }, due: '2026-12-02', overdue: true })
    })

    it('asks for the balance first when only a deposit was paid', () => {
        expect(row(book('2026-11-25', { paymentStage: 'deposit', amountPaid: 190 })).next.key).toBe('balance')
    })

    it('follows print and shipping to the end', () => {
        expect(row(book('2026-11-20', { printOrderedAt: iso('2026-12-08') }))).toMatchObject({ group: 'upcoming', next: { key: 'mark_shipped' }, due: '2026-12-22' })
        expect(row(book('2026-11-20', { shippedAt: iso('2026-12-01') }))).toMatchObject({ group: 'today', next: { key: 'confirm_arrived' }, overdue: true })
        expect(row(book('2026-11-20', { deliveredAt: iso('2026-12-01') }))).toMatchObject({ group: 'done' })
        expect(row(book('2026-11-20', { closedAt: iso('2026-12-01') }))).toMatchObject({ group: 'done' })
    })

    it('asks to sort an old past event once, but not an old event still ahead', () => {
        const old = { createdAt: iso('2026-09-01'), createdVia: undefined }
        expect(row(book('2026-10-10', old))).toMatchObject({ group: 'triage', next: { key: 'triage' } })
        expect(row(book('2026-12-10', old))).toMatchObject({ next: { key: 'message', message: 'eve' } })
        expect(row(book('2026-10-10', { ...old, triagedAt: iso('2026-12-01') }))).toMatchObject({ group: 'today', next: { key: 'approve_print' } })
    })

    it('treats a used book with no payment as a sale to check, and an unused past one as closed', () => {
        expect(row(book('2026-12-01', { amountPaid: 0 }), { entries: 5 })).toMatchObject({ group: 'chance', next: { key: 'check_payment' } })
        expect(row(book('2026-12-01', { amountPaid: 0 }), { entries: 0 })).toMatchObject({ group: 'done' })
    })

    it('asks for a missing date', () => {
        expect(row(book(''))).toMatchObject({ group: 'today', next: { key: 'ask_date' } })
    })

    it('moves a deferred task to its new day', () => {
        expect(row(book(''), {}, null)).toMatchObject({ group: 'today' })
        expect(row(book('', { boardDeferUntil: '2026-12-15' }))).toMatchObject({ group: 'upcoming', due: '2026-12-15', overdue: false })
        expect(row(book('', { boardDeferUntil: TODAY }))).toMatchObject({ group: 'today' })
    })
})

describe('after the first day with the board', () => {
    it('says which marks a row carries, so each can be undone', () => {
        const marked = row(book('2026-11-20', { deliveredAt: iso('2026-12-01'), triagedAt: iso('2026-12-01') }))

        expect(marked.marks).toEqual(['deliveredAt', 'triagedAt'])
        expect(row(book('2027-01-20')).marks).toEqual([])
    })

    it('keeps messages of events from before the switch-on day as his own tasks', () => {
        // Event yesterday, automatic sending turned on today.
        expect(row(book('2026-12-08'), {}, TODAY)).toMatchObject({ group: 'today', next: { key: 'message', message: 'post_1' }, auto: false })
    })

    it('turns a failed message into a task until it is dealt with', () => {
        const failed = { sends: { post_1: { status: 'failed' } } }
        const w = book('2026-12-08', { lifecycleSent: { post_1: 1 } })

        expect(row(w, failed, '2026-12-01')).toMatchObject({ group: 'today', next: { key: 'send_failed', message: 'post_1' } })
        expect(row(w, { sends: { post_1: { status: 'manual' } } }, '2026-12-01').next.key).not.toBe('send_failed')
        expect(row(book('2026-12-08', { deliveredAt: iso('2026-12-09') }), failed).group).toBe('done')
    })
})

describe('buildCustomerBoard', () => {
    it('gives every row that is not closed a next step and a day, most overdue first', () => {
        const board = buildCustomerBoard([
            { w: book('2026-11-30', { id: 'late', lifecycleSent: { post_1: 1, post_3: 1 } }), facts: { entries: 3 } },
            { w: book('', { id: 'nodate' }), facts: { entries: 3 } },
            { w: book('2026-11-20', { id: 'done', deliveredAt: iso('2026-12-01') }), facts: { entries: 3 } },
        ], TODAY, null)

        expect(board.rows.filter(item => item.group === 'today').map(item => item.id)).toEqual(['late', 'nodate'])
        for (const item of board.rows.filter(entry => entry.group !== 'done')) {
            expect(item.next.label).toBeTruthy()
            expect(item.due).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        }
        expect(board.counts).toMatchObject({ today: 2, done: 1 })
    })
})
