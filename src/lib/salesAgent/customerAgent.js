// A customer's request becomes a numbered draft for Lord: Claude reads, Lord
// approves, the app sends. This changes no book and moves no money. Nothing
// here logs a phone number, a name or message text.
// Design: docs/superpowers/specs/2026-11-25-customer-requests-agent-design.md

import { adminDb } from '@/lib/firebaseAdmin'
import { CLAUDE_AGENT_MODEL, callAnthropic } from './agent'
import { noteClaudeOutcome } from './claudeHealth'
import { sendWhatsAppText } from './whatsapp'
import { buildDraftRequest, ownerDraftMessage, parseDraft } from './customerAgentCore'

export const DRAFTS_COLLECTION = 'customer_drafts'
const INBOX = 'customer_inbox'
const APP = 'https://app.weddingtales.co.il'
// Meta's free-form window, with a few minutes to spare.
const WINDOW_MS = 24 * 3_600_000 - 5 * 60_000
// Customers write in bursts; only the last message of one is answered.
const BURST_WAIT_MS = 6_000
const HISTORY = 12
const WAITING = new Set(['pending', 'needs_owner'])
// The follow-up opt-out word is handled by the reply route itself.
const OPT_OUT = /^["'״]?הסר["'״]?[.!]?$/
// A sent reply whose tasks Lord has not closed yet.
const openTasks = row => row.status === 'sent' && (row.tasks || []).length > 0

const store = db => db || adminDb
const draftError = code => Object.assign(new Error('customer draft unavailable'), { code })
const millis = value => {
    if (value?.toMillis) return value.toMillis()
    const number = Number(value)
    if (Number.isFinite(number) && number > 0) return number < 1e12 ? number * 1000 : number
    return Date.parse(value) || 0
}
const itemTime = item => millis(item.occurredAt) || millis(item.receivedAt)
const settingsRef = db => store(db).collection('admin_settings').doc('customerAgent')
const ownerRef = db => store(db).collection('sales_runtime').doc('owner_window')
const draftRef = (db, number) => store(db).collection(DRAFTS_COLLECTION).doc(String(number))

export async function readAgentSettings({ db } = {}) {
    try {
        const snap = await settingsRef(db).get()
        const data = (snap.exists && snap.data()) || {}
        return { enabled: data.enabled === true, testPhones: Array.isArray(data.testPhones) ? data.testPhones.map(String) : [] }
    } catch (error) {
        console.warn('[customer-agent] settings not read', error?.code || 'UNKNOWN')
        return { enabled: false, testPhones: [] }
    }
}

export async function writeAgentSettings({ enabled, by }, { db, nowMs = Date.now() } = {}) {
    await settingsRef(db).set({ enabled: enabled === true, updatedBy: String(by || '').slice(0, 160), updatedAt: nowMs }, { merge: true })
    return readAgentSettings({ db })
}

export async function noteOwnerWrote({ db, nowMs = Date.now() } = {}) {
    await ownerRef(db).set({ lastOwnerAt: nowMs }, { merge: true })
}

async function mailOwner(text) {
    const { default: nodemailer } = await import('nodemailer')
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS } })
    await transporter.sendMail({
        from: `"Wedding Tales" <${process.env.MAIL_USER}>`, to: process.env.MAIL_USER,
        subject: 'בקשה מלקוח מחכה לך', text: `${text}\n\n${APP}/admin/customers`,
    })
}

// His phone while his 24 hour window is open, otherwise e-mail. Never throws:
// the draft is on the board either way.
export async function notifyOwner(text, { db, nowMs = Date.now(), whatsapp = sendWhatsAppText, mail = mailOwner, ownerPhone = process.env.SALES_AGENT_OWNER_PHONE } = {}) {
    try {
        const wrote = Number((await ownerRef(db).get()).data()?.lastOwnerAt) || 0
        if (ownerPhone && nowMs - wrote < WINDOW_MS) {
            await whatsapp(ownerPhone, text)
            return 'whatsapp'
        }
    } catch (error) {
        console.warn('[customer-agent] owner not reached on WhatsApp', error?.errorCode || error?.code || 'UNKNOWN')
    }
    try {
        await mail(text)
        return 'mail'
    } catch (error) {
        console.warn('[customer-agent] owner not mailed', error?.code || 'UNKNOWN')
        return 'none'
    }
}

async function itemsOf(db, phone) {
    const snap = await store(db).collection(INBOX).where('phone', '==', phone).get()
    return snap.docs.map(doc => ({ ...doc.data(), id: doc.id })).sort((a, b) => itemTime(a) - itemTime(b))
}

async function bookFacts(db, weddingId) {
    const ref = store(db).collection('weddings').doc(weddingId)
    const w = (await ref.get()).data()
    if (!w) return null
    const blessings = (await ref.collection('entries').count().get()).data().count
    // No money and no contact details: Claude does not need them.
    return {
        celebrant: w.celebrantName || [w.brideName, w.groomName].filter(Boolean).join(' ו') || '',
        eventType: w.eventType || '', date: w.weddingDate || w.eventDate || '', blessings,
        guestLink: w.slug ? `${APP}/w/${w.slug}` : '',
        printOrdered: !!w.printOrderedAt, shipped: !!w.shippedAt, delivered: !!w.deliveredAt,
    }
}

async function saveDraft(db, draft, nowMs) {
    const open = (await store(db).collection(DRAFTS_COLLECTION).where('phone', '==', draft.phone).get()).docs
        .filter(doc => WAITING.has(doc.data().status)).map(doc => doc.id)
    const counter = store(db).collection('admin_settings').doc('customerAgentCounter')
    return store(db).runTransaction(async tx => {
        const number = (Number((await tx.get(counter)).data()?.last) || 0) + 1
        for (const id of open) tx.set(draftRef(db, id), { status: 'replaced', updatedAt: nowMs }, { merge: true })
        tx.set(counter, { last: number }, { merge: true })
        tx.set(draftRef(db, number), { ...draft, number, createdAt: nowMs, updatedAt: nowMs })
        return number
    })
}

const askClaude = ({ system, messages }) => callAnthropic({
    system, messages, model: CLAUDE_AGENT_MODEL, maxTokens: 4096, deadlineAtMs: Date.now() + 25_000,
})

export async function draftForCustomer({ eventId, phone }, {
    db, nowMs = Date.now(), ask = askClaude, tell, wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
    const settings = await readAgentSettings({ db })
    if (!settings.enabled && !settings.testPhones.includes(phone)) return { action: 'off' }
    await wait(BURST_WAIT_MS)
    const items = await itemsOf(db, phone)
    const latest = items.at(-1)
    if (!latest || latest.id !== eventId) return { action: 'superseded' }
    if (OPT_OUT.test(String(latest.text || '').trim())) return { action: 'opt-out' }
    // A message replayed after an outage can no longer be answered here.
    if (nowMs - itemTime(latest) >= WINDOW_MS) return { action: 'stale' }

    let ids = latest.weddingIds || []
    // Customers from before the bot are linked on the private lead record, not
    // by a phone on the book.
    if (!ids.length) {
        const linked = (await store(db).collection('sales_leads').doc(phone).get()).data()?.weddingId
        if (linked) ids = [String(linked)]
    }
    let draft = {
        phone, weddingId: ids.length === 1 ? ids[0] : null, customerName: latest.customerName || '',
        basisId: latest.id, basisAt: itemTime(latest), status: 'needs_owner', summary: '', text: '', tasks: [],
    }
    if (ids.length > 1) {
        draft.summary = 'יש כמה ספרים על המספר הזה. צריך לבחור לאיזה הכוונה.'
    } else {
        try {
            const book = ids.length ? await bookFacts(db, ids[0]) : null
            const recent = items.filter(item => item.status !== 'done').slice(-HISTORY)
            const answer = await ask(buildDraftRequest({
                books: book ? [book] : [],
                messages: recent.map(item => ({ type: item.messageType || 'text', text: item.text || '' })),
            }))
            noteClaudeOutcome(answer)
            const parsed = parseDraft(answer.text)
            if (parsed) {
                const link = parsed.link === 'guest' ? book?.guestLink : parsed.link === 'login' ? `${APP}/login` : ''
                // A reply that counts on a link we do not have is not sent.
                const missing = parsed.link && !link
                const text = missing ? '' : parsed.reply && link ? `${parsed.reply}\n${link}` : parsed.reply
                draft = { ...draft, summary: parsed.summary, text, tasks: parsed.tasks, status: text ? 'pending' : 'needs_owner' }
            } else {
                console.warn('[customer-agent] unusable answer')
            }
        } catch (error) {
            noteClaudeOutcome(error)
            console.warn('[customer-agent] draft failed', error?.errorCode || error?.code || 'UNKNOWN')
        }
        if (!draft.summary) draft.summary = String(latest.text || '').slice(0, 200) || 'שלחו קובץ'
    }
    const number = await saveDraft(db, draft, nowMs)
    const message = ownerDraftMessage({ ...draft, number })
    await (tell ? tell(message) : notifyOwner(message, { db, nowMs }))
    return { action: 'drafted', number }
}

// Lord's decision. A send goes only to the phone on the draft, and only while
// the draft still answers the customer's last message.
export async function decideDraft(number, decision, { db, text, send = sendWhatsAppText, nowMs = Date.now() } = {}) {
    if (!['send', 'reject', 'done'].includes(decision)) throw draftError('INVALID_DECISION')
    const ref = draftRef(db, number)
    const before = await ref.get()
    if (!before.exists) throw draftError('DRAFT_NOT_FOUND')
    if (decision === 'done') {
        if (!openTasks(before.data())) throw draftError('DRAFT_NOT_PENDING')
        await ref.set({ status: 'done', updatedAt: nowMs }, { merge: true })
        return { number: Number(number), status: 'done' }
    }
    const items = decision === 'send' ? await itemsOf(db, before.data().phone) : []

    const claimed = await store(db).runTransaction(async tx => {
        const row = (await tx.get(ref)).data()
        if (!WAITING.has(row.status)) throw draftError('DRAFT_NOT_PENDING')
        if (decision === 'reject') {
            tx.set(ref, { status: 'rejected', updatedAt: nowMs }, { merge: true })
            return row
        }
        const words = String(text ?? row.text ?? '').trim().slice(0, 4000)
        if (!words) throw draftError('NOTHING_TO_SEND')
        if (nowMs - row.basisAt >= WINDOW_MS) throw draftError('WINDOW_CLOSED')
        if (items.some(item => item.id !== row.basisId && itemTime(item) > row.basisAt)) throw draftError('NEWER_MESSAGE')
        const lead = store(db).collection('sales_leads').doc(row.phone)
        const turns = (await tx.get(lead)).data()?.turns || []
        tx.set(ref, { status: 'sending', text: words, updatedAt: nowMs }, { merge: true })
        // Written before the send: WhatsApp echoes our message back on this
        // chat, and without this it reads as Lord typing.
        tx.set(lead, { turns: [...turns, { role: 'assistant', text: words, at: nowMs }] }, { merge: true })
        return { ...row, text: words }
    })
    if (decision === 'reject') return { number: Number(number), status: 'rejected' }

    try {
        await send(claimed.phone, claimed.text)
    } catch (error) {
        console.warn('[customer-agent] send failed', error?.errorCode || error?.code || 'UNKNOWN')
        await ref.set({ status: 'pending', errorCode: 'SEND_FAILED', updatedAt: nowMs }, { merge: true })
        throw draftError('SEND_FAILED')
    }
    await ref.set({ status: 'sent', sentAt: nowMs, errorCode: null, updatedAt: nowMs }, { merge: true })
    return { number: Number(number), status: 'sent', tasks: claimed.tasks || [] }
}

// Lord wrote in the chat himself: nothing of ours should follow.
export async function cancelDraftsFor(phone, { db, nowMs = Date.now() } = {}) {
    const open = (await store(db).collection(DRAFTS_COLLECTION).where('phone', '==', phone).get()).docs
        .filter(doc => WAITING.has(doc.data().status))
    for (const doc of open) await draftRef(db, doc.id).set({ status: 'answered', updatedAt: nowMs }, { merge: true })
    return open.length
}

async function unfinished(db) {
    const snap = await store(db).collection(DRAFTS_COLLECTION).get()
    return snap.docs.map(doc => doc.data()).filter(row => WAITING.has(row.status) || openTasks(row)).sort((a, b) => a.number - b.number)
}

export async function listDrafts({ db, nowMs = Date.now() } = {}) {
    return (await unfinished(db)).map(row => ({
        number: row.number, status: row.status, phone: row.phone, customerName: row.customerName, weddingId: row.weddingId,
        summary: row.summary, text: row.text, tasks: row.tasks || [], errorCode: row.errorCode || null,
        createdAt: row.createdAt, windowOpen: nowMs - row.basisAt < WINDOW_MS,
    }))
}

export async function draftAlerts({ db } = {}) {
    try {
        const rows = await unfinished(db)
        const waiting = rows.filter(row => WAITING.has(row.status)).length
        const tasks = rows.filter(openTasks).length
        return [
            ...(waiting ? [`📩 בקשות לקוחות מחכות לך: ${waiting}`] : []),
            ...(tasks ? [`📩 משימות מלקוחות שעוד פתוחות: ${tasks}`] : []),
        ]
    } catch (error) {
        console.warn('[customer-agent] drafts not counted', error?.code || 'UNKNOWN')
        return []
    }
}
