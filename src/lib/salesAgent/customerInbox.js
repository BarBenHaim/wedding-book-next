// Keeps what an identified customer sends, so it can be read and acted on
// later. It never replies, never changes a book and never affects the
// sales bot's answer: the route hands it the message and moves on.
//
// Nothing here logs a phone number or message text.

import crypto from 'node:crypto'
import { after } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb, adminStorage } from '@/lib/firebaseAdmin'
import { MAX_MEDIA_BYTES, buildInboxItem, isCapturable, mediaExtension, phoneVariants } from './customerInboxCore'

export const INBOX_COLLECTION = 'customer_inbox'
const GRAPH = 'https://graph.facebook.com/v19.0'
const DOWNLOAD_TIMEOUT_MS = 20_000
const ALREADY_EXISTS = 6

function inboxError(code) {
    const error = new Error('customer media unavailable')
    error.code = code
    return error
}

function isHttps(value) {
    try {
        const url = new URL(String(value || ''))
        return url.protocol === 'https:' && !url.username && !url.password
    } catch {
        return false
    }
}

// Meta answers a media id with a short-lived address, and wants the same
// token again to hand over the bytes.
export async function downloadInboundMedia(mediaId, {
    fetchFn = fetch,
    token = process.env.WHATSAPP_TOKEN,
    graphBase = GRAPH,
} = {}) {
    const id = String(mediaId || '').trim().slice(0, 500)
    if (!id || !token) throw inboxError('MEDIA_NOT_CONFIGURED')
    const request = { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) }
    try {
        const described = await fetchFn(`${graphBase}/${encodeURIComponent(id)}`, request)
        if (!described?.ok) throw inboxError('MEDIA_DOWNLOAD_FAILED')
        const meta = await described.json().catch(() => null)
        if (!isHttps(meta?.url)) throw inboxError('MEDIA_PROVIDER_INVALID')
        if (Number(meta.file_size) > MAX_MEDIA_BYTES) throw inboxError('MEDIA_TOO_LARGE')

        const file = await fetchFn(meta.url, request)
        if (!file?.ok) throw inboxError('MEDIA_DOWNLOAD_FAILED')
        if (Number(file.headers?.get?.('content-length')) > MAX_MEDIA_BYTES) throw inboxError('MEDIA_TOO_LARGE')
        const bytes = Buffer.from(await file.arrayBuffer())
        if (!bytes.length) throw inboxError('MEDIA_DOWNLOAD_FAILED')
        if (bytes.length > MAX_MEDIA_BYTES) throw inboxError('MEDIA_TOO_LARGE')
        return { bytes, mimeType: String(meta.mime_type || 'application/octet-stream') }
    } catch (error) {
        if (typeof error?.code === 'string' && error.code.startsWith('MEDIA_')) throw error
        throw inboxError('MEDIA_DOWNLOAD_FAILED')
    }
}

const firebaseDeps = {
    async findWeddings(phone) {
        const variants = phoneVariants(phone)
        if (!variants.length) return []
        const snap = await adminDb.collection('weddings').where('ownerPhone', 'in', variants).limit(5).get()
        return snap.docs.map(doc => ({ weddingId: doc.id, ownerName: doc.data()?.ownerName || null }))
    },
    async getLeadStage(phone) {
        const snap = await adminDb.collection('sales_leads').doc(phone).get()
        return snap.exists ? snap.data()?.stage || null : null
    },
    // `create` refuses an existing document, so a retried message cannot put
    // an item that was already handled back to "new".
    async createItem(eventId, item) {
        try {
            await adminDb.collection(INBOX_COLLECTION).doc(eventId)
                .create({ ...item, receivedAt: FieldValue.serverTimestamp() })
            return true
        } catch (error) {
            if (error?.code === ALREADY_EXISTS) return false
            throw error
        }
    },
    async updateItem(eventId, patch) {
        await adminDb.collection(INBOX_COLLECTION).doc(eventId).set(patch, { merge: true })
    },
    async saveFile(path, bytes, contentType) {
        await adminStorage.bucket().file(path).save(bytes, {
            resumable: false, contentType, metadata: { cacheControl: 'private, max-age=0' },
        })
    },
    download: mediaId => downloadInboundMedia(mediaId),
}

export async function captureCustomerMessage({ eventId, phone, body }, deps = firebaseDeps) {
    if (!isCapturable(body)) return { action: 'skipped-empty' }
    const matches = await deps.findWeddings(phone)
    // Sales leads are not customers: nothing of theirs is kept here.
    if (!matches.length && await deps.getLeadStage(phone) !== 'closed_won') return { action: 'skipped-unknown' }

    const item = buildInboxItem({ phone, body, matches })
    if (!await deps.createItem(eventId, item)) return { action: 'duplicate' }
    if (!item.mediaId) return { action: 'stored' }

    try {
        const file = await deps.download(item.mediaId)
        const folder = crypto.createHash('sha256').update(item.phone).digest('hex').slice(0, 24)
        const storagePath = `customer-inbox/${folder}/${eventId}.${mediaExtension(file.mimeType)}`
        await deps.saveFile(storagePath, file.bytes, file.mimeType)
        await deps.updateItem(eventId, { fileStatus: 'saved', storagePath, mimeType: file.mimeType })
        return { action: 'stored' }
    } catch (error) {
        const fileError = typeof error?.code === 'string' ? error.code : 'MEDIA_SAVE_FAILED'
        console.warn('[customer-inbox] file not saved', fileError)
        await deps.updateItem(eventId, { fileStatus: 'failed', fileError })
        return { action: 'stored', fileError }
    }
}

// Runs after the response has left, so a slow download or a failed write
// can neither delay nor change what Make receives.
export function scheduleCustomerCapture(args, { capture = captureCustomerMessage, onStored = null } = {}) {
    const run = () => Promise.resolve()
        .then(() => capture(args))
        // Only a new message of a customer has a follow-on.
        .then(result => (result?.action === 'stored' ? onStored?.() : null))
        .catch(error => console.warn('[customer-inbox] capture failed', error?.code || 'UNKNOWN'))
    try {
        after(run)
    } catch {
        run()
    }
}
