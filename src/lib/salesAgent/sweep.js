// src/lib/salesAgent/sweep.js
//
// Nobody falls between the chairs.
//
// The ladder in followupPolicy.js decides when to chase a lead that HAS
// a next step. This file is about the leads that quietly stopped having
// one, which is where a funnel like this actually leaks - not in the
// messages it writes badly, but in the conversations it forgets it was
// having.
//
// A lead ends up with `followUpAt: null` in more ways than you would
// guess. The model returned a handoff and the ladder correctly stopped.
// The Firestore write failed after the reply had already gone out. A
// stage got edited by hand in the admin table. Somebody was marked human
// and the 48-hour pause expired with nobody acting on it. None of those
// throw, none of them show up in a log anybody reads, and every one of
// them ends the same way: a person who asked about a guest book and
// never heard back.
//
// Two different problems live here, and they need opposite treatment.
//
// An ORPHAN is a live lead the machinery forgot. Nothing about it says a
// human needs to be involved, so the answer is simply to put it back on
// the ladder and let the bot carry on. Fully automatic, by design.
//
// A STALE HANDOFF is the reverse. A human was asked to take over and
// did not. The bot must NOT quietly resume those. A handoff happens
// because somebody was angry, or asked something legal, or asked for a
// person - and a bot that waits two days and then cheerfully picks the
// thread back up is worse than one that never handed over at all. Those
// go to Lord as a list and stay his.

import { MAX_ATTEMPTS } from './followupPolicy'
import { HUMAN_PAUSE_HOURS } from './leadsCore'

// How long after the customer's last message a lead counts as forgotten.
// Long enough that a conversation still in motion is never swept up
// mid-flow: somebody who wrote last night is thinking, not lost.
export const ORPHAN_AFTER_HOURS = 36

// Firestore hands timestamps back in three shapes depending on whether
// they came from the SDK, from JSON, or from a hand-edited document.
const msOf = v => {
    if (!v) return null
    if (typeof v === 'number') return Number.isFinite(v) ? v : null
    if (typeof v?.toMillis === 'function') return v.toMillis()
    if (typeof v?.seconds === 'number') return v.seconds * 1000
    if (typeof v === 'string') {
        const parsed = Date.parse(v)
        return Number.isFinite(parsed) ? parsed : null
    }
    return null
}

const isClosed = stage => stage === 'closed_won' || stage === 'closed_lost'

const lastContactMs = lead => msOf(lead?.lastInboundAt) ?? msOf(lead?.lastMessageAt) ?? msOf(lead?.updatedAt)

export const hoursSince = (ms, nowMs = Date.now()) =>
    ms == null ? null : Math.floor((nowMs - ms) / 3600000)

/**
 * Live leads with no scheduled next step.
 *
 * Deliberately excludes anything marked human: those are the stale
 * handoffs below, and picking them up here would be exactly the
 * behaviour a handoff exists to prevent.
 *
 * Also excludes leads with no timestamp at all. That sounds like the
 * wrong call - an unknown age is not a young age - but a lead with no
 * contact time is usually a half-written document, and messaging a
 * phone number we cannot prove ever wrote to us is the one mistake here
 * with a real cost. Those surface in the admin table instead.
 */
export function findOrphans(leads, { nowMs = Date.now(), maxAttempts = MAX_ATTEMPTS } = {}) {
    const cutoff = nowMs - ORPHAN_AFTER_HOURS * 3600 * 1000
    return (Array.isArray(leads) ? leads : []).filter(lead => {
        if (!lead || !lead.phone) return false
        if (isClosed(lead.stage)) return false
        if (lead.followUpAt) return false // already has a next step
        if (lead.human) return false // handoff territory, not ours
        if ((lead.followUpCount || 0) >= maxAttempts) return false // ladder finished
        const last = lastContactMs(lead)
        if (last == null) return false
        return last < cutoff
    })
}

/**
 * Handoffs nobody picked up.
 *
 * The pause has expired, which means the bot is technically free to talk
 * again - and it still should not. These are surfaced to Lord instead,
 * because the whole point of a handoff is that somebody decided a person
 * was needed, and no amount of elapsed time changes that.
 *
 * Unlike orphans, a missing timestamp IS reported here. Reporting costs
 * one line in a WhatsApp message to the owner; hiding it costs a
 * customer who asked for a human and got silence.
 */
export function findStaleHandoffs(leads, { nowMs = Date.now(), afterHours = HUMAN_PAUSE_HOURS } = {}) {
    const cutoff = nowMs - afterHours * 3600 * 1000
    return (Array.isArray(leads) ? leads : []).filter(lead => {
        if (!lead || !lead.phone) return false
        if (isClosed(lead.stage)) return false
        if (!lead.human) return false
        const since = msOf(lead.humanSince)
        if (since == null) return true
        return since < cutoff
    })
}

const nameOf = lead => lead?.name || lead?.profileName || lead?.phone || 'לקוח'

/**
 * The owner message for stale handoffs, or null when there are none.
 *
 * Null is the important return value. An alert that arrives every
 * morning saying "0 waiting" is one you stop reading, and then you miss
 * the morning it said 3.
 *
 * Oldest first: the person who has been waiting longest is the one most
 * likely to have already given up, so they are the one worth the call.
 */
export function handoffAlert(stale, { nowMs = Date.now(), limit = 10 } = {}) {
    const items = (Array.isArray(stale) ? stale : []).slice()
    if (!items.length) return null

    items.sort((a, b) => (msOf(a.humanSince) ?? 0) - (msOf(b.humanSince) ?? 0))

    const lines = items.slice(0, limit).map(lead => {
        const h = hoursSince(msOf(lead.humanSince), nowMs)
        const waited = h == null ? 'זמן לא ידוע' : h >= 48 ? `${Math.floor(h / 24)} ימים` : `${h} שעות`
        const why = lead.humanReason ? ` (${lead.humanReason})` : ''
        return `• ${nameOf(lead)} — ${lead.phone} — ${waited}${why}`
    })

    const more = items.length > limit ? `\n+${items.length - limit} נוספים` : ''
    const head = items.length === 1
        ? 'שיחה אחת מחכה לך ואף אחד לא חזר אליה:'
        : `${items.length} שיחות מחכות לך ואף אחד לא חזר אליהן:`

    return `${head}\n${lines.join('\n')}${more}\n\nהבוט לא ימשיך אותן לבד — הן הועברו אליך בכוונה.`
}

export default { ORPHAN_AFTER_HOURS, findOrphans, findStaleHandoffs, handoffAlert, hoursSince }
