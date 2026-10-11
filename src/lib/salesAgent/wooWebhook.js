import crypto from 'crypto'
import { MAX_WOO_BODY_BYTES } from './paymentTruth'

// WooCommerce WC_Webhook::deliver_ping sends unsigned `webhook_id=<id>`
// and requires HTTP 200. This is only a connectivity check, never an order.
// JSON is supported only AFTER HMAC for customized Woo ping adapters.
export function isWooSetupPing(buffer, { allowJson = false } = {}) {
    if (!Buffer.isBuffer(buffer) || buffer.length > 128) return false
    const raw = buffer.toString('utf8')
    if (/^webhook_id=[1-9][0-9]{0,19}$/.test(raw)) return true
    if (!allowJson) return false
    try {
        const value = JSON.parse(raw)
        return value != null && typeof value === 'object' && !Array.isArray(value)
            && Object.keys(value).length === 1 && Object.prototype.hasOwnProperty.call(value, 'webhook_id')
            && (typeof value.webhook_id === 'string' && /^[1-9][0-9]{0,19}$/.test(value.webhook_id)
                || typeof value.webhook_id === 'number' && Number.isSafeInteger(value.webhook_id) && value.webhook_id > 0)
    } catch { return false }
}

// Invalid encoding/length is rejected before a constant-time comparison of
// fixed-size digests. Raw request bytes, never reserialized JSON, are signed.
export function verifyWooSignature(buffer, signature, secret) {
    if (!Buffer.isBuffer(buffer) || buffer.length > MAX_WOO_BODY_BYTES || !buffer.length
        || typeof secret !== 'string' || !secret || typeof signature !== 'string'
        || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false
    const actual = Buffer.from(signature, 'base64')
    if (actual.length !== 32 || actual.toString('base64') !== signature) return false
    const expected = crypto.createHmac('sha256', secret).update(buffer).digest()
    return crypto.timingSafeEqual(actual, expected)
}

export async function readWooBody(req) {
    if (Number(req.headers.get('content-length')) > MAX_WOO_BODY_BYTES) throw new Error('BODY_TOO_LARGE')
    if (!req.body?.getReader) {
        const buffer = Buffer.from(await req.arrayBuffer())
        if (buffer.length > MAX_WOO_BODY_BYTES) throw new Error('BODY_TOO_LARGE')
        return buffer
    }
    const reader = req.body.getReader()
    const chunks = []
    let size = 0
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            size += value.byteLength
            if (size > MAX_WOO_BODY_BYTES) {
                await reader.cancel()
                throw new Error('BODY_TOO_LARGE')
            }
            chunks.push(Buffer.from(value))
        }
        return Buffer.concat(chunks, size)
    } finally { reader.releaseLock() }
}

const modifiedAt = order => {
    const raw = order?.date_modified_gmt
    if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z)?$/.test(raw)) return NaN
    return Date.parse(raw.endsWith('Z') ? raw : `${raw}Z`)
}

// A late retry is not permission to resurrect a refunded order. Provider
// modification times order events where supplied; without those, a refund is
// terminal for automatic fulfillment and needs an explicit service review.
export async function recordWooWebhookSnapshot(db, orderId, order, paymentCheck, receivedAt) {
    const target = db.collection('ordersRaw').doc(orderId)
    return db.runTransaction(async tx => {
        const previousSnap = await tx.get(target)
        const previous = previousSnap.exists ? previousSnap.data() : null
        const oldTime = modifiedAt(previous?.body), newTime = modifiedAt(order)
        if (previous?.signatureVerified === true && Number.isFinite(oldTime) && Number.isFinite(newTime) && newTime < oldTime) {
            return { accepted: false, reason: 'stale_order_event' }
        }
        if (previous?.signatureVerified === true && previous.body?.status === 'refunded' && order.status !== 'refunded') {
            return { accepted: false, reason: 'refunded_order_requires_review' }
        }
        tx.set(target, { body: order, signatureVerified: true, paymentCheck, receivedAt })
        return { accepted: true }
    })
}
