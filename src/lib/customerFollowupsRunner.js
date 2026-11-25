// Sends the follow-up that is due today to each customer, once. Server only.
// Nothing happens while the switch is off. No phone numbers in logs.

import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebaseAdmin'
import { sendWhatsAppTemplate } from '@/lib/salesAgent/whatsapp'
import { recordDeliveryEvent } from '@/lib/salesAgent/leads'
import { createOutboundId } from '@/lib/salesAgent/delivery'
import { dueFollowup, mobileOf, templateFor } from '@/lib/customerFollowups'
import { FOLLOWUPS_COLLECTION, loadCustomerBooks, readFollowupSettings } from '@/lib/customerData'

export const MAX_PER_RUN = 20

// Refusals that are about the account or a template, not about one customer:
// token, permission, template missing / paused / disabled, parameters, payment,
// registration and rate limits. Nothing left, and the next send would fail too.
const ACCOUNT_REFUSALS = new Set([
    10, 100, 190, 200, 368, 80007, 130429, 131042, 131045, 131048, 132000, 132001, 132005,
    132007, 132012, 132015, 132016, 133010, 'TEMPLATE_NOT_CONFIGURED', 'WHATSAPP_NOT_CONFIGURED',
])

const firebaseDeps = {
    readSettings: readFollowupSettings,
    listBooks: () => loadCustomerBooks({ withEntries: false }),
    // The moment is marked used before the send: a run that dies half way, or a
    // second run, can never send it again.
    async claim(weddingId, key) {
        const ref = adminDb.collection('weddings').doc(weddingId)
        return adminDb.runTransaction(async tx => {
            const data = (await tx.get(ref)).data()
            if (!data || data.lifecycleOff === true || data.lifecycleSent?.[key]) return false
            tx.set(ref, { lifecycleSent: { [key]: Date.now() } }, { merge: true })
            return true
        })
    },
    async release(weddingId, key) {
        await adminDb.collection('weddings').doc(weddingId).update({ [`lifecycleSent.${key}`]: FieldValue.delete() })
    },
    send: (phone, template, params) => sendWhatsAppTemplate(phone, template, params),
    async record({ weddingId, key, status, providerMessageId, errorCode }) {
        const outboundId = createOutboundId({ scope: 'followup', subject: `${weddingId}:${key}`, attempt: 0, part: 'text' })
        await adminDb.collection(FOLLOWUPS_COLLECTION).doc(`${weddingId}_${key}`).set({
            weddingId, key, status, outboundId,
            errorCode: errorCode ?? null,
            at: FieldValue.serverTimestamp(),
        })
        if (status !== 'accepted') return
        // Lets the delivered and read callbacks from Meta find this message.
        await recordDeliveryEvent({
            eventId: `${outboundId}:accepted`, outboundId, channel: 'whatsapp_graph',
            status: 'accepted', providerMessageId, occurredAt: new Date().toISOString(),
        })
    },
}

export async function runCustomerFollowups({ today, baseUrl, dry = false, deps = firebaseDeps }) {
    const settings = await deps.readSettings()
    const result = { enabled: settings.enabled === true, due: [], sent: 0, failed: 0 }
    if (!result.enabled) return result

    const messaged = new Set()
    for (const { w, facts } of await deps.listBooks()) {
        const due = dueFollowup({ w, facts, today, enabledDay: settings.enabledDay })
        if (!due) continue
        const template = templateFor(due.key, w, baseUrl)
        const phone = mobileOf(w.ownerPhone) || mobileOf(facts?.phone)
        // One message per phone per run, even for a customer with two books.
        if (!template || messaged.has(phone)) continue
        messaged.add(phone)
        result.due.push({ id: w.id, key: due.key })
        if (dry || result.sent + result.failed >= MAX_PER_RUN) continue
        if (!await deps.claim(w.id, due.key)) continue

        let outcome
        try {
            const { providerMessageId } = await deps.send(phone, template.name, template.params)
            outcome = { status: 'accepted', providerMessageId }
            result.sent++
        } catch (error) {
            const errorCode = error?.providerCode || error?.errorCode || 'PROVIDER_FAILED'
            console.warn('[customer-followups] send refused', errorCode)
            if (ACCOUNT_REFUSALS.has(errorCode)) {
                // Give the moment back, so it goes once the account is fixed.
                await deps.release(w.id, due.key)
                result.stopped = errorCode
                break
            }
            outcome = { status: 'failed', errorCode }
            result.failed++
        }
        try {
            await deps.record({ weddingId: w.id, key: due.key, ...outcome })
        } catch {
            console.warn('[customer-followups] record failed', due.key)
        }
    }
    return result
}

const SAMPLE = { id: 'sample', ownerName: 'בדיקה', celebrantName: 'איתמר', slug: 'sample', digitalTokens: ['sample'] }

// One sample of a template to Lord's own phone, to prove Meta delivers it.
export async function sendTestFollowup({ key, phone, baseUrl = 'https://app.weddingtales.co.il', deps = firebaseDeps }) {
    const fail = code => Object.assign(new Error('test follow-up not sent'), { code })
    const template = templateFor(key, SAMPLE, baseUrl)
    if (!template) throw fail('UNKNOWN_FOLLOWUP')
    if (!mobileOf(phone)) throw fail('PHONE_MISSING')
    return deps.send(mobileOf(phone), template.name, template.params)
}
