import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => {
    const docs = new Map()
    let writes = []
    let queue = Promise.resolve()
    let failNextCommit = false
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
        runTransaction: work => {
            const run = queue.then(async () => {
                const staged = []
                const result = await work({
                    get: async target => snapshot(target),
                    set: (target, value, options) => staged.push({ target, value, options }),
                })
                if (failNextCommit) {
                    failNextCommit = false
                    throw new Error('injected delivery transaction failure')
                }
                for (const write of staged) {
                    const old = docs.get(write.target.key) || {}
                    const next = materialize(old, write.value)
                    docs.set(write.target.key, write.options?.merge ? { ...old, ...next } : next)
                    writes.push({ key: write.target.key, value: write.value })
                }
                return result
            })
            queue = run.catch(() => {})
            return run
        },
    }
    return {
        db,
        reset() { docs.clear(); writes = []; queue = Promise.resolve(); failNextCommit = false },
        set(key, value) { docs.set(key, value) },
        get(key) { return docs.get(key) },
        entries() { return [...docs.entries()] },
        writes() { return [...writes] },
        failNext() { failNextCommit = true },
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

import {
    prepareDigestDelivery, prepareFollowUpDelivery, recordDeliveryEvent, recordDigestOutcome,
    resolveProviderMessageOutboundId,
} from '@/lib/salesAgent/leads'
import { providerMessageCorrelationId } from '@/lib/salesAgent/delivery'
import { POST as acknowledgeDelivery } from '@/app/api/sales-agent/delivery/route'

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
    logicalAttemptId: 'followup-logical-attempt-1',
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

        expect(store.get(DELIVERY)).toMatchObject({
            status: 'requested',
            leadId: '41',
            deliveryRole: 'primary',
            advanceOnDelivery: true,
            logicalAttemptId: 'followup-logical-attempt-1',
        })
        expect(store.get(DELIVERY)).not.toHaveProperty('text')
        expect(store.get(LEAD)).toMatchObject({ followUpAt: '2026-08-14', followUpCount: 0 })
        expect(store.get(LEAD).pendingDeliveryMessages).toEqual({ [OUTBOUND_ID]: 'follow-up fixture text' })
        expect(store.get(LEAD).lastFollowUpAt).toBeUndefined()
        expect(store.get(LEAD).deliveryPendingUntilMs).toBeUndefined()
        expect(store.get(LEAD)).toMatchObject({
            lastDeliveryStatus: 'requested',
            deliveryRequestOutboundId: OUTBOUND_ID,
            deliveryRequestUntilMs: Date.parse('2026-08-14T10:02:00.000Z'),
        })
    })

    it('suppresses another advancing follow-up during the requested lease and permits repair after expiry', async () => {
        await prepareFollowUpDelivery(requested())
        const retryId = 'followup-retry-fixture-1:template'
        await expect(prepareFollowUpDelivery(requested({ outboundId: retryId, requestedAt: '2026-08-14T10:01:00.000Z' })))
            .resolves.toEqual({ action: 'busy', outboundId: OUTBOUND_ID, status: 'requested' })
        expect(store.get(`sales_delivery_events/${retryId}`)).toBeUndefined()

        await expect(prepareFollowUpDelivery(requested({ outboundId: retryId, requestedAt: '2026-08-14T10:02:00.000Z' })))
            .resolves.toEqual({ action: 'requested', outboundId: retryId })
        expect(store.get(LEAD)).toMatchObject({
            deliveryRequestOutboundId: retryId,
            staleRequestOutboundId: OUTBOUND_ID,
        })
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
            deliveryRequestOutboundId: null,
            deliveryRequestUntilMs: null,
        })
        expect(store.get(LEAD).lastFollowUpAt).toBeUndefined()
    })

    it('delivered then read and replayed read advance the logical attempt once total', async () => {
        await prepareFollowUpDelivery(requested())
        await recordDeliveryEvent(event('accepted'))
        await expect(recordDeliveryEvent(event('delivered'))).resolves.toMatchObject({ action: 'applied', advanced: true })
        await expect(recordDeliveryEvent(event('read'))).resolves.toMatchObject({ action: 'applied', advanced: false })
        await expect(recordDeliveryEvent(event('read'))).resolves.toEqual({ action: 'noop', reason: 'EVENT_REPLAY' })

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

    it.each([
        ['requested', 'delivered'],
        ['requested', 'read'],
        ['accepted', 'delivered'],
        ['accepted', 'read'],
    ])('%s to first verified %s binds provider identity and advances exactly once', async (from, status) => {
        await prepareFollowUpDelivery(requested())
        if (from === 'accepted') await recordDeliveryEvent(event('accepted', { eventId: `pre-${status}-accepted` }))

        await recordDeliveryEvent(event(status, { eventId: `first-${status}-success` }))
        if (status === 'read') {
            await expect(recordDeliveryEvent(event('delivered', { eventId: 'late-delivered-after-read' })))
                .resolves.toEqual({ action: 'noop', reason: 'STALE_STATUS' })
        } else {
            await recordDeliveryEvent(event('read', { eventId: 'read-after-delivered' }))
        }

        expect(store.get(DELIVERY)).toMatchObject({
            status: 'read',
            providerMessageId: 'wamid-provider-fixture',
            followUpAdvanced: true,
        })
        expect(store.get(LEAD)).toMatchObject({ followUpCount: 1, followUpAt: '2026-08-17' })
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
            logicalAttemptId: 'followup-logical-attempt-2',
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

    it.each(['accepted', 'failed'])(
        'a secondary image %s event updates its delivery and replay ledger but leaves the exact primary lead truth unchanged',
        async status => {
            const imageOutboundId = 'followup-a1b2c3-1:image'
            await prepareFollowUpDelivery(requested())
            await prepareFollowUpDelivery(requested({
                outboundId: imageOutboundId,
                part: 'image',
                text: '',
                advancesFollowUp: false,
                demoEvidence: true,
            }))
            expect(store.get(`sales_delivery_events/${imageOutboundId}`)).toMatchObject({
                deliveryRole: 'secondary',
                advanceOnDelivery: false,
                logicalAttemptId: 'followup-logical-attempt-1',
                demoEvidence: true,
            })
            await recordDeliveryEvent(event('delivered', { eventId: 'primary-delivered-before-image' }))
            await recordDeliveryEvent(event('read', { eventId: 'primary-read-before-image' }))
            const leadBeforeImage = structuredClone(store.get(LEAD))
            const imageEvent = event(status, {
                eventId: `image-${status}-fixture`,
                outboundId: imageOutboundId,
                providerMessageId: status === 'failed' ? undefined : 'wamid-image-fixture',
                errorCode: status === 'failed' ? 'GRAPH_REJECTED' : undefined,
                occurredAt: '2026-08-14T10:03:00.000Z',
            })

            await expect(recordDeliveryEvent(imageEvent)).resolves.toMatchObject({ action: 'applied', advanced: false })
            expect(store.get(LEAD)).toEqual(leadBeforeImage)
            expect(store.get(`sales_delivery_events/${imageOutboundId}`)).toMatchObject({ status })
            await expect(recordDeliveryEvent(imageEvent)).resolves.toEqual({ action: 'noop', reason: 'EVENT_REPLAY' })
            await expect(recordDeliveryEvent({
                ...imageEvent,
                status: status === 'failed' ? 'accepted' : 'failed',
                providerMessageId: status === 'failed' ? 'wamid-image-fixture' : undefined,
                errorCode: status === 'failed' ? undefined : 'GRAPH_REJECTED',
            })).rejects.toMatchObject({ code: 'EVENT_ID_CONFLICT' })
            expect(store.get(LEAD)).toEqual(leadBeforeImage)
        },
    )

    it('records acknowledged demo evidence only after a secondary media part is delivered', async () => {
        const outboundId = 'inbound-demo-fixture-0:image'
        const deliveryKey = `sales_delivery_events/${outboundId}`
        store.set(deliveryKey, {
            outboundId,
            channel: 'make',
            status: 'requested',
            leadId: '41',
            part: 'image',
            deliveryRole: 'secondary',
            advanceOnDelivery: false,
            logicalAttemptId: 'inbound-demo-fixture-0',
            advancesFollowUp: false,
            demoEvidence: true,
            requestedAtMs: Date.parse('2026-08-14T10:00:00.000Z'),
        })

        await recordDeliveryEvent(event('accepted', {
            eventId: 'demo-image-accepted',
            outboundId,
            channel: 'make',
            providerMessageId: 'wamid-demo-image-fixture',
        }))
        expect(store.get(LEAD).demoEvidenceDelivered).toBeUndefined()

        await recordDeliveryEvent(event('delivered', {
            eventId: 'demo-image-delivered',
            outboundId,
            channel: 'make',
            providerMessageId: 'wamid-demo-image-fixture',
            occurredAt: '2026-08-14T10:02:00.000Z',
        }))
        expect(store.get(LEAD)).toMatchObject({
            demoEvidenceDelivered: true,
            demoEvidenceDeliveredAt: '2026-08-14T10:02:00.000Z',
            followUpCount: 0,
            followUpAt: '2026-08-14',
        })
    })

    it('does not claim demo evidence when a prepared media delivery fails', async () => {
        const outboundId = 'inbound-demo-failed-fixture-0:image'
        store.set(`sales_delivery_events/${outboundId}`, {
            outboundId,
            channel: 'make',
            status: 'requested',
            leadId: '41',
            part: 'image',
            deliveryRole: 'secondary',
            advanceOnDelivery: false,
            logicalAttemptId: 'inbound-demo-failed-fixture-0',
            advancesFollowUp: false,
            demoEvidence: true,
        })

        await recordDeliveryEvent(event('failed', {
            eventId: 'demo-image-failed',
            outboundId,
            channel: 'make',
            providerMessageId: undefined,
            errorCode: 'PROVIDER_FAILED',
        }))

        expect(store.get(LEAD).demoEvidenceDelivered).toBeUndefined()
    })

    it.each(['accepted', 'failed'])(
        'a newer same-attempt primary %s callback cannot overwrite truth after the older primary advances',
        async status => {
            const newerOutboundId = 'followup-same-attempt-retry:template'
            await prepareFollowUpDelivery(requested())
            await prepareFollowUpDelivery(requested({
                outboundId: newerOutboundId,
                requestedAt: '2026-08-14T10:02:00.000Z',
            }))
            await recordDeliveryEvent(event('delivered', {
                eventId: 'older-primary-delivered-same-attempt',
                occurredAt: '2026-08-14T10:02:30.000Z',
            }))
            const advancedLead = structuredClone(store.get(LEAD))

            await recordDeliveryEvent(event(status, {
                eventId: `newer-primary-${status}-same-attempt`,
                outboundId: newerOutboundId,
                providerMessageId: status === 'failed' ? undefined : 'wamid-newer-same-attempt',
                errorCode: status === 'failed' ? 'GRAPH_TIMEOUT' : undefined,
                occurredAt: '2026-08-14T10:03:00.000Z',
            }))

            expect(store.get(LEAD)).toEqual(advancedLead)
            expect(store.get(`sales_delivery_events/${newerOutboundId}`)).toMatchObject({ status })
        },
    )
})

describe('callback-created and legacy delivery normalization', () => {
    const externalOutboundId = 'make-callback-created-fixture:text'
    const externalEvent = (status, overrides = {}) => ({
        eventId: `make-external-${status}`,
        outboundId: externalOutboundId,
        channel: 'make',
        status,
        providerMessageId: 'wamid-make-external-fixture',
        occurredAt: '2026-08-14T11:00:00.000Z',
        ...overrides,
    })

    it('creates explicit external metadata and never writes a lead across accepted, delivered, and read', async () => {
        const leadBefore = structuredClone(store.get(LEAD))
        await recordDeliveryEvent(externalEvent('accepted'))
        expect(store.get(`sales_delivery_events/${externalOutboundId}`)).toMatchObject({
            outboundId: externalOutboundId,
            deliveryRole: 'external',
            advanceOnDelivery: false,
            logicalAttemptId: externalOutboundId,
            status: 'accepted',
        })

        await recordDeliveryEvent(externalEvent('delivered', { eventId: 'make-external-delivered' }))
        await recordDeliveryEvent(externalEvent('read', { eventId: 'make-external-read' }))

        expect(store.get(`sales_delivery_events/${externalOutboundId}`)).toMatchObject({ status: 'read', followUpAdvanced: false })
        expect(store.get(LEAD)).toEqual(leadBefore)
        expect(store.writes().filter(write => write.key === LEAD)).toEqual([])
        expect(store.entries().filter(([key]) => key.startsWith('sales_delivery_event_ids/'))).toHaveLength(3)
    })

    it('creates explicit non-advancing metadata for a callback-created failure', async () => {
        const failedOutboundId = 'make-callback-created-failed:text'
        await recordDeliveryEvent(externalEvent('failed', {
            eventId: 'make-external-failed',
            outboundId: failedOutboundId,
            providerMessageId: undefined,
            errorCode: 'PROVIDER_FAILED',
        }))
        expect(store.get(`sales_delivery_events/${failedOutboundId}`)).toMatchObject({
            deliveryRole: 'external',
            advanceOnDelivery: false,
            logicalAttemptId: failedOutboundId,
            status: 'failed',
        })
        expect(store.writes().filter(write => write.key === LEAD)).toEqual([])
    })

    it('backfills a legacy primary and preserves its stored advancing ownership exactly once', async () => {
        const outboundId = 'legacy-primary-fixture:text'
        store.set(`sales_delivery_events/${outboundId}`, {
            outboundId,
            channel: 'make',
            status: 'requested',
            leadId: '41',
            advancesFollowUp: true,
            attemptNumber: 1,
            nextFollowUpAt: '2026-08-17',
        })
        store.set(LEAD, {
            ...store.get(LEAD),
            pendingDeliveryMessages: { [outboundId]: 'legacy primary fixture' },
        })
        await recordDeliveryEvent(externalEvent('delivered', {
            eventId: 'legacy-primary-delivered', outboundId,
        }))
        expect(store.get(`sales_delivery_events/${outboundId}`)).toMatchObject({
            deliveryRole: 'primary',
            advanceOnDelivery: true,
            logicalAttemptId: outboundId,
            followUpAdvanced: true,
        })
        expect(store.get(LEAD)).toMatchObject({ followUpCount: 1, followUpAt: '2026-08-17' })
        await recordDeliveryEvent(externalEvent('read', { eventId: 'legacy-primary-read', outboundId }))
        expect(store.get(LEAD).followUpCount).toBe(1)
    })

    it.each([
        ['absent', undefined],
        ['false', false],
    ])('lets explicit primary ownership outrank legacy %s through accepted pending and one verified advancement', async (_label, legacyFlag) => {
        const outboundId = `explicit-primary-${_label}-fixture:template`
        const stored = {
            outboundId,
            channel: 'make',
            status: 'requested',
            leadId: '41',
            deliveryRole: 'primary',
            advanceOnDelivery: true,
            logicalAttemptId: `explicit-primary-${_label}-attempt`,
            attemptNumber: 1,
            nextFollowUpAt: '2026-08-17',
        }
        if (legacyFlag !== undefined) stored.advancesFollowUp = legacyFlag
        store.set(`sales_delivery_events/${outboundId}`, stored)
        store.set(LEAD, {
            ...store.get(LEAD),
            pendingDeliveryMessages: { [outboundId]: 'explicit primary fixture' },
        })

        await recordDeliveryEvent(externalEvent('accepted', {
            eventId: `explicit-primary-${_label}-accepted`, outboundId,
        }))
        expect(store.get(LEAD)).toMatchObject({
            followUpCount: 0,
            lastDeliveryStatus: 'accepted',
            deliveryPendingOutboundId: outboundId,
            deliveryPendingUntilMs: Date.parse('2026-08-14T11:30:00.000Z'),
            deliveryPendingAttemptId: `explicit-primary-${_label}-attempt`,
        })

        await recordDeliveryEvent(externalEvent('delivered', {
            eventId: `explicit-primary-${_label}-delivered`, outboundId,
        }))
        await recordDeliveryEvent(externalEvent('read', {
            eventId: `explicit-primary-${_label}-read`, outboundId,
        }))

        expect(store.get(`sales_delivery_events/${outboundId}`)).toMatchObject({
            deliveryRole: 'primary',
            advanceOnDelivery: true,
            logicalAttemptId: `explicit-primary-${_label}-attempt`,
            status: 'read',
            followUpAdvanced: true,
        })
        expect(store.get(LEAD)).toMatchObject({
            followUpCount: 1,
            followUpAt: '2026-08-17',
            lastDeliveryStatus: 'read',
            deliveryPendingOutboundId: null,
            deliveryPendingUntilMs: null,
        })
    })

    it('derives primary ownership when explicit advanceOnDelivery is true and role is absent', async () => {
        const outboundId = 'explicit-advance-true-fixture:template'
        store.set(`sales_delivery_events/${outboundId}`, {
            outboundId,
            channel: 'make',
            status: 'requested',
            leadId: '41',
            advanceOnDelivery: true,
            advancesFollowUp: false,
            logicalAttemptId: 'explicit-advance-true-attempt',
            attemptNumber: 1,
            nextFollowUpAt: '2026-08-17',
        })
        store.set(LEAD, {
            ...store.get(LEAD),
            pendingDeliveryMessages: { [outboundId]: 'explicit advance fixture' },
        })

        await recordDeliveryEvent(externalEvent('accepted', {
            eventId: 'explicit-advance-true-accepted', outboundId,
        }))
        expect(store.get(`sales_delivery_events/${outboundId}`)).toMatchObject({
            deliveryRole: 'primary',
            advanceOnDelivery: true,
        })
        expect(store.get(LEAD)).toMatchObject({
            followUpCount: 0,
            deliveryPendingOutboundId: outboundId,
            deliveryPendingAttemptId: 'explicit-advance-true-attempt',
        })

        await recordDeliveryEvent(externalEvent('delivered', {
            eventId: 'explicit-advance-true-delivered', outboundId,
        }))
        await recordDeliveryEvent(externalEvent('read', {
            eventId: 'explicit-advance-true-read', outboundId,
        }))
        expect(store.get(LEAD)).toMatchObject({ followUpCount: 1, followUpAt: '2026-08-17' })
    })

    it('derives secondary non-ownership when explicit advanceOnDelivery is false and role is absent', async () => {
        const outboundId = 'explicit-advance-false-fixture:image'
        store.set(`sales_delivery_events/${outboundId}`, {
            outboundId,
            channel: 'make',
            status: 'requested',
            leadId: '41',
            advanceOnDelivery: false,
            advancesFollowUp: true,
            logicalAttemptId: 'explicit-advance-false-attempt',
            attemptNumber: 1,
        })
        const leadBefore = structuredClone(store.get(LEAD))

        await recordDeliveryEvent(externalEvent('accepted', {
            eventId: 'explicit-advance-false-accepted', outboundId,
        }))
        await recordDeliveryEvent(externalEvent('delivered', {
            eventId: 'explicit-advance-false-delivered', outboundId,
        }))
        await recordDeliveryEvent(externalEvent('read', {
            eventId: 'explicit-advance-false-read', outboundId,
        }))

        expect(store.get(`sales_delivery_events/${outboundId}`)).toMatchObject({
            deliveryRole: 'secondary',
            advanceOnDelivery: false,
            logicalAttemptId: 'explicit-advance-false-attempt',
            status: 'read',
            followUpAdvanced: false,
        })
        expect(store.get(LEAD)).toEqual(leadBefore)
        expect(store.writes().filter(write => write.key === LEAD)).toEqual([])
    })

    it.each([
        ['primary', false, 'secondary'],
        ['secondary', true, 'secondary'],
    ])('normalizes conflicting explicit %s/%s ownership to safe non-advancing %s metadata', async (deliveryRole, advanceOnDelivery, expectedRole) => {
        const outboundId = `explicit-conflict-${deliveryRole}-${advanceOnDelivery}:template`
        store.set(`sales_delivery_events/${outboundId}`, {
            outboundId,
            channel: 'make',
            status: 'requested',
            leadId: '41',
            deliveryRole,
            advanceOnDelivery,
            advancesFollowUp: true,
            logicalAttemptId: `explicit-conflict-${deliveryRole}-attempt`,
            attemptNumber: 1,
            nextFollowUpAt: '2026-08-17',
        })
        const leadBefore = structuredClone(store.get(LEAD))

        await recordDeliveryEvent(externalEvent('accepted', {
            eventId: `explicit-conflict-${deliveryRole}-accepted`, outboundId,
        }))
        await recordDeliveryEvent(externalEvent('delivered', {
            eventId: `explicit-conflict-${deliveryRole}-delivered`, outboundId,
        }))
        await recordDeliveryEvent(externalEvent('read', {
            eventId: `explicit-conflict-${deliveryRole}-read`, outboundId,
        }))

        expect(store.get(`sales_delivery_events/${outboundId}`)).toMatchObject({
            deliveryRole: expectedRole,
            advanceOnDelivery: false,
            status: 'read',
            followUpAdvanced: false,
        })
        expect(store.get(LEAD)).toEqual(leadBefore)
        expect(store.writes().filter(write => write.key === LEAD)).toEqual([])
    })

    it.each([
        ['secondary', false],
        ['external', undefined],
    ])('backfills legacy %s metadata without ever mutating its referenced lead', async (expectedRole, legacyFlag) => {
        const outboundId = `legacy-${expectedRole}-fixture:image`
        const legacy = {
            outboundId,
            channel: 'make',
            status: 'requested',
            leadId: '41',
            attemptNumber: 1,
        }
        if (legacyFlag !== undefined) legacy.advancesFollowUp = legacyFlag
        store.set(`sales_delivery_events/${outboundId}`, legacy)
        const leadBefore = structuredClone(store.get(LEAD))
        const accepted = externalEvent('accepted', { eventId: `legacy-${expectedRole}-accepted`, outboundId })

        await recordDeliveryEvent(accepted)
        expect(store.get(`sales_delivery_events/${outboundId}`)).toMatchObject({
            deliveryRole: expectedRole,
            advanceOnDelivery: false,
            logicalAttemptId: outboundId,
        })
        expect(store.get(LEAD)).toEqual(leadBefore)
        await expect(recordDeliveryEvent(accepted)).resolves.toEqual({ action: 'noop', reason: 'EVENT_REPLAY' })
        await expect(recordDeliveryEvent({ ...accepted, providerMessageId: 'wamid-conflicting-replay' }))
            .rejects.toMatchObject({ code: 'EVENT_ID_CONFLICT' })
        await expect(recordDeliveryEvent(externalEvent('delivered', {
            eventId: `legacy-${expectedRole}-mismatched-provider`,
            outboundId,
            providerMessageId: 'wamid-mismatched-provider',
        }))).rejects.toMatchObject({ code: 'PROVIDER_MESSAGE_ID_MISMATCH' })
        expect(store.get(LEAD)).toEqual(leadBefore)
    })

    it('persists a Task6-like Make callback-created outbound through the authenticated route', async () => {
        process.env.SALES_AGENT_SECRET = 'route-secret-fixture'
        const event = externalEvent('accepted', { eventId: 'task6-make-route-accepted' })
        const response = await acknowledgeDelivery(new Request('http://localhost/api/sales-agent/delivery', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-sales-agent-secret': 'route-secret-fixture' },
            body: JSON.stringify(event),
        }))

        expect(response.status).toBe(202)
        expect(await response.json()).toMatchObject({ accepted: true, result: { action: 'applied' } })
        expect(store.get(`sales_delivery_events/${externalOutboundId}`)).toMatchObject({
            deliveryRole: 'external', advanceOnDelivery: false, logicalAttemptId: externalOutboundId,
        })
        expect(store.writes().filter(write => write.key === LEAD)).toEqual([])
    })
})

describe('owner digest health metadata', () => {
    it('claims a deterministic digest attempt before transport and never reuses a terminal attempt', async () => {
        const first = await prepareDigestDelivery({
            outboundId: 'digest-fixture:template', requestedAt: '2026-08-14T10:00:00.000Z', attemptNumber: 1,
        })
        const replay = await prepareDigestDelivery({
            outboundId: 'digest-fixture:template', requestedAt: '2026-08-14T10:01:00.000Z', attemptNumber: 1,
        })
        expect(first).toEqual({ action: 'requested', outboundId: 'digest-fixture:template' })
        expect(store.get('sales_delivery_events/digest-fixture:template')).toMatchObject({
            deliveryRole: 'owner_digest',
            advanceOnDelivery: false,
            logicalAttemptId: 'digest-fixture:template',
        })
        expect(replay).toEqual({ action: 'existing', outboundId: 'digest-fixture:template', status: 'requested' })

        await recordDeliveryEvent(event('failed', {
            eventId: 'digest-failed-fixture', outboundId: 'digest-fixture:template',
            providerMessageId: undefined, errorCode: 'GRAPH_REJECTED',
        }))
        await expect(prepareDigestDelivery({
            outboundId: 'digest-fixture:template', requestedAt: '2026-08-14T10:02:00.000Z', attemptNumber: 1,
        })).resolves.toMatchObject({ action: 'existing', status: 'failed' })
        await expect(prepareDigestDelivery({
            outboundId: 'digest-fixture-retry:template', requestedAt: '2026-08-14T10:02:00.000Z', attemptNumber: 2,
        })).resolves.toMatchObject({ action: 'requested' })
    })

    it('allows one transactional winner for concurrent digest preclaims', async () => {
        const claim = {
            outboundId: 'digest-concurrent-fixture:template',
            requestedAt: '2026-08-14T10:00:00.000Z',
            attemptNumber: 1,
        }
        const results = await Promise.all([prepareDigestDelivery(claim), prepareDigestDelivery(claim)])
        expect(results.map(result => result.action).sort()).toEqual(['existing', 'requested'])
    })

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

describe('global delivery event replay ledger', () => {
    const replayEvent = (overrides = {}) => event('accepted', {
        eventId: 'global-replay-event-fixture',
        ...overrides,
    })

    it('returns an explicit no-op for an identical old event after newer status events', async () => {
        await prepareFollowUpDelivery(requested())
        await recordDeliveryEvent(replayEvent())
        await recordDeliveryEvent(event('delivered', { eventId: 'newer-delivered-event-fixture' }))

        await expect(recordDeliveryEvent(replayEvent()))
            .resolves.toEqual({ action: 'noop', reason: 'EVENT_REPLAY' })
        expect(store.get(LEAD).followUpCount).toBe(1)
    })

    it('rejects the same event ID reused for another status, outbound, channel, or provider identity', async () => {
        await prepareFollowUpDelivery(requested())
        await recordDeliveryEvent(replayEvent())

        await expect(recordDeliveryEvent(replayEvent({ status: 'read' })))
            .rejects.toMatchObject({ code: 'EVENT_ID_CONFLICT' })
        await expect(recordDeliveryEvent(replayEvent({ channel: 'make' })))
            .rejects.toMatchObject({ code: 'EVENT_ID_CONFLICT' })
        await expect(recordDeliveryEvent(replayEvent({ providerMessageId: 'wamid-conflicting-fixture' })))
            .rejects.toMatchObject({ code: 'EVENT_ID_CONFLICT' })

        const otherOutboundId = 'followup-other-fixture-1:text'
        await prepareFollowUpDelivery(requested({ outboundId: otherOutboundId, part: 'text' }))
        await expect(recordDeliveryEvent(replayEvent({ outboundId: otherOutboundId })))
            .rejects.toMatchObject({ code: 'EVENT_ID_CONFLICT' })
    })

    it('does not retain a replay claim when the delivery transaction rolls back', async () => {
        await prepareFollowUpDelivery(requested())
        store.failNext()

        await expect(recordDeliveryEvent(replayEvent())).rejects.toThrow('injected delivery transaction failure')
        expect(store.get(DELIVERY).status).toBe('requested')
        expect(store.entries().filter(([key]) => key.startsWith('sales_delivery_event_ids/'))).toEqual([])

        await expect(recordDeliveryEvent(replayEvent())).resolves.toMatchObject({ action: 'applied' })
        const ledgerRows = store.entries().filter(([key]) => key.startsWith('sales_delivery_event_ids/'))
        expect(ledgerRows).toHaveLength(1)
        expect(ledgerRows[0][0]).not.toContain('global-replay-event-fixture')
    })

    it('allows one winner when the same event ID is claimed concurrently for different outbounds', async () => {
        const otherOutboundId = 'followup-concurrent-fixture-1:text'
        await prepareFollowUpDelivery(requested())
        await prepareFollowUpDelivery(requested({ outboundId: otherOutboundId, part: 'text' }))

        const results = await Promise.allSettled([
            recordDeliveryEvent(replayEvent()),
            recordDeliveryEvent(replayEvent({ outboundId: otherOutboundId, providerMessageId: 'wamid-other-fixture' })),
        ])

        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
        expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
        expect(results.find(result => result.status === 'rejected').reason).toMatchObject({ code: 'EVENT_ID_CONFLICT' })
    })
})

describe('privacy-safe provider message correlation', () => {
    it('stores only a hashed provider key and phone-free outbound ID', async () => {
        await prepareFollowUpDelivery(requested())
        await recordDeliveryEvent(event('accepted'))

        const key = `sales_delivery_provider_ids/${providerMessageCorrelationId('wamid-provider-fixture')}`
        expect(store.get(key)).toEqual({
            outboundId: OUTBOUND_ID,
            createdAt: 'SERVER_TIME',
            updatedAt: 'SERVER_TIME',
        })
        expect(key).not.toContain('wamid-provider-fixture')
        expect(JSON.stringify(store.get(key))).not.toContain('non-dialable-lead-abc-41')
        await expect(resolveProviderMessageOutboundId('wamid-provider-fixture')).resolves.toBe(OUTBOUND_ID)
    })

    it('rejects a provider ID bound to a mismatched outbound ID', async () => {
        await prepareFollowUpDelivery(requested())
        await recordDeliveryEvent(event('accepted'))

        await expect(recordDeliveryEvent(event('accepted', {
            eventId: 'mismatched-provider-binding-event',
            outboundId: 'followup-other-phone-free-hash:template',
        }))).rejects.toMatchObject({ code: 'PROVIDER_MESSAGE_ID_MISMATCH' })
    })

    it('fails closed for an ambiguous correlation record', async () => {
        const ambiguousId = 'wamid-ambiguous-fixture'
        store.set(`sales_delivery_provider_ids/${providerMessageCorrelationId(ambiguousId)}`, {
            outboundIds: ['phone-free-outbound-a:text', 'phone-free-outbound-b:text'],
        })

        await expect(resolveProviderMessageOutboundId(ambiguousId))
            .rejects.toMatchObject({ code: 'PROVIDER_MESSAGE_ID_AMBIGUOUS' })
    })

    it('does not write or retain an unknown provider correlation', async () => {
        const providerMessageId = 'non-dialable-missing-provider-sentinel'
        const beforeEntries = store.entries()
        const beforeWrites = store.writes()

        await expect(resolveProviderMessageOutboundId(providerMessageId))
            .rejects.toMatchObject({ code: 'PROVIDER_MESSAGE_ID_NOT_FOUND' })

        expect(store.entries()).toEqual(beforeEntries)
        expect(store.writes()).toEqual(beforeWrites)
        expect(JSON.stringify(store.entries())).not.toContain(providerMessageId)
    })
})
