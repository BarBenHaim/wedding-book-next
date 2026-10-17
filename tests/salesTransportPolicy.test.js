import { describe, expect, it } from 'vitest'
import { parseInboundBody } from '@/lib/salesAgent/inbound'
import { decideInboundAge, MAX_LIVE_INBOUND_AGE_MS } from '@/lib/salesAgent/transportPolicy'

describe('decideInboundAge', () => {
    const nowMs = Date.parse('2026-10-17T20:30:00.000Z')

    it('processes a current event', () => {
        expect(decideInboundAge({
            occurredAt: '2026-10-17T20:29:00.000Z',
            nowMs,
        })).toEqual({ action: 'process', ageMs: 60_000 })
    })

    it('processes an event exactly fifteen minutes old', () => {
        expect(decideInboundAge({
            occurredAt: '2026-10-17T20:15:00.000Z',
            nowMs,
        })).toEqual({ action: 'process', ageMs: MAX_LIVE_INBOUND_AGE_MS })
    })

    it('skips an event older than fifteen minutes', () => {
        expect(decideInboundAge({
            occurredAt: '2026-10-17T20:14:59.999Z',
            nowMs,
        })).toEqual({ action: 'skip-stale', ageMs: MAX_LIVE_INBOUND_AGE_MS + 1 })
    })

    it.each([
        ['unix seconds', (nowMs - 60_000) / 1000, 60_000],
        ['unix milliseconds', nowMs - 60_000, 60_000],
        ['string unix seconds', String((nowMs - 60_000) / 1000), 60_000],
        ['string unix milliseconds', String(nowMs - 60_000), 60_000],
        ['padded string unix seconds', ` ${(nowMs - 60_000) / 1000} `, 60_000],
    ])('normalizes %s before applying the age gate', (_label, occurredAt, ageMs) => {
        expect(decideInboundAge({ occurredAt, nowMs })).toEqual({ action: 'process', ageMs })
    })

    it.each([null, '', 'invalid', '2026-10-17T20:29:00.000'])('blocks missing, invalid, or timezone-free provider time %j', occurredAt => {
        expect(decideInboundAge({ occurredAt, nowMs })).toEqual({ action: 'skip-invalid-timestamp', ageMs: null })
    })

    it('blocks a future provider timestamp instead of treating it as current', () => {
        expect(decideInboundAge({
            occurredAt: '2026-10-17T20:31:00.000Z',
            nowMs,
        })).toEqual({ action: 'skip-future-timestamp', ageMs: 0 })
    })

    it('blocks every event from the 667-item queue before the fixed UTC cutover', () => {
        const results = Array.from({ length: 667 }, (_, index) => decideInboundAge({
            occurredAt: new Date(Date.parse('2026-10-17T20:05:00.000Z') - index - 1).toISOString(),
            nowMs,
        }))

        expect(results.every(result => result.action === 'skip-pre-cutover')).toBe(true)
    })
})


describe('inbound parser to transport age policy', () => {
    const nowMs = Date.parse('2026-10-17T20:30:00.000Z')
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
                action: ageMs < 0 ? 'skip-future-timestamp' : ageMs > MAX_LIVE_INBOUND_AGE_MS ? 'skip-stale' : 'process',
                ageMs: Math.max(0, ageMs),
            })
        }
    })

    it('also suppresses a stale digit timestamp from repaired Make JSON', () => {
        const { body, repaired } = parseInboundBody(`{"text":"line one\nline two","occurredAt":"${(nowMs - 20 * 60_000) / 1000}"}`)
        expect(repaired).toBe(true)
        expect(decideInboundAge({ occurredAt: body.occurredAt, nowMs })).toEqual({
            action: 'skip-stale', ageMs: 20 * 60_000,
        })
    })

    it.each([undefined, null, '', 'invalid', 'NaN', 'Infinity', '999999999999999999999999999999'])('blocks unknown provider time for %j', occurredAt => {
        const { body } = parseInboundBody(JSON.stringify({ occurredAt }))
        expect(decideInboundAge({ occurredAt: body.occurredAt, nowMs })).toEqual({ action: 'skip-invalid-timestamp', ageMs: null })
    })

    it('blocks signed timestamps instead of accepting an ambiguous date parse', () => {
        expect(decideInboundAge({ occurredAt: -1, nowMs })).toEqual({ action: 'skip-invalid-timestamp', ageMs: null })
        for (const occurredAt of [-1, '-1', '-1786881540']) {
            const { body } = parseInboundBody(JSON.stringify({ occurredAt }))
            expect(decideInboundAge({ occurredAt: body.occurredAt, nowMs })).toEqual({ action: 'skip-invalid-timestamp', ageMs: null })
        }
    })
})
