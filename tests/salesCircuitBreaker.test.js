import { describe, expect, it } from 'vitest'
import {
    breakerDecision, nextFailureState, successState, reserveHalfOpenProbe,
    normalizeProviderError, resolveProviderFailure, resolveProviderSuccess,
    HALF_OPEN_LEASE_MS, PROVIDER_PATH_DEADLINE_MS, sanitizeBreakerRuntimeState,
} from '../src/lib/salesAgent/circuitBreaker'

describe('Anthropic circuit breaker', () => {
    it('opens after three consecutive failures for five minutes', () => {
        const one = nextFailureState({}, 1_000, '429')
        const two = nextFailureState(one, 2_000, '429')
        const three = nextFailureState(two, 3_000, '429')

        expect(three).toMatchObject({
            consecutiveFailures: 3,
            openUntilMs: 303_000,
            lastErrorCode: 'rate_limit',
        })
        expect(breakerDecision(three, 4_000)).toEqual({ allow: false, mode: 'open' })
    })

    it('keeps the first two failures closed', () => {
        const one = nextFailureState({}, 1_000, 'provider_error')
        const two = nextFailureState(one, 2_000, 'provider_error')

        expect(breakerDecision(one, 2_001)).toEqual({ allow: true, mode: 'closed' })
        expect(breakerDecision(two, 2_001)).toEqual({ allow: true, mode: 'closed' })
    })

    it('reserves exactly one half-open probe after the cooldown', () => {
        const state = { consecutiveFailures: 3, openUntilMs: 3_000 }
        const first = reserveHalfOpenProbe(state, 3_001, 'probe-a')
        const second = reserveHalfOpenProbe(first.state, 3_002, 'probe-b')

        expect(first).toEqual({
            decision: { allow: true, mode: 'half-open' },
            state: expect.objectContaining({ halfOpenProbeId: 'probe-a', halfOpenLeaseUntilMs: 26_001 }),
        })
        expect(second.decision).toEqual({ allow: false, mode: 'half-open-busy' })
    })

    it('keeps the half-open lease longer than the complete provider budget', () => {
        expect(HALF_OPEN_LEASE_MS).toBeGreaterThan(PROVIDER_PATH_DEADLINE_MS)
        expect(PROVIDER_PATH_DEADLINE_MS).toBeLessThan(30_000)
    })

    it('fences a late half-open resolver so it cannot clear a newer probe', () => {
        const first = reserveHalfOpenProbe({ consecutiveFailures: 3, openUntilMs: 1_000 }, 1_001, 'probe-old')
        const second = reserveHalfOpenProbe({ ...first.state, halfOpenLeaseUntilMs: 2_000 }, 2_001, 'probe-new')

        expect(resolveProviderSuccess(second.state, 2_002, 'probe-old')).toEqual({ action: 'stale' })
        expect(resolveProviderFailure(second.state, 2_002, 'timeout', 'probe-old')).toEqual({ action: 'stale' })
        expect(resolveProviderFailure(second.state, 2_002, 'timeout', 'probe-new')).toMatchObject({
            action: 'resolved', state: { consecutiveFailures: 4, openUntilMs: 302_002, halfOpenProbeId: null },
        })
    })

    it('keeps null timestamps null when sanitizing runtime state', () => {
        expect(sanitizeBreakerRuntimeState({ openUntilMs: null, lastFailureAtMs: null, lastSuccessAtMs: null }))
            .toMatchObject({ openUntilMs: null, lastFailureAtMs: null, lastSuccessAtMs: null })
    })

    it('resets completely on success', () => {
        expect(successState(9_000)).toEqual({
            consecutiveFailures: 0,
            openUntilMs: null,
            lastSuccessAtMs: 9_000,
            halfOpenProbeId: null,
            halfOpenLeaseUntilMs: null,
        })
    })

    it.each([
        [Object.assign(new Error('request timed out'), { name: 'AbortError' }), 'timeout'],
        [new Error('anthropic 429: busy'), 'rate_limit'],
        [new Error('anthropic 400: credit_balance exhausted'), 'low_credit'],
        [Object.assign(new Error('not json'), { code: 'INVALID_JSON' }), 'invalid_json'],
        [new SyntaxError('Unexpected token < in JSON'), 'invalid_json'],
        [new Error('upstream unavailable'), 'provider_error'],
    ])('normalizes provider failure %s without retaining its body', (error, expected) => {
        const state = nextFailureState({}, 1_000, error)

        expect(normalizeProviderError(error)).toBe(expected)
        expect(state.lastErrorCode).toBe(expected)
        expect(JSON.stringify(state)).not.toContain(error.message)
    })
})
