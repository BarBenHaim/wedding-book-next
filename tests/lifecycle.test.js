import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import {
    nextMessage,
    renderLifecycleEmail,
    messageCopy,
    digestLines,
    dailySummary,
    bookTitleOf,
    daysBetween,
    israelDate,
    LIFECYCLE_START_MS,
} from '@/lib/lifecycle'

const DAY = 24 * 60 * 60 * 1000
// noon in Israel on 2026-12-10
const NOW = Date.parse('2026-12-10T12:00:00+02:00')
const created = daysAgo => ({ toMillis: () => NOW - daysAgo * DAY })
const dateOffset = d => israelDate(NOW + d * DAY)
const base = (over = {}) => ({
    createdVia: 'order',
    ownerEmail: 'dana@example.com',
    createdAt: created(3),
    paymentStage: 'deposit',
    celebrantName: 'נועם',
    eventType: 'bar_mitzvah',
    ...over,
})

describe('dates', () => {
    it('counts whole days', () => {
        expect(daysBetween('2026-12-10', '2026-12-24')).toBe(14)
        expect(daysBetween('2026-12-10', '2026-12-09')).toBe(-1)
        expect(daysBetween('x', '2026-12-09')).toBeNaN()
    })
})

describe('which message is due', () => {
    it('a nudge two days after the order when nobody wrote', () => {
        expect(nextMessage({ w: base(), entries: 0, now: NOW })).toEqual({ key: 'nudge_share', kind: 'nudge' })
        expect(nextMessage({ w: base(), entries: 4, now: NOW })).toBe(null)
        expect(nextMessage({ w: base({ createdAt: created(1) }), entries: 0, now: NOW })).toBe(null)
    })

    it('never sends the same message twice', () => {
        expect(nextMessage({ w: base(), entries: 0, now: NOW, sent: { nudge_share: 1 } })).toBe(null)
    })

    it('two weeks out: share; the last days: the sign', () => {
        expect(nextMessage({ w: base({ weddingDate: dateOffset(12) }), entries: 3, now: NOW }).key).toBe('share_14')
        expect(nextMessage({ w: base({ weddingDate: dateOffset(1) }), entries: 3, now: NOW }).key).toBe('eve')
    })

    it('after the event: stragglers, then the review', () => {
        expect(nextMessage({ w: base({ weddingDate: dateOffset(-1) }), entries: 9, now: NOW }).key).toBe('post_1')
        expect(nextMessage({ w: base({ weddingDate: dateOffset(-4), paymentStage: 'paid' }), entries: 9, now: NOW }).key).toBe('post_3')
    })

    it('a deposit waits for its balance, a paid event does not', () => {
        expect(nextMessage({ w: base({ weddingDate: dateOffset(-8) }), entries: 9, now: NOW }).key).toBe('balance_7')
        expect(nextMessage({ w: base({ weddingDate: dateOffset(-20) }), entries: 9, now: NOW }).key).toBe('balance_14')
        expect(nextMessage({ w: base({ weddingDate: dateOffset(-8), paymentStage: 'paid' }), entries: 9, now: NOW })).toBe(null)
    })

    it('a missed day is caught up inside its window, an old moment never fires', () => {
        // two days late for post_1, still inside its window
        expect(nextMessage({ w: base({ weddingDate: dateOffset(-2) }), entries: 9, now: NOW }).key).toBe('post_1')
        // a month and a half after the event: nothing left to say
        expect(nextMessage({ w: base({ weddingDate: dateOffset(-60) }), entries: 9, now: NOW })).toBe(null)
    })

    it('no nudge once the event is two days away', () => {
        expect(nextMessage({ w: base({ weddingDate: dateOffset(1), createdAt: created(5) }), entries: 0, now: NOW }).key).toBe('eve')
    })
})

describe('whose events these are', () => {
    it('only events opened by a paid order', () => {
        expect(nextMessage({ w: base({ createdVia: 'self_serve' }), entries: 0, now: NOW })).toBe(null)
        expect(nextMessage({ w: base({ createdVia: undefined }), entries: 0, now: NOW })).toBe(null)
    })

    it('only events created after the engine started', () => {
        const old = { toMillis: () => LIFECYCLE_START_MS - DAY }
        expect(nextMessage({ w: base({ createdAt: old }), entries: 0, now: NOW })).toBe(null)
    })

    it('not without an address, and not when switched off', () => {
        expect(nextMessage({ w: base({ ownerEmail: '' }), entries: 0, now: NOW })).toBe(null)
        expect(nextMessage({ w: base({ lifecycleOff: true }), entries: 0, now: NOW })).toBe(null)
    })
})

describe('the e-mails', () => {
    const links = { share: 'https://wa.me/?text=x', sign: 'https://s.test/sign', portal: 'https://s.test/enter?t=1', balance: 'https://s.test/pay' }
    const kinds = ['nudge', 'share', 'eve', 'post1', 'review', 'balance']

    it('every kind has copy and a main action that exists in the links', () => {
        for (const k of kinds) {
            const copy = messageCopy(k, { title: 'נועם', entries: 5, balanceDue: 800 })
            expect(copy.subject).toContain('נועם')
            expect(links[copy.primary]).toBeTruthy()
        }
    })

    it('renders html and plain text with the links', () => {
        const m = renderLifecycleEmail('balance', { title: 'נועם', entries: 5, balanceDue: 800 }, links)
        expect(m.html).toContain('href="https://s.test/pay"')
        expect(m.html).toContain('800 ₪')
        expect(m.text).toContain('https://s.test/pay')
    })

    it('escapes what the owner typed', () => {
        const m = renderLifecycleEmail('nudge', { title: '<b>x</b>', entries: 0 }, links)
        expect(m.html).not.toContain('<b>x</b>')
    })

    it('an unknown kind renders nothing', () => {
        expect(renderLifecycleEmail('nope', {}, links)).toBe(null)
    })
})

describe('titles and the owner digest', () => {
    it('names the book the way the owner knows it', () => {
        expect(bookTitleOf({ eventType: 'wedding', brideName: 'דנה', groomName: 'איתי' })).toBe('דנה & איתי')
        expect(bookTitleOf({ celebrantName: 'נועם' })).toBe('נועם')
        expect(bookTitleOf({ customTitle: 'משפחת לוי' })).toBe('משפחת לוי')
        expect(bookTitleOf(null)).toBe('')
    })

    it('says nothing when nothing is wrong', () => {
        expect(digestLines({})).toEqual([])
        expect(digestLines({ quietEvents: [{ id: 'a', days: 3, email: 'x@y.z' }] })).toHaveLength(1)
    })
})

describe('the cron route', () => {
    const src = readFileSync('src/app/api/cron/lifecycle/route.js', 'utf8')
    it('does not run without the cron secret', () => {
        expect(src).toContain('if (!secret) return false')
    })
    it('marks what it sent, and has a dry run', () => {
        expect(src).toContain('lifecycleSent')
        expect(src).toContain("searchParams.get('dry')")
    })
    it('is scheduled', () => {
        expect(readFileSync('vercel.json', 'utf8')).toContain('/api/cron/lifecycle')
    })
    it('the older cron also fails closed', () => {
        expect(readFileSync('src/app/api/cron/email/route.js', 'utf8')).toContain('if (!secret) return false')
    })
})

describe('the balance-paid e-mail', () => {
    it('answers the customer at once, with the way back in', async () => {
        const { renderBalancePaidEmail } = await import('@/lib/lifecycle')
        const m = renderBalancePaidEmail({ title: 'נועם' }, { portal: 'https://s.test/enter?t=1' })
        expect(m.subject).toContain('נועם')
        expect(m.html).toContain('href="https://s.test/enter?t=1"')
        expect(m.text).toContain('https://s.test/enter?t=1')
    })

    it('createWedding sends it when a balance order is paid', () => {
        const src = readFileSync('src/app/api/createWedding/route.js', 'utf8')
        expect(src).toContain('renderBalancePaidEmail(')
    })
})

describe('the daily summary to the owner of the business', () => {
    it('says nothing on a quiet day, whatever the greetings', () => {
        expect(dailySummary({})).toBe(null)
        expect(dailySummary({ greetings: 40 })).toBe(null)
    })

    it('lists new orders, balances paid and what needs attention', () => {
        const m = dailySummary({
            newOrders: [{ title: 'נועם', amount: '190.00' }],
            balancesPaid: [{ title: 'אריאל' }],
            greetings: 7,
            failedLocks: [{ orderId: '7001', error: 'x' }],
            exceptionLines: ['אירוע דנה: בעוד 3 ימים ועדיין אין ברכות.'],
        })
        expect(m.subject).toContain('סיכום יומי')
        expect(m.text).toContain('נועם')
        expect(m.text).toContain('אריאל')
        expect(m.text).toContain('ברכות שנכתבו ביממה האחרונה: 7')
        expect(m.text).toContain('7001')
        expect(m.text).toContain('אין ברכות')
    })

    it('one alert alone is enough to send', () => {
        expect(dailySummary({ failedLocks: [{ orderId: '1' }] })).not.toBe(null)
    })
})
