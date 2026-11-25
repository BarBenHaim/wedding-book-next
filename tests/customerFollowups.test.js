import { describe, expect, it } from 'vitest'
import { dueFollowup, followupBlock, isNoSendDay, renderFollowup, scheduleFor, templateFor } from '@/lib/customerFollowups'

// 2026-12-09 is a Wednesday, 2026-12-12 a Saturday.
const book = (weddingDate, extra = {}) => ({
    id: 'w1', amountPaid: 990, weddingDate, slug: 'abc123', ownerName: 'דנה כהן',
    eventType: 'bar_mitzvah', celebrantName: 'איתמר', ownerPhone: '050-123-4567', digitalTokens: ['view-token'], ...extra,
})
const facts = { openRequests: 0, paused: false }
const due = (w, today, extra = {}) => dueFollowup({ w, facts, today, enabledDay: '2026-12-01', ...extra })?.key ?? null

describe('isNoSendDay', () => {
    it('rests on Saturday and on the Jewish holidays', () => {
        expect(isNoSendDay('2026-12-12')).toBe(true) // Saturday
        expect(isNoSendDay('2027-04-22')).toBe(true) // 15 Nisan
        expect(isNoSendDay('2027-10-02')).toBe(true) // 1 Tishrei
        expect(isNoSendDay('2027-06-11')).toBe(true) // 6 Sivan
    })

    it('works on an ordinary weekday, including Friday', () => {
        expect(isNoSendDay('2026-12-09')).toBe(false)
        expect(isNoSendDay('2026-12-11')).toBe(false)
    })
})

describe('dueFollowup', () => {
    it('picks the message of the day around the event', () => {
        const w = book('2026-12-30')
        expect(due(w, '2026-12-15')).toBeNull() // 15 days before
        expect(due(w, '2026-12-16')).toBe('share_14')
        expect(due(w, '2026-12-22')).toBe('share_14') // 8 days before
        expect(due(w, '2026-12-23')).toBeNull()
        expect(due(w, '2026-12-28')).toBe('eve')
        expect(due(w, '2026-12-30')).toBeNull() // nothing on the day itself
        expect(due(w, '2026-12-31')).toBe('post_1')
        expect(due(w, '2027-01-04')).toBe('post_3') // 5 days after
        expect(due(w, '2027-01-06')).toBeNull()
    })

    it('never sends the same key twice, even after a failure', () => {
        const w = book('2026-12-30', { lifecycleSent: { post_1: 123 } })
        expect(due(w, '2026-12-31')).toBeNull()
    })

    it('waits out Saturday without losing the message', () => {
        // Event Friday 11.12: the day after is Saturday.
        const w = book('2026-12-11')
        expect(due(w, '2026-12-12')).toBeNull()
        expect(due(w, '2026-12-13')).toBe('post_1')
        expect(due(w, '2026-12-14')).toBe('post_1')
        expect(due(w, '2026-12-15')).toBeNull()
    })

    it('brings the sign reminder forward when both days before the event are rest days', () => {
        // Sukkot 2027: 16.10 is a Saturday and holiday, 15.10 is a Friday. Use an event on Sunday 17.10:
        // the days before are Saturday 16.10 and Friday 15.10, so Friday still serves.
        expect(due(book('2027-10-17'), '2027-10-15', { enabledDay: '2027-10-01' })).toBe('eve')
        // Rosh Hashana 2027 falls on Saturday 2.10 and Sunday 3.10: an event on Monday 4.10 is reminded on Friday 1.10.
        expect(due(book('2027-10-04'), '2027-10-01', { enabledDay: '2027-09-01' })).toBe('eve')
    })

    it('does not reach back to events from before the switch was turned on', () => {
        expect(due(book('2026-12-08'), '2026-12-09', { enabledDay: '2026-12-09' })).toBeNull()
        expect(due(book('2026-12-09'), '2026-12-10', { enabledDay: '2026-12-09' })).toBe('post_1')
    })

    it('sends nothing without a switch-on day or on a rest day', () => {
        expect(due(book('2026-12-30'), '2026-12-16', { enabledDay: null })).toBeNull()
        expect(due(book('2026-12-30'), '2026-12-19')).toBeNull() // Saturday inside the share window
    })
})

describe('scheduleFor', () => {
    const plan = (w, today, enabledDay) => scheduleFor({ w, facts, today, enabledDay }).map(item => `${item.key} ${item.day}`)

    it('lays out every message still to come, moving off rest days', () => {
        // Wednesday 30.12.2026
        expect(plan(book('2026-12-30'), '2026-12-01', '2026-12-01')).toEqual([
            'share_14 2026-12-16', 'eve 2026-12-28', 'post_1 2026-12-31', 'post_3 2027-01-04',
        ])
    })

    it('skips what already went and shows only what is left', () => {
        expect(plan(book('2026-12-30', { lifecycleSent: { share_14: 1, eve: 1 } }), '2026-12-29', '2026-12-01'))
            .toEqual(['post_1 2026-12-31', 'post_3 2027-01-04'])
    })

    it('shows an event from yesterday when sending is by hand, and not after switching on today', () => {
        expect(plan(book('2026-12-30'), '2026-12-31')[0]).toBe('post_1 2026-12-31')
        expect(plan(book('2026-12-30'), '2026-12-31', '2026-12-31')).toEqual([])
    })
})

describe('followupBlock', () => {
    const blocked = (extra, f = {}) => followupBlock(book('2026-12-30', extra), { ...facts, ...f })

    it('allows a paid, open, reachable customer', () => {
        expect(blocked({})).toBeNull()
    })

    it.each([
        ['unpaid', { amountPaid: 0 }, {}],
        ['demo', { isDemo: true }, {}],
        ['closed', { closedAt: 'x' }, {}],
        ['in_print', { printOrderedAt: 'x' }, {}],
        ['in_print', { printOrder: { luluStatus: 'CREATED' } }, {}],
        ['in_print', { deliveredAt: 'x' }, {}],
        ['muted', { lifecycleOff: true }, {}],
        ['no_phone', { ownerPhone: '' }, {}],
        ['no_phone', { ownerPhone: '03-1234567' }, {}],
        ['no_title', { celebrantName: '' }, {}],
        ['open_request', {}, { openRequests: 1 }],
        ['human', {}, { paused: true }],
    ])('blocks %s', (reason, extra, f) => {
        expect(blocked(extra, f)).toBe(reason)
    })

    it('takes the phone from the private customer list when the book has none', () => {
        expect(blocked({ ownerPhone: '' }, { phone: '972501234567' })).toBeNull()
    })
})

describe('templateFor', () => {
    const base = 'https://app.example'

    it('fills the approved template of each message in order', () => {
        const w = book('2026-12-30')
        expect(templateFor('share_14', w, base)).toEqual({ name: 'wt_share_14', params: ['דנה', 'איתמר', `${base}/w/abc123`] })
        expect(templateFor('eve', w, base)).toEqual({ name: 'wt_eve', params: ['דנה', 'איתמר', `${base}/wedding/w1/portal?view=poster`] })
        expect(templateFor('post_1', w, base)).toEqual({ name: 'wt_after', params: ['דנה', 'איתמר', `${base}/wedding/w1/book/view-token`, `${base}/w/abc123`] })
        expect(templateFor('post_3', w, base)).toEqual({ name: 'wt_review', params: ['דנה', 'איתמר', `${base}/wedding/w1/portal`] })
    })

    it('never carries a sign-in token, and greets someone without a name', () => {
        const w = book('2026-12-30', { ownerName: '' })
        const all = ['share_14', 'eve', 'post_1', 'post_3'].flatMap(key => templateFor(key, w, base).params)
        expect(all.join(' ')).not.toMatch(/enter|token=/)
        expect(templateFor('eve', w, base).params[0]).toBe('לכם')
    })

    it('writes the approved text for sending by hand', () => {
        const text = renderFollowup('post_1', book('2026-12-30'), base)
        expect(text).toBe(`היי דנה, מזל טוב! 💛 מקווים שהאירוע של איתמר היה מרגש. לצפייה בספר: ${base}/wedding/w1/book/view-token ולמי שלא הספיק לכתוב ברכה, זה הקישור: ${base}/w/abc123 אפשר להעביר אותו לאורחים.`)
        expect(renderFollowup('eve', book('2026-12-30'), base)).not.toMatch(/\{\{/)
        expect(renderFollowup('post_1', book('2026-12-30', { digitalTokens: [] }), base)).toBeNull()
    })

    it('has no message without the link it is about', () => {
        expect(templateFor('post_1', book('2026-12-30', { digitalTokens: [] }), base)).toBeNull()
        expect(templateFor('share_14', book('2026-12-30', { slug: '' }), base)).toBeNull()
    })
})
