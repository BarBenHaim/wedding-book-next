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
import { followUpEvidence, normalizeFollowUpConsent } from './followupEvidence'
import { isConversationalPolicyEnabled } from './salesContract'

export { followUpEvidence }

export const MAX_ATTEMPTS = 3
export const FIRST_FOLLOWUP_MIN_IDLE_HOURS = 4

// A bar mitzvah parent decides a month or two before the event. The
// ladder (1, 3, 7 days) spends all three touches in the week they are
// least ready and then falls silent for the two months in which they
// actually choose. So a lead with a known, far event date gets one more
// touch, timed to the event: thirty days before (or fourteen, when
// thirty is already behind us), with the offer. `MAX_TOUCHES` is the
// ladder plus that one.
export const PRE_EVENT_LEADS_DAYS = [30, 14]
export const MAX_TOUCHES = MAX_ATTEMPTS + 1

export function preEventTouchDate(eventDate, todayISO) {
    const d = daysUntil(eventDate, todayISO)
    if (d == null || d < 0) return null
    for (const lead of PRE_EVENT_LEADS_DAYS) {
        // At least three days out, so it never collides with the ladder's
        // last message and never lands the morning after a goodbye.
        if (d - lead >= 3) return addDaysISO(todayISO, d - lead)
    }
    return null
}

const HOUR_MS = 3600 * 1000
const WHATSAPP_WINDOW_MS = 24 * HOUR_MS

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
    // The ladder is spent: one pre-event touch if the date allows, else stop.
    if (attempt >= MAX_ATTEMPTS) return attempt === MAX_ATTEMPTS ? preEventTouchDate(eventDate, todayISO) : null

    const urgency = urgencyFor(eventDate, todayISO)
    // The event already happened. Whatever this lead was, it is over, and
    // a cheerful nudge now is the worst message we could send.
    if (urgency === 'past') return null

    // A promised callback beats every rule here. Following up the day
    // after somebody said "call me next week" is the highest-yield and
    // least annoying moment there is, precisely because they chose it.
    if (callbackPromised && callbackPromised > todayISO) return addDaysISO(callbackPromised, 1)

    // The first ordinary nudge must stay inside WhatsApp's 24-hour service
    // window. `isDueFollowUpCandidate` still requires four quiet hours, so
    // "today" means "eligible later today", never "send immediately".
    // A quoted price, an objection, or an explicit "later" commitment keeps
    // its stage floor below.
    if (attempt === 0 && !STAGE_FLOOR[stage]) return todayISO

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

/**
 * True when this is the last message this lead will ever get from the
 * bot. With a far event date the third ladder message is NOT the last:
 * a pre-event touch still follows, so the third one says "נדבר לקראת
 * האירוע" instead of goodbye.
 */
export function isFinalAttempt(attempt = 0, { eventDate = null, todayISO = null } = {}) {
    if (attempt + 1 >= MAX_TOUCHES) return true
    if (attempt + 1 >= MAX_ATTEMPTS) return !preEventTouchDate(eventDate, todayISO)
    return false
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

function timestampMs(value) {
    if (value == null) return null
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (typeof value?.toMillis === 'function') return value.toMillis()
    if (typeof value?.seconds === 'number') return value.seconds * 1000
    if (typeof value === 'string') {
        const parsed = Date.parse(value)
        return Number.isFinite(parsed) ? parsed : null
    }
    return null
}

function lastInboundMs(lead) {
    // Only a customer message opens Meta's 24-hour service window.
    // `lastMessageAt` also advances on our outbound delivery and
    // `updatedAt` advances on admin/system writes, so neither is evidence
    // that free-form WhatsApp delivery is legal.
    return timestampMs(lead?.lastInboundAtMs) ?? timestampMs(lead?.lastInboundAt)
}

export function isInsideWhatsAppWindow(lead, nowMs = Date.now()) {
    const last = lastInboundMs(lead)
    if (last == null) return false
    const age = Number(nowMs) - last
    return age >= 0 && age < WHATSAPP_WINDOW_MS
}

export function isDueFollowUpCandidate(lead, todayISO, nowMs = Date.now()) {
    if (isConversationalPolicyEnabled() || isStrictFollowUpLead(lead)) return strictFollowUpEligibility(lead, { nowMs }).ok
    if (!lead?.followUpAt || !todayISO || lead.followUpAt > todayISO) return false
    if (lead.customerDeferred === true && (!lead.customerCallbackAt || lead.customerCallbackAt > todayISO)) return false
    if (lead.stage === 'commit_later' && !lead.customerCallbackAt && !lead.callbackPromised) return false
    if (lead.callbackPromised && lead.callbackPromised >= todayISO) return false
    if (lead.paymentVerified === true) return false
    if (['closed_won', 'closed_lost', 'handoff'].includes(lead.stage)) return false
    if (pausedForHuman(lead, nowMs)) return false
    if ((lead.followUpCount || 0) >= MAX_TOUCHES) return false
    if ((lead.followUpCount || 0) === 0) {
        const last = lastInboundMs(lead)
        if (last == null) return false
        if (Number(nowMs) - last < FIRST_FOLLOWUP_MIN_IDLE_HOURS * HOUR_MS) return false
    }
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

export function rankDueFollowUps(leads, todayISO, nowMs = Date.now()) {
    return (Array.isArray(leads) ? leads : [])
        .map((lead, index) => ({
            lead,
            index,
            reachable: isInsideWhatsAppWindow(lead, nowMs),
            priority: revenuePriority(lead, todayISO),
        }))
        .sort((left, right) => Number(right.reachable) - Number(left.reachable)
            || right.priority - left.priority
            || left.index - right.index)
        .map(row => row.lead)
}

const RECENT_CONVERSATION_MS = 7 * 24 * HOUR_MS
const RECENT_RUN_SHARE = 0.6

/**
 * Keep a revenue-ranked backlog without letting it permanently starve new
 * conversations. A full 25-lead run reserves fifteen places for leads opened
 * during the last week and leaves ten for the strongest older opportunities.
 */
export function selectDueFollowUps(leads, todayISO, limit = 40, nowMs = Date.now()) {
    const cap = Math.max(0, Number.parseInt(limit, 10) || 0)
    if (!cap) return []
    const ranked = rankDueFollowUps(leads, todayISO, nowMs)
    const cutoff = Number(nowMs) - RECENT_CONVERSATION_MS
    const recentReserve = Math.ceil(cap * RECENT_RUN_SHARE)
    const reachable = ranked
        .filter(lead => isInsideWhatsAppWindow(lead, nowMs))
        .slice(0, cap)
    const selected = new Set(reachable)
    const reachableRecent = reachable.filter(lead => {
        const startedAt = timestampMs(lead?.createdAt) ?? timestampMs(lead?.firstInboundAt)
        return startedAt != null && startedAt >= cutoff && startedAt <= Number(nowMs)
    }).length
    const remaining = cap - reachable.length
    const recent = ranked.filter(lead => {
        if (selected.has(lead)) return false
        const startedAt = timestampMs(lead?.createdAt) ?? timestampMs(lead?.firstInboundAt)
        return startedAt != null && startedAt >= cutoff && startedAt <= Number(nowMs)
    }).slice(0, Math.min(remaining, Math.max(0, recentReserve - reachableRecent)))
    for (const lead of recent) selected.add(lead)
    return [
        ...reachable,
        ...recent,
        ...ranked.filter(lead => !selected.has(lead)).slice(0, cap - reachable.length - recent.length),
    ]
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
export function sendableNow(ms = Date.now(), policy = readStrictFollowUpPolicy()) {
    if (policy.enabled) return strictSendableNow(ms, policy)
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
    MAX_ATTEMPTS, MAX_TOUCHES, MAX_PER_RUN, FIRST_FOLLOWUP_MIN_IDLE_HOURS, nextFollowUpDate, urgencyFor, daysUntil, preEventTouchDate,
    isFinalAttempt, pendingFollowUpStatus, followUpEvidence, isDueFollowUpCandidate, isInsideWhatsAppWindow,
    rankDueFollowUps, sendableNow, israelClock,
}

export default followupPolicy

// Strict rollout is opt-in and fails closed without separately approved business
// configuration. Legacy constants above are not approved hours for this mode.
// WhatsApp policy, verified 2026-10-05: https://whatsappbusiness.com/policy/
// Sections 1–2: opt-in and opt-out, correct designated template purpose, and
// a 24-hour service window reset only by a customer message. An approved
// template is a transport authorization, never customer consent.
export const STRICT_FOLLOWUP_VERSION = 'consent-v1'
export const MAX_UNANSWERED_SALES_REMINDERS = 2

const parseConfig = raw => {
    try { return JSON.parse(String(raw || '')) } catch { return null }
}
const clockMinutes = text => {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(text || ''))) return null
    return Number(text.slice(0, 2)) * 60 + Number(text.slice(3))
}

export function readStrictFollowUpPolicy(env = process.env) {
    const enabled = isConversationalPolicyEnabled(env)
    const hours = parseConfig(env.SALES_CONSENT_FOLLOWUP_HOURS_JSON)
    const delays = parseConfig(env.SALES_CONSENT_FOLLOWUP_DELAYS_HOURS)
    const approval = parseConfig(env.SALES_FOLLOWUP_TEMPLATE_APPROVAL_JSON)
    const activatedAtMs = Date.parse(env.SALES_CONSENT_FOLLOWUPS_ACTIVATED_AT || '')
    const weekly = hours?.weekly
    const hoursValid = hours?.timeZone === 'Asia/Jerusalem' && weekly && typeof weekly === 'object'
        && !Array.isArray(weekly) && Object.keys(weekly).length > 0
        && Object.entries(weekly).every(([day, intervals]) => /^[0-6]$/.test(day)
            && Array.isArray(intervals) && intervals.every(interval => Array.isArray(interval) && interval.length === 2
                && clockMinutes(interval[0]) != null && clockMinutes(interval[1]) != null
                && clockMinutes(interval[0]) < clockMinutes(interval[1])))
        && Object.values(weekly).some(intervals => intervals.length > 0)
    const delaysValid = Array.isArray(delays) && delays.length === 2
        && delays.every(n => Number.isFinite(n) && n > 0) && delays[0] >= 3 && delays[1] >= 48
    return {
        enabled,
        active: enabled && env.SALES_CONSENT_FOLLOWUPS_ENABLED === 'true' && Number.isFinite(activatedAtMs),
        activatedAtMs: Number.isFinite(activatedAtMs) ? activatedAtMs : null,
        weekly: hoursValid ? weekly : null,
        delaysHours: delaysValid ? delays : null,
        template: approval?.status === 'APPROVED' && approval.category === 'MARKETING'
            && approval.purpose === 'sales_reminders' && approval.language === 'he'
            && ['wt_followup_he', 'wt_followup'].includes(approval.name)
            && typeof approval.source === 'string' && approval.source.trim()
            && Number.isFinite(approval.checkedAtMs) && approval.checkedAtMs > 0
            && env.SALES_FOLLOWUP_TEMPLATE_ENABLED === 'true'
            && approval.name === String(env.SALES_FOLLOWUP_TEMPLATE_NAME || 'wt_followup_he').trim()
            ? approval : null,
    }
}

export function strictSendableNow(nowMs = Date.now(), policy = readStrictFollowUpPolicy()) {
    if (!policy.active || policy.activatedAtMs > nowMs) return { ok: false, reason: 'strict-followups-not-activated' }
    if (!policy.weekly || !policy.delaysHours) return { ok: false, reason: 'strict-followup-config-missing' }
    const { weekday, hour, minute } = israelClock(nowMs)
    const now = hour * 60 + minute
    const ok = (policy.weekly[String(weekday)] || []).some(([start, end]) => now >= clockMinutes(start) && now < clockMinutes(end))
    return { ok, reason: ok ? null : 'outside-approved-hours' }
}

export function strictFollowUpStopReason(lead = {}) {
    const stage = String(lead.stage || '').toLowerCase()
    const state = String(lead.conversationalState || '').toLowerCase()
    if (lead.handoffPending || lead.human || lead.humanTakeover || lead.human_takeover
        || ['requested', 'pending', 'open', 'acknowledged', 'assigned', 'in_progress', 'resolved'].includes(lead.humanTaskStatus)
        || ['human', 'handoff'].includes(stage) || state === 'human') return 'human-takeover'
    if (lead.paymentVerified || lead.paymentClaimed || lead.existingCustomer
        || ['paid', 'closed_won', 'onboarding', 'service'].includes(stage) || ['paid', 'onboarding', 'service'].includes(state)
        || ['paid', 'verified', 'processing', 'completed'].includes(lead.orderStatus)) return 'payment-or-service'
    if (lead.marketingSuppressed || lead.optedOut || lead.optOut || lead.optOutAt
        || lead.followUpConsent?.status === 'revoked' || ['closed_lost', 'stopped'].includes(stage) || state === 'stopped') return 'marketing-suppressed'
    if (lead.offerMismatch || lead.offerMismatchAt || stage === 'offer_mismatch' || state === 'offer_mismatch') return 'offer-mismatch'
    return null
}

export const isStrictFollowUpLead = lead => !!lead?.conversationalPolicyVersion
    || lead?.followUpSchedule?.policyVersion === STRICT_FOLLOWUP_VERSION
    || lead?.followUpConsent?.scope === 'sales_reminders'

const sameStrictSchedule = (left, right) => !!left && !!right
    && ['policyVersion', 'generation', 'consentSourceMessageId', 'scheduledAtMs', 'dueAtMs', 'lastInboundAtMs', 'attemptNumber']
        .every(key => left[key] === right[key])

/** Pure guard used at selection, transaction claim, and again before dispatch. */
export function strictFollowUpEligibility(lead = {}, {
    nowMs = Date.now(), policy = readStrictFollowUpPolicy(), expectedSchedule = null,
    checkDue = true, checkHours = true, checkPending = true, transport = null, templateName = null,
    claimedAttemptNumber = null,
} = {}) {
    if (!policy.enabled) return isStrictFollowUpLead(lead)
        ? { ok: false, strict: true, reason: 'strict-followups-not-activated' }
        : { ok: true, strict: false, reason: null }
    const deny = reason => ({ ok: false, strict: true, reason })
    if (!policy.active || policy.activatedAtMs > nowMs) return deny('strict-followups-not-activated')
    if (!policy.weekly || !policy.delaysHours) return deny('strict-followup-config-missing')
    const stopped = strictFollowUpStopReason(lead)
    if (stopped) return deny(stopped)
    const consent = normalizeFollowUpConsent(lead.followUpConsent, nowMs)
    if (!consent || consent.recordedAtMs < policy.activatedAtMs) return deny('followup-consent-missing')
    if (consent.callbackPending === true) return deny('customer-callback-unresolved')
    const schedule = lead.followUpSchedule
    if (schedule?.policyVersion !== STRICT_FOLLOWUP_VERSION
        || !Number.isInteger(schedule.generation) || schedule.generation < 1
        || schedule.generation !== lead.conversationRevision
        || schedule.consentSourceMessageId !== consent.sourceMessageId
        || !Number.isFinite(schedule.scheduledAtMs) || schedule.scheduledAtMs < consent.recordedAtMs
        || schedule.scheduledAtMs > nowMs
        || !Number.isFinite(schedule.dueAtMs) || schedule.dueAtMs < schedule.scheduledAtMs
        || schedule.lastInboundAtMs !== lastInboundMs(lead)
        || schedule.lastInboundAtMs == null || schedule.lastInboundAtMs > schedule.scheduledAtMs
        || !Number.isInteger(schedule.attemptNumber) || schedule.attemptNumber < 1
        || (expectedSchedule && !sameStrictSchedule(schedule, expectedSchedule))) return deny('stale-or-missing-followup-schedule')
    const claimed = claimedAttemptNumber === schedule.attemptNumber
    const used = consent.usedReminders
    const unanswered = Number(lead.unansweredSalesReminders || 0)
    if (!Number.isInteger(unanswered) || unanswered < 0
        || (claimed ? used !== schedule.attemptNumber : used + 1 !== schedule.attemptNumber)
        || schedule.attemptNumber > consent.maxReminders
        || (claimed ? unanswered > MAX_UNANSWERED_SALES_REMINDERS : unanswered >= MAX_UNANSWERED_SALES_REMINDERS)) return deny('reminder-limit')
    if (consent.callbackAtMs != null && (schedule.dueAtMs < consent.callbackAtMs || (checkDue && nowMs < consent.callbackAtMs))) return deny('customer-callback-not-due')
    if ((lead.customerDeferred || String(lead.stage).toLowerCase() === 'commit_later') && consent.callbackAtMs == null) return deny('customer-callback-unresolved')
    if (checkDue && schedule.dueAtMs > nowMs) return deny('followup-not-due')
    if (checkPending && pendingFollowUpStatus(lead, nowMs) !== 'none') return deny('followup-attempt-unsettled')
    if (checkHours) {
        const hours = strictSendableNow(nowMs, policy)
        if (!hours.ok) return deny(hours.reason)
    }
    if (daysUntil(lead.eventDate, new Date(nowMs).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })) < 0) return deny('event-passed')
    const withinWindow = isInsideWhatsAppWindow(lead, nowMs)
    if (!withinWindow && (!policy.template || policy.template.checkedAtMs > nowMs)) return deny('approved-marketing-template-required')
    if (!withinWindow && transport && transport !== 'template') return deny('whatsapp-window-closed')
    if (transport === 'template' && (!policy.template || templateName !== policy.template.name)) return deny('template-not-approved-for-purpose')
    return { ok: true, strict: true, reason: null, consent, schedule, withinWindow }
}

/** Schedule only following explicit permission/current inbound, never a sweep. */
export function createStrictFollowUpSchedule(lead = {}, { nowMs = Date.now(), policy = readStrictFollowUpPolicy() } = {}) {
    if (!policy.enabled || !policy.active || policy.activatedAtMs > nowMs || !policy.weekly || !policy.delaysHours
        || strictFollowUpStopReason(lead)) return null
    const consent = normalizeFollowUpConsent(lead.followUpConsent, nowMs)
    const last = lastInboundMs(lead)
    if (!consent || consent.callbackPending === true || consent.recordedAtMs < policy.activatedAtMs || consent.usedReminders >= consent.maxReminders
        || (lead.unansweredSalesReminders || 0) >= MAX_UNANSWERED_SALES_REMINDERS
        || last == null || !Number.isInteger(lead.conversationRevision) || lead.conversationRevision < 1
        || ((lead.customerDeferred || lead.stage === 'commit_later') && consent.callbackAtMs == null)) return null
    const afterPrevious = consent.usedReminders > 0
    const anchor = afterPrevious ? timestampMs(lead.lastSalesReminderClaimedAtMs) : Math.max(last, consent.recordedAtMs)
    if (anchor == null) return null
    const dueAtMs = !afterPrevious && consent.callbackAtMs != null
        ? Math.max(consent.callbackAtMs, nowMs)
        : Math.max(nowMs, anchor + policy.delaysHours[afterPrevious ? 1 : 0] * HOUR_MS)
    return {
        policyVersion: STRICT_FOLLOWUP_VERSION, generation: lead.conversationRevision,
        consentSourceMessageId: consent.sourceMessageId, scheduledAtMs: nowMs, dueAtMs,
        lastInboundAtMs: last, attemptNumber: consent.usedReminders + 1,
    }
}

export const strictFollowUpDate = schedule => schedule?.dueAtMs != null
    ? new Date(schedule.dueAtMs).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }) : null
