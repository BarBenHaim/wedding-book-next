import { describe, expect, it } from 'vitest'
import { parseInboundBody } from '@/lib/salesAgent/inbound'
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
        ['string unix seconds', '1786881540', 60_000],
        ['string unix milliseconds', '1786881540000', 60_000],
        ['padded string unix seconds', ' 1786881540 ', 60_000],
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


describe('inbound parser to transport age policy', () => {
    const nowMs = Date.parse('2026-08-16T12:00:00.000Z')
    const formats = [
        ['ISO', ms => new Date(ms).toISOString()],
        ['number seconds', ms => ms / 1000],
        ['number milliseconds', ms => ms],
        ['string seconds', ms => String(ms / 1000)],
        ['string milliseconds', ms => String(ms)],
    ]

    it.each(formats)('classifies old, fresh, boundary and future %s through JSON parsing', (_label, format) => {
        for (const ageMs of [60_000, MAX_LIVE_INBOUND_AGE_MS, MAX_LIVE_INBOUND_AGE_MS + 1000, -60_000]) {
            const { body } = parseInboundBody(JSON.stringify({ occurredAt: format(nowMs - ageMs) }))
            expect(decideInboundAge({ occurredAt: body.occurredAt, nowMs })).toEqual({
                action: ageMs > MAX_LIVE_INBOUND_AGE_MS ? 'skip-stale' : 'process',
                ageMs: Math.max(0, ageMs),
            })
        }
    })

    it('also suppresses a stale digit timestamp from repaired Make JSON', () => {
        const { body, repaired } = parseInboundBody('{"text":"line one\nline two","occurredAt":"1786880400"}')
        expect(repaired).toBe(true)
        expect(decideInboundAge({ occurredAt: body.occurredAt, nowMs })).toEqual({
            action: 'skip-stale', ageMs: 20 * 60_000,
        })
    })

    it.each([undefined, null, '', 'invalid', 'NaN', 'Infinity', '999999999999999999999999999999'])('preserves unknown-time processing for %j', occurredAt => {
        const { body } = parseInboundBody(JSON.stringify({ occurredAt }))
        expect(decideInboundAge({ occurredAt: body.occurredAt, nowMs })).toEqual({ action: 'process', ageMs: null })
    })

    it('preserves the existing handling of signed timestamps rather than adding a new format', () => {
        expect(decideInboundAge({ occurredAt: -1, nowMs })).toEqual({ action: 'skip-stale', ageMs: nowMs + 1000 })
        for (const occurredAt of [-1, '-1', '-1786881540']) {
            const { body } = parseInboundBody(JSON.stringify({ occurredAt }))
            const parsed = Date.parse(String(occurredAt))
            expect(decideInboundAge({ occurredAt: body.occurredAt, nowMs })).toEqual(Number.isFinite(parsed)
                ? { action: 'skip-stale', ageMs: nowMs - parsed }
                : { action: 'process', ageMs: null })
        }
    })
})
