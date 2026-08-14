// Deterministic state transitions for the provider-wide Anthropic circuit.
// This module deliberately has no Firebase dependency so the critical timing
// and privacy rules can be exercised without credentials or network access.

export const BREAKER_THRESHOLD = 3
export const BREAKER_COOLDOWN_MS = 5 * 60_000
// The entire provider path (first response plus one JSON repair) is bounded
// below the inbound lease. The probe reservation includes a small commit
// margin, but still expires recoverably if an invocation dies.
// The deadline starts immediately after the inbound claim, therefore it also
// bounds prompt/media preparation. Eight seconds remain below maxDuration for
// the fallback transaction and response transport. Individual attempts cap at
// 16 seconds; a JSON repair receives only the remaining shared budget.
export const PROVIDER_PATH_DEADLINE_MS = 22_000
export const HALF_OPEN_LEASE_MS = 25_000

const ERROR_CODES = new Set(['timeout', 'rate_limit', 'low_credit', 'invalid_json', 'provider_error'])

export function normalizeProviderError(error) {
    const given = String(error?.errorCode || error?.code || '').toLowerCase()
    if (ERROR_CODES.has(given)) return given

    const status = Number(error?.status || error?.statusCode)
    const name = String(error?.name || '')
    const message = String(error?.message || error || '').toLowerCase()
    if (name === 'AbortError' || /\btimeout\b|timed out|abort/.test(message)) return 'timeout'
    if (status === 429 || /\b429\b|rate.?limit/.test(message)) return 'rate_limit'
    if (/low.?credit|credit.?balance|insufficient.?credit|insufficient.?balance/.test(message)) return 'low_credit'
    if (given === 'invalid_json' || name === 'SyntaxError' || /invalid.?json|unparseable.?json|unexpected token/.test(message)) return 'invalid_json'
    return 'provider_error'
}

export function breakerDecision(state = {}, nowMs = Date.now()) {
    if (Number(state.openUntilMs) > nowMs) return { allow: false, mode: 'open' }
    if ((Number(state.consecutiveFailures) || 0) >= BREAKER_THRESHOLD) {
        if (Number(state.halfOpenLeaseUntilMs) > nowMs) return { allow: false, mode: 'half-open-busy' }
        return { allow: true, mode: 'half-open' }
    }
    return { allow: true, mode: 'closed' }
}

export function reserveHalfOpenProbe(state = {}, nowMs = Date.now(), probeId = '') {
    const decision = breakerDecision(state, nowMs)
    if (decision.mode !== 'half-open') return { decision, state }
    return {
        decision,
        state: {
            ...state,
            halfOpenProbeId: String(probeId),
            halfOpenLeaseUntilMs: nowMs + HALF_OPEN_LEASE_MS,
        },
    }
}

function isOwnedHalfOpenProbe(state, probeId) {
    return Boolean(probeId) && String(state.halfOpenProbeId || '') === String(probeId)
}

export function nextFailureState(state = {}, nowMs = Date.now(), error = 'provider_error') {
    const consecutiveFailures = (Number(state.consecutiveFailures) || 0) + 1
    return {
        consecutiveFailures,
        openUntilMs: consecutiveFailures >= BREAKER_THRESHOLD ? nowMs + BREAKER_COOLDOWN_MS : null,
        lastFailureAtMs: nowMs,
        lastErrorCode: normalizeProviderError(error),
        halfOpenProbeId: null,
        halfOpenLeaseUntilMs: null,
    }
}

export const successState = nowMs => ({
    consecutiveFailures: 0,
    openUntilMs: null,
    lastSuccessAtMs: nowMs,
    halfOpenProbeId: null,
    halfOpenLeaseUntilMs: null,
})

// A late result must never overwrite a newer half-open probe. Closed-circuit
// calls do not have a probe id and retain the normal reset/increment behavior.
export function resolveProviderSuccess(state = {}, nowMs = Date.now(), probeId = null) {
    if (probeId && !isOwnedHalfOpenProbe(state, probeId)) return { action: 'stale' }
    return { action: 'resolved', state: successState(nowMs) }
}

export function resolveProviderFailure(state = {}, nowMs = Date.now(), error = 'provider_error', probeId = null) {
    if (probeId && !isOwnedHalfOpenProbe(state, probeId)) return { action: 'stale' }
    return { action: 'resolved', state: nextFailureState(state, nowMs, error) }
}

export function sanitizeBreakerRuntimeState(state = {}) {
    const numberOrNull = value => value == null ? null : Number.isFinite(Number(value)) ? Number(value) : null
    return {
        consecutiveFailures: Math.max(0, Number(state.consecutiveFailures) || 0),
        openUntilMs: numberOrNull(state.openUntilMs),
        lastFailureAtMs: numberOrNull(state.lastFailureAtMs),
        lastSuccessAtMs: numberOrNull(state.lastSuccessAtMs),
        lastErrorCode: state.lastErrorCode ? normalizeProviderError({ errorCode: state.lastErrorCode }) : null,
        halfOpenProbeId: state.halfOpenProbeId || null,
        halfOpenLeaseUntilMs: numberOrNull(state.halfOpenLeaseUntilMs),
    }
}
