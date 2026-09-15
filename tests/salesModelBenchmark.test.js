import { describe, expect, it, vi } from 'vitest'
import {
    redactBenchmarkCase,
    runModelBenchmark,
    scoreBenchmarkCandidate,
    selectBenchmarkCases,
} from '@/lib/salesAgent/modelBenchmark'

const privateCase = {
    phone: '052-661-8184', email: 'private@example.com', name: 'נועה כהן',
    orderId: 'order-private-991', incomingText: 'אני נועה כהן, חזרו אליי ב-0526618184 דרך private@example.com https://private.example/order-private-991',
    stage: 'engaged', intent: 'price', outcome: 'open', expectedAction: 'answer_then_qualify',
    turns: [
        { role: 'assistant', text: 'שלום נועה כהן, הנה https://private.example' },
        { role: 'user', text: 'הטלפון שלי 0526618184' },
    ],
}
const candidates = [
    { id: 'gemini', provider: 'gemini', model: 'gemini-3.6-flash' },
    { id: 'claude', provider: 'anthropic', model: 'claude-sonnet-4-5' },
]
const validCandidate = JSON.stringify({ messages: ['הספר הדיגיטלי עולה 690 ₪. לאיזה אירוע ומתי?'], stage: 'qualified', handoff: false })

describe('redacted offline model benchmark', () => {
    it('removes direct identifiers and bounds the retained conversation', () => {
        const redacted = redactBenchmarkCase({
            ...privateCase,
            turns: [...Array.from({ length: 6 }, (_, index) => ({ role: index % 2 ? 'user' : 'assistant', text: `נועה כהן ${index}` })), ...privateCase.turns],
        })
        const serialized = JSON.stringify(redacted)

        expect(redacted.turns).toHaveLength(4)
        expect(serialized).not.toMatch(/052|@|order-private|https?:\/\/|נועה כהן/)
        expect(serialized).toContain('[phone]')
    })

    it('allowlists classifier fields instead of trusting corrupted lead metadata', () => {
        const redacted = redactBenchmarkCase({
            ...privateCase,
            intent: 'private@example.com',
            stage: 'https://private.example',
            outcome: '0526618184',
            expectedAction: 'order-private-991',
        })

        expect(redacted).toMatchObject({
            intent: 'unknown', stage: 'new', outcome: 'open', expectedAction: 'answer_then_qualify',
        })
        expect(JSON.stringify(redacted)).not.toMatch(/052|@|order-private|https?:\/\//)
    })

    it('removes direct identifiers before every provider call and stores no raw text', async () => {
        const callModel = vi.fn(async () => ({ text: validCandidate, usage: { input_tokens: 100, output_tokens: 20 } }))
        const saveScore = vi.fn()

        await runModelBenchmark({ revision: 3, cases: [privateCase], candidates }, {
            callModel, saveScore, randomId: () => 'case-random', now: () => 1_000,
        })

        expect(JSON.stringify(callModel.mock.calls)).not.toMatch(/052|@|order-private|https?:\/\/|נועה כהן/)
        expect(JSON.stringify(saveScore.mock.calls)).not.toContain(privateCase.incomingText)
        expect(saveScore).toHaveBeenCalledTimes(2)
        expect(saveScore).toHaveBeenCalledWith(expect.objectContaining({
            caseId: 'case-random', armId: expect.any(String), schemaValid: true,
        }))
    })

    it('never calls a WhatsApp transport', async () => {
        const forbiddenSend = vi.fn(() => { throw new Error('must not send') })

        await runModelBenchmark({ revision: 3, cases: [privateCase], candidates }, {
            callModel: vi.fn(async () => ({ text: validCandidate })),
            saveScore: vi.fn(), sendWhatsApp: forbiddenSend,
        })

        expect(forbiddenSend).not.toHaveBeenCalled()
    })

    it('scores schema, no-call compliance, next action, brevity, and fixed prices', () => {
        expect(scoreBenchmarkCandidate({ raw: validCandidate, benchmarkCase: privateCase })).toMatchObject({
            schemaValid: true, noCallCompliant: true, nextActionFit: true,
            brevityCompliant: true, catalogCompliant: true,
        })
        expect(scoreBenchmarkCandidate({
            raw: JSON.stringify({ messages: ['אפשר לעשות שיחת טלפון. המחיר 123 ₪'], stage: 'engaged', handoff: false }),
            benchmarkCase: privateCase,
        })).toMatchObject({ noCallCompliant: false, catalogCompliant: false })
    })

    it('balances strata and enforces the hard case cap', () => {
        const cases = Array.from({ length: 140 }, (_, index) => ({
            incomingText: `case ${index}`, stage: index % 2 ? 'engaged' : 'offer_sent',
            intent: index % 3 ? 'price' : 'objection', outcome: index % 5 ? 'open' : 'won',
        }))

        const selected = selectBenchmarkCases(cases, 100)

        expect(selected).toHaveLength(100)
        expect(new Set(selected.map(row => `${row.intent}:${row.stage}:${row.outcome}`)).size).toBeGreaterThan(2)
    })

    it('normalizes provider failures and never stores raw provider errors', async () => {
        const saveScore = vi.fn()
        await runModelBenchmark({ revision: 3, cases: [privateCase], candidates: [candidates[0]] }, {
            callModel: vi.fn(async () => { throw new Error('provider private body with 0526618184') }),
            saveScore,
        })

        expect(saveScore).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'provider_error' }))
        expect(JSON.stringify(saveScore.mock.calls)).not.toContain('provider private body')
    })
})
