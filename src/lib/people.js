// One list of people: leads and books of the same person joined into rows, each
// with one stage, at most one next step, and whether it rests. Pure: the caller
// reads the data. Spec: docs/superpowers/specs/2026-11-25-simple-crm-design.md
//
// Resting is only a way of looking. Nothing is written because of it.

import { daysBetween } from './lifecycle'
import { eventDay } from './journeyStage'
import { boardRow } from './customerBoard'
import { mobileOf, renderFollowup } from './customerFollowups'
import { deriveLead } from './salesAgent/leadsView'
import { isTestPhone } from './salesAgent/leadsCore'

const REST_AFTER_DAYS = 14
const DAY_MS = 86_400_000
const EVENT = {
    wedding: 'חתונה', bar_mitzvah: 'בר מצווה', twins_bar_mitzvah: 'בר מצווה', bat_mitzvah: 'בת מצווה',
    birthday: 'יום הולדת', poker: 'ערב פוקר', travel: 'מסע',
}
const WAITING_DRAFT = new Set(['pending', 'needs_owner', 'sent'])
const BOOK_ACTION = {
    message: 'whatsapp', send_failed: 'whatsapp', check_payment: 'whatsapp', offer_help: 'whatsapp', ask_date: 'whatsapp', no_blessings: 'whatsapp',
    // A balance is collected before anything is marked, so it opens the person.
    approve_print: 'mark', balance: 'open', mark_shipped: 'mark', confirm_arrived: 'mark', reach: 'open',
}
const MARK_FIELD = { approve_print: 'printOrderedAt', mark_shipped: 'shippedAt', confirm_arrived: 'deliveredAt' }
const LEAD_STEP = {
    handoff: 'מחכה לך: לענות',
    ready_to_pay: 'מוכן לשלם: לעזור לסגור',
    callback_due: 'הבטיח לחזור: לחזור אליו',
}
// Among the things of one day, what comes first.
const URGENCY = { request: 0, sample: 1, ready_to_pay: 2, handoff: 3, callback_due: 4, no_book: 5 }

const millis = value => {
    if (!value) return 0
    if (typeof value === 'number') return value
    if (typeof value.toMillis === 'function') return value.toMillis()
    if (typeof value.seconds === 'number') return value.seconds * 1000
    if (typeof value._seconds === 'number') return value._seconds * 1000
    return Date.parse(value) || 0
}
const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)

// What the rules need to know about one conversation.
function readLead(raw, { today, nowMs }) {
    const lead = deriveLead(raw, { todayISO: today, nowMs })
    const lastInboundMs = millis(raw.lastInboundAt)
    const heard = lastInboundMs || millis(raw.createdAt)
    const silent = !heard || nowMs - heard >= REST_AFTER_DAYS * DAY_MS
    // A promise to come back counts while it is ahead, and for a while after.
    const promised = Boolean(raw.callbackPromised) && raw.callbackPromised >= addDays(today, -REST_AFTER_DAYS)
    return {
        raw, phone: String(raw.phone || ''), lead, lastInboundMs, silent, promised,
        info: {
            stage: lead.stage, attention: lead.attention, paused: lead.paused,
            handoffReason: raw.handoffReason || null, packageInterest: raw.packageInterest || null,
            lastInboundMs: lastInboundMs || null, followUpAt: raw.followUpAt || null,
            callbackPromised: raw.callbackPromised || null,
        },
    }
}

// Unanswered requests before sent ones, the newest first.
const unansweredFirst = (a, b) => Number(a.status === 'sent') - Number(b.status === 'sent') || b.number - a.number
const waitingIds = extra => ({
    draft: extra.drafts[0]?.number ?? null, drafts: extra.drafts.map(draft => draft.number),
    sample: extra.samples[0]?.id ?? null, samples: extra.samples.map(sample => sample.id),
})

const requestStep = draft => ({
    key: 'request', action: 'open',
    label: draft?.status === 'sent' ? 'נשארו משימות מהבקשה' : 'הלקוח כתב: לענות',
})
const sampleStep = { key: 'sample', action: 'open', label: 'לאשר דוגמת שלט' }

function leadStep(entry, phone) {
    const key = entry.info.attention
    if (!LEAD_STEP[key]) return null
    return {
        step: { key, label: LEAD_STEP[key], action: phone ? 'whatsapp' : 'phone' },
        due: key === 'callback_due' ? entry.info.callbackPromised : null,
    }
}

function finish(row, { step, due }, today) {
    const inToday = Boolean(step?.action) && !row.resting && due <= today
    return { ...row, next: step || null, due: step ? due : null, inToday, overdue: inToday && due < today }
}

function bookPerson({ w, facts }, board, entry, extra, context) {
    const { today, baseUrl, sendsUnknown } = context
    const phone = board.phone || null
    const done = Boolean(w.closedAt || w.deliveredAt) || board.group === 'done'
    const stage = done ? 'done'
        : w.shippedAt || w.printOrderedAt || w.printOrder ? 'way'
            : board.amount > 0 && board.toEvent != null && board.toEvent < -6 ? 'print' : 'collect'
    const draft = extra.drafts[0]
    const waiting = facts.openRequests > 0 || Boolean(draft)
    const deferred = String(w.boardDeferUntil || '') > today
    // A deferral quiets what was known when it was set, never what came after it.
    const heardSince = !w.boardDeferAt || (entry?.lastInboundMs || 0) > millis(w.boardDeferAt)
    // A finished or an old book does not silence a person who is waiting now.
    const fromLead = entry && (!entry.silent || entry.promised) && (!deferred || heardSince) ? leadStep(entry, phone) : null
    const resting = board.group === 'triage' && !waiting && !extra.samples.length && !fromLead && !(entry && !entry.silent)

    let step = null
    let due = today
    if (waiting) step = requestStep(draft)
    else if (extra.samples.length) step = sampleStep
    else if (fromLead) {
        step = fromLead.step
        due = fromLead.due || today
    } else if (!resting && !['none', 'triage', 'request'].includes(board.next.key)) {
        const key = board.next.key
        // An automatic message is shown, but it is not his to do. Neither is one
        // that may be automatic because the settings were not read.
        const mayGoAlone = board.auto || (sendsUnknown && ['message', 'send_failed'].includes(key))
        let action = mayGoAlone ? null : BOOK_ACTION[key] || null
        if (key === 'reach' && board.blocked === 'no_phone') action = 'phone'
        if (action === 'whatsapp' && !phone) action = 'phone'
        step = {
            key, label: board.next.label, action,
            ...(MARK_FIELD[key] ? { field: MARK_FIELD[key] } : {}),
            ...(board.next.message ? { message: board.next.message, text: renderFollowup(board.next.message, w, baseUrl) } : {}),
        }
        due = board.group === 'chance' ? today : board.due || today
    }

    return finish({
        key: `b:${w.id}`, kind: 'book', name: board.title, ownerName: board.ownerName, what: EVENT[board.eventType] || '',
        day: board.day, toEvent: board.toEvent, stage, resting, phone, weddingId: w.id, leadPhone: entry?.phone || null,
        entries: board.entries, amount: board.amount, note: board.note, marks: board.marks, muted: board.muted,
        deferredUntil: deferred ? w.boardDeferUntil : null, lead: entry?.info || null,
        ...waitingIds(extra), lastAt: entry?.info.lastInboundMs || null,
        requests: facts.openRequests || 0, messages: facts.openMessages || [],
    }, { step, due }, today)
}

// `linked`: this conversation belongs to a book that shows another one.
function leadPerson(entry, extra, context, { linked = false } = {}) {
    const { today, nowMs } = context
    const { raw, phone, info } = entry
    const day = eventDay(raw.eventDate) || null
    const paidAt = millis(raw.closedAt) || millis(raw.paymentVerifiedAt)
    const unopened = !linked && info.stage === 'closed_won' && paidAt > 0 && nowMs - paidAt < REST_AFTER_DAYS * DAY_MS
    const open = !['closed_won', 'closed_lost'].includes(info.stage)
    const waiting = extra.drafts.length > 0 || extra.samples.length > 0
    const resting = open && !waiting && entry.silent && !entry.promised && !(day && day >= today)

    let step = null
    let due = today
    if (extra.drafts.length) step = requestStep(extra.drafts[0])
    else if (extra.samples.length) step = sampleStep
    else if (unopened) step = { key: 'no_book', action: 'open', label: 'נרשם תשלום ואין ספר: לוודא שנפתח' }
    else if (open && !resting) {
        const found = leadStep(entry, mobileOf(phone) || phone)
        if (found) {
            step = found.step
            due = found.due || today
        }
    }

    return finish({
        key: `l:${phone}`, kind: 'lead', name: raw.name || raw.profileName || raw.celebrantName || `מספר שמסתיים ב-${phone.slice(-4)}`,
        ownerName: raw.name || raw.profileName || null, what: EVENT[raw.eventType] || '', day,
        toEvent: day ? daysBetween(today, day) : null, stage: unopened ? 'collect' : open ? 'talk' : 'done', resting,
        phone: phone || null, weddingId: null, leadPhone: phone, entries: null, amount: Number(raw.amount) || 0,
        note: null, marks: [], muted: false, deferredUntil: null, lead: info,
        ...waitingIds(extra), lastAt: info.lastInboundMs,
        requests: 0, messages: [],
    }, { step, due }, today)
}

// A number that wrote or asked and has neither a book nor a conversation here.
// Nothing is known about it, so no lead action is offered on its row.
function unknownPerson(phone, extra, context) {
    const name = extra.drafts[0]?.customerName || extra.samples[0]?.name || `מספר שמסתיים ב-${phone.slice(-4)}`
    return finish({
        key: `u:${phone}`, kind: 'unknown', name, ownerName: null, what: '', day: null, toEvent: null, stage: 'talk', resting: false,
        phone, weddingId: null, leadPhone: null, entries: null, amount: 0, note: null, marks: [], muted: false, deferredUntil: null,
        lead: null, ...waitingIds(extra), lastAt: null, requests: 0, messages: [],
    }, { step: extra.drafts.length ? requestStep(extra.drafts[0]) : sampleStep, due: context.today }, context.today)
}

// The book a phone's conversation belongs to: the nearest event ahead, else the
// latest one behind.
const nearness = board => (board.group === 'done' ? 2_000_000 : 0)
    + (board.toEvent == null ? 500_000 : board.toEvent >= 0 ? board.toEvent : 100_000 - board.toEvent)

// Of two conversations on one book: the one waiting for him, then the latest.
const wanting = entry => ((!entry.silent || entry.promised) && LEAD_STEP[entry.info.attention] ? URGENCY[entry.info.attention] : 99)
const firstToShow = (a, b) => wanting(a) - wanting(b) || b.lastInboundMs - a.lastInboundMs

const rank = row => (row.inToday ? (row.overdue ? 0 : 1) : row.resting ? 3 : row.stage === 'done' ? 4 : 2)
const farthest = value => (value == null ? 1_000_000 : Math.abs(value))

function inOrder(a, b) {
    const group = rank(a) - rank(b)
    if (group) return group
    if (rank(a) === 1) return (URGENCY[a.next.key] ?? 6) - (URGENCY[b.next.key] ?? 6) || farthest(a.toEvent) - farthest(b.toEvent)
    if (rank(a) === 3) return (b.lastAt || 0) - (a.lastAt || 0)
    if (rank(a) === 4) return String(b.day || '').localeCompare(String(a.day || ''))
    return String(a.due || '9999').localeCompare(String(b.due || '9999')) || farthest(a.toEvent) - farthest(b.toEvent)
}

export function buildPeople({
    today, nowMs, books = [], leads = [], drafts = [], samples = [], ownerPhone = '', enabledDay = null, sendsUnknown = false,
    baseUrl = 'https://app.weddingtales.co.il',
}) {
    const context = { today, nowMs, baseUrl, sendsUnknown }
    const owner = mobileOf(ownerPhone)
    const shelf = books
        .map(source => ({ source, board: boardRow({ w: source.w, facts: source.facts, today, enabledDay }) }))
        .filter(item => item.board)

    // Every conversation goes to one book, or stands alone.
    const byBook = new Map()
    const alone = []
    for (const raw of leads) {
        const phone = String(raw.phone || '')
        if (!phone || isTestPhone(phone) || (owner && mobileOf(phone) === owner)) continue
        const entry = readLead(raw, context)
        const linked = raw.weddingId && shelf.find(item => item.source.w.id === String(raw.weddingId))
        const same = mobileOf(phone)
        const target = linked || (same && shelf.filter(item => item.board.phone === same).sort((a, b) => nearness(a.board) - nearness(b.board))[0])
        if (!target) {
            alone.push({ entry, linked: false })
            continue
        }
        const id = target.source.w.id
        byBook.set(id, [...(byBook.get(id) || []), entry])
    }
    // A book shows one conversation; any other keeps a row of its own.
    for (const [id, entries] of byBook) {
        const [shown, ...others] = entries.sort(firstToShow)
        byBook.set(id, shown)
        alone.push(...others.map(entry => ({ entry, linked: true })))
    }

    // Everything that waits sits on one row: its book, else its phone.
    const waitingDrafts = drafts.filter(draft => WAITING_DRAFT.has(draft.status)).sort(unansweredFirst)
    const readySamples = samples.filter(sample => sample.status === 'ready')
    const taken = new Set()
    const claim = (list, matches) => {
        const found = list.filter(item => !taken.has(item) && matches(item))
        for (const item of found) taken.add(item)
        return found
    }
    const byPhone = phone => ({
        drafts: claim(waitingDrafts, draft => draft.phone === phone),
        samples: claim(readySamples, sample => sample.phone === phone),
    })

    const ordered = [...shelf].sort((a, b) => nearness(a.board) - nearness(b.board))
    const bookRows = ordered.map(({ source, board }) => {
        const entry = byBook.get(source.w.id) || null
        const phones = new Set([board.phone, entry?.phone].filter(Boolean))
        const mine = [
            ...claim(waitingDrafts, draft => draft.weddingId === source.w.id),
            ...claim(waitingDrafts, draft => !draft.weddingId && phones.has(draft.phone)),
        ].sort(unansweredFirst)
        return bookPerson(source, board, entry, { drafts: mine, samples: claim(readySamples, sample => phones.has(sample.phone)) }, context)
    })
    const leadRows = alone.map(({ entry, linked }) => leadPerson(entry, byPhone(entry.phone), context, { linked }))
    // Nothing that waits may disappear because its number belongs to nobody yet.
    for (const item of [...waitingDrafts, ...readySamples]) {
        const phone = String(item.phone || '')
        if (!phone || taken.has(item)) continue
        leadRows.push(unknownPerson(phone, byPhone(phone), context))
    }

    const rows = [...bookRows, ...leadRows].sort(inOrder)
    const living = rows.filter(row => !row.resting)
    const counts = {
        today: rows.filter(row => row.inToday).length,
        ...Object.fromEntries(['talk', 'collect', 'print', 'way'].map(stage => [stage, living.filter(row => row.stage === stage).length])),
        resting: rows.length - living.length,
        done: living.filter(row => row.stage === 'done').length,
    }
    return { rows, counts }
}

