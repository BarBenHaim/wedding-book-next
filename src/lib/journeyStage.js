// src/lib/journeyStage.js — pure: where is this customer on the road, and does it need Bar today.
//
// The admin table used to answer "status" with the event date alone (today / upcoming / past).
// That says nothing about the customer. This module derives ONE stage from facts that already
// sit on the event, and a separate list of reasons the event needs a human.
//
// Rules of the design:
//  - The stage is the furthest milestone reached. Nothing here is ever hand-set except the two
//    things a machine cannot know: the book was ordered from the printer, and it was delivered.
//  - "Needs attention" is NOT a stage. It sits on top of the stage, otherwise events would flap
//    between stages and the funnel counts would mean nothing.
//  - Events from before the funnel went live are read, never guessed: 'legacy' never lands in the
//    work queue, so 45 old rows can not turn into 800 ₪ of phantom balance.
//  - Pure: no Firebase, no clock. The caller passes `now`.

import { israelDate, daysBetween } from './lifecycle'

// The sales page and the deposit flow went live on 22.11.2026. Anything opened before that
// is a customer of the old way of working.
export const FUNNEL_START_MS = Date.parse('2026-11-22T00:00:00+02:00')

export const STAGES = ['free', 'deposit_quiet', 'collecting', 'awaiting_review', 'balance_started', 'print_now', 'in_print', 'delivered', 'closed', 'legacy']

export const STAGE_LABEL = {
    free: 'אירוע חינמי',
    deposit_quiet: 'שילם מקדמה, אין ברכות',
    collecting: 'אוספים ברכות',
    awaiting_review: 'האירוע עבר, ממתין לאישור',
    balance_started: 'התחיל לשלם יתרה',
    print_now: 'שולם: להדפיס עכשיו',
    in_print: 'בהדפסה',
    delivered: 'נמסר',
    closed: 'נסגר',
    legacy: 'לפני המשפך',
}

// red = Bar has to act, amber = waiting on the customer, green = fine, grey = not in the funnel.
export const STAGE_TONE = {
    free: 'grey', deposit_quiet: 'amber', collecting: 'green', awaiting_review: 'amber', balance_started: 'amber',
    print_now: 'red', in_print: 'green', delivered: 'green', closed: 'grey', legacy: 'grey',
}

const ms = v => {
    if (!v) return 0
    if (typeof v === 'number') return v
    if (typeof v?.toMillis === 'function') return v.toMillis()
    if (typeof v?._seconds === 'number') return v._seconds * 1000
    const t = Date.parse(v)
    return Number.isFinite(t) ? t : 0
}

/** YYYY-MM-DD in Israel for a stored event date (plain date or a full ISO timestamp), '' when there is none. */
export function eventDay(v) {
    if (!v) return ''
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v
    const t = ms(v)
    return t ? israelDate(t) : ''
}

const has = v => Boolean(ms(v))
const n = v => Number(v) || 0

/**
 * { stage, label, tone, attention, action, days }
 *   attention: [{ key, label, days }]   reasons this event needs Bar, most urgent first
 *   action:    'print' | 'deliver' | 'link' | 'balance' | null   the one thing Bar can do from the row
 *   days:      whole days Bar's side has been waiting (print_now), else days to the event (negative once past)
 */
export function journeyOf(w, now = Date.now()) {
    const today = israelDate(now)
    const createdMs = ms(w?.createdAt)
    const day = eventDay(w?.weddingDate)
    const toEvent = day ? daysBetween(today, day) : NaN
    const sinceEvent = Number.isFinite(toEvent) ? -toEvent : NaN
    const blessings = n(w?.greetingsCount)
    const stage0 = w?.paymentStage || ''
    const paidFull = stage0 === 'paid' || (!stage0 && w?.createdVia === 'order' && n(w?.amountPaid) > 0 && createdMs >= FUNNEL_START_MS)

    const out = (stage, extra = {}) => ({ stage, label: STAGE_LABEL[stage], tone: STAGE_TONE[stage], attention: [], action: null, days: Number.isFinite(toEvent) ? toEvent : null, ...extra })
    const attention = []
    const need = (key, label, days = 0) => attention.push({ key, label, days })

    // What a human recorded beats anything derived.
    if (has(w?.closedAt)) return out('closed')
    if (has(w?.deliveredAt)) return out('delivered')
    const printed = has(w?.printOrderedAt) || Boolean(w?.printOrder)
    if (printed) return out('in_print', { action: 'deliver' })

    if (!stage0 && !paidFull) {
        return createdMs && createdMs >= FUNNEL_START_MS && n(w?.amountPaid) <= 0 ? out('free') : out('legacy')
    }

    if (paidFull) {
        const paidMs = ms(w?.balancePaidAt) || createdMs
        const waited = paidMs ? Math.max(0, daysBetween(israelDate(paidMs), today)) : 0
        if (waited >= 2) need('print_late', `ממתין להדפסה ${waited} ימים`, waited)
        return out('print_now', { attention, action: 'print', days: waited })
    }

    // From here the customer paid a deposit and owes the balance.
    const noDate = !day
    if (noDate) need('no_date', 'אין תאריך אירוע')

    const afterEvent = Number.isFinite(sinceEvent) && sinceEvent > 0
    if (afterEvent) {
        if (has(w?.balanceClickAt)) {
            if (sinceEvent >= 14) need('balance_stuck', `התחיל לשלם ולא סיים, ${sinceEvent} ימים אחרי האירוע`, sinceEvent)
            return out('balance_started', { attention, action: 'balance' })
        }
        if (sinceEvent >= 14) need('balance_late', `היתרה לא שולמה ${sinceEvent} ימים אחרי האירוע`, sinceEvent)
        return out('awaiting_review', { attention, action: 'balance' })
    }

    // Before (or on) the event day.
    if (blessings === 0) {
        if (Number.isFinite(toEvent) && toEvent <= 7) need('quiet_close', `בעוד ${toEvent} ימים ועדיין אין ברכות`, 7 - toEvent)
        else if (!has(w?.linkSharedAt)) {
            const sinceOrder = createdMs ? daysBetween(israelDate(createdMs), today) : 0
            if (sinceOrder >= 3) need('link_unsent', `${sinceOrder} ימים מההזמנה והקישור לא נשלח לאורחים`, sinceOrder)
        }
        return out('deposit_quiet', { attention, action: 'link' })
    }
    return out('collecting', { attention, action: 'link' })
}

/** Rank for the "needs Bar today" queue: bigger is more urgent. */
export function urgencyOf(j) {
    if (!j.attention.length) return 0
    const top = Math.max(...j.attention.map(a => a.days || 0))
    return (j.stage === 'print_now' ? 1000 : 0) + top + j.attention.length
}

/** Counts per stage plus the money still owed, for the strip above the table. */
export function summarize(list, now = Date.now(), balanceOf = w => n(w?.balanceDue) || 800) {
    const c = Object.fromEntries(STAGES.map(s => [s, 0]))
    let owed = 0
    let attention = 0
    for (const w of Array.isArray(list) ? list : []) {
        const j = journeyOf(w, now)
        c[j.stage]++
        if (j.attention.length) attention++
        if (j.stage === 'awaiting_review' || j.stage === 'balance_started') owed += balanceOf(w)
    }
    return { counts: c, owed, attention }
}
