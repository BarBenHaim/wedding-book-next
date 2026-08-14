import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => {
    const docs = new Map()
    let writes = []
    const ref = key => ({ key })
    const snapshot = target => ({ exists: docs.has(target.key), data: () => docs.get(target.key) })
    const materialize = (old, patch) => Object.fromEntries(Object.entries(patch).map(([key, value]) => {
        if (value?.operation === 'increment') return [key, Number(old?.[key] || 0) + value.value]
        if (value?.operation === 'arrayUnion') {
            const existing = Array.isArray(old?.[key]) ? old[key] : []
            return [key, [...existing, ...value.items]]
        }
        return [key, value]
    }))
    const db = {
        collection: name => ({ doc: id => ref(`${name}/${id}`) }),
        runTransaction: async work => {
            const staged = []
            const result = await work({
                get: async target => snapshot(target),
                set: (target, value, options) => staged.push({ target, value, options }),
            })
            for (const write of staged) {
                const old = docs.get(write.target.key) || {}
                const next = materialize(old, write.value)
                docs.set(write.target.key, write.options?.merge ? { ...old, ...next } : next)
                writes.push({ key: write.target.key, value: write.value })
            }
            return result
        },
    }
    return {
        db,
        reset() { docs.clear(); writes = [] },
        set(key, value) { docs.set(key, value) },
        get(key) { return docs.get(key) },
        writes() { return [...writes] },
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

import { prepareFollowUpDelivery, recordDeliveryEvent, recordDigestOutcome } from '@/lib/salesAgent/leads'

const LEAD = 'sales_leads/41'
const OUTBOUND_ID = 'followup-a1b2c3-1:template'
const DELIVERY = `sales_delivery_events/${OUTBOUND_ID}`
const requested = (overrides = {}) => ({
    phone: 'non-dialable-lead-abc-41',
    outboundId: OUTBOUND_ID,
    channel: 'whatsapp_graph',
    part: 'template',
    text: 'follow-up fixture text',
    nextFollowUpAt: '2026-08-17',
    stage: 'engaged',
    advancesFollowUp: true,
    requestedAt: '2026-08-14T10:00:00.000Z',
    ...overrides,
})
const event = (status, overrides = {}) => ({
    eventId: `status-event-${status}`,
    outboundId: OUTBOUND_ID,
    channel: 'whatsapp_graph',
    status,
    providerMessageId: 'wamid-provider-fixture',
    occurredAt: '2026-08-14T10:01:00.000Z',
    ...overrides,
})

beforeEach(() => {
    store.reset()
    store.set(LEAD, { followUpAt: '2026-08-14', followUpCount: 0, stage: 'engaged' })
})

describe('transactional follow-up delivery truth', () => {
    it('records requested metadata without claiming the follow-up was accepted or delivered', async () => {
        await expect(prepareFollowUpDelivery(requested())).resolves.toEqual({ action: 'requested', outboundId: OUTBOUND_ID })

        expect(store.get(DELIVERY)).toMatchObject({ status: 'requested', leadId: '41', advancesFollowUp: true })
        expect(store.get(DELIVERY)).not.toHaveProperty('text')
        expect(store.get(LEAD)).toMatchObject({ followUpAt: '2026-08-14', followUpCount: 0 })
        expect(store.get(LEAD).pendingDeliveryMessages).toEqual({ [OUTBOUND_ID]: 'follow-up fixture text' })
        expect(store.get(LEAD).lastFollowUpAt).toBeUndefined()
        expect(store.get(LEAD).deliveryPendingUntilMs).toBeUndefined()
    })

    it('accepted creates pending for 30 minutes but does not increment or move the cadence', async () => {
        await prepareFollowUpDelivery(requested())
        await expect(recordDeliveryEvent(event('accepted'))).resolves.toMatchObject({ action: 'applied', status: 'accepted', advanced: false })

        expect(store.get(DELIVERY)).toMatchObject({ status: 'accepted', providerMessageId: 'wamid-provider-fixture' })
        expect(store.get(LEAD)).toMatchObject({
            followUpAt: '2026-08-14',
            followUpCount: 0,
            lastDeliveryStatus: 'accepted',
            deliveryPendingOutboundId: OUTBOUND_ID,
            deliveryPendingUntilMs: Date.parse('2026-08-14T10:31:00.000Z'),
        })
        expect(store.get(LEAD).lastFollowUpAt).toBeUndefined()
    })

    it('delivered then read and replayed read advance the logical attempt once total', async () => {
        await prepareFollowUpDelivery(requested())
        await recordDeliveryEvent(event('accepted'))
        await expect(recordDeliveryEvent(event('delivered'))).resolves.toMatchObject({ action: 'applied', advanced: true })
        await expect(recordDeliveryEvent(event('read'))).resolves.toMatchObject({ action: 'applied', advanced: false })
        await expect(recordDeliveryEvent(event('read'))).resolves.toEqual({ action: 'noop', reason: 'DUPLICATE_STATUS' })

        expect(store.get(DELIVERY)).toMatchObject({ status: 'read', followUpAdvanced: true })
        expect(store.get(LEAD)).toMatchObject({
            followUpCount: 1,
            followUpAt: '2026-08-17',
            lastFollowUpAt: 'SERVER_TIME',
            lastDeliveryStatus: 'read',
            deliveryPendingUntilMs: null,
            deliveryPendingOutboundId: null,
        })
        expect(store.get(LEAD).turns).toEqual([{ role: 'assistant', text: 'follow-up fixture text', at: Date.parse('2026-08-14T10:01:00.000Z') }])
    })

    it('failed clears pending, stores only a normalized code, and leaves the lead due', async () => {
        await prepareFollowUpDelivery(requested())
        await recordDeliveryEvent(event('accepted'))
        await expect(recordDeliveryEvent(event('failed', { providerMessageId: undefined, errorCode: 'GRAPH_REJECTED' })))
            .resolves.toMatchObject({ action: 'applied', status: 'failed', advanced: false })

        expect(store.get(LEAD)).toMatchObject({
            followUpAt: '2026-08-14',
            followUpCount: 0,
            lastDeliveryStatus: 'failed',
            lastDeliveryError: 'GRAPH_REJECTED',
            deliveryPendingUntilMs: null,
            deliveryPendingOutboundId: null,
        })
        expect(store.get(LEAD).lastFollowUpAt).toBeUndefined()
    })

    it('an expired pending attempt becomes a stored warning and a retry failure remains due', async () => {
        store.set(LEAD, {
            followUpAt: '2026-08-14',
            followUpCount: 0,
            stage: 'engaged',
            lastDeliveryStatus: 'accepted',
            deliveryPendingOutboundId: 'older-outbound-fixture:text',
            deliveryPendingUntilMs: Date.parse('2026-08-14T09:30:00.000Z'),
        })
        await prepareFollowUpDelivery(requested())

        expect(store.get(LEAD)).toMatchObject({
            followUpAt: '2026-08-14',
            followUpCount: 0,
            lastDeliveryStatus: 'requested',
            deliveryPendingOutboundId: null,
            deliveryPendingUntilMs: null,
            staleDeliveryOutboundId: 'older-outbound-fixture:text',
            staleDeliveryDetectedAtMs: Date.parse('2026-08-14T10:00:00.000Z'),
        })

        await recordDeliveryEvent(event('failed', { providerMessageId: undefined, errorCode: 'GRAPH_TIMEOUT' }))
        expect(store.get(LEAD)).toMatchObject({
            followUpAt: '2026-08-14',
            followUpCount: 0,
            lastDeliveryStatus: 'failed',
            lastDeliveryError: 'GRAPH_TIMEOUT',
        })
    })

    it('rejects a provider ID mismatch transactionally without mutating either document', async () => {
        await prepareFollowUpDelivery(requested())
        await recordDeliveryEvent(event('accepted'))
        const beforeDelivery = { ...store.get(DELIVERY) }
        const beforeLead = { ...store.get(LEAD) }
        const beforeWrites = store.writes().length

        await expect(recordDeliveryEvent(event('delivered', { providerMessageId: 'wamid-mismatched-fixture' })))
            .rejects.toMatchObject({ code: 'PROVIDER_MESSAGE_ID_MISMATCH' })

        expect(store.get(DELIVERY)).toEqual(beforeDelivery)
        expect(store.get(LEAD)).toEqual(beforeLead)
        expect(store.writes()).toHaveLength(beforeWrites)
    })

    it('a late read for an older attempt cannot clear or hide a newer pending attempt', async () => {
        await prepareFollowUpDelivery(requested())
        await recordDeliveryEvent(event('accepted'))
        await recordDeliveryEvent(event('delivered'))

        const newerOutboundId = 'followup-a1b2c3-2:text'
        await prepareFollowUpDelivery(requested({
            outboundId: newerOutboundId,
            part: 'text',
            requestedAt: '2026-08-14T10:02:00.000Z',
            nextFollowUpAt: '2026-08-21',
        }))
        await recordDeliveryEvent(event('accepted', {
            eventId: 'status-newer-accepted',
            outboundId: newerOutboundId,
            providerMessageId: 'wamid-newer-fixture',
            occurredAt: '2026-08-14T10:03:00.000Z',
        }))
        await recordDeliveryEvent(event('read', { occurredAt: '2026-08-14T10:04:00.000Z' }))

        expect(store.get(LEAD)).toMatchObject({
            followUpCount: 1,
            lastDeliveryStatus: 'accepted',
            deliveryPendingOutboundId: newerOutboundId,
            deliveryPendingUntilMs: Date.parse('2026-08-14T10:33:00.000Z'),
        })
    })
})

describe('owner digest health metadata', () => {
    it('stores only normalized digest delivery metadata', async () => {
        await recordDigestOutcome({
            status: 'digest_failed',
            errorCode: 'GRAPH_TIMEOUT',
            outboundId: 'digest-hash-fixture:template',
            occurredAt: '2026-08-14T10:00:00.000Z',
            rawProviderBody: 'private provider body fixture',
            ownerPhone: 'non-dialable-owner-fixture',
        })

        expect(store.get('sales_runtime/digest')).toEqual({
            status: 'digest_failed',
            errorCode: 'GRAPH_TIMEOUT',
            outboundId: 'digest-hash-fixture:template',
            occurredAt: '2026-08-14T10:00:00.000Z',
            updatedAt: 'SERVER_TIME',
        })
    })
})
