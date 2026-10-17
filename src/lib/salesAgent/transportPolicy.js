export const MAX_LIVE_INBOUND_AGE_MS = 15 * 60 * 1000
export const INBOUND_CUTOVER_AT_UTC = '2026-10-17T20:05:00.000Z'
const INBOUND_CUTOVER_AT_MS = Date.parse(INBOUND_CUTOVER_AT_UTC)

function parseOccurredAt(value) {
    // parseInboundBody preserves provider fields as strings, including JSON
    // numbers. Recognize unsigned integer Unix timestamps before Date.parse,
    // which does not parse contemporary seconds/milliseconds digit strings.
    // Keep signed/malformed strings on their existing compatibility path.
    if (typeof value === 'string') {
        const normalized = value.trim()
        if (/^[+-]\d+$/.test(normalized)) return null
        if (/^\d+$/.test(normalized)) {
            const numeric = Number(normalized)
            if (!Number.isSafeInteger(numeric)) return null
            value = numeric
        }
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        if (value < 0) return null
        return value < 10_000_000_000 ? value * 1000 : value
    }
    // Meta timestamps are ISO instants. A timezone-free text value changes
    // meaning with the runtime locale, so fail closed instead of guessing.
    const text = typeof value === 'string' ? value.trim() : ''
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) return null
    const parsed = Date.parse(text)
    return Number.isFinite(parsed) ? parsed : null
}

export function decideInboundAge({
    occurredAt,
    nowMs = Date.now(),
    maxAgeMs = MAX_LIVE_INBOUND_AGE_MS,
} = {}) {
    const occurredAtMs = parseOccurredAt(occurredAt)
    if (occurredAtMs == null) return { action: 'skip-invalid-timestamp', ageMs: null }
    if (occurredAtMs < INBOUND_CUTOVER_AT_MS) {
        return { action: 'skip-pre-cutover', ageMs: Math.max(0, nowMs - occurredAtMs) }
    }
    if (occurredAtMs > nowMs) return { action: 'skip-future-timestamp', ageMs: 0 }
    const ageMs = nowMs - occurredAtMs
    return {
        action: ageMs > maxAgeMs ? 'skip-stale' : 'process',
        ageMs,
    }
}

export default { decideInboundAge, MAX_LIVE_INBOUND_AGE_MS, INBOUND_CUTOVER_AT_UTC }
