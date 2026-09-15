import { describe, expect, it } from 'vitest'
import {
    assignModelArm,
    evaluateModelGuardrail,
    normalizeModelExperiment,
    recommendModelAllocation,
    summarizeModelExperiment,
} from '@/lib/salesAgent/modelExperiment'

const registry = [
    { id: 'gemini-3.6-flash', provider: 'gemini' },
    { id: 'claude-sonnet-4-5', provider: 'anthropic' },
    { id: 'gpt-4.1-mini', provider: 'openai' },
]

const experiment = {
    id: 'model-2026-09',
    revision: 1,
    enabled: true,
    targetVerifiedSalesPerDay: 2,
    minimumDeliveredPerArm: 30,
    minimumDays: 7,
    championArmId: 'gemini',
    arms: [
        {
            id: 'gemini', provider: 'gemini', model: 'gemini-3.6-flash',
            weight: 80, enabled: true, revision: 1,
        },
        {
            id: 'claude', provider: 'anthropic', model: 'claude-sonnet-4-5',
            weight: 20, enabled: true, revision: 1,
        },
    ],
}

describe('sales model experiment policy', () => {
    it('normalizes one active 80/20 allocation using only registered provider-model pairs', () => {
        const normalized = normalizeModelExperiment(experiment, registry)

        expect(normalized).toEqual(experiment)
    })

    it('keeps every lead sticky and approximates the configured allocation across opaque leads', () => {
        const first = assignModelArm(experiment, 'opaque-lead-42')
        expect(assignModelArm(experiment, 'opaque-lead-42')).toEqual(first)

        const counts = { gemini: 0, claude: 0 }
        for (let index = 0; index < 1000; index += 1) {
            counts[assignModelArm(experiment, `opaque-lead-${index}`).armId] += 1
        }

        expect(counts.gemini).toBeGreaterThanOrEqual(760)
        expect(counts.gemini).toBeLessThanOrEqual(840)
        expect(counts.claude).toBe(1000 - counts.gemini)
        expect(first).toMatchObject({
            experimentId: 'model-2026-09',
            experimentRevision: 1,
            armRevision: 1,
        })
    })

    it.each([
        ['unknown model', { arms: [{ ...experiment.arms[0], model: 'unknown-model' }, experiment.arms[1]] }, 'INVALID_MODEL_ARM_MODEL'],
        ['provider mismatch', { arms: [{ ...experiment.arms[0], provider: 'openai' }, experiment.arms[1]] }, 'INVALID_MODEL_ARM_MODEL'],
        ['duplicate arm', { arms: [experiment.arms[0], { ...experiment.arms[1], id: 'gemini' }] }, 'DUPLICATE_MODEL_ARM'],
        ['weights not 100', { arms: [{ ...experiment.arms[0], weight: 70 }, experiment.arms[1]] }, 'INVALID_MODEL_EXPERIMENT_WEIGHT'],
    ])('rejects %s rather than running an untrustworthy cohort', (_label, patch, error) => {
        expect(() => normalizeModelExperiment({ ...experiment, ...patch }, registry)).toThrow(error)
    })

    it('uses delivered uncontaminated leads and verified payments for an aggregate-only verdict', () => {
        const nowMs = Date.UTC(2026, 8, 15, 12)
        const assignedAt = nowMs - 8 * 24 * 60 * 60_000
        const assignment = (armId, model, provider) => ({
            experimentId: 'model-2026-09', experimentRevision: 1,
            armId, armRevision: 1, model, provider, assignedAt,
        })
        const leads = [
            {
                id: 'opaque-private-one', incomingText: 'customer private text',
                modelAssignment: assignment('gemini', 'gemini-3.6-flash', 'gemini'),
                modelPrimaryAttempted: true, modelDeliveredAt: assignedAt + 1000,
                modelReply24h: true, modelProgressed: true, stage: 'ready_to_pay',
                paymentVerified: true, amount: 990, modelCostUsd: 0.04, modelLatencyMs: 900,
            },
            {
                id: 'opaque-private-two', modelAssignment: assignment('gemini', 'gemini-3.6-flash', 'gemini'),
                modelPrimaryAttempted: true, modelDeliveredAt: assignedAt + 2000,
                modelReply24h: false, modelProgressed: false, stage: 'engaged',
                paymentVerified: false, modelCostUsd: 0.03, modelLatencyMs: 1100,
            },
            {
                id: 'opaque-private-three', modelAssignment: assignment('claude', 'claude-sonnet-4-5', 'anthropic'),
                modelPrimaryAttempted: true, modelDeliveredAt: assignedAt + 3000,
                modelReply24h: true, modelProgressed: true, stage: 'ready_to_pay',
                paymentVerified: true, amount: 990, modelCostUsd: 0.11, modelLatencyMs: 1300,
            },
            {
                id: 'opaque-private-four', modelAssignment: assignment('claude', 'claude-sonnet-4-5', 'anthropic'),
                modelPrimaryAttempted: true, modelDeliveredAt: assignedAt + 4000,
                modelReply24h: true, modelProgressed: true, stage: 'closed_won',
                paymentVerified: true, amount: 990, modelCostUsd: 0.12, modelLatencyMs: 1400,
            },
            {
                id: 'opaque-private-fallback', modelAssignment: assignment('gemini', 'gemini-3.6-flash', 'gemini'),
                modelPrimaryAttempted: true, modelFallbackUsed: true,
                modelDeliveredAt: assignedAt + 5000, paymentVerified: true, amount: 5000,
                modelCostUsd: 0.5, modelLatencyMs: 5000, providerFailureCode: 'timeout',
            },
        ]
        const summary = summarizeModelExperiment(leads, {
            experiment: { ...experiment, minimumDeliveredPerArm: 2 }, nowMs,
        })

        expect(summary.evidenceReady).toBe(true)
        expect(summary.rows).toEqual(expect.arrayContaining([
            expect.objectContaining({
                armId: 'gemini', assigned: 3, eligible: 2, delivered: 2,
                verifiedPaid: 1, verifiedRevenue: 990, fallbacks: 1,
            }),
            expect.objectContaining({
                armId: 'claude', assigned: 2, eligible: 2, delivered: 2,
                verifiedPaid: 2, verifiedRevenue: 1980, fallbacks: 0,
            }),
        ]))
        expect(recommendModelAllocation(summary)).toEqual({
            action: 'promote', winnerArmId: 'claude', allocation: { gemini: 0, claude: 100 },
            reason: 'verified_purchase_lift',
        })
        expect(JSON.stringify(summary)).not.toMatch(/opaque-private|customer private text/)
    })

    it('does not declare a winner before both sample and exposure boundaries', () => {
        const summary = summarizeModelExperiment([], { experiment, nowMs: Date.UTC(2026, 8, 15, 12) })

        expect(summary.evidenceReady).toBe(false)
        expect(recommendModelAllocation(summary)).toEqual({ action: 'insufficient_evidence' })
    })

    it.each([
        [{ primaryAttempted: 5, providerFailures: 2, invalidOutputs: 0, policyFailures: 0 }, { pause: true, reason: 'provider_failure_rate' }],
        [{ primaryAttempted: 10, providerFailures: 0, invalidOutputs: 2, policyFailures: 0 }, { pause: true, reason: 'invalid_output_rate' }],
        [{ primaryAttempted: 1, providerFailures: 0, invalidOutputs: 0, policyFailures: 1 }, { pause: true, reason: 'policy_violation' }],
        [{ primaryAttempted: 10, providerFailures: 1, invalidOutputs: 1, policyFailures: 0 }, { pause: false, reason: null }],
    ])('pauses only an arm that crosses a fixed safety boundary', (row, expected) => {
        expect(evaluateModelGuardrail(row)).toEqual(expected)
    })
})
