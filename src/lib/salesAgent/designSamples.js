// The free sign sample of a lead: the offer mark, the invited photo, the queue
// Lord's PC draws from (scripts/designs.mjs), his approval and the send.
//
// The app collects and sends; it never draws. Nothing is sent without his
// approval. Nothing here logs a phone number, a name or message text.
// Design: docs/superpowers/specs/2026-11-25-lead-design-samples-design.md

import crypto from 'node:crypto'
import { after } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb, adminStorage } from '@/lib/firebaseAdmin'
import { downloadInboundMedia } from './customerInbox'
import { sendWhatsAppImage } from './whatsapp'
import { SAMPLE_CAPTION } from './designSamplesCore'

export const SAMPLES_COLLECTION = 'sales_design_samples'
const LEADS = 'sales_leads'
const KEEP_MS = 30 * 86_400_000
// Meta's free-form window, with a few minutes to spare for the send itself.
const WINDOW_MS = 24 * 3_600_000 - 5 * 60_000
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const PHOTO_TURN = '[תמונה לדוגמת שלט]'
const OPEN = new Set(['receiving', 'pending', 'failed', 'ready', 'sending'])

export const sampleId = phone => crypto.createHash('sha256').update(`design-sample:${String(phone)}`).digest('hex').slice(0, 32)
const sampleError = code => Object.assign(new Error('design sample unavailable'), { code })
const millis = value => (value?.toMillis ? value.toMillis() : Number(value) || 0)
const store = db => db || adminDb
const sampleRef = (db, id) => store(db).collection(SAMPLES_COLLECTION).doc(String(id))
const leadRef = (db, phone) => store(db).collection(LEADS).doc(String(phone))
const settingsRef = db => store(db).collection('admin_settings').doc('designSamples')

const saveFile = (path, bytes, contentType) => adminStorage.bucket().file(path)
    .save(bytes, { resumable: false, contentType, metadata: { cacheControl: 'private, max-age=0, no-store' } })
const signFile = async path => (await adminStorage.bucket().file(path).getSignedUrl({ action: 'read', expires: Date.now() + 15 * 60_000 }))[0]
const removeFolder = prefix => adminStorage.bucket().deleteFiles({ prefix })

// Off until Lord turns it on. A phone in `testPhones` is offered even then.
export async function readDesignSettings({ db } = {}) {
    try {
        const snap = await settingsRef(db).get()
        const data = (snap.exists && snap.data()) || {}
        return { enabled: data.enabled === true, testPhones: Array.isArray(data.testPhones) ? data.testPhones.map(String) : [] }
    } catch (error) {
        console.warn('[design-samples] settings not read', error?.code || 'UNKNOWN')
        return { enabled: false, testPhones: [] }
    }
}

export async function writeDesignSettings({ enabled, by }, { db, nowMs = Date.now() } = {}) {
    await settingsRef(db).set({ enabled: enabled === true, updatedBy: String(by || '').slice(0, 160), updatedAt: nowMs }, { merge: true })
    return readDesignSettings({ db })
}

export async function markSampleOffered(phone, kind, { db, nowMs = Date.now() } = {}) {
    await leadRef(db, phone).set({ designSample: { status: 'offered', kind, offeredAt: nowMs } }, { merge: true })
}

// One request per lead. Keeps the lead's chat open (no pause) and counts the
// photo as a message from them, which is what the 24 hour window runs on.
export async function receiveSamplePhoto({ phone, mediaId, profileName = '', ack }, { db, nowMs = Date.now() } = {}) {
    const id = sampleId(phone)
    return store(db).runTransaction(async tx => {
        const sample = sampleRef(db, id)
        const lead = leadRef(db, phone)
        const [sampleSnap, leadSnap] = [await tx.get(sample), await tx.get(lead)]
        const current = sampleSnap.exists ? sampleSnap.data() : null
        const held = (leadSnap.exists && leadSnap.data()) || {}
        const repeat = !!current && current.status !== 'rejected'
        tx.set(sample, {
            leadId: String(phone),
            kind: held.designSample?.kind || 'both',
            profileName: String(profileName || held.profileName || '').slice(0, 120),
            status: repeat ? current.status : 'receiving',
            createdAt: current?.createdAt || nowMs,
            updatedAt: nowMs,
        }, { merge: true })
        const turns = Array.isArray(held.turns) ? held.turns : []
        tx.set(lead, {
            designSample: { status: 'received' },
            lastInboundAt: FieldValue.serverTimestamp(),
            lastMessageAt: FieldValue.serverTimestamp(),
            turns: [
                ...turns,
                { role: 'user', text: PHOTO_TURN, at: nowMs },
                // A second picture is taken quietly.
                ...(repeat ? [{ role: 'assistant', text: '[התמונה נוספה לבקשת הדוגמה]', at: nowMs }] : [{ role: 'assistant', text: String(ack), at: nowMs }]),
            ],
        }, { merge: true })
        return { id, repeat }
    })
}

export async function storeSamplePhoto(id, mediaId, { db, download = downloadInboundMedia, save = saveFile, nowMs = Date.now() } = {}) {
    const ref = sampleRef(db, id)
    try {
        const file = await download(mediaId)
        const extension = PHOTO_TYPES[String(file.mimeType).split(';')[0].trim().toLowerCase()]
        if (!extension) throw sampleError('UNSUPPORTED_MEDIA_TYPE')
        const before = (await ref.get()).data() || {}
        const photos = Array.isArray(before.photos) ? before.photos : []
        const path = `design-samples/${id}/photo-${photos.length + 1}.${extension}`
        await save(path, file.bytes, file.mimeType)
        await store(db).runTransaction(async tx => {
            const now = (await tx.get(ref)).data() || {}
            tx.set(ref, {
                photos: [...(Array.isArray(now.photos) ? now.photos : []), { path, mediaId: String(mediaId).slice(0, 500) }],
                status: ['receiving', 'failed'].includes(now.status) ? 'pending' : now.status,
                errorCode: null,
                updatedAt: nowMs,
            }, { merge: true })
        })
        return { action: 'stored', path }
    } catch (error) {
        const code = String(error?.code || 'PHOTO_SAVE_FAILED')
        console.warn('[design-samples] photo not saved', code)
        const now = (await ref.get()).data() || {}
        if (!now.photos?.length) await ref.set({ status: 'failed', errorCode: code, updatedAt: nowMs }, { merge: true })
        return { action: 'failed', errorCode: code }
    }
}

// Runs after the response has left, so a slow download cannot delay the ack.
export function scheduleSamplePhoto(id, mediaId, deps) {
    const run = () => Promise.resolve()
        .then(() => storeSamplePhoto(id, mediaId, deps))
        .catch(error => console.warn('[design-samples] photo task failed', error?.code || 'UNKNOWN'))
    try {
        after(run)
    } catch {
        run()
    }
}

async function allSamples(db) {
    const snap = await store(db).collection(SAMPLES_COLLECTION).get()
    return snap.docs.map(doc => ({ ...doc.data(), id: doc.id }))
}

export async function listSamples({ db, sign = signFile, nowMs = Date.now() } = {}) {
    const open = (await allSamples(db)).filter(row => OPEN.has(row.status)).sort((a, b) => a.createdAt - b.createdAt)
    return Promise.all(open.map(async row => {
        const lead = (await leadRef(db, row.leadId).get()).data() || {}
        const path = row.samplePath || row.photos?.at?.(-1)?.path || null
        return {
            id: row.id,
            status: row.status,
            phone: row.leadId,
            name: row.profileName || '',
            createdAt: row.createdAt,
            errorCode: row.errorCode || null,
            previewUrl: path ? await sign(path).catch(() => null) : null,
            windowOpen: nowMs - millis(lead.lastInboundAt) < WINDOW_MS,
        }
    }))
}

// Lord's approval or refusal. The send goes only to the phone on the record.
export async function decideSample(id, decision, { db, send = sendWhatsAppImage, sign = signFile, nowMs = Date.now() } = {}) {
    if (!['send', 'reject'].includes(decision)) throw sampleError('INVALID_DECISION')
    const ref = sampleRef(db, id)

    // Claim first, so two taps cannot send two pictures.
    const claimed = await store(db).runTransaction(async tx => {
        const snap = await tx.get(ref)
        if (!snap.exists) throw sampleError('SAMPLE_NOT_FOUND')
        const row = snap.data()
        if (decision === 'reject') {
            if (['sent', 'sending'].includes(row.status)) throw sampleError('SAMPLE_NOT_READY')
            tx.set(ref, { status: 'rejected', updatedAt: nowMs }, { merge: true })
            return { ...row, status: 'rejected' }
        }
        if (row.status !== 'ready' || !row.samplePath) throw sampleError('SAMPLE_NOT_READY')
        const lead = leadRef(db, row.leadId)
        const held = (await tx.get(lead)).data() || {}
        if (['closed_won', 'closed_lost'].includes(held.stage)) throw sampleError('LEAD_CLOSED')
        if (nowMs - millis(held.lastInboundAt) >= WINDOW_MS) throw sampleError('WINDOW_CLOSED')
        tx.set(ref, { status: 'sending', updatedAt: nowMs }, { merge: true })
        // Written before the send: WhatsApp echoes our picture back on this
        // chat, and without this it reads as a photo from the lead.
        const turns = Array.isArray(held.turns) ? held.turns : []
        tx.set(lead, {
            lastOutboundMediaAt: nowMs,
            lastOutboundMediaKind: 'image',
            turns: [...turns, { role: 'assistant', text: SAMPLE_CAPTION, at: nowMs }],
        }, { merge: true })
        return row
    })
    if (decision === 'reject') return { id, status: 'rejected' }

    try {
        await send(claimed.leadId, await sign(claimed.samplePath), SAMPLE_CAPTION)
    } catch (error) {
        console.warn('[design-samples] send failed', error?.errorCode || error?.code || 'UNKNOWN')
        await ref.set({ status: 'ready', errorCode: 'SEND_FAILED', updatedAt: nowMs }, { merge: true })
        throw sampleError('SEND_FAILED')
    }
    await ref.set({ status: 'sent', sentAt: nowMs, errorCode: null, updatedAt: nowMs }, { merge: true })
    await leadRef(db, claimed.leadId).set({ designSample: { status: 'sent' } }, { merge: true })
    return { id, status: 'sent' }
}

// One line for the owner report. Never throws.
export async function sampleAlerts({ db } = {}) {
    try {
        const rows = await allSamples(db)
        const toDraw = rows.filter(row => ['receiving', 'pending', 'failed'].includes(row.status)).length
        const toApprove = rows.filter(row => row.status === 'ready').length
        return toDraw || toApprove ? [`🎨 דוגמאות שלט: ${toDraw} מחכות לציור, ${toApprove} מחכות לאישור שלך.`] : []
    } catch (error) {
        console.warn('[design-samples] not counted', error?.code || 'UNKNOWN')
        return []
    }
}

// The promise made with the offer: photos are deleted after 30 days.
export async function purgeOldSamples({ db, remove = removeFolder, nowMs = Date.now() } = {}) {
    const old = (await allSamples(db)).filter(row => row.status !== 'expired' && nowMs - Number(row.createdAt) >= KEEP_MS)
    for (const row of old) {
        await remove(`design-samples/${row.id}/`)
        await sampleRef(db, row.id).set({ status: 'expired', photos: [], samplePath: null, profileName: '', updatedAt: nowMs }, { merge: true })
    }
    return old.length
}
