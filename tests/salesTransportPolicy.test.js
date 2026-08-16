import { describe, expect, it } from 'vitest'
import { decideInboundAge, MAX_LIVE_INBOUND_AGE_MS } from '@/lib/salesAgent/transportPolicy'

describe('decideInboundAge', () => {
    const nowMs = Date.parse('2026-08-16T12:00:00.000Z')

    it('processes a current event', () => {
        expect(decideInboundAge({
            occurredAt: '2026-08-16T11:59:00.000Z',
            nowMs,
        })).toEqual({ action: 'process', ageMs: 60_000 })
    })

    it('processes an event exactly fifteen minutes old', () => {
        expect(decideInboundAge({
            occurredAt: '2026-08-16T11:45:00.000Z',
            nowMs,
        })).toEqual({ action: 'process', ageMs: MAX_LIVE_INBOUND_AGE_MS })
    })

    it('skips an event older than fifteen minutes', () => {
        expect(decideInboundAge({
            occurredAt: '2026-08-16T11:44:59.999Z',
            nowMs,
        })).toEqual({ action: 'skip-stale', ageMs: MAX_LIVE_INBOUND_AGE_MS + 1 })
    })

    it.each([
        ['unix seconds', 1_786_881_540, 60_000],
        ['unix milliseconds', 1_786_881_540_000, 60_000],
    ])('normalizes %s before applying the age gate', (_label, occurredAt, ageMs) => {
        expect(decideInboundAge({ occurredAt, nowMs })).toEqual({ action: 'process', ageMs })
    })

    it.each([null, '', 'invalid'])('processes missing or invalid provider time %j safely', occurredAt => {
        expect(decideInboundAge({ occurredAt, nowMs })).toEqual({ action: 'process', ageMs: null })
    })

    it('never treats a future provider timestamp as stale', () => {
        expect(decideInboundAge({
            occurredAt: '2026-08-16T12:01:00.000Z',
            nowMs,
        })).toEqual({ action: 'process', ageMs: 0 })
    })
})
