import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => {
    const docs = new Map()
    const ref = key => ({ key })
    const snapshot = target => ({
        id: target.key.split('/').at(-1),
        exists: docs.has(target.key),
        data: () => docs.get(target.key),
    })
    const collectionDocs = name => [...docs.entries()]
        .filter(([key]) => key.startsWith(`${name}/`))
        .map(([key]) => snapshot(ref(key)))
    const limitedQuery = (name, items) => ({
        limit: count => ({
            get: async () => ({ docs: items().slice(0, count), size: Math.min(items().length, count) }),
        }),
    })
    const db = {
        collection: name => ({
            doc: id => ref(`${name}/${id}`),
            where: (field, operator, value) => limitedQuery(name, () => collectionDocs(name).filter(item => {
                if (operator === '<=') return item.data()?.[field] <= value
                throw new Error(`unsupported test operator: ${operator}`)
            })),
            orderBy: field => ({
                limit: count => ({
                    get: async () => ({
                        docs: collectionDocs(name)
                            .sort((a, b) => Number(b.data()?.[field] || 0) - Number(a.data()?.[field] || 0))
                            .slice(0, count),
                    }),
                }),
            }),
        }),
        getAll: async (...targets) => targets.map(snapshot),
        runTransaction: async work => work({
            get: async target => snapshot(target),
            set: (target, value, options) => {
                const old = docs.get(target.key) || {}
                const patch = Object.fromEntries(Object.entries(value).map(([key, item]) => [
                    key,
                    item?.operation === 'increment' ? Number(old[key] || 0) + item.value : item,
                ]))
                docs.set(target.key, options?.merge ? { ...old, ...patch } : patch)
            },
        }),
    }
    return {
        db,
        reset() { docs.clear() },
        set(key, value) { docs.set(key, value) },
        get(key) { return docs.get(key) },
    }
})

vi.mock('@/lib/firebaseAdmin', () => ({ adminDb: store.db }))
vi.mock('firebase-admin/firestore', () => ({
    FieldValue: {
        serverTimestamp: () => 'SERVER_TIME',
        increment: value => ({ operation: 'increment', value }),
        arrayUnion: (...items) => ({ operation: 'arrayUnion', items }),
    },
}))

import { readDueFollowUpHealth, readSalesHealthRuntime, recordInboundHeartbeat } from '@/lib/salesAgent/leads'

describe('sanitized sales health Firestore aggregation', () => {
    beforeEach(() => store.reset())

    it('records heartbeat metadata without event, phone, message, or payload fields', async () => {
        await recordInboundHeartbeat({
            receivedAtMs: 1_723_630_000_000,
            eventId: 'private-event-sentinel',
            phone: 'non-dialable-private-phone-sentinel',
            message: 'private-message-sentinel',
            payload: 'private-payload-sentinel',
        })

        expect(store.get('sales_runtime/inbound')).toEqual({
            lastHeartbeatAtMs: 1_723_630_000_000,
            makeStatus: 'active',
            heartbeatCount: 1,
            updatedAt: 'SERVER_TIME',
        })
    })

    it('reads only runtime enums/timestamps and the latest 20 delivery counters', async () => {
        store.set('sales_runtime/inbound', {
            lastHeartbeatAtMs: 1_723_630_000_000,
            makeStatus: 'active',
            operationsStatus: 'unknown',
            phone: 'non-dialable-runtime-private-sentinel',
            payload: 'runtime-private-payload-sentinel',
        })
        store.set('sales_runtime/anthropic', {
            consecutiveFailures: 2,
            lastFailureAtMs: 1_723_629_000_000,
            lastErrorCode: 'timeout',
            halfOpenProbeId: 'private-probe-sentinel',
        })
        store.set('sales_runtime/followups', { lastRunAtMs: 1_723_628_000_000, rawBody: 'private-followup-body' })
        for (let i = 0; i < 22; i++) {
            store.set(`sales_delivery_events/phone-free-outbound-${i}:text`, {
                status: i === 21 ? 'failed' : i % 2 ? 'accepted' : 'delivered',
                requestedAtMs: 1_723_600_000_000 + i,
                occurredAtMs: 1_723_610_000_000 + i,
                deliveryPendingUntilMs: 1_723_700_000_000,
                updatedAt: 1_723_620_000_000 + i,
                providerMessageId: `private-provider-${i}`,
                leadId: `private-lead-${i}`,
                body: `private-body-${i}`,
            })
        }

        const result = await readSalesHealthRuntime()
        const serialized = JSON.stringify(result)

        expect(result.inbound).toEqual({
            lastHeartbeatAtMs: 1_723_630_000_000,
            activationAtMs: null,
            makeStatus: 'active',
            operationsStatus: 'unknown',
        })
        expect(result.breaker).toMatchObject({ consecutiveFailures: 2, lastErrorCode: 'timeout' })
        expect(result.breaker).not.toHaveProperty('halfOpenProbeId')
        expect(result.deliveryAttempts).toHaveLength(20)
        expect(result.deliveryAttempts[0]).toEqual({
            status: 'failed',
            requestedAtMs: 1_723_600_000_021,
            occurredAtMs: 1_723_610_000_021,
            updatedAtMs: 1_723_620_000_021,
            deliveryPendingUntilMs: 1_723_700_000_000,
        })
        for (const forbidden of ['private-provider', 'private-lead', 'private-body', 'runtime-private', 'private-probe', 'private-followup']) {
            expect(serialized).not.toContain(forbidden)
        }
    })

    it('reports a saturated ineligible scan as unknown even when an eligible row is hidden behind it', async () => {
        for (let i = 0; i < 78; i++) {
            store.set(`sales_leads/non-dialable-terminal-${i}`, {
                followUpAt: '2026-08-15',
                stage: 'closed_lost',
            })
        }
        store.set('sales_leads/non-dialable-hidden-eligible', {
            followUpAt: '2026-08-15',
            stage: 'engaged',
            followUpCount: 0,
        })

        const result = await readDueFollowUpHealth('2026-08-15')

        expect(result).toEqual({ dueFollowUps: null, scanSaturated: true, scanned: 78 })
        expect(JSON.stringify(result)).not.toContain('non-dialable')
    })

    it('preserves the follow-up warning boundary below 26 and at 26', async () => {
        for (let i = 0; i < 25; i++) {
            store.set(`sales_leads/non-dialable-due-${i}`, {
                followUpAt: '2026-08-15', stage: 'engaged', followUpCount: 0,
            })
        }
        await expect(readDueFollowUpHealth('2026-08-15')).resolves.toEqual({
            dueFollowUps: 25, scanSaturated: false, scanned: 25,
        })

        store.set('sales_leads/non-dialable-due-25', {
            followUpAt: '2026-08-15', stage: 'engaged', followUpCount: 0,
        })
        await expect(readDueFollowUpHealth('2026-08-15')).resolves.toEqual({
            dueFollowUps: 26, scanSaturated: false, scanned: 26,
        })
    })
})
