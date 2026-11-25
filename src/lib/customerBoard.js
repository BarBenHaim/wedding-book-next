// The super admin's customer board: every book gets exactly one next step and
// the day it is due, or is closed. Pure: no Firebase, no clock.
// Spec: docs/superpowers/specs/2026-11-25-customer-board-and-followups-design.md

import { daysBetween, israelDate } from './lifecycle'
import { FUNNEL_START_MS, eventDay } from './journeyStage'
import { eventNameOf, followupBlock, mobileOf, scheduleFor } from './customerFollowups'

export const BOARD_GROUPS = [
    { key: 'today', label: 'לטיפול היום' },
    { key: 'chance', label: 'לברר תשלום' },
    { key: 'triage', label: 'ישנים: לסגור פעם אחת' },
    { key: 'upcoming', label: 'בהמשך' },
    { key: 'done', label: 'סגורים' },
]

const MARKS = ['printOrderedAt', 'shippedAt', 'deliveredAt', 'closedAt', 'triagedAt']

const REACH = {
    no_phone: 'אין טלפון: ליצור קשר בדרך אחרת',
    no_title: 'חסר שם בעל השמחה: להשלים',
    muted: 'ההודעות כבויות: ללוות ידנית',
    human: 'השיחה אצלך: להמשיך ידנית',
}

const DAY_MS = 86_400_000
const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
const later = (a, b) => (a > b ? a : b)
const millis = value => {
    if (!value) return 0
    if (typeof value === 'number') return value
    if (typeof value.toMillis === 'function') return value.toMillis()
    if (typeof value._seconds === 'number') return value._seconds * 1000
    return Date.parse(value) || 0
}
const dayOf = value => (millis(value) ? israelDate(millis(value)) : '')

function stageOf(w, { paid, toEvent }) {
    if (w.closedAt) return 'סגור'
    if (w.deliveredAt) return 'הספר הגיע'
    if (w.shippedAt) return 'נשלח'
    if (w.printOrderedAt || w.printOrder) return 'בהדפסה'
    if (!paid) return 'ללא תשלום רשום'
    if (toEvent == null) return 'בלי תאריך'
    if (toEvent < 0) return 'אחרי האירוע'
    return toEvent <= 14 ? 'לקראת האירוע' : 'לפני האירוע'
}

export function boardRow({ w, facts = {}, today, enabledDay = null }) {
    if (w.isDemo === true || w.createdVia === 'demo') return null

    const day = eventDay(w.weddingDate) || null
    const toEvent = day ? daysBetween(today, day) : null
    const entries = Number(facts.entries) || 0
    const paid = Number(w.amountPaid) > 0
    const blocked = followupBlock(w, facts)
    // Automatic sending covers events from the switch-on day. Earlier events keep
    // their messages as tasks for him, so none of them just disappears.
    const automatic = Boolean(enabledDay && day && day >= enabledDay)
    const scheduled = scheduleFor({ w, facts, today, enabledDay: automatic ? enabledDay : undefined })
    const failed = Object.entries(facts.sends || {}).find(([, send]) => send.status === 'failed')?.[0]

    const as = (group, key, label, due, extra = {}) => ({ group, next: { key, label, ...extra }, due, auto: false })
    const byDue = (key, label, due, extra) => as(due <= today ? 'today' : 'upcoming', key, label, due, extra)
    const closed = label => as('done', 'none', label, null)

    function decide() {
        if (w.closedAt || w.deliveredAt) return closed('סגור')
        if (facts.openRequests > 0) return as('today', 'request', 'הלקוח כתב: לענות ולטפל', today)
        if (failed) return as('today', 'send_failed', 'הודעה נכשלה: לשלוח ידנית', today, { message: failed })
        if (w.shippedAt) return byDue('confirm_arrived', 'לוודא שהספר הגיע', addDays(dayOf(w.shippedAt) || today, 3))
        if (w.printOrderedAt || w.printOrder) {
            const ordered = dayOf(w.printOrderedAt || w.printOrder?.orderedAt) || today
            return byDue('mark_shipped', 'בהדפסה: לסמן כשנשלח', addDays(ordered, 14))
        }

        // Events opened before the funnel were never tracked. Past ones are sorted once, by hand.
        const untracked = millis(w.createdAt) < FUNNEL_START_MS && !w.triagedAt && (!day || day < today)
        if (untracked) {
            return paid || entries > 0
                ? as('triage', 'triage', 'לסמן: נמסר, בהדפסה, צריך טיפול או סגור', today)
                : closed('לא פעיל')
        }

        if (!paid) {
            if (entries > 0) return as('chance', 'check_payment', 'יש ברכות ולא רשום תשלום: לברר', today)
            if (day && day >= today) return byDue('offer_help', 'ניסיון: להציע עזרה לפני האירוע', later(today, addDays(day, -7)))
            return closed('לא פעיל')
        }

        if (!day) return as('today', 'ask_date', 'לברר את תאריך האירוע', today)
        if (toEvent >= 0 && toEvent <= 7 && entries === 0) {
            return as('today', 'no_blessings', 'האירוע קרוב ואין ברכות: לדבר עם הלקוח', today)
        }
        if (toEvent >= -6) {
            if (REACH[blocked]) {
                const due = toEvent >= 0 ? later(today, addDays(day, toEvent > 14 ? -14 : -2)) : addDays(day, 1)
                return byDue('reach', REACH[blocked], due)
            }
            const message = scheduled[0]
            if (message) {
                const label = `${automatic ? 'יישלח לבד' : 'לשלוח'}: ${message.label}`
                return automatic
                    ? { ...as('upcoming', 'message', label, message.day, { message: message.key }), auto: true }
                    : byDue('message', label, message.day, { message: message.key })
            }
            if (toEvent >= 0) return as('upcoming', 'wait_event', 'להמתין לאירוע', day)
        }
        const due = addDays(day, 7)
        return w.paymentStage === 'deposit'
            ? byDue('balance', 'לאשר את הספר ולגבות את היתרה', due)
            : byDue('approve_print', 'לעבור על הספר, לאשר ולהזמין להדפסה', due)
    }

    let result = decide()
    const deferred = String(w.boardDeferUntil || '')
    if (deferred > today && result.group !== 'done' && result.next.key !== 'request') {
        result = { ...result, group: 'upcoming', due: deferred }
    }

    return {
        id: w.id,
        title: eventNameOf(w) || w.ownerName || w.id,
        ownerName: w.ownerName || null,
        eventType: w.eventType || null,
        phone: mobileOf(w.ownerPhone) || mobileOf(facts.phone) || null,
        day,
        toEvent,
        entries,
        amount: Number(w.amountPaid) || 0,
        stage: stageOf(w, { paid, toEvent }),
        blocked,
        muted: w.lifecycleOff === true,
        note: w.boardNote || null,
        marks: MARKS.filter(mark => w[mark]),
        openRequests: facts.openRequests || 0,
        lastCustomerMessage: facts.lastCustomerMessage || null,
        sends: facts.sends || {},
        scheduled,
        ...result,
        overdue: result.group === 'today' && result.due < today,
    }
}

export function buildCustomerBoard(list, today, enabledDay = null) {
    const order = BOARD_GROUPS.map(group => group.key)
    const rows = list
        .map(({ w, facts }) => boardRow({ w, facts, today, enabledDay }))
        .filter(Boolean)
        .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group)
            || (a.group === 'done'
                ? String(b.day || '').localeCompare(String(a.day || ''))
                : String(a.due).localeCompare(String(b.due))))
    const counts = Object.fromEntries(order.map(key => [key, rows.filter(row => row.group === key).length]))
    return { rows, counts }
}
