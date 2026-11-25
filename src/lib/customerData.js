// The facts about every customer that the board and the follow-up sender read.
// Server only.

import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebaseAdmin'
import { isPausedForHuman } from '@/lib/salesAgent/leadsCore'
import { mobileOf } from '@/lib/customerFollowups'
import { phoneVariants } from '@/lib/salesAgent/customerInboxCore'

export const FOLLOWUPS_COLLECTION = 'customer_followups'
const settingsRef = () => adminDb.collection('admin_settings').doc('customerFollowups')

// Off unless somebody turned it on.
export async function readFollowupSettings() {
    const data = (await settingsRef().get()).data() || {}
    return { enabled: data.enabled === true, enabledDay: data.enabled === true ? data.enabledDay || null : null }
}

export async function writeFollowupSettings({ enabled, today, by }) {
    await settingsRef().set({
        enabled: enabled === true,
        enabledDay: enabled === true ? today : null,
        changedBy: by || null,
        changedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    return readFollowupSettings()
}

const millis = value => value?.toMillis?.() || 0

// An inbox message belongs to its book, or to the phone when no book is on it.
export function isOpenItemFor(item, weddingId, phone) {
    if ((item.weddingIds || []).length) return item.weddingIds.includes(weddingId)
    return Boolean(phone) && item.phone === phone
}

export async function closeOpenRequests(weddingId) {
    const wedding = (await adminDb.collection('weddings').doc(weddingId).get()).data()
    let phone = mobileOf(wedding?.ownerPhone)
    if (!phone) {
        const lead = await adminDb.collection('sales_leads').where('weddingId', '==', weddingId).limit(1).get()
        phone = mobileOf(lead.docs[0]?.id)
    }
    const open = await adminDb.collection('customer_inbox').where('status', '==', 'new').get()
    const mine = open.docs.filter(doc => isOpenItemFor(doc.data(), weddingId, phone))
    await Promise.all(mine.map(doc => doc.ref.set(
        { status: 'handled', handledAt: FieldValue.serverTimestamp(), note: 'closed from the customer board' },
        { merge: true },
    )))
    return mine.length
}

// A customer asked to stop the follow-ups: mark every book that is theirs.
export async function optOutCustomer(phone) {
    const variants = phoneVariants(phone)
    if (!variants.length) return 0
    const [books, lead] = await Promise.all([
        adminDb.collection('weddings').where('ownerPhone', 'in', variants).limit(10).get(),
        adminDb.collection('sales_leads').doc(phone).get(),
    ])
    const ids = new Set(books.docs.map(doc => doc.id))
    if (lead.data()?.weddingId) ids.add(String(lead.data().weddingId))
    if (!ids.size) return 0
    const batch = adminDb.batch()
    for (const id of ids) {
        batch.set(adminDb.collection('weddings').doc(id),
            { lifecycleOff: true, lifecycleOffAt: FieldValue.serverTimestamp() }, { merge: true })
    }
    await batch.commit()
    return ids.size
}

async function readSends() {
    const records = (await adminDb.collection(FOLLOWUPS_COLLECTION).get()).docs.map(doc => doc.data())
    // Delivered and read arrive later, on the delivery record of the same outbound message.
    const refs = records.filter(record => record.outboundId)
        .map(record => adminDb.collection('sales_delivery_events').doc(record.outboundId))
    const delivery = new Map((refs.length ? await adminDb.getAll(...refs) : [])
        .map(doc => [doc.id, doc.data()?.status]))
    const sends = new Map()
    for (const record of records) {
        if (!sends.has(record.weddingId)) sends.set(record.weddingId, {})
        const later = delivery.get(record.outboundId)
        sends.get(record.weddingId)[record.key] = {
            status: ['delivered', 'read', 'failed'].includes(later) ? later : record.status,
            at: millis(record.at) || null,
        }
    }
    return sends
}

// `leads` may be passed by a caller that has read them already.
export async function loadCustomerBooks({ withEntries = true, leads: preloaded } = {}) {
    const [books, leadDocs, inbox, sends] = await Promise.all([
        adminDb.collection('weddings').get(),
        preloaded ? null : adminDb.collection('sales_leads').select('weddingId', 'human', 'humanSince', 'turns').get(),
        adminDb.collection('customer_inbox').where('status', '==', 'new').get(),
        readSends(),
    ])
    const leads = preloaded || leadDocs.docs.map(doc => ({ phone: doc.id, ...doc.data() }))
    const leadByPhone = new Map(leads.map(lead => [lead.phone, lead]))
    const leadByBook = new Map(leads.filter(lead => lead.weddingId).map(lead => [String(lead.weddingId), lead]))
    const open = inbox.docs.map(doc => doc.data())

    return Promise.all(books.docs.map(async doc => {
        const w = { id: doc.id, ...doc.data() }
        const lead = leadByPhone.get(mobileOf(w.ownerPhone)) || leadByBook.get(doc.id)
        const phone = mobileOf(w.ownerPhone) || mobileOf(lead?.phone)
        const message = (lead?.turns || []).filter(turn => turn.role === 'user' && turn.text).at(-1)
        const waiting = open.filter(item => isOpenItemFor(item, doc.id, phone))
        const entries = withEntries
            ? (await doc.ref.collection('entries').count().get()).data().count
            : 0
        return {
            w,
            facts: {
                entries,
                phone: phone || null,
                paused: lead ? isPausedForHuman(lead) : false,
                openRequests: waiting.length,
                // What the customer wrote and nobody answered yet, newest last.
                openMessages: waiting.sort((a, b) => millis(a.receivedAt) - millis(b.receivedAt)).slice(-3)
                    .map(item => ({ type: item.messageType || 'text', text: String(item.text || '').slice(0, 300), at: millis(item.receivedAt) || null })),
                lastCustomerMessage: message
                    ? { text: String(message.text).slice(0, 200), at: Number(message.at) || null }
                    : null,
                sends: sends.get(doc.id) || {},
            },
        }
    }))
}
