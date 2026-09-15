import { describe, expect, it } from 'vitest'
import { summarizeLiveModelExperiment } from '@/lib/salesAgent/modelExperimentAnalytics'

const experiment = {
    id: 'sales-models', revision: 2, enabled: true,
    championArmId: 'gemini', targetVerifiedSalesPerDay: 2,
    minimumDeliveredPerArm: 1, minimumDays: 1,
    arms: [
        { id: 'gemini', revision: 1, provider: 'gemini', model: 'gemini-3.6-flash', weight: 80, enabled: true },
        { id: 'claude', revision: 1, provider: 'anthropic', model: 'claude-sonnet-4-5', weight: 20, enabled: true },
    ],
}
const assignedAt = Date.UTC(2026, 8, 14)
const assignment = arm => ({
    experimentId: 'sales-models', experimentRevision: 2,
    armId: arm, armRevision: 1,
    provider: arm === 'gemini' ? 'gemini' : 'anthropic',
    model: arm === 'gemini' ? 'gemini-3.6-flash' : 'claude-sonnet-4-5',
    assignedAt,
})

describe('live model revenue analytics', () => {
    it('returns only aggregate delivery, response, cost, and verified-payment truth', () => {
        const result = summarizeLiveModelExperiment([
            {
                id: 'private-lead-one', name: 'Private Name', turns: [{ text: 'private message' }],
                modelAssignment: assignment('gemini'), modelPrimaryAttempted: true,
                modelDeliveredAt: assignedAt + 100, modelReply24h: true, modelProgressed: true,
                paymentVerified: true, amount: 990, modelCostUsd: 0.01,
            },
            {
                id: 'private-lead-two', phone: 'private-phone',
                modelAssignment: assignment('claude'), modelPrimaryAttempted: true,
                modelDeliveredAt: assignedAt + 200, modelCostUsd: 0.02,
            },
        ], { experiment, nowMs: assignedAt + 86_400_000 })

        expect(result.summary.rows.find(row => row.armId === 'gemini')).toMatchObject({
            delivered: 1, replied24h: 1, progressed: 1, verifiedPaid: 1, verifiedRevenue: 990,
        })
        expect(result.recommendation).toMatchObject({ action: 'keep', winnerArmId: 'gemini' })
        expect(JSON.stringify(result)).not.toMatch(/private-lead|Private Name|private message|private-phone/)
    })
})
