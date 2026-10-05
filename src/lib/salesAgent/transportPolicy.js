export const MAX_LIVE_INBOUND_AGE_MS = 15 * 60 * 1000

export function parseOccurredAt(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value < 10_000_000_000 ? value * 1000 : value
    }
    const parsed = typeof value === 'string' && value.trim() ? Date.parse(value) : NaN
    return Number.isFinite(parsed) ? parsed : null
}

// The service window is rooted in the provider's customer-message timestamp,
// never this server's receipt/processing time. Strict rollout requires that
// timestamp in the transport mapping and fails closed when it is unavailable.
export function decideStrictInboundTime({ occurredAt, nowMs = Date.now(), latestAtMs = null } = {}) {
    if (typeof occurredAt === 'string' && !/(?:Z|[+-]\d{2}:\d{2})$/.test(occurredAt)) {
        return { ok: false, reason: 'customer-timestamp-unverified', occurredAtMs: null }
    }
    const occurredAtMs = parseOccurredAt(occurredAt)
    if (occurredAtMs == null || occurredAtMs <= 0 || occurredAtMs > nowMs) return { ok: false, reason: 'customer-timestamp-unverified', occurredAtMs: null }
    if (Number.isFinite(latestAtMs) && occurredAtMs < latestAtMs) return { ok: false, reason: 'out-of-order-inbound', occurredAtMs }
    if (nowMs - occurredAtMs > MAX_LIVE_INBOUND_AGE_MS) return { ok: false, reason: 'stale-inbound', occurredAtMs }
    return { ok: true, reason: null, occurredAtMs }
}

export function decideInboundAge({
    occurredAt,
    nowMs = Date.now(),
    maxAgeMs = MAX_LIVE_INBOUND_AGE_MS,
} = {}) {
    const occurredAtMs = parseOccurredAt(occurredAt)
    if (occurredAtMs == null) return { action: 'process', ageMs: null }
    const ageMs = Math.max(0, nowMs - occurredAtMs)
    return {
        action: ageMs > maxAgeMs ? 'skip-stale' : 'process',
        ageMs,
    }
}

export default { decideInboundAge, MAX_LIVE_INBOUND_AGE_MS }
