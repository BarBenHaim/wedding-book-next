import crypto from 'node:crypto'

export const DELIVERY_PENDING_MS = 30 * 60 * 1000
export const DELIVERY_REQUEST_LEASE_MS = 2 * 60 * 1000

export const DELIVERY_ERROR_CODES = Object.freeze([
    'GRAPH_REJECTED',
    'GRAPH_TIMEOUT',
    'PROVIDER_MESSAGE_ID_MISSING',
    'WHATSAPP_NOT_CONFIGURED',
    'TEMPLATE_NOT_CONFIGURED',
    'OWNER_PHONE_MISSING',
    'PROVIDER_FAILED',
])

const CHANNELS = new Set(['make', 'whatsapp_graph'])
const STATUSES = new Set(['accepted', 'delivered', 'read', 'failed'])
const ERROR_CODES = new Set(DELIVERY_ERROR_CODES)
const IDENTIFIER_MAX = 500

function identifier(value) {
    if (typeof value !== 'string') return null
    const clean = value.trim()
    return clean && clean.length <= IDENTIFIER_MAX ? clean : null
}

export function validateDeliveryEvent(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'INVALID_INPUT' }

    const eventId = identifier(input.eventId)
    if (!eventId) return { ok: false, error: 'INVALID_EVENT_ID' }
    const outboundId = identifier(input.outboundId)
    if (!outboundId || outboundId.includes('/')) return { ok: false, error: 'INVALID_OUTBOUND_ID' }
    const channel = identifier(input.channel)
    if (!CHANNELS.has(channel)) return { ok: false, error: 'INVALID_CHANNEL' }
    const status = identifier(input.status)
    if (!STATUSES.has(status)) return { ok: false, error: 'INVALID_STATUS' }

    const providerMessageId = input.providerMessageId == null ? null : identifier(input.providerMessageId)
    if (input.providerMessageId != null && !providerMessageId) return { ok: false, error: 'INVALID_PROVIDER_MESSAGE_ID' }
    if (status !== 'failed' && !providerMessageId) return { ok: false, error: 'PROVIDER_MESSAGE_ID_REQUIRED' }

    const errorCode = input.errorCode == null ? null : identifier(input.errorCode)
    if (input.errorCode != null && !errorCode) return { ok: false, error: 'INVALID_ERROR_CODE' }
    if (status === 'failed' && !errorCode) return { ok: false, error: 'ERROR_CODE_REQUIRED' }
    if (errorCode && !ERROR_CODES.has(errorCode)) return { ok: false, error: 'INVALID_ERROR_CODE' }

    const occurredAt = identifier(input.occurredAt)
    if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) return { ok: false, error: 'INVALID_OCCURRED_AT' }

    const event = { eventId, outboundId, channel, status }
    if (providerMessageId) event.providerMessageId = providerMessageId
    if (errorCode) event.errorCode = errorCode
    event.occurredAt = occurredAt
    return { ok: true, event }
}

export function decideDeliveryTransition(current, event) {
    const stored = current && typeof current === 'object' ? current : null
    if (stored?.channel && stored.channel !== event.channel) return { action: 'reject', error: 'CHANNEL_MISMATCH' }
    if (stored?.providerMessageId && event.providerMessageId && stored.providerMessageId !== event.providerMessageId) {
        return { action: 'reject', error: 'PROVIDER_MESSAGE_ID_MISMATCH' }
    }

    const from = stored?.status || 'requested'
    const to = event.status
    if (from === to) return { action: 'noop', reason: 'DUPLICATE_STATUS' }
    if (from === 'failed') return { action: 'reject', error: 'TERMINAL_DELIVERY_STATE' }
    if (from === 'read' && to === 'delivered') return { action: 'noop', reason: 'STALE_STATUS' }
    if (from === 'read') return { action: 'reject', error: to === 'accepted' ? 'DELIVERY_STATE_REGRESSION' : 'TERMINAL_DELIVERY_STATE' }
    if (from === 'delivered' && to !== 'read') {
        return { action: 'reject', error: to === 'accepted' ? 'DELIVERY_STATE_REGRESSION' : 'TERMINAL_DELIVERY_STATE' }
    }

    const allowed = (
        (from === 'requested' && (to === 'accepted' || to === 'delivered' || to === 'read' || to === 'failed'))
        || (from === 'accepted' && (to === 'delivered' || to === 'read' || to === 'failed'))
        || (from === 'delivered' && to === 'read')
    )
    if (!allowed) return { action: 'reject', error: 'INVALID_DELIVERY_TRANSITION' }

    if (to === 'accepted') {
        return {
            action: 'apply',
            nextStatus: 'accepted',
            advanceFollowUp: false,
            clearPending: false,
            pendingUntilMs: Date.parse(event.occurredAt) + DELIVERY_PENDING_MS,
        }
    }
    return {
        action: 'apply',
        nextStatus: to,
        advanceFollowUp: (to === 'delivered' || to === 'read') && !stored?.followUpAdvanced,
        clearPending: true,
        pendingUntilMs: null,
    }
}

export function deliveryEventLedgerId(eventId) {
    return crypto.createHash('sha256').update(String(eventId || '')).digest('hex')
}

export function deliveryEventFingerprint(event) {
    return crypto.createHash('sha256').update(JSON.stringify([
        String(event?.outboundId || ''),
        String(event?.channel || ''),
        String(event?.status || ''),
        String(event?.providerMessageId || ''),
        String(event?.errorCode || ''),
    ])).digest('hex')
}

export function isDeliveryPending(value, nowMs = Date.now()) {
    return value?.status === 'accepted'
        && Number.isFinite(Number(value.deliveryPendingUntilMs))
        && Number(value.deliveryPendingUntilMs) > Number(nowMs)
}

export function createOutboundId({ scope, subject, attempt, part }) {
    const safeScope = String(scope || 'outbound').replace(/[^a-z0-9_-]/gi, '').slice(0, 30) || 'outbound'
    const safePart = String(part || 'text').replace(/[^a-z0-9_-]/gi, '').slice(0, 30) || 'text'
    const safeAttempt = Math.max(0, Number.parseInt(attempt, 10) || 0)
    const digest = crypto.createHash('sha256').update(String(subject || '')).digest('hex').slice(0, 24)
    return `${safeScope}-${digest}-${safeAttempt}:${safePart}`
}

const delivery = {
    DELIVERY_PENDING_MS,
    DELIVERY_REQUEST_LEASE_MS,
    DELIVERY_ERROR_CODES,
    validateDeliveryEvent,
    decideDeliveryTransition,
    deliveryEventLedgerId,
    deliveryEventFingerprint,
    isDeliveryPending,
    createOutboundId,
}

export default delivery
