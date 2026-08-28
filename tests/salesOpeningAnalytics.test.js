import { describe, expect, it } from 'vitest'
import { openingLeadRow, summarizeOpeningExperiment } from '../src/lib/salesAgent/openingAnalytics'

const HOUR = 3_600_000
const NOW = Date.parse('2026-08-24T12:00:00.000Z')
const exposed = Date.parse('2026-08-20T10:00:00.000Z')

const lead = (overrides = {}) => ({
    phone: '972501234567',
    name: 'נועה',
    source: 'instagram',
    campaignId: 'campaign-safe',
    openingVariantId: 'A',
    openingVariantRevision: 3,
    openingExposedAt: exposed,
    openingFirstReplyAt: exposed + 30 * 60_000,
    openingContinuedAt: exposed + HOUR,
    eventType: 'bar_mitzvah',
    eventDate: '2026-12-12',
    childPhotoReceived: true,
    openingDesignApproved: true,
    paymentLinkSentAt: exposed + 2 * HOUR,
    paymentVerified: true,
    verifiedOrderId: 'verified-order-safe',
    amount: 950,
    openingStatus: 'completed',
    ...overrides,
})

const experiment = {
    enabled: true,
    minSamplePerVariant: 30,
    variants: [
        { id: 'A', label: 'דוגמה אישית', enabled: true, revision: 3 },
        { id: 'B', label: 'מדיה', enabled: true, revision: 3 },
        { id: 'C', label: 'אירוע', enabled: false, revision: 3 },
    ],
}

describe('summarizeOpeningExperiment', () => {
    it('uses delivered exposure as every rate denominator and keeps accepted/requested out', () => {
        const result = summarizeOpeningExperiment([
            lead(),
            lead({ phone: '972500000002', openingVariantId: 'A', openingExposedAt: null, openingFirstReplyAt: NOW }),
            lead({ phone: '972500000003', openingVariantId: 'B', openingFirstReplyAt: exposed + 25 * HOUR, openingContinuedAt: null, childPhotoReceived: false, openingDesignApproved: false, paymentLinkSentAt: null, paymentVerified: false, verifiedOrderId: null }),
        ], { experiment, nowMs: NOW })

        expect(result.variants.A.assigned).toBe(2)
        expect(result.variants.A.delivered).toBe(1)
        expect(result.variants.A.reply1h).toEqual({ numerator: 1, denominator: 1, rate: 1 })
        expect(result.variants.B.reply24h).toEqual({ numerator: 0, denominator: 1, rate: 0 })
        expect(result.variants.B.reply72h).toEqual({ numerator: 1, denominator: 1, rate: 1 })
        expect(result.variants.A.verifiedPayment).toEqual({ numerator: 1, denominator: 1, rate: 1 })
        expect(result.variants.A.verifiedRevenue).toBe(950)
    })

    it('keeps unknown relevance outside the relevance denominator and deduplicates lead milestones', () => {
        const result = summarizeOpeningExperiment([
            lead({ phone: '972500000011', childPhotoReceived: false, eventType: null, eventDate: null, paymentLinkSentAt: null, paymentVerified: false, verifiedOrderId: null }),
            lead({ phone: '972500000012', childPhotoReceived: false, eventType: null, eventDate: null, paymentLinkSentAt: null, paymentVerified: false, verifiedOrderId: null }),
            lead({ phone: '972500000013', disqualificationReason: 'not_interested', childPhotoReceived: false, eventType: null, eventDate: null, paymentLinkSentAt: null, paymentVerified: false, verifiedOrderId: null }),
        ], { experiment, nowMs: NOW })

        expect(result.variants.A.relevance).toEqual({ relevant: 0, notRelevant: 1, unknown: 2, denominator: 1, rate: 0 })
        expect(result.variants.A.continuation.numerator).toBe(3)
        expect(result.variants.A.continuation.denominator).toBe(3)
    })

    it('requires the minimum delivered sample for every enabled arm before naming a trend', () => {
        const rows = [
            ...Array.from({ length: 30 }, (_, i) => lead({ phone: `test-a-${i}`, openingVariantId: 'A' })),
            ...Array.from({ length: 29 }, (_, i) => lead({ phone: `test-b-${i}`, openingVariantId: 'B' })),
        ]
        expect(summarizeOpeningExperiment(rows, { experiment, nowMs: NOW }).trendReady).toBe(false)
        rows.push(lead({ phone: 'test-b-final', openingVariantId: 'B' }))
        expect(summarizeOpeningExperiment(rows, { experiment, nowMs: NOW }).trendReady).toBe(true)
    })

    it('returns null rates for zero denominators', () => {
        const result = summarizeOpeningExperiment([], { experiment, nowMs: NOW })
        expect(result.variants.C.reply24h).toEqual({ numerator: 0, denominator: 0, rate: null })
        expect(result.trendReady).toBe(false)
    })

    it('measures only the published variant revision and treats photo or qualified-event progress as a reply', () => {
        const result = summarizeOpeningExperiment([
            lead({
                phone: 'test-current-photo',
                openingFirstReplyAt: null,
                openingPhotoReceivedAt: exposed + 20 * 60_000,
            }),
            lead({
                phone: 'test-current-event', openingVariantId: 'B', openingFirstReplyAt: null,
                childPhotoReceived: false, openingDesignApproved: false, paymentLinkSentAt: null,
                paymentVerified: false, verifiedOrderId: null, openingContinuedAt: exposed + 2 * HOUR,
            }),
            lead({ phone: 'test-old-copy', openingVariantRevision: 2 }),
        ], { experiment, nowMs: NOW })

        expect(result.variants.A.assigned).toBe(1)
        expect(result.variants.A.reply1h).toEqual({ numerator: 1, denominator: 1, rate: 1 })
        expect(result.variants.B.reply24h).toEqual({ numerator: 1, denominator: 1, rate: 1 })
    })
})

describe('openingLeadRow', () => {
    it('returns the exact masked management row without transcript or provider media identity', () => {
        const row = openingLeadRow(lead({
            turns: [{ role: 'user', text: 'private transcript' }],
            childPhotoMediaId: 'private-provider-media-id',
            notes: 'private notes',
        }), NOW)

        expect(row).toEqual({
            id: expect.stringMatching(/^[a-f0-9]{16}$/),
            phone: '•••4567',
            name: 'נועה',
            source: 'instagram',
            campaignId: 'campaign-safe',
            variantId: 'A',
            variantRevision: 3,
            eventType: 'bar_mitzvah',
            eventDate: '2026-12-12',
            relevance: 'relevant',
            relevanceReason: 'photo_received',
            cursor: null,
            waitingFor: null,
            status: 'completed',
            exposedAt: exposed,
            repliedAt: exposed + 30 * 60_000,
            reply24h: true,
            continuedAt: exposed + HOUR,
            approval: 'approved',
            paymentLinkSent: true,
            paymentVerified: true,
            verifiedRevenue: 950,
        })
        expect(JSON.stringify(row)).not.toMatch(/private|972501234567|provider|transcript|notes/)
    })

    it('shows a delivered photo as the first response when the legacy reply timestamp is absent', () => {
        const photoAt = exposed + 15 * 60_000
        const row = openingLeadRow(lead({ openingFirstReplyAt: null, openingPhotoReceivedAt: photoAt }), NOW)

        expect(row.repliedAt).toBe(photoAt)
        expect(row.reply24h).toBe(true)
    })
})
