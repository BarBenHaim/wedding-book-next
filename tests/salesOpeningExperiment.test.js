import { describe, expect, it } from 'vitest'
import {
    DEFAULT_OPENING_EXPERIMENT,
    assignOpeningVariant,
    classifyOpeningLead,
    normalizeOpeningExperiment,
    runOpeningFlow,
} from '@/lib/salesAgent/openingExperiment'

const media = {
    cover_personalised: { kind: 'image' },
    book_open_spread: { kind: 'image' },
    owner_voice: { kind: 'audio' },
}

const simpleVariant = (id, { enabled = true, weight = 1 } = {}) => ({
    id,
    label: `מסלול ${id}`,
    enabled,
    weight,
    revision: 1,
    blocks: [{ id: `${id}-stop`, type: 'stop' }],
})

const dynamicId = number => `v_${number.toString(16).padStart(12, '0')}`

describe('opening experiment contract', () => {
    it('ships three editable deterministic defaults that implement A, B and C', () => {
        expect(DEFAULT_OPENING_EXPERIMENT).toMatchObject({ enabled: false, minSamplePerVariant: 30 })
        expect(DEFAULT_OPENING_EXPERIMENT.variants.map(variant => variant.id)).toEqual(['A', 'B', 'C'])
        expect(DEFAULT_OPENING_EXPERIMENT.variants.map(variant => variant.blocks.map(block => block.type))).toEqual([
            ['text', 'ask_photo', 'generate_design', 'wait_owner_approval', 'send_approved_design', 'stop'],
            ['text', 'media', 'media', 'ask_event', 'stop'],
            ['ask_event', 'text', 'ask_photo', 'generate_design', 'wait_owner_approval', 'send_approved_design', 'stop'],
        ])
        expect(JSON.stringify(DEFAULT_OPENING_EXPERIMENT)).not.toMatch(/phone call|שיחת טלפון|נדבר בטלפון|מתי נוח לדבר/i)
    })

    it('normalizes owner edits without mutating the submitted experiment', () => {
        const input = structuredClone(DEFAULT_OPENING_EXPERIMENT)
        input.enabled = true
        input.variants[1].weight = 55
        input.variants[1].blocks.splice(3, 0, { id: 'b-voice', type: 'media', mediaKey: 'owner_voice' })

        const normalized = normalizeOpeningExperiment(input, { registeredMedia: media })

        expect(normalized.enabled).toBe(true)
        expect(normalized.variants[1]).toMatchObject({ id: 'B', weight: 55 })
        expect(normalized.variants[1].blocks[3]).toEqual({ id: 'b-voice', type: 'media', mediaKey: 'owner_voice' })
        expect(input.variants[1].blocks).toHaveLength(6)
        expect(normalized).not.toBe(input)
    })

    it('normalizes one to eight stable journeys including dynamic ids', () => {
        const variants = ['A', 'B', 'C', ...Array.from({ length: 5 }, (_, index) => dynamicId(index + 1))]
            .map(id => simpleVariant(id))

        const normalized = normalizeOpeningExperiment({
            enabled: true,
            minSamplePerVariant: 30,
            variants,
        })

        expect(normalized.variants.map(variant => variant.id)).toEqual(variants.map(variant => variant.id))
        expect(normalized.variants).toHaveLength(8)
    })

    it.each([
        ['zero journeys', []],
        ['nine journeys', Array.from({ length: 9 }, (_, index) => simpleVariant(dynamicId(index + 1)))],
        ['duplicate ids', [simpleVariant('A'), simpleVariant('A')]],
        ['malformed dynamic id', [simpleVariant('v_not-valid')]],
    ])('rejects %s', (_label, variants) => {
        expect(() => normalizeOpeningExperiment({
            enabled: true,
            minSamplePerVariant: 30,
            variants,
        })).toThrow('INVALID_OPENING_VARIANT')
    })

    it('deterministically assigns a new lead to an enabled dynamic journey', () => {
        const experiment = normalizeOpeningExperiment({
            enabled: true,
            minSamplePerVariant: 30,
            variants: [
                simpleVariant('A', { enabled: false, weight: 0 }),
                simpleVariant('v_111111111111', { weight: 100 }),
            ],
        })

        expect(assignOpeningVariant({ leadKey: 'non-dialable-dynamic-lead', experiment })).toEqual({
            variantId: 'v_111111111111',
            variantRevision: 1,
        })
    })

    it('accepts typed variable blocks and rejects ambiguous literal bindings', () => {
        const input = structuredClone(DEFAULT_OPENING_EXPERIMENT)
        input.variants[1].blocks[0] = { id: 'b-copy', type: 'text', variableKey: 'opening_copy' }
        input.variants[1].blocks[1] = { id: 'b-demo', type: 'media', variableKey: 'demo_video' }

        const normalized = normalizeOpeningExperiment(input, {
            registeredMedia: media,
            registeredVariables: ['opening_copy', 'demo_video'],
        })
        expect(normalized.variants[1].blocks.slice(0, 2)).toEqual([
            { id: 'b-copy', type: 'text', variableKey: 'opening_copy' },
            { id: 'b-demo', type: 'media', variableKey: 'demo_video' },
        ])

        input.variants[1].blocks[0].text = 'אסור גם וגם'
        expect(() => normalizeOpeningExperiment(input, {
            registeredMedia: media,
            registeredVariables: ['opening_copy', 'demo_video'],
        })).toThrow('AMBIGUOUS_OPENING_VARIABLE')
    })

    it.each([
        ['unknown block', experiment => { experiment.variants[0].blocks[0].type = 'javascript' }, 'INVALID_OPENING_BLOCK'],
        ['unregistered media', experiment => { experiment.variants[1].blocks[1].mediaKey = 'attacker-url' }, 'INVALID_OPENING_MEDIA'],
        ['duplicate block id', experiment => { experiment.variants[0].blocks[1].id = experiment.variants[0].blocks[0].id }, 'DUPLICATE_OPENING_BLOCK'],
        ['more than 20 blocks', experiment => { experiment.variants[1].blocks = [...Array.from({ length: 20 }, (_, i) => ({ id: `text-${i}`, type: 'text', text: 'x' })), { id: 'stop', type: 'stop' }] }, 'TOO_MANY_OPENING_BLOCKS'],
        ['missing terminal stop', experiment => { experiment.variants[0].blocks.pop() }, 'INVALID_OPENING_TERMINAL'],
        ['block after stop', experiment => { experiment.variants[0].blocks.push({ id: 'late', type: 'text', text: 'late' }) }, 'INVALID_OPENING_TERMINAL'],
        ['design before photo', experiment => { experiment.variants[0].blocks.splice(1, 1) }, 'INVALID_OPENING_DESIGN_ORDER'],
        ['send before approval', experiment => { experiment.variants[0].blocks.splice(3, 1) }, 'INVALID_OPENING_DESIGN_ORDER'],
        ['no executable variants', experiment => { experiment.variants.forEach(variant => { variant.enabled = false }) }, 'NO_ACTIVE_OPENING_VARIANT'],
    ])('rejects %s', (_name, mutate, code) => {
        const input = structuredClone(DEFAULT_OPENING_EXPERIMENT)
        mutate(input)
        expect(() => normalizeOpeningExperiment(input, { registeredMedia: media })).toThrow(code)
    })

    it('assigns the same lead to one enabled positive-weight variant and never to a stopped arm', () => {
        const experiment = normalizeOpeningExperiment({
            ...structuredClone(DEFAULT_OPENING_EXPERIMENT),
            enabled: true,
            variants: DEFAULT_OPENING_EXPERIMENT.variants.map(variant => ({
                ...structuredClone(variant),
                enabled: variant.id !== 'B',
                weight: variant.id === 'C' ? 80 : 20,
            })),
        }, { registeredMedia: media })

        const first = assignOpeningVariant({ leadKey: 'lead-stable-token', experiment })
        const second = assignOpeningVariant({ leadKey: 'lead-stable-token', experiment })
        expect(second).toEqual(first)
        expect(['A', 'C']).toContain(first.variantId)
        expect(first.variantRevision).toBe(experiment.variants.find(row => row.id === first.variantId).revision)
    })
})

describe('opening experiment runner', () => {
    const normalized = normalizeOpeningExperiment(DEFAULT_OPENING_EXPERIMENT, { registeredMedia: media })
    const variant = id => normalized.variants.find(row => row.id === id)

    it('runs A to the photo boundary without AI-authored text', () => {
        const result = runOpeningFlow({ flow: variant('A'), eventId: 'event-a-1', library: media })

        expect(result.action).toBe('wait_photo')
        expect(result.parts.map(part => part.kind)).toEqual(['text', 'text'])
        expect(result.parts[1].text).toContain('תמונה')
        expect(result.state).toEqual({ cursor: 2, waitingFor: 'photo' })
        expect(new Set(result.parts.map(part => part.partId)).size).toBe(2)
    })

    it('turns the awaited photo into one approval request and no customer send', () => {
        const result = runOpeningFlow({
            flow: variant('A'),
            state: { cursor: 2, waitingFor: 'photo' },
            inbound: { kind: 'image', mediaId: 'provider-media-token' },
            eventId: 'event-a-photo',
            library: media,
        })

        expect(result.action).toBe('approval_pending')
        expect(result.parts).toEqual([])
        expect(result.captures).toEqual({ childPhotoReceived: true, childPhotoMediaId: 'provider-media-token' })
        expect(result.approvalRequest).toMatchObject({ templateId: 'bar-mitzvah-v1', mediaId: 'provider-media-token' })
        expect(result.state.waitingFor).toBe('approval')
    })

    it('sends only an approved matching design and then completes', () => {
        const result = runOpeningFlow({
            flow: variant('A'),
            state: { cursor: 4, waitingFor: 'approval' },
            inbound: { kind: 'owner_approval', approvalId: 'approval-safe-token', assetKey: 'generated-safe-token' },
            eventId: 'event-a-approved',
            library: media,
        })

        expect(result.action).toBe('completed')
        expect(result.parts).toEqual([expect.objectContaining({ kind: 'approved_design', assetKey: 'generated-safe-token' })])
        expect(result.captures.designApproved).toBe(true)
        expect(result.completed).toBe(true)
    })

    it('keeps C waiting on ambiguous qualification and advances on an exact event and date', () => {
        const initial = runOpeningFlow({ flow: variant('C'), eventId: 'event-c-1', library: media })
        expect(initial).toMatchObject({ action: 'wait_event', state: { cursor: 1, waitingFor: 'event' } })

        const ambiguous = runOpeningFlow({
            flow: variant('C'), state: initial.state, inbound: { kind: 'text', text: 'כנראה מתישהו בחורף' },
            eventId: 'event-c-2', library: media,
        })
        expect(ambiguous).toMatchObject({ action: 'wait_event', captures: { qualificationNeedsReview: true } })

        const exact = runOpeningFlow({
            flow: variant('C'), state: initial.state, inbound: { kind: 'text', text: 'בר מצווה ב-15/12/2026' },
            eventId: 'event-c-3', library: media,
        })
        expect(exact.captures).toMatchObject({ eventType: 'bar_mitzvah', eventDate: '2026-12-15', qualificationNeedsReview: false })
        expect(exact).toMatchObject({ action: 'wait_photo', state: { waitingFor: 'photo' } })
    })

    it('returns stable part ids when the same claimed event is evaluated twice', () => {
        const one = runOpeningFlow({ flow: variant('B'), eventId: 'duplicate-event', library: media })
        const two = runOpeningFlow({ flow: variant('B'), eventId: 'duplicate-event', library: media })
        expect(two.parts.map(part => part.partId)).toEqual(one.parts.map(part => part.partId))
    })
})

describe('opening relevance truth', () => {
    const now = Date.UTC(2026, 7, 24)

    it.each([
        [{ childPhotoReceived: true }, { state: 'relevant', reason: 'photo_received' }],
        [{ paymentLinkSentAt: now }, { state: 'relevant', reason: 'payment_intent' }],
        [{ eventType: 'bar_mitzvah', eventDate: '2026-09-10' }, { state: 'relevant', reason: 'supported_future_event' }],
        [{ eventDate: '2026-07-01' }, { state: 'not_relevant', reason: 'event_passed' }],
        [{ disqualificationReason: 'wrong_number' }, { state: 'not_relevant', reason: 'wrong_number' }],
        [{}, { state: 'unknown', reason: 'insufficient_evidence' }],
    ])('classifies only evidence-backed relevance', (lead, expected) => {
        expect(classifyOpeningLead(lead, now)).toEqual(expected)
    })
})
