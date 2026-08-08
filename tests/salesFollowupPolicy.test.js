import { describe, it, expect } from 'vitest'
import {
    MAX_ATTEMPTS, nextFollowUpDate, urgencyFor, daysUntil, isFinalAttempt,
    sendableNow, israelClock,
} from '@/lib/salesAgent/followupPolicy'

// This file guards the difference between a helpful nudge and the reason
// somebody blocks the number. Every case below is a real way an
// automated chaser embarrasses the business that sent it.

const TODAY = '2026-08-10'

describe('urgencyFor', () => {
    it('separates an event next week from one next year', () => {
        expect(urgencyFor('2026-08-18', TODAY)).toBe('imminent')
        expect(urgencyFor('2026-09-10', TODAY)).toBe('near')
        expect(urgencyFor('2027-04-01', TODAY)).toBe('far')
    })

    it('treats an unknown date as its own case, not as far away', () => {
        // Most new enquiries have not said a date yet, and those are the
        // ones that deserve a quick second touch.
        expect(urgencyFor(null, TODAY)).toBe('unknown')
        expect(urgencyFor('', TODAY)).toBe('unknown')
        expect(urgencyFor('not-a-date', TODAY)).toBe('unknown')
    })

    it('knows the event already happened', () => {
        expect(urgencyFor('2026-08-09', TODAY)).toBe('past')
    })
})

describe('daysUntil', () => {
    it('counts whole days across a month boundary', () => {
        expect(daysUntil('2026-09-01', TODAY)).toBe(22)
        expect(daysUntil(TODAY, TODAY)).toBe(0)
    })

    it('returns null rather than NaN for junk', () => {
        expect(daysUntil(null, TODAY)).toBeNull()
        expect(daysUntil('soon', TODAY)).toBeNull()
    })
})

describe('the ladder', () => {
    const base = { stage: 'engaged', todayISO: TODAY }

    it('widens with each attempt instead of nagging daily', () => {
        expect(nextFollowUpDate({ ...base, attempt: 0 })).toBe('2026-08-11')
        expect(nextFollowUpDate({ ...base, attempt: 1 })).toBe('2026-08-13')
        expect(nextFollowUpDate({ ...base, attempt: 2 })).toBe('2026-08-17')
    })

    it('stops after the agreed number of attempts', () => {
        expect(nextFollowUpDate({ ...base, attempt: MAX_ATTEMPTS })).toBeNull()
        expect(nextFollowUpDate({ ...base, attempt: 9 })).toBeNull()
    })

    it('gives a fresh price room to breathe', () => {
        // Chasing the morning after a quote is pressure; the same message
        // two days later is service.
        const engaged = nextFollowUpDate({ stage: 'engaged', attempt: 0, todayISO: TODAY })
        const quoted = nextFollowUpDate({ stage: 'offer_sent', attempt: 0, todayISO: TODAY })
        expect(quoted > engaged).toBe(true)
    })

    it('waits longest for someone who asked us to come back later', () => {
        const later = nextFollowUpDate({ stage: 'commit_later', attempt: 0, todayISO: TODAY })
        expect(daysUntil(later, TODAY)).toBeGreaterThanOrEqual(4)
    })
})

describe('the event date changes the rhythm', () => {
    it('compresses when the event is close', () => {
        const soon = nextFollowUpDate({ stage: 'engaged', attempt: 1, eventDate: '2026-08-20', todayISO: TODAY })
        const far = nextFollowUpDate({ stage: 'engaged', attempt: 1, eventDate: '2027-05-01', todayISO: TODAY })
        expect(daysUntil(soon, TODAY)).toBeLessThan(daysUntil(far, TODAY))
    })

    it('stretches when the event is months away', () => {
        const far = nextFollowUpDate({ stage: 'engaged', attempt: 0, eventDate: '2027-05-01', todayISO: TODAY })
        expect(daysUntil(far, TODAY)).toBe(2)
    })

    it('never schedules a follow-up for after the event', () => {
        // A message about a guest book for a wedding that already
        // happened is the worst thing this system could send.
        const d = nextFollowUpDate({ stage: 'offer_sent', attempt: 2, eventDate: '2026-08-12', todayISO: TODAY })
        expect(daysUntil(d, TODAY)).toBeLessThanOrEqual(2)
    })

    it('stops entirely once the event has passed', () => {
        expect(nextFollowUpDate({ stage: 'offer_sent', attempt: 0, eventDate: '2026-08-01', todayISO: TODAY })).toBeNull()
    })

    it('still waits at least a day', () => {
        // Halving the ladder must never round down to "today".
        const d = nextFollowUpDate({ stage: 'engaged', attempt: 0, eventDate: '2026-08-11', todayISO: TODAY })
        expect(daysUntil(d, TODAY)).toBeGreaterThanOrEqual(1)
    })
})

describe('what stops the chase', () => {
    it('a closed deal, won or lost', () => {
        expect(nextFollowUpDate({ stage: 'closed_won', attempt: 0, todayISO: TODAY })).toBeNull()
        expect(nextFollowUpDate({ stage: 'closed_lost', attempt: 0, todayISO: TODAY })).toBeNull()
    })

    it('a handoff to a human', () => {
        expect(nextFollowUpDate({ stage: 'engaged', attempt: 0, todayISO: TODAY, handoff: true })).toBeNull()
    })

    it('a missing today', () => {
        expect(nextFollowUpDate({ stage: 'engaged', attempt: 0 })).toBeNull()
    })
})

describe('a promised callback beats the ladder', () => {
    it('lands the day after the date the customer chose', () => {
        const d = nextFollowUpDate({ stage: 'commit_later', attempt: 0, todayISO: TODAY, callbackPromised: '2026-08-25' })
        expect(d).toBe('2026-08-26')
    })

    it('is ignored once it is in the past', () => {
        const d = nextFollowUpDate({ stage: 'engaged', attempt: 0, todayISO: TODAY, callbackPromised: '2026-08-01' })
        expect(d).toBe('2026-08-11')
    })
})

describe('isFinalAttempt', () => {
    it('flags the last message so it can say goodbye properly', () => {
        // `attempt` counts what has already been sent, so attempt 2
        // means the message about to go out is the third and last.
        expect(isFinalAttempt(0)).toBe(false)
        expect(isFinalAttempt(1)).toBe(false)
        expect(isFinalAttempt(2)).toBe(true)
    })
})

describe('quiet hours', () => {
    // Israel is UTC+3 in August. These are chosen so the intent is
    // readable in the UTC literal.
    const at = utc => Date.parse(utc)

    it('allows an ordinary weekday morning', () => {
        expect(sendableNow(at('2026-08-10T08:00:00Z')).ok).toBe(true) // 11:00 Mon
    })

    it('refuses the middle of the night', () => {
        expect(sendableNow(at('2026-08-10T02:00:00Z')).reason).toBe('too-early') // 05:00
    })

    it('refuses late evening', () => {
        expect(sendableNow(at('2026-08-10T19:30:00Z')).reason).toBe('too-late') // 22:30
    })

    it('goes quiet on Friday afternoon', () => {
        // 2026-08-14 is a Friday. 12:00Z = 15:00 Israel.
        expect(israelClock(at('2026-08-14T12:00:00Z')).weekday).toBe(5)
        expect(sendableNow(at('2026-08-14T12:00:00Z')).reason).toBe('erev-shabbat')
    })

    it('still allows Friday morning', () => {
        expect(sendableNow(at('2026-08-14T07:00:00Z')).ok).toBe(true) // 10:00 Fri
    })

    it('stays quiet through Shabbat', () => {
        // 2026-08-15 is a Saturday.
        expect(israelClock(at('2026-08-15T12:00:00Z')).weekday).toBe(6)
        expect(sendableNow(at('2026-08-15T12:00:00Z')).reason).toBe('shabbat')
        expect(sendableNow(at('2026-08-15T16:00:00Z')).reason).toBe('shabbat') // 19:00
    })

    it('stays off all of Saturday rather than opening a one-hour window at night', () => {
        // Shabbat ends around 21:00 and the evening cutoff is 21:00 too.
        // Rather than squeeze a sales message into the gap, Saturday is
        // simply off and the daily run picks it up on Sunday morning.
        expect(sendableNow(at('2026-08-15T18:30:00Z')).reason).toBe('shabbat') // 21:30 Sat
        expect(sendableNow(at('2026-08-15T20:00:00Z')).reason).toBe('shabbat') // 23:00 Sat
    })

    it('is back on Sunday morning', () => {
        expect(sendableNow(at('2026-08-16T07:00:00Z')).ok).toBe(true) // 10:00 Sun
    })

    it('reads the clock in Israel time, not UTC', () => {
        // 21:00Z is midnight in Israel: the naive UTC reading would call
        // this a perfectly good evening.
        expect(sendableNow(at('2026-08-10T21:00:00Z')).ok).toBe(false)
    })
})
