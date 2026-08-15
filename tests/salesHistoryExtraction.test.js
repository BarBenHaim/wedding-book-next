import { describe, expect, it, vi } from 'vitest'
import {
    buildHistoryExtractionPrompt,
    extractHistoricalLead,
    normalizeHistoryExtractionInput,
    parseHistoryExtraction,
} from '@/lib/salesAgent/historyExtraction'

const validInput = () => ({
    conversationKey: 'test-history-contact',
    messages: [
        { direction: 'inbound', occurredAt: '2026-08-14T08:00:00.000Z', text: 'יש לנו בר מצווה ב-10 בדצמבר 2026' },
        { direction: 'outbound', occurredAt: '2026-08-14T08:01:00.000Z', text: 'בשמחה, הנה הפרטים' },
    ],
})

const validModelOutput = () => JSON.stringify({
    event_type: 'bar_mitzvah',
    event_date: '2026-12-10',
    celebrant_name: null,
    stage: 'engaged',
    historical_outcome: 'qualified',
    loss_reason: null,
    summary: 'הלקוח ציין במפורש בר מצווה בדצמבר.',
    confidence: 'explicit',
    evidence_at: {
        event_type: '2026-08-14T08:00:00.000Z',
        event_date: '2026-08-14T08:00:00.000Z',
        stage: '2026-08-14T08:00:00.000Z',
        historical_outcome: '2026-08-14T08:00:00.000Z',
        summary: '2026-08-14T08:00:00.000Z',
    },
})

describe('historical WhatsApp extraction input', () => {
    it('builds a bounded evidence-only prompt without exposing the conversation identity', () => {
        const normalized = normalizeHistoryExtractionInput(validInput())
        const prompt = buildHistoryExtractionPrompt(normalized)

        expect(prompt.system).toContain('רק על סמך הכתוב')
        expect(prompt.system).toContain('אין להציע או לבצע שיחות טלפון')
        expect(prompt.system).toContain('JSON')
        expect(prompt.user).toContain('2026-08-14T08:00:00.000Z | inbound')
        expect(prompt.user).not.toContain('test-history-contact')
    })

    it('rejects aggregate transcript text over 25,000 characters with a fixed code', () => {
        expect(() => normalizeHistoryExtractionInput({
            conversationKey: 'test-history-contact',
            messages: [{ direction: 'inbound', occurredAt: null, text: 'א'.repeat(25_001) }],
        })).toThrow(expect.objectContaining({ code: 'HISTORY_INPUT_TOO_LARGE' }))
    })

    it('counts timestamp and direction framing in the 25,000-character prompt budget', () => {
        const framedMessages = Array.from({ length: 800 }, (_, index) => ({
            direction: index % 2 ? 'outbound' : 'inbound',
            occurredAt: '2026-08-14T08:00:00.000Z',
            text: '',
        }))

        expect(() => normalizeHistoryExtractionInput({
            conversationKey: 'test-history-contact',
            messages: framedMessages,
        })).toThrow(expect.objectContaining({ code: 'HISTORY_INPUT_TOO_LARGE' }))
    })

    it.each([
        null,
        {},
        { conversationKey: '', messages: [] },
        { conversationKey: 'test-history-contact', messages: [{ direction: 'sideways', occurredAt: null, text: 'x' }] },
        { conversationKey: 'test-history-contact', messages: [{ direction: 'inbound', occurredAt: 'not-a-date', text: 'x' }] },
    ])('rejects malformed input without retaining raw values: %s', input => {
        expect(() => normalizeHistoryExtractionInput(input)).toThrow(expect.objectContaining({ code: 'HISTORY_INVALID_INPUT' }))
    })
})

describe('historical extraction output', () => {
    it('returns only allowlisted fields backed by timestamps from the transcript', () => {
        const result = parseHistoryExtraction(validModelOutput(), validInput())

        expect(result).toEqual({
            eventType: 'bar_mitzvah',
            eventDate: '2026-12-10',
            celebrantName: null,
            stage: 'engaged',
            historicalOutcome: 'qualified',
            lossReason: null,
            summary: 'הלקוח ציין במפורש בר מצווה בדצמבר.',
            confidence: 'explicit',
            evidenceAt: {
                eventType: '2026-08-14T08:00:00.000Z',
                eventDate: '2026-08-14T08:00:00.000Z',
                stage: '2026-08-14T08:00:00.000Z',
                historicalOutcome: '2026-08-14T08:00:00.000Z',
                summary: '2026-08-14T08:00:00.000Z',
            },
        })
    })

    it('nulls unsupported values and evidence timestamps not present in the conversation', () => {
        const raw = JSON.stringify({
            event_type: 'invented_event', event_date: '2026-99-99', celebrant_name: 'שם מומצא',
            stage: 'call_customer', historical_outcome: 'maybe', loss_reason: 'סיבה', summary: 'סיכום',
            confidence: 'certain',
            evidence_at: {
                celebrant_name: '2020-01-01T00:00:00.000Z',
                loss_reason: '2020-01-01T00:00:00.000Z',
                summary: '2020-01-01T00:00:00.000Z',
            },
        })

        expect(parseHistoryExtraction(raw, validInput())).toEqual({
            eventType: null,
            eventDate: null,
            celebrantName: null,
            stage: null,
            historicalOutcome: null,
            lossReason: null,
            summary: null,
            confidence: 'unknown',
            evidenceAt: {},
        })
    })

    it('does not report confident extraction when no field has accepted evidence', () => {
        expect(parseHistoryExtraction(JSON.stringify({
            event_type: null, event_date: null, celebrant_name: null, stage: null,
            historical_outcome: null, loss_reason: null, summary: null,
            confidence: 'explicit', evidence_at: {},
        }), validInput()).confidence).toBe('unknown')
    })

    it('calls the resilient provider boundary and retries malformed model JSON once', async () => {
        const callModel = vi.fn()
            .mockResolvedValueOnce({ text: 'not-json' })
            .mockResolvedValueOnce({ text: validModelOutput() })

        const result = await extractHistoricalLead(validInput(), { callModel, deadlineAtMs: Date.now() + 5_000 })

        expect(result.eventType).toBe('bar_mitzvah')
        expect(callModel).toHaveBeenCalledTimes(2)
        expect(callModel.mock.calls[0][0]).toMatchObject({ temperature: 0 })
        expect(callModel.mock.calls[1][0].system).toContain('הפלט הקודם לא היה JSON תקין')
    })
})
