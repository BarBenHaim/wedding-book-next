import { describe, expect, it } from 'vitest'
import { DEFAULT_OPENING_EXPERIMENT } from '../src/lib/salesAgent/openingExperiment'
import { prepareOpeningRuntime } from '../src/lib/salesAgent/openingRuntime'

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
