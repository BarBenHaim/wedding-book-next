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

import { prepareDigestDelivery, prepareFollowUpDelivery, recordDeliveryEvent, recordDigestOutcome } from '@/lib/salesAgent/leads'

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
            }))
            expect(store.get(`sales_delivery_events/${imageOutboundId}`)).toMatchObject({
                deliveryRole: 'secondary',
                advanceOnDelivery: false,
                logicalAttemptId: 'followup-logical-attempt-1',
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
