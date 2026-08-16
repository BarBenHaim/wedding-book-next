export const MAX_LIVE_INBOUND_AGE_MS = 15 * 60 * 1000

function parseOccurredAt(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value < 10_000_000_000 ? value * 1000 : value
    }
    const parsed = typeof value === 'string' && value.trim() ? Date.parse(value) : NaN
    return Number.isFinite(parsed) ? parsed : null
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
