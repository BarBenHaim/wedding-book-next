// src/lib/salesAgent/followupPolicy.js
//
// When to chase, how hard, and when to stop.
//
// The engine that WRITES follow-ups already existed and was the easy
// half. This file is the half that decides whether a message should
// exist at all, and it is where an automation like this earns its keep
// or becomes the reason somebody blocks the number.
//
// Four things shape every decision here.
//
// The ladder widens. One day, then three, then seven. A person who has
// not answered twice is not going to be won by a third message tomorrow;
// spacing out signals patience, and patience is what a 950-shekel
// keepsake purchase actually needs. Three attempts, then a graceful last
// message and silence - chosen with Lord, and the give-up note matters
// more than it looks: it is the message people most often reply to.
//
// The event date changes everything. A wedding in ten days and a wedding
// in eight months are not the same lead, and treating them alike is the
// single most obvious way this would feel stupid. Close events compress
// the ladder, distant ones stretch it, and an event that has already
// passed stops it outright - chasing somebody about a party that
// happened last week is worse than never writing.
//
// Some hours are not for selling. Israel: nothing before 09:00 or after
// 21:00, nothing from Friday afternoon through the end of Shabbat. A
// business message at 22:40 on a Friday does not read as eager, it reads
// as automated, and the whole point of this bot is that it does not.
//
// And the stage sets the floor. A nudge the morning after a price was
// quoted is pressure; the same nudge three days later is service.

import { addDaysISO } from './prompt'
import { followUpEvidence } from './followupEvidence'

export { followUpEvidence }

export const MAX_ATTEMPTS = 3

// Days to wait before attempt N, counted from the last contact.
const LADDER = [1, 3, 7]

// Some stages need more room than the ladder gives on its own. A person
// who has just been quoted a price, or who has just raised an objection,
// is thinking - and the answer to thinking is not a reminder the next
// morning. `commit_later` is the strongest signal of all: they told us
// when to come back, so anything sooner is not following up, it is
// ignoring what they said.
const STAGE_FLOOR = {
    offer_sent: 2,
    objection: 2,
    commit_later: 4,
}

// Stages where chasing is either pointless or actively wrong.
const NEVER_CHASE = new Set(['closed_won', 'closed_lost', 'handoff'])

const NOON = iso => Date.parse(`${iso}T12:00:00Z`)

export function daysUntil(eventDate, todayISO) {
    if (!eventDate || !todayISO) return null
    const a = NOON(eventDate)
    const b = NOON(todayISO)
    if (Number.isNaN(a) || Number.isNaN(b)) return null
    return Math.round((a - b) / 86400000)
}

/**
 * How urgent this lead is, from the event date alone.
 *
 * `unknown` is deliberately its own answer rather than being folded into
 * `far`. Most leads have not told us a date yet, and treating "we do not
 * know" as "it is ages away" would slow down exactly the new enquiries
 * that deserve a quick second touch.
 */
export function urgencyFor(eventDate, todayISO) {
    const d = daysUntil(eventDate, todayISO)
    if (d == null) return 'unknown'
    if (d < 0) return 'past'
    if (d <= 14) return 'imminent'
    if (d <= 45) return 'near'
    return 'far'
}

// The ladder, scaled. Imminent halves the wait, far doubles it.
const URGENCY_SCALE = { imminent: 0.5, near: 1, unknown: 1, far: 2, past: 0 }

/**
 * The date of the next follow-up, or null to stop chasing.
 *
 * `attempt` is how many follow-ups have ALREADY been sent, so the first
 * call for a fresh lead passes 0.
 */
export function nextFollowUpDate({
    stage,
    attempt = 0,
    eventDate = null,
    todayISO,
    callbackPromised = null,
    handoff = false,
} = {}) {
    if (!todayISO) return null
    if (handoff) return null
    if (NEVER_CHASE.has(stage)) return null
    if (attempt >= MAX_ATTEMPTS) return null

    const urgency = urgencyFor(eventDate, todayISO)
    // The event already happened. Whatever this lead was, it is over, and
    // a cheerful nudge now is the worst message we could send.
    if (urgency === 'past') return null

    // A promised callback beats every rule here. Following up the day
    // after somebody said "call me next week" is the highest-yield and
    // least annoying moment there is, precisely because they chose it.
    if (callbackPromised && callbackPromised > todayISO) return addDaysISO(callbackPromised, 1)

    const base = LADDER[Math.min(attempt, LADDER.length - 1)]
    const floored = Math.max(base, STAGE_FLOOR[stage] || 0)
    let days = Math.max(1, Math.round(floored * URGENCY_SCALE[urgency]))

    // Never schedule past the event itself. If the wedding is on Sunday,
    // a follow-up on Monday is a message about a book they no longer
    // need, sent by a system that clearly was not paying attention.
    const untilEvent = daysUntil(eventDate, todayISO)
    if (untilEvent != null && untilEvent >= 1) days = Math.min(days, untilEvent)

    return addDaysISO(todayISO, days)
}

/** True when this is the last message this lead will ever get from the bot. */
export function isFinalAttempt(attempt = 0) {
    return attempt + 1 >= MAX_ATTEMPTS
}

/** Operational state for an accepted follow-up waiting on Meta status. */
export function pendingFollowUpStatus(lead, nowMs = Date.now()) {
    if (lead?.lastDeliveryStatus === 'requested') {
        const requestUntil = Number(lead?.deliveryRequestUntilMs)
        if (!Number.isFinite(requestUntil)) return 'stale-requested'
        return requestUntil > Number(nowMs) ? 'requested' : 'stale-requested'
    }
    if (lead?.lastDeliveryStatus !== 'accepted') return 'none'
    const pendingUntil = Number(lead?.deliveryPendingUntilMs)
    if (!Number.isFinite(pendingUntil)) return 'stale'
    return pendingUntil > Number(nowMs) ? 'pending' : 'stale'
}

function pausedForHuman(lead, nowMs) {
    if (!lead?.human) return false
    const since = lead.humanSince?.toMillis ? lead.humanSince.toMillis() : Number(lead.humanSince) || 0
    return !since || Number(nowMs) - since < 48 * 3600 * 1000
}

export function isDueFollowUpCandidate(lead, todayISO, nowMs = Date.now()) {
    if (!lead?.followUpAt || !todayISO || lead.followUpAt > todayISO) return false
    if (lead.paymentVerified === true) return false
    if (['closed_won', 'closed_lost', 'handoff'].includes(lead.stage)) return false
    if (pausedForHuman(lead, nowMs)) return false
    if ((lead.followUpCount || 0) >= MAX_ATTEMPTS) return false
    if (['pending', 'requested'].includes(pendingFollowUpStatus(lead, nowMs))) return false
    if (daysUntil(lead.eventDate, todayISO) < 0) return false
    return true
}

function revenuePriority(lead, todayISO) {
    if (lead.stage === 'ready_to_pay') return 10_000
    const eventDays = daysUntil(lead.eventDate, todayISO)
    if (eventDays != null && eventDays >= 0 && eventDays <= 30) return 9_000 - eventDays
    if (['objection', 'commit_later'].includes(lead.stage)) return 8_000
    if (['offer_sent', 'demo_sent'].includes(lead.stage)) return 7_000
    if (lead.stage === 'engaged') return 6_000
    return 5_000
}

export function rankDueFollowUps(leads, todayISO) {
    return (Array.isArray(leads) ? leads : [])
        .map((lead, index) => ({ lead, index, priority: revenuePriority(lead, todayISO) }))
        .sort((left, right) => right.priority - left.priority || left.index - right.index)
        .map(row => row.lead)
}

// ── When not to send ────────────────────────────────────────────────
//
// Times are read in Asia/Jerusalem rather than computed from an offset,
// because Israel moves its clocks and a hardcoded +02:00 would start
// sending an hour early every spring without anyone noticing.

const PARTS = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
})

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function israelClock(ms = Date.now()) {
    const parts = Object.fromEntries(PARTS.formatToParts(new Date(ms)).map(p => [p.type, p.value]))
    return {
        weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
        hour: Number(parts.hour),
        minute: Number(parts.minute),
    }
}

export const DAY_START_HOUR = 9
export const DAY_END_HOUR = 21
// Friday: stop early enough that nobody is answering a sales message
// while they are cooking.
export const FRIDAY_CUTOFF_HOUR = 14

// Saturday is off entirely, and that is a decision rather than an
// oversight. Shabbat ends around 21:00 in summer, which leaves a window
// of an hour before the ordinary evening cutoff - and a sales message
// landing at 21:20 on a Saturday night is the worst use of it. The run
// happens daily, so anything due on Saturday goes out on Sunday morning,
// twelve hours later, at a time somebody actually wants to read it.
//
// A first version resumed at 21:00 and the test caught that the two
// rules cancelled: Saturday could never be sendable at any hour, which
// happened to be right for the wrong reason.

/**
 * Is right now a reasonable moment to message a stranger about a
 * purchase? Returns a reason rather than a bare false, so the daily run
 * can log why it did nothing instead of looking broken.
 */
export function sendableNow(ms = Date.now()) {
    const { weekday, hour } = israelClock(ms)
    if (weekday === 6) return { ok: false, reason: 'shabbat' }
    if (weekday === 5 && hour >= FRIDAY_CUTOFF_HOUR) return { ok: false, reason: 'erev-shabbat' }
    if (hour < DAY_START_HOUR) return { ok: false, reason: 'too-early' }
    if (hour >= DAY_END_HOUR) return { ok: false, reason: 'too-late' }
    return { ok: true, reason: null }
}

/**
 * How many follow-ups one run may send.
 *
 * A cap exists because the failure mode of a scheduled job is not
 * sending too few, it is a bad day where a hundred leads come due at
 * once and every one of them costs a model call and a Make operation.
 * Twenty-five is more than this business will legitimately owe in a day.
 */
export const MAX_PER_RUN = 25

const followupPolicy = {
    MAX_ATTEMPTS, MAX_PER_RUN, nextFollowUpDate, urgencyFor, daysUntil,
    isFinalAttempt, pendingFollowUpStatus, followUpEvidence, isDueFollowUpCandidate, rankDueFollowUps, sendableNow, israelClock,
}

export default followupPolicy
