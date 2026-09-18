import { describe, expect, it } from 'vitest'
import { DEFAULT_OPENING_EXPERIMENT } from '../src/lib/salesAgent/openingExperiment'
import { prepareOpeningRuntime, openingNoteFor } from '../src/lib/salesAgent/openingRuntime'

const library = {
    cover_personalised: { kind: 'image', url: 'https://media.example/cover.jpg', caption: 'כריכה' },
    book_open_spread: { kind: 'image', url: 'https://media.example/spread.jpg', caption: 'עמוד פנימי' },
}

const active = {
    ...DEFAULT_OPENING_EXPERIMENT,
    enabled: true,
}

describe('prepareOpeningRuntime', () => {
    it('enrolls only a genuinely new conversation and pins its executable revision', async () => {
        const runtime = await prepareOpeningRuntime({
            lead: { isNew: true, hasPriorConversation: false },
            experiment: active,
            leadKey: 'non-dialable-lead-a',
            inbound: { kind: 'text', text: 'אשמח לפרטים' },
            library,
            eventId: 'opening-event-a',
        })

        expect(runtime.eligible).toBe(true)
        expect(runtime.enrollment).toMatchObject({ variantId: expect.stringMatching(/^[ABC]$/), variantRevision: 1 })
        expect(runtime.enrollment.flow.blocks.at(-1)).toMatchObject({ type: 'stop' })
        expect(runtime.expectedStateVersion).toBe(0)
        expect(runtime.result.parts.length).toBeGreaterThan(0)
    })

    it('enrolls a new lead into a published variable-backed opening', async () => {
        const experiment = {
            enabled: true,
            minSamplePerVariant: 30,
            variants: [{
                id: 'A', label: 'variable opening', enabled: true, weight: 100, revision: 1,
                blocks: [
                    { id: 'intro', type: 'text', text: 'היי' },
                    { id: 'demo', type: 'media', variableKey: 'demo_image', variableVersionId: 'v1' },
                    { id: 'stop', type: 'stop' },
                ],
            }],
        }
        const runtime = await prepareOpeningRuntime({
            lead: { isNew: true, hasPriorConversation: false },
            experiment,
            leadKey: 'non-dialable-variable-lead',
            inbound: { kind: 'text', text: 'אשמח לפרטים' },
            variableVersions: {
                'demo_image:v1': {
                    id: 'v1', kind: 'image', status: 'published', createdAtMs: 1,
                    objectPath: 'sales-variable-media/demo.jpg', contentType: 'image/jpeg',
                    bytes: 123, checksum: 'a'.repeat(64), caption: 'דוגמה', when: '',
                },
            },
            signDownload: async () => 'https://media.example/signed-demo.jpg',
            eventId: 'opening-variable-event',
        })

        expect(runtime).toMatchObject({
            eligible: true,
            enrollment: { variantId: 'A', variantRevision: 1 },
            result: { parts: [
                expect.objectContaining({ kind: 'text', text: 'היי' }),
                expect.objectContaining({ kind: 'image', url: 'https://media.example/signed-demo.jpg' }),
            ] },
        })
    })

    it.each([
        ['existing lead', { isNew: false }],
        ['historical conversation', { isNew: true, hasPriorConversation: true }],
    ])('does not enroll an %s', async (_label, lead) => {
        await expect(prepareOpeningRuntime({
            lead,
            experiment: active,
            leadKey: 'non-dialable-lead-b',
            inbound: { kind: 'text', text: 'שלום' },
            library,
            eventId: 'opening-event-b',
        })).resolves.toEqual({ eligible: false, reason: 'not-enrolled' })
    })

    it('continues a pinned photo wait without reassigning or restarting the opening', async () => {
        const pinnedFlow = active.variants.find(item => item.id === 'A')
        const lead = {
            isNew: false,
            openingVariantId: 'A',
            openingVariantRevision: 1,
            openingFlow: pinnedFlow,
            openingState: { cursor: 2, waitingFor: 'photo' },
            openingStateVersion: 4,
            openingExposedAt: '2026-08-24T08:00:00.000Z',
        }

        const runtime = await prepareOpeningRuntime({
            lead,
            experiment: active,
            leadKey: 'non-dialable-lead-c',
            inbound: { kind: 'image', mediaId: 'opaque-media-id' },
            library,
            eventId: 'opening-event-c',
        })

        expect(runtime.eligible).toBe(true)
        expect(runtime.enrollment).toBeNull()
        expect(runtime.expectedStateVersion).toBe(4)
        expect(runtime.replyToExposure).toBe(true)
        expect(runtime.result).toMatchObject({
            action: 'approval_pending',
            captures: { childPhotoReceived: true, childPhotoMediaId: 'opaque-media-id' },
            approvalRequest: { templateId: 'bar-mitzvah-v1', mediaId: 'opaque-media-id' },
        })
    })

    it('continues a deleted journey only for a lead that already owns its pinned snapshot', async () => {
        const retiredId = 'v_aaaaaaaaaaaa'
        const runtime = await prepareOpeningRuntime({
            lead: {
                isNew: false,
                openingVariantId: retiredId,
                openingVariantRevision: 2,
                openingFlow: {
                    id: retiredId,
                    label: 'מסלול שנמחק',
                    revision: 2,
                    blocks: [
                        { id: 'retired-text', type: 'text', text: 'המשך שמור' },
                        { id: 'retired-stop', type: 'stop' },
                    ],
                },
                openingState: { cursor: 0, waitingFor: null },
                openingStateVersion: 3,
            },
            experiment: active,
            leadKey: 'non-dialable-retired-lead',
            inbound: { kind: 'text', text: 'המשך' },
            library,
            eventId: 'opening-retired-event',
        })

        expect(runtime).toMatchObject({
            eligible: true,
            enrollment: null,
            expectedStateVersion: 3,
            flow: { id: retiredId, revision: 2 },
            result: { action: 'completed', completed: true },
        })
        expect(runtime.result.parts).toEqual([
            expect.objectContaining({ kind: 'text', text: 'המשך שמור' }),
        ])
    })

    it('fails closed when the experiment or the pinned arm is stopped', async () => {
        const pinned = {
            isNew: false,
            openingVariantId: 'B',
            openingVariantRevision: 1,
            openingFlow: active.variants.find(item => item.id === 'B'),
            openingState: { cursor: 4, waitingFor: 'event' },
            openingStateVersion: 2,
        }
        await expect(prepareOpeningRuntime({ ...{
            lead: pinned, leadKey: 'non-dialable-lead-d', inbound: { kind: 'text', text: 'בר מצווה 12/12/2026' },
            library, eventId: 'opening-event-d',
        }, experiment: { ...active, enabled: false } })).resolves.toEqual({ eligible: false, reason: 'experiment-stopped' })

        const armStopped = {
            ...active,
            variants: active.variants.map(item => item.id === 'B' ? { ...item, enabled: false, weight: 0 } : item),
        }
        await expect(prepareOpeningRuntime({
            lead: pinned, experiment: armStopped, leadKey: 'non-dialable-lead-d',
            inbound: { kind: 'text', text: 'בר מצווה 12/12/2026' }, library, eventId: 'opening-event-d',
        })).resolves.toEqual({ eligible: false, reason: 'variant-stopped' })
    })

    it('keeps ambiguous event details waiting and never invents qualification', async () => {
        const flow = active.variants.find(item => item.id === 'C')
        const runtime = await prepareOpeningRuntime({
            lead: {
                isNew: false, openingVariantId: 'C', openingVariantRevision: 1, openingFlow: flow,
                openingState: { cursor: 1, waitingFor: 'event' }, openingStateVersion: 1,
            },
            experiment: active,
            leadKey: 'non-dialable-lead-e',
            inbound: { kind: 'text', text: 'כנראה בסתיו' },
            library,
            eventId: 'opening-event-e',
        })

        expect(runtime.result).toMatchObject({
            action: 'wait_event',
            state: { cursor: 1, waitingFor: 'event' },
            captures: { eventType: null, eventDate: null, qualificationNeedsReview: true },
        })
        expect(runtime.result.parts).toEqual([])
    })
})

// Before 18.9 a silent opening was the end of the request: the route sent
// nothing. In full-sales mode the route asks the runtime to yield those
// turns to the agent; in opening-only mode nothing changes.
describe('prepareOpeningRuntime yieldWhenSilent', () => {
    const flowA = active.variants.find(item => item.id === 'A')
    const pinned = (openingState, extra = {}) => ({
        isNew: false,
        openingVariantId: 'A',
        openingVariantRevision: 1,
        openingFlow: flowA,
        openingState,
        openingStateVersion: 2,
        openingExposedAt: '2026-09-17T08:00:00.000Z',
        ...extra,
    })
    const run = (lead, inbound, yieldWhenSilent = true) => prepareOpeningRuntime({
        lead, experiment: active, leadKey: 'non-dialable-lead-y', inbound, library, eventId: 'opening-event-y', yieldWhenSilent,
    })

    it('yields a text reply while the opening waits for a photo, and leaves the wait in place', async () => {
        const runtime = await run(pinned({ cursor: 2, waitingFor: 'photo' }), { kind: 'text', text: 'האורחים סורקים באירוע או לפני?' })
        expect(runtime.eligible).toBe(false)
        expect(runtime.reason).toBe('opening-wait_photo-yielded')
        expect(runtime.result.state).toEqual({ cursor: 2, waitingFor: 'photo' })
        const note = openingNoteFor(runtime, {})
        expect(note).toMatch(/תמונה/)
        expect(note).toMatch(/לא לחזור על הבקשה/)
    })

    it('still resumes the design flow when the photo does arrive', async () => {
        const runtime = await run(pinned({ cursor: 2, waitingFor: 'photo' }), { kind: 'image', mediaId: 'opaque-media-id' })
        expect(runtime.eligible).toBe(true)
        expect(runtime.result.action).toBe('approval_pending')
    })

    it('yields every turn after the opening reached its stop block', async () => {
        const runtime = await run(pinned({ cursor: flowA.blocks.length, waitingFor: null }), { kind: 'text', text: 'כמה זה עולה?' })
        expect(runtime.eligible).toBe(false)
        expect(runtime.reason).toBe('opening-finished')
        expect(openingNoteFor(runtime, {})).toMatch(/אל תציג את המוצר מחדש/)
        expect(openingNoteFor(runtime, { childPhotoReceived: true })).toMatch(/אל תבטיח מועד לדוגמה/)
    })

    it('quotes what the opening already said so the agent does not repeat it', async () => {
        const runtime = await run(pinned({ cursor: flowA.blocks.length, waitingFor: null }), { kind: 'text', text: 'היי' })
        const firstText = flowA.blocks.find(block => block.type === 'text').text.slice(0, 20)
        expect(openingNoteFor(runtime, {})).toContain(firstText)
    })

    it('changes nothing when the route did not ask for it, or when the opening has something to send', async () => {
        const legacy = await run(pinned({ cursor: flowA.blocks.length, waitingFor: null }), { kind: 'text', text: 'היי' }, false)
        expect(legacy.eligible).toBe(true)
        expect(legacy.result.parts).toEqual([])
        expect(openingNoteFor(legacy, {})).toBeNull()

        const fresh = await prepareOpeningRuntime({
            lead: { isNew: true, hasPriorConversation: false }, experiment: active, leadKey: 'non-dialable-lead-z',
            inbound: { kind: 'text', text: 'אשמח לפרטים' }, library, eventId: 'opening-event-z', yieldWhenSilent: true,
        })
        expect(fresh.eligible).toBe(true)
        expect(fresh.result.parts.length).toBeGreaterThan(0)
    })
})
