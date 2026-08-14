import { describe, expect, it } from 'vitest'
import {
    breakerDecision, nextFailureState, successState, reserveHalfOpenProbe,
    normalizeProviderError,
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
            state: expect.objectContaining({ halfOpenProbeId: 'probe-a', halfOpenLeaseUntilMs: 33_001 }),
        })
        expect(second.decision).toEqual({ allow: false, mode: 'half-open-busy' })
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
