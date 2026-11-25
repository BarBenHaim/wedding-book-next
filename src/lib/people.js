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
    const { today, baseUrl } = context
    const phone = board.phone || null
    const done = Boolean(w.closedAt || w.deliveredAt) || board.group === 'done'
    const stage = done ? 'done'
        : w.shippedAt || w.printOrderedAt || w.printOrder ? 'way'
            : board.amount > 0 && board.toEvent != null && board.toEvent < -6 ? 'print' : 'collect'
    const waiting = facts.openRequests > 0 || extra.draft
    const resting = board.group === 'triage' && !waiting && !extra.sample
    const deferred = String(w.boardDeferUntil || '') > today

    let step = null
    let due = today
    const fromLead = entry && !done && !deferred && (!entry.silent || entry.promised) ? leadStep(entry, phone) : null
    if (waiting) step = requestStep(extra.draft)
    else if (extra.sample) step = sampleStep
    else if (fromLead) {
        step = fromLead.step
        due = fromLead.due || today
    } else if (!resting && !['none', 'triage', 'request'].includes(board.next.key)) {
        const key = board.next.key
        // An automatic message is shown, but it is not his to do.
        let action = board.auto ? null : BOOK_ACTION[key] || null
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
        draft: extra.draft?.number ?? null, sample: extra.sample?.id ?? null, lastAt: entry?.info.lastInboundMs || null,
        requests: facts.openRequests || 0, messages: facts.openMessages || [],
    }, { step, due }, today)
}

function leadPerson(entry, extra, context) {
    const { today, nowMs } = context
    const { raw, phone, info } = entry
    const day = eventDay(raw.eventDate) || null
    const paidAt = millis(raw.closedAt) || millis(raw.paymentVerifiedAt)
    const unopened = info.stage === 'closed_won' && paidAt > 0 && nowMs - paidAt < REST_AFTER_DAYS * DAY_MS
    const open = !['closed_won', 'closed_lost'].includes(info.stage)
    const waiting = extra.draft || extra.sample
    const resting = open && !waiting && entry.silent && !entry.promised && !(day && day >= today)

    let step = null
    let due = today
    if (extra.draft) step = requestStep(extra.draft)
    else if (extra.sample) step = sampleStep
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
        draft: extra.draft?.number ?? null, sample: extra.sample?.id ?? null, lastAt: info.lastInboundMs,
        requests: 0, messages: [],
    }, { step, due }, today)
}

// The book a phone's conversation belongs to: the nearest event ahead, else the
// latest one behind.
const nearness = board => (board.group === 'done' ? 2_000_000 : 0)
    + (board.toEvent == null ? 500_000 : board.toEvent >= 0 ? board.toEvent : 100_000 - board.toEvent)

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
    today, nowMs, books = [], leads = [], drafts = [], samples = [], ownerPhone = '', enabledDay = null,
    baseUrl = 'https://app.weddingtales.co.il',
}) {
    const context = { today, nowMs, baseUrl }
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
            alone.push(entry)
            continue
        }
        const id = target.source.w.id
        if (!byBook.has(id) || entry.lastInboundMs > byBook.get(id).lastInboundMs) byBook.set(id, entry)
    }

    // A draft or a ready sample sits on one row: its book, else its phone.
    const waitingDrafts = drafts.filter(draft => WAITING_DRAFT.has(draft.status))
    const readySamples = samples.filter(sample => sample.status === 'ready')
    const taken = new Set()
    const claim = (list, matches) => {
        const found = list.find(item => !taken.has(item) && matches(item))
        if (found) taken.add(found)
        return found || null
    }

    const ordered = [...shelf].sort((a, b) => nearness(a.board) - nearness(b.board))
    const bookRows = ordered.map(({ source, board }) => {
        const entry = byBook.get(source.w.id) || null
        const phones = new Set([board.phone, entry?.phone].filter(Boolean))
        return bookPerson(source, board, entry, {
            draft: claim(waitingDrafts, draft => draft.weddingId === source.w.id) || claim(waitingDrafts, draft => !draft.weddingId && phones.has(draft.phone)),
            sample: claim(readySamples, sample => phones.has(sample.phone)),
        }, context)
    })
    const own = entry => leadPerson(entry, {
        draft: claim(waitingDrafts, draft => draft.phone === entry.phone),
        sample: claim(readySamples, sample => sample.phone === entry.phone),
    }, context)
    const leadRows = alone.map(own)
    // Nothing that waits may disappear because its number belongs to nobody yet.
    for (const item of [...waitingDrafts, ...readySamples]) {
        const phone = String(item.phone || '')
        if (!phone || taken.has(item)) continue
        leadRows.push(own(readLead({ phone, profileName: item.customerName || item.name || '', stage: 'new', lastInboundAt: nowMs }, context)))
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

