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
    it('enrolls only a genuinely new conversation and pins its executable revision', () => {
        const runtime = prepareOpeningRuntime({
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

    it.each([
        ['existing lead', { isNew: false }],
        ['historical conversation', { isNew: true, hasPriorConversation: true }],
    ])('does not enroll an %s', (_label, lead) => {
        expect(prepareOpeningRuntime({
            lead,
            experiment: active,
            leadKey: 'non-dialable-lead-b',
            inbound: { kind: 'text', text: 'שלום' },
            library,
            eventId: 'opening-event-b',
        })).toEqual({ eligible: false, reason: 'not-enrolled' })
    })

    it('continues a pinned photo wait without reassigning or restarting the opening', () => {
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

        const runtime = prepareOpeningRuntime({
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

    it('fails closed when the experiment or the pinned arm is stopped', () => {
        const pinned = {
            isNew: false,
            openingVariantId: 'B',
            openingVariantRevision: 1,
            openingFlow: active.variants.find(item => item.id === 'B'),
            openingState: { cursor: 4, waitingFor: 'event' },
            openingStateVersion: 2,
        }
        expect(prepareOpeningRuntime({ ...{
            lead: pinned, leadKey: 'non-dialable-lead-d', inbound: { kind: 'text', text: 'בר מצווה 12/12/2026' },
            library, eventId: 'opening-event-d',
        }, experiment: { ...active, enabled: false } })).toEqual({ eligible: false, reason: 'experiment-stopped' })

        const armStopped = {
            ...active,
            variants: active.variants.map(item => item.id === 'B' ? { ...item, enabled: false, weight: 0 } : item),
        }
        expect(prepareOpeningRuntime({
            lead: pinned, experiment: armStopped, leadKey: 'non-dialable-lead-d',
            inbound: { kind: 'text', text: 'בר מצווה 12/12/2026' }, library, eventId: 'opening-event-d',
        })).toEqual({ eligible: false, reason: 'variant-stopped' })
    })

    it('keeps ambiguous event details waiting and never invents qualification', () => {
        const flow = active.variants.find(item => item.id === 'C')
        const runtime = prepareOpeningRuntime({
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
