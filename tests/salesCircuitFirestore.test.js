import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => {
    const docs = new Map()
    let queue = Promise.resolve()
    let failCommit = false
    let nowMs = 10_000
    let stagedWrites = []
    let committedWrites = []
    let readGates = []
    const doc = key => ({ key })
    const snapshot = ref => ({ exists: docs.has(ref.key), data: () => docs.get(ref.key) })
    const db = {
        collection: name => ({ doc: id => doc(`${name}/${id}`) }),
        runTransaction: work => {
            const run = queue.then(async () => {
                const writes = []
                const tx = {
                    get: async ref => {
                        const index = readGates.findIndex(gate => gate.key === ref.key)
                        if (index >= 0) {
                            const [gate] = readGates.splice(index, 1)
                            gate.markStarted()
                            await gate.wait
                        }
                        return snapshot(ref)
                    },
                    set: (ref, value, options) => {
                        const write = { key: ref.key, value, options }
                        writes.push(write)
                        stagedWrites.push(write)
                    },
                }
                const result = await work(tx)
                if (failCommit) throw new Error('injected commit failure')
                for (const write of writes) {
                    const old = docs.get(write.key) || {}
                    docs.set(write.key, write.options?.merge ? { ...old, ...write.value } : write.value)
                    committedWrites.push(write)
                }
                return result
            })
            queue = run.catch(() => {})
            return run
        },
    }
    return {
        db,
        reset() {
            docs.clear()
            queue = Promise.resolve()
            failCommit = false
            nowMs = 10_000
            stagedWrites = []
            committedWrites = []
            readGates = []
        },
        set(key, value) { docs.set(key, value) },
        get(key) { return docs.get(key) },
        entries() { return [...docs.entries()] },
        fail() { failCommit = true },
        now() { return nowMs },
        setNow(value) { nowMs = value },
        staged() { return [...stagedWrites] },
        committed() { return [...committedWrites] },
        delayRead(key) {
            let release
            let markStarted
            const wait = new Promise(resolve => { release = resolve })
            const started = new Promise(resolve => { markStarted = resolve })
            readGates.push({ key, wait, markStarted })
            return { started, release }
        },
    }
})

vi.mock('@/lib/firebaseAdmin', () => ({ adminDb: store.db }))
vi.mock('firebase-admin/firestore', () => ({
    FieldValue: {
        serverTimestamp: () => 'SERVER_TIME',
        increment: n => ({ increment: n }),
        arrayUnion: (...items) => ({ arrayUnion: items }),
    },
}))

import {
    acquireProviderCircuit,
    buildExchangePatch,
    completeProviderFallback,
    completeSuccessfulExchange,
    recordProviderFailure,
    recordProviderSuccess,
    releaseProviderProbe,
} from '@/lib/salesAgent/leads'
import { createOutboundId } from '@/lib/salesAgent/delivery'

const RUNTIME = 'sales_runtime/anthropic'
const EVENT = 'sales_inbound_events/event-token'
const DEADLINE = 10_100
const processingEvent = (overrides = {}) => ({
    status: 'processing', leaseUntilMs: 20_000, claimToken: 'claim-token', claimGeneration: 1, ...overrides,
})
const fallbackArgs = (overrides = {}) => ({
    eventId: 'event-token', claimToken: 'claim-token', claimGeneration: 1, phone: 'test-phone-123',
    reason: 'תקלה בשירות ה-AI',
    recoveryFollowUpAt: '2026-08-17',
    outcome: { sendText: 'קיבלתי את ההודעה שלך. מישהו מהצוות יחזור אליך בהקדם.', handoff: true },
    ...overrides,
})
const parsed = {
    messages: ['assistant one', 'assistant two'], stage: 'offer_sent', customerName: 'Name',
    eventType: 'wedding', eventDate: '2026-12-12', celebrantName: 'Celebrant',
    packageInterest: 'premium', notes: 'note', callbackPromised: '2026-11-11',
    objectionRaised: true, image: 'book_wedding', handoff: true, handoffReason: 'human',
}

const parsedWithOpeningMedia = {
    ...parsed,
    image: 'book_wedding',
    openingMediaKeys: ['book_wedding', 'pages_wedding', 'book_open_spread'],
}
const exchange = {
    phone: 'test-lead-456', incomingText: 'customer', parsed, followUpAt: null,
    profileName: 'Profile', source: 'instagram', variant: 'question_first', isNew: true,
}
const successArgs = (overrides = {}) => ({
    eventId: 'event-token', claimToken: 'claim-token', claimGeneration: 1,
    exchange, outcome: { sendText: 'answer', handoff: true }, ...overrides,
})

function expectNoWrites() {
    expect(store.staged()).toEqual([])
    expect(store.committed()).toEqual([])
}

beforeEach(() => {
    store.reset()
    vi.spyOn(Date, 'now').mockImplementation(() => store.now())
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('Firestore provider acquire deadline fence', () => {
    it('allows exactly one concurrent half-open acquire', async () => {
        store.set(RUNTIME, { consecutiveFailures: 3, openUntilMs: 9_999 })

        const results = await Promise.all([acquireProviderCircuit(), acquireProviderCircuit()])

        expect(results.filter(result => result.allow)).toHaveLength(1)
        expect(results.filter(result => result.mode === 'half-open-busy')).toHaveLength(1)
        expect(store.committed()).toHaveLength(1)
    })

    it('acquire delayed-read expiry stages and commits zero writes', async () => {
        store.set(RUNTIME, { consecutiveFailures: 3, openUntilMs: 9_999 })
        const gate = store.delayRead(RUNTIME)
        const pending = acquireProviderCircuit({ deadlineAtMs: DEADLINE })
        await gate.started
        store.setNow(DEADLINE)
        gate.release()

        await expect(pending).resolves.toEqual({ allow: false, mode: 'deadline' })
        expectNoWrites()
    })
})

describe('Firestore provider success resolver matrix', () => {
    it('success resolver matching probe resets the breaker', async () => {
        store.set(RUNTIME, { consecutiveFailures: 3, openUntilMs: null, halfOpenProbeId: 'probe-a', halfOpenLeaseUntilMs: 20_000 })

        await expect(recordProviderSuccess('probe-a')).resolves.toMatchObject({ action: 'resolved' })

        expect(store.get(RUNTIME)).toMatchObject({ consecutiveFailures: 0, openUntilMs: null, halfOpenProbeId: null })
        expect(store.committed()).toHaveLength(1)
    })

    it('success resolver mismatched probe is stale and writes nothing', async () => {
        const newer = { consecutiveFailures: 3, openUntilMs: null, halfOpenProbeId: 'probe-new', halfOpenLeaseUntilMs: 20_000 }
        store.set(RUNTIME, newer)

        await expect(recordProviderSuccess('probe-old')).resolves.toEqual({ action: 'stale' })

        expect(store.get(RUNTIME)).toEqual(newer)
        expectNoWrites()
    })

    it('success resolver delayed-read expiry cannot reset a newer probe', async () => {
        store.set(RUNTIME, { consecutiveFailures: 3, halfOpenProbeId: 'probe-old', halfOpenLeaseUntilMs: 20_000 })
        const gate = store.delayRead(RUNTIME)
        const pending = recordProviderSuccess('probe-old', DEADLINE)
        await gate.started
        const newer = { consecutiveFailures: 3, halfOpenProbeId: 'probe-new', halfOpenLeaseUntilMs: 30_000 }
        store.set(RUNTIME, newer)
        store.setNow(DEADLINE)
        gate.release()

        await expect(pending).resolves.toEqual({ action: 'deadline' })
        expect(store.get(RUNTIME)).toEqual(newer)
        expectNoWrites()
    })
})

describe('Firestore provider failure resolver matrix', () => {
    it('failure resolver matching probe increments once and clears ownership', async () => {
        store.set(RUNTIME, { consecutiveFailures: 1, openUntilMs: null, halfOpenProbeId: 'probe-a', halfOpenLeaseUntilMs: 20_000 })

        await expect(recordProviderFailure('timeout', 'probe-a')).resolves.toMatchObject({ action: 'resolved' })

        expect(store.get(RUNTIME)).toMatchObject({ consecutiveFailures: 2, lastErrorCode: 'timeout', halfOpenProbeId: null })
        expect(store.committed()).toHaveLength(1)
    })

    it('failure resolver mismatched probe is stale and writes nothing', async () => {
        const newer = { consecutiveFailures: 3, openUntilMs: null, halfOpenProbeId: 'probe-new', halfOpenLeaseUntilMs: 20_000 }
        store.set(RUNTIME, newer)

        await expect(recordProviderFailure('timeout', 'probe-old')).resolves.toEqual({ action: 'stale' })

        expect(store.get(RUNTIME)).toEqual(newer)
        expectNoWrites()
    })

    it('failure resolver reopens the breaker from a matching half-open probe', async () => {
        store.set(RUNTIME, { consecutiveFailures: 3, openUntilMs: null, halfOpenProbeId: 'probe-a', halfOpenLeaseUntilMs: 20_000 })

        await expect(recordProviderFailure('rate_limit', 'probe-a')).resolves.toMatchObject({ action: 'resolved' })

        expect(store.get(RUNTIME)).toMatchObject({ consecutiveFailures: 4, openUntilMs: 310_000, lastErrorCode: 'rate_limit', halfOpenProbeId: null })
    })

    it('failure resolver delayed-read expiry cannot increment a newer probe', async () => {
        store.set(RUNTIME, { consecutiveFailures: 3, halfOpenProbeId: 'probe-old', halfOpenLeaseUntilMs: 20_000 })
        const gate = store.delayRead(RUNTIME)
        const pending = recordProviderFailure('timeout', 'probe-old', DEADLINE)
        await gate.started
        const newer = { consecutiveFailures: 3, halfOpenProbeId: 'probe-new', halfOpenLeaseUntilMs: 30_000 }
        store.set(RUNTIME, newer)
        store.setNow(DEADLINE)
        gate.release()

        await expect(pending).resolves.toEqual({ action: 'deadline' })
        expect(store.get(RUNTIME)).toEqual(newer)
        expectNoWrites()
    })
})

describe('Firestore provider probe release matrix', () => {
    it('release matching probe clears only lease metadata without changing failures', async () => {
        store.set(RUNTIME, { consecutiveFailures: 3, openUntilMs: null, halfOpenProbeId: 'probe-a', halfOpenLeaseUntilMs: 20_000 })

        await expect(releaseProviderProbe('probe-a')).resolves.toEqual({ action: 'released' })

        expect(store.get(RUNTIME)).toMatchObject({ consecutiveFailures: 3, halfOpenProbeId: null, halfOpenLeaseUntilMs: null })
        expect(store.committed()).toHaveLength(1)
    })

    it('release mismatched probe is stale and writes nothing', async () => {
        const newer = { consecutiveFailures: 3, halfOpenProbeId: 'probe-new', halfOpenLeaseUntilMs: 20_000 }
        store.set(RUNTIME, newer)

        await expect(releaseProviderProbe('probe-old')).resolves.toEqual({ action: 'stale' })

        expect(store.get(RUNTIME)).toEqual(newer)
        expectNoWrites()
    })

    it('release pre-entry deadline expiry stages and commits zero writes', async () => {
        store.setNow(DEADLINE)

        await expect(releaseProviderProbe('probe-a', DEADLINE)).rejects.toThrow('deadline exhausted')

        expectNoWrites()
    })

    it('release delayed-read expiry cannot clear a newer probe', async () => {
        store.set(RUNTIME, { consecutiveFailures: 3, halfOpenProbeId: 'probe-old', halfOpenLeaseUntilMs: 20_000 })
        const gate = store.delayRead(RUNTIME)
        const pending = releaseProviderProbe('probe-old', DEADLINE)
        await gate.started
        const newer = { consecutiveFailures: 3, halfOpenProbeId: 'probe-new', halfOpenLeaseUntilMs: 30_000 }
        store.set(RUNTIME, newer)
        store.setNow(DEADLINE)
        gate.release()

        await expect(pending).resolves.toEqual({ action: 'deadline' })
        expect(store.get(RUNTIME)).toEqual(newer)
        expectNoWrites()
    })
})

describe('Firestore atomic provider fallback matrix', () => {
    it('fallback success commits the event and human state as one pair', async () => {
        store.set(EVENT, processingEvent())

        await expect(completeProviderFallback(fallbackArgs())).resolves.toMatchObject({ action: 'completed' })

        expect(store.entries().find(([key]) => key.startsWith('sales_leads/'))?.[1]).toMatchObject({
            human: true,
            handoffReason: 'תקלה בשירות ה-AI',
            followUpAt: '2026-08-17',
        })
        expect(store.get(EVENT)).toMatchObject({ status: 'completed', outcome: { handoff: true } })
        expect(store.committed().map(write => write.key).sort()).toEqual([EVENT, 'sales_leads/123'].sort())
    })

    it('fallback stale generation writes neither lead nor event', async () => {
        const newer = processingEvent({ claimGeneration: 2 })
        store.set(EVENT, newer)

        await expect(completeProviderFallback(fallbackArgs())).resolves.toEqual({ action: 'stale' })

        expect(store.get(EVENT)).toEqual(newer)
        expectNoWrites()
    })

    it('fallback pre-entry deadline expiry stages and commits zero writes', async () => {
        store.set(EVENT, processingEvent())
        store.setNow(DEADLINE)

        await expect(completeProviderFallback(fallbackArgs({ deadlineAtMs: DEADLINE }))).rejects.toThrow('deadline exhausted')

        expectNoWrites()
    })

    it('fallback delayed-read expiry cannot mutate a newer event claim', async () => {
        store.set(EVENT, processingEvent())
        const gate = store.delayRead(EVENT)
        const pending = completeProviderFallback(fallbackArgs({ deadlineAtMs: DEADLINE }))
        await gate.started
        const newer = processingEvent({ claimToken: 'new-token', claimGeneration: 2, leaseUntilMs: 30_000 })
        store.set(EVENT, newer)
        store.setNow(DEADLINE)
        gate.release()

        await expect(pending).resolves.toEqual({ action: 'deadline' })
        expect(store.get(EVENT)).toEqual(newer)
        expect(store.entries().find(([key]) => key.startsWith('sales_leads/'))).toBeUndefined()
        expectNoWrites()
    })

    it('fallback rollback exposes staged pair but commits neither write', async () => {
        store.set(EVENT, processingEvent())
        store.fail()

        await expect(completeProviderFallback(fallbackArgs())).rejects.toThrow('injected commit failure')

        expect(store.staged().map(write => write.key).sort()).toEqual([EVENT, 'sales_leads/123'].sort())
        expect(store.committed()).toEqual([])
        expect(store.get(EVENT)).toEqual(processingEvent())
        expect(store.entries().find(([key]) => key.startsWith('sales_leads/'))).toBeUndefined()
    })
})

describe('Firestore atomic successful exchange matrix', () => {
    it('records every configured opening asset as seen in the same durable exchange', () => {
        const result = buildExchangePatch({ ...exchange, parsed: parsedWithOpeningMedia })
        expect(result.patch.imagesSent).toBeUndefined()
        expect(result.patch.mediaSent).toBeUndefined()
        expect(result.patch.pendingMediaKeys).toBeUndefined()
        expect(result.patch.lastMediaAt).toBeUndefined()
    })

    it('successful exchange commits the exchange, event, and requested text delivery atomically', async () => {
        store.set(EVENT, processingEvent())
        const expected = buildExchangePatch(exchange)
        // Literal parity with the active Make formula:
        // inbound-${sha256(inboundMessageId).slice(0, 24)}-0:text
        const textOutboundId = 'inbound-01639857c87ca59d2f08e31b-0:text'

        await expect(completeSuccessfulExchange(successArgs())).resolves.toMatchObject({ action: 'completed' })

        expect(store.get(`sales_leads/${expected.id}`)).toEqual(expected.patch)
        expect(store.get(EVENT)).toMatchObject({ status: 'completed', outcome: { sendText: 'answer', handoff: true } })
        expect(store.get(`sales_delivery_events/${textOutboundId}`)).toMatchObject({
            outboundId: textOutboundId,
            leadId: expected.id,
            channel: 'make',
            status: 'requested',
            part: 'text',
            deliveryRole: 'secondary',
            advanceOnDelivery: false,
            demoEvidence: false,
        })
        expect(store.committed().map(write => write.key).sort()).toEqual([
            EVENT,
            `sales_leads/${expected.id}`,
            `sales_delivery_events/${textOutboundId}`,
        ].sort())
    })

    it('prepares exact Make-correlated media delivery records without storing media URLs', async () => {
        store.set(EVENT, processingEvent())
        const outcome = {
            sendText: 'הנה דוגמה',
            sendImage: 'https://assets.invalid/private-image-fixture.jpg',
            sendVideo: 'https://assets.invalid/private-video-fixture.mp4',
            handoff: false,
        }

        await completeSuccessfulExchange(successArgs({ outcome }))

        const records = ['text', 'image', 'video'].map(part => {
            const outboundId = createOutboundId({ scope: 'inbound', subject: 'event-token', attempt: 0, part })
            return store.get(`sales_delivery_events/${outboundId}`)
        })
        expect(records).toEqual([
            expect.objectContaining({ part: 'text', demoEvidence: false }),
            expect.objectContaining({ part: 'image', demoEvidence: true }),
            expect.objectContaining({ part: 'video', demoEvidence: true }),
        ])
        expect(JSON.stringify(records)).not.toContain('assets.invalid')
    })

    it('atomically prepares every ordered opening part without storing customer text or media URLs', async () => {
        store.set(EVENT, processingEvent())
        const openingSequenceParts = [
            { partId: 'a'.repeat(32), order: 1, kind: 'text', text: 'private answer', demoEvidence: false },
            { partId: 'b'.repeat(32), order: 2, kind: 'image', mediaKey: 'cover_personalised', url: 'https://assets.invalid/cover.jpg', demoEvidence: true },
            { partId: 'c'.repeat(32), order: 3, kind: 'image', mediaKey: 'book_open_spread', url: 'https://assets.invalid/spread.jpg', demoEvidence: true },
            { partId: 'd'.repeat(32), order: 4, kind: 'text', text: 'private demo question', demoEvidence: true },
            {
                partId: 'e'.repeat(32), order: 5, kind: 'audio', url: 'https://assets.invalid/private.ogg',
                variableKey: 'voice_intro', variableVersionId: 'v2', voiceNote: true, demoEvidence: true,
            },
        ]

        await completeSuccessfulExchange(successArgs({
            outcome: { sendText: 'private answer', handoff: false, openingSequenceParts },
        }))

        const records = openingSequenceParts.map(part => store.get(`sales_delivery_events/${part.partId}`))
        expect(records).toEqual([
            expect.objectContaining({ outboundId: 'a'.repeat(32), part: 'text', order: 1, demoEvidence: false }),
            expect.objectContaining({ outboundId: 'b'.repeat(32), part: 'image', order: 2, mediaKey: 'cover_personalised', demoEvidence: true }),
            expect.objectContaining({ outboundId: 'c'.repeat(32), part: 'image', order: 3, mediaKey: 'book_open_spread', demoEvidence: true }),
            expect.objectContaining({ outboundId: 'd'.repeat(32), part: 'text', order: 4, demoEvidence: true }),
            expect.objectContaining({
                outboundId: 'e'.repeat(32), part: 'audio', order: 5, demoEvidence: true,
                variableKey: 'voice_intro', variableVersionId: 'v2', voiceNote: true,
            }),
        ])
        expect(JSON.stringify(records)).not.toMatch(/private|assets\.invalid/)
        expect(store.committed().map(write => write.key).filter(key => key.startsWith('sales_delivery_events/'))).toHaveLength(5)
    })

    it('pins the assigned journey and advances its state under an optimistic version fence', async () => {
        store.set(EVENT, processingEvent())
        const dynamicVariantId = 'v_aaaaaaaaaaaa'
        const openingRuntime = {
            expectedStateVersion: 0,
            enrollment: {
                variantId: dynamicVariantId, variantRevision: 3,
                flow: { id: dynamicVariantId, label: 'דוגמה אישית', revision: 3, blocks: [{ id: 'a-stop', type: 'stop' }] },
            },
            state: { cursor: 4, waitingFor: 'approval' },
            captures: { childPhotoReceived: true, childPhotoMediaId: 'opaque-provider-id' },
            approvalRequest: { templateId: 'bar-mitzvah-v1', mediaId: 'opaque-provider-id' },
            completed: false, action: 'approval_pending',
            variantId: dynamicVariantId, variantRevision: 3,
        }

        await expect(completeSuccessfulExchange(successArgs({
            exchange: { ...exchange, openingRuntime },
            outcome: {
                sendText: 'שלחי תמונה', handoff: false,
                openingSequenceParts: [{
                    partId: 'e'.repeat(32), blockId: 'a-photo', order: 1, kind: 'text', text: 'שלחי תמונה',
                }],
            },
        }))).resolves.toEqual(expect.objectContaining({ action: 'completed' }))

        expect(store.get('sales_leads/456')).toMatchObject({
            openingVariantId: dynamicVariantId,
            openingVariantRevision: 3,
            openingFlow: openingRuntime.enrollment.flow,
            openingState: { cursor: 4, waitingFor: 'approval' },
            openingStateVersion: 1,
            openingStatus: 'approval_pending',
        })
        expect(store.get(`sales_delivery_events/${'e'.repeat(32)}`)).toMatchObject({
            openingVariantId: dynamicVariantId, openingVariantRevision: 3,
            openingBlockId: 'a-photo', openingExposure: true,
        })
        const approvals = store.entries().filter(([key]) => key.startsWith('sales_opening_approvals/'))
        expect(approvals).toHaveLength(1)
        expect(approvals[0][1]).toMatchObject({
            status: 'pending_generation', leadId: '456', stateVersion: 1,
            mediaId: 'opaque-provider-id', templateId: 'bar-mitzvah-v1',
            variantId: dynamicVariantId, variantRevision: 3, storagePath: null,
        })
        expect(JSON.stringify(approvals[0][1])).not.toContain('http')
    })

    it('rejects a stale opening state version without mutating lead, event, or deliveries', async () => {
        store.set(EVENT, processingEvent())
        store.set('sales_leads/456', { openingStateVersion: 2, openingVariantId: 'A' })
        const existingLead = structuredClone(store.get('sales_leads/456'))

        await expect(completeSuccessfulExchange(successArgs({
            exchange: {
                ...exchange,
                openingRuntime: {
                    expectedStateVersion: 1, enrollment: null,
                    state: { cursor: 4, waitingFor: 'approval' }, captures: {}, approvalRequest: null,
                    completed: false, action: 'approval_pending', variantId: 'A', variantRevision: 3,
                },
            },
            outcome: { sendText: '', handoff: false, noReply: true, openingSequenceParts: [] },
        }))).resolves.toEqual({ action: 'stale' })

        expect(store.get('sales_leads/456')).toEqual(existingLead)
        expect(store.get(EVENT)).toEqual(processingEvent())
        expectNoWrites()
    })

    it('successful exchange stale generation writes neither lead nor event', async () => {
        const newer = processingEvent({ claimGeneration: 2 })
        store.set(EVENT, newer)

        await expect(completeSuccessfulExchange(successArgs())).resolves.toEqual({ action: 'stale' })

        expect(store.get(EVENT)).toEqual(newer)
        expectNoWrites()
    })

    it('successful exchange pre-entry deadline expiry stages and commits zero writes', async () => {
        store.set(EVENT, processingEvent())
        store.setNow(DEADLINE)

        await expect(completeSuccessfulExchange(successArgs({ deadlineAtMs: DEADLINE }))).rejects.toThrow('deadline exhausted')

        expectNoWrites()
    })

    it('successful exchange delayed-read expiry cannot mutate a newer event claim', async () => {
        store.set(EVENT, processingEvent())
        const gate = store.delayRead(EVENT)
        const pending = completeSuccessfulExchange(successArgs({ deadlineAtMs: DEADLINE }))
        await gate.started
        const newer = processingEvent({ claimToken: 'new-token', claimGeneration: 2, leaseUntilMs: 30_000 })
        store.set(EVENT, newer)
        store.setNow(DEADLINE)
        gate.release()

        await expect(pending).resolves.toEqual({ action: 'deadline' })
        expect(store.get(EVENT)).toEqual(newer)
        expect(store.entries().find(([key]) => key.startsWith('sales_leads/'))).toBeUndefined()
        expectNoWrites()
    })

    it('successful exchange rollback exposes staged pair but commits neither write', async () => {
        store.set(EVENT, processingEvent())
        store.fail()

        await expect(completeSuccessfulExchange(successArgs())).rejects.toThrow('injected commit failure')

        const textOutboundId = 'inbound-01639857c87ca59d2f08e31b-0:text'
        expect(store.staged().map(write => write.key).sort()).toEqual([
            EVENT,
            'sales_leads/456',
            `sales_delivery_events/${textOutboundId}`,
        ].sort())
        expect(store.committed()).toEqual([])
        expect(store.get(EVENT)).toEqual(processingEvent())
        expect(store.get('sales_leads/456')).toBeUndefined()
    })
})
