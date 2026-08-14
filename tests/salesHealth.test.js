import { describe, expect, it } from 'vitest'
import { salesHealthStageView, summarizeSalesHealth } from '../src/lib/salesAgent/leadsCore'

const HOUR = 60 * 60 * 1000
const NOW = Date.parse('2026-08-15T12:00:00.000Z')

const healthyInput = (overrides = {}) => ({
    nowMs: NOW,
    inbound: {
        lastHeartbeatAtMs: NOW - HOUR,
        activationAtMs: null,
        makeStatus: 'active',
        operationsStatus: 'available',
    },
    breaker: {
        consecutiveFailures: 0,
        openUntilMs: null,
        lastSuccessAtMs: NOW - 2 * HOUR,
        lastFailureAtMs: null,
        lastErrorCode: null,
    },
    deliveryAttempts: [{ status: 'delivered', occurredAtMs: NOW - HOUR }],
    dueFollowUps: 0,
    followupsLastRunAtMs: NOW - 3 * HOUR,
    ...overrides,
})

describe('sales health summary', () => {
    it('keeps accepted-only delivery amber and separates provider acceptance from delivery evidence', () => {
        const health = summarizeSalesHealth(healthyInput({
            deliveryAttempts: [
                { status: 'accepted', requestedAtMs: NOW - 10_000, deliveryPendingUntilMs: NOW + HOUR },
                { status: 'read', occurredAtMs: NOW - HOUR },
            ],
        }))

        expect(health.whatsapp).toMatchObject({
            status: 'amber',
            reason: 'pending',
            accepted: 1,
            delivered: 0,
            read: 1,
            pendingAccepted: 1,
            staleAccepted: 0,
        })
    })

    it('marks WhatsApp red at five failures, more than five stale attempts, or exhausted Make operations', () => {
        const failed = Array.from({ length: 5 }, (_, i) => ({ status: 'failed', occurredAtMs: NOW - i }))
        expect(summarizeSalesHealth(healthyInput({ deliveryAttempts: failed })).whatsapp)
            .toMatchObject({ status: 'red', reason: 'failure-threshold', failed: 5 })

        const stale = [
            ...Array.from({ length: 3 }, (_, i) => ({ status: 'requested', requestedAtMs: NOW - 3 * HOUR - i })),
            ...Array.from({ length: 3 }, (_, i) => ({ status: 'accepted', deliveryPendingUntilMs: NOW - 1 - i })),
        ]
        expect(summarizeSalesHealth(healthyInput({ deliveryAttempts: stale })).whatsapp)
            .toMatchObject({ status: 'red', reason: 'stale-threshold', staleRequested: 3, staleAccepted: 3 })

        expect(summarizeSalesHealth(healthyInput({
            inbound: { ...healthyInput().inbound, operationsStatus: 'exhausted' },
        })).whatsapp).toMatchObject({ status: 'red', reason: 'make-operations-exhausted' })
    })

    it('uses exact inbound 6h and 24h boundaries and stays unknown before measurable evidence', () => {
        expect(summarizeSalesHealth(healthyInput({ inbound: null })).inbound.status).toBe('unknown')
        expect(summarizeSalesHealth(healthyInput({
            inbound: { lastHeartbeatAtMs: NOW - 6 * HOUR, makeStatus: 'active', operationsStatus: 'unknown' },
        })).inbound).toMatchObject({ status: 'amber', reason: 'heartbeat-aging' })
        expect(summarizeSalesHealth(healthyInput({
            inbound: { lastHeartbeatAtMs: NOW - 24 * HOUR, makeStatus: 'active', operationsStatus: 'unknown' },
        })).inbound).toMatchObject({ status: 'red', reason: 'heartbeat-stale' })
        expect(summarizeSalesHealth(healthyInput({
            inbound: { activationAtMs: NOW - HOUR, makeStatus: 'active', operationsStatus: 'unknown' },
        })).inbound).toMatchObject({ status: 'green', reason: 'activation-recent' })
    })

    it('treats explicit Make inactivity/exhaustion as red and unknown activation as unknown', () => {
        expect(summarizeSalesHealth(healthyInput({
            inbound: { lastHeartbeatAtMs: NOW - 1, makeStatus: 'inactive', operationsStatus: 'available' },
        })).inbound).toMatchObject({ status: 'red', reason: 'make-inactive' })
        expect(summarizeSalesHealth(healthyInput({
            inbound: { lastHeartbeatAtMs: NOW - 1, makeStatus: 'active', operationsStatus: 'exhausted' },
        })).inbound).toMatchObject({ status: 'red', reason: 'make-operations-exhausted' })
        expect(summarizeSalesHealth(healthyInput({
            inbound: { activationAtMs: null, makeStatus: 'unknown', operationsStatus: 'unknown' },
        })).inbound.status).toBe('unknown')
    })

    it('uses Anthropic and follow-up thresholds without inventing green for missing evidence', () => {
        expect(summarizeSalesHealth(healthyInput({ breaker: null })).anthropic.status).toBe('unknown')
        expect(summarizeSalesHealth(healthyInput({ breaker: { consecutiveFailures: 1 } })).anthropic.status).toBe('amber')
        expect(summarizeSalesHealth(healthyInput({ breaker: { consecutiveFailures: 2 } })).anthropic.status).toBe('amber')
        expect(summarizeSalesHealth(healthyInput({ breaker: { consecutiveFailures: 3, openUntilMs: NOW + 1 } })).anthropic.status).toBe('red')
        expect(summarizeSalesHealth(healthyInput({ dueFollowUps: null })).followups.status).toBe('unknown')
        expect(summarizeSalesHealth(healthyInput({ dueFollowUps: 1 })).followups.status).toBe('amber')
        expect(summarizeSalesHealth(healthyInput({ dueFollowUps: 25 })).followups.status).toBe('amber')
        expect(summarizeSalesHealth(healthyInput({ dueFollowUps: 26 })).followups.status).toBe('red')
        expect(summarizeSalesHealth(healthyInput({
            dueFollowUps: null,
            followupsScanSaturated: true,
        })).followups).toMatchObject({ status: 'unknown', reason: 'scan-saturated', due: null, scanSaturated: true })
    })

    it('returns only sanitized counts, booleans, enums, and timestamps', () => {
        const health = summarizeSalesHealth(healthyInput({
            token: 'secret-health-token-sentinel',
            phone: 'non-dialable-private-phone-sentinel',
            transcript: 'private transcript sentinel',
            inbound: {
                ...healthyInput().inbound,
                payload: 'raw inbound payload sentinel',
                connectionId: 'make-connection-sentinel',
            },
            deliveryAttempts: [{
                status: 'delivered',
                occurredAtMs: NOW - HOUR,
                providerMessageId: 'private-provider-id-sentinel',
                leadId: 'private-lead-id-sentinel',
                body: 'raw provider body sentinel',
            }],
        }))
        const serialized = JSON.stringify(health)

        for (const forbidden of ['secret-health', 'private-phone', 'transcript sentinel', 'raw inbound', 'connection-sentinel', 'provider-id', 'lead-id', 'provider body']) {
            expect(serialized).not.toContain(forbidden)
        }
        expect(health.whatsapp).toMatchObject({ delivered: 1, lastEvidenceAtMs: NOW - HOUR })
    })
})

describe('Hebrew rail copy', () => {
    it('maps status and evidence to explicit actionable text without call actions', () => {
        const view = salesHealthStageView(summarizeSalesHealth(healthyInput({
            deliveryAttempts: [{ status: 'accepted', deliveryPendingUntilMs: NOW + HOUR, occurredAtMs: NOW - 1 }],
            dueFollowUps: 26,
            followupsLastRunAtMs: null,
        })))

        expect(view.map(stage => stage.key)).toEqual(['inbound', 'anthropic', 'whatsapp', 'followups'])
        expect(view.find(stage => stage.key === 'whatsapp')).toMatchObject({ label: 'WhatsApp', statusLabel: 'בהמתנה לאישור מסירה' })
        expect(view.find(stage => stage.key === 'followups').action).toContain('בדקו')
        expect(view.find(stage => stage.key === 'followups').evidenceAtMs).toBe(NOW)
        expect(JSON.stringify(view)).not.toMatch(/התקשר|tel:/)
    })

    it('gives an actionable Hebrew diagnostic for a provider failure', () => {
        const view = salesHealthStageView(summarizeSalesHealth(healthyInput({
            deliveryAttempts: [{ status: 'failed', occurredAtMs: NOW - 1 }],
        })))

        expect(view.find(stage => stage.key === 'whatsapp').action).toContain('בדקו')
    })
})
