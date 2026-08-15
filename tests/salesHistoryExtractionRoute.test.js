import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ callClaude: vi.fn() }))

vi.mock('@/lib/salesAgent/agent', () => ({
    callClaude: mocks.callClaude,
    providerDeadlineAt: () => Date.now() + 20_000,
}))

const validInput = () => ({
    conversationKey: 'test-history-contact',
    messages: [{
        direction: 'inbound',
        occurredAt: '2026-08-14T08:00:00.000Z',
        text: 'יש לנו בר מצווה בדצמבר',
    }],
})

const modelOutput = JSON.stringify({
    event_type: 'bar_mitzvah', event_date: null, celebrant_name: null, stage: 'engaged',
    historical_outcome: 'qualified', loss_reason: null, summary: 'ליד לבר מצווה.', confidence: 'explicit',
    evidence_at: {
        event_type: '2026-08-14T08:00:00.000Z',
        stage: '2026-08-14T08:00:00.000Z',
        historical_outcome: '2026-08-14T08:00:00.000Z',
        summary: '2026-08-14T08:00:00.000Z',
    },
})

let POST

function request(body, secret = 'history-route-secret') {
    return new Request('http://localhost/api/sales-agent/history-extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-history-extract-secret': secret },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    })
}

beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.HISTORY_EXTRACT_SECRET = 'history-route-secret'
    mocks.callClaude.mockResolvedValue({ text: modelOutput })
    ;({ POST } = await import('@/app/api/sales-agent/history-extract/route'))
})

describe('private historical extraction route', () => {
    it('rejects missing or incorrect secrets before model work', async () => {
        const missing = await POST(request(validInput(), ''))
        const wrong = await POST(request(validInput(), 'wrong-secret'))

        expect(missing.status).toBe(401)
        expect(wrong.status).toBe(401)
        expect(await missing.json()).toEqual({ error: 'UNAUTHORIZED' })
        expect(await wrong.json()).toEqual({ error: 'UNAUTHORIZED' })
        expect(mocks.callClaude).not.toHaveBeenCalled()
    })

    it('returns fixed 400 responses for malformed JSON and oversized transcripts', async () => {
        const malformed = await POST(request('{broken'))
        const oversized = await POST(request({
            conversationKey: 'test-history-contact',
            messages: [{ direction: 'inbound', occurredAt: null, text: 'א'.repeat(25_001) }],
        }))

        expect(malformed.status).toBe(400)
        expect(await malformed.json()).toEqual({ error: 'HISTORY_INVALID_INPUT' })
        expect(oversized.status).toBe(400)
        expect(await oversized.json()).toEqual({ error: 'HISTORY_INPUT_TOO_LARGE' })
        expect(mocks.callClaude).not.toHaveBeenCalled()
    })

    it('returns only the strict structured result for valid evidence', async () => {
        const response = await POST(request(validInput()))
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toEqual({
            eventType: 'bar_mitzvah', eventDate: null, celebrantName: null, stage: 'engaged',
            historicalOutcome: 'qualified', lossReason: null, summary: 'ליד לבר מצווה.', confidence: 'explicit',
            evidenceAt: {
                eventType: '2026-08-14T08:00:00.000Z',
                stage: '2026-08-14T08:00:00.000Z',
                historicalOutcome: '2026-08-14T08:00:00.000Z',
                summary: '2026-08-14T08:00:00.000Z',
            },
        })
        expect(JSON.stringify(body)).not.toContain('test-history-contact')
    })

    it('normalizes provider failure without logging transcript or provider bodies', async () => {
        const transcriptSentinel = 'private transcript sentinel'
        const providerSentinel = 'private provider body sentinel'
        mocks.callClaude.mockRejectedValue(new Error(providerSentinel))
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
        const input = validInput()
        input.messages[0].text = transcriptSentinel

        const response = await POST(request(input))
        const responseText = await response.text()

        expect(response.status).toBe(503)
        expect(JSON.parse(responseText)).toEqual({ error: 'HISTORY_EXTRACT_UNAVAILABLE' })
        expect(responseText).not.toContain(providerSentinel)
        expect(responseText).not.toContain(transcriptSentinel)
        expect(JSON.stringify(logged.mock.calls)).not.toContain(providerSentinel)
        expect(JSON.stringify(logged.mock.calls)).not.toContain(transcriptSentinel)
    })

    it('returns a safe 503 after two malformed model responses', async () => {
        mocks.callClaude.mockResolvedValue({ text: 'not-json private model body' })

        const response = await POST(request(validInput()))

        expect(response.status).toBe(503)
        expect(await response.json()).toEqual({ error: 'HISTORY_EXTRACT_UNAVAILABLE' })
        expect(mocks.callClaude).toHaveBeenCalledTimes(2)
    })
})
