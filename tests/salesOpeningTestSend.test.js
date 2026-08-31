import { describe, expect, it, vi } from 'vitest'
import { sendOpeningVariantTest } from '../src/lib/salesAgent/openingTestSend'

const experiment = {
    enabled: false,
    variants: [{
        id: 'B', label: 'בדיקת מדיה', revision: 7, enabled: true, weight: 1,
        blocks: [{ id: 'start', type: 'text', text: 'שלום' }, { id: 'stop', type: 'stop' }],
    }],
}

const dynamicExperiment = {
    enabled: false,
    variants: [{
        ...experiment.variants[0],
        id: 'v_aaaaaaaaaaaa',
        label: 'מסלול משוכפל',
        revision: 1,
    }],
}

const resolvedParts = [
    { partId: 'p1', order: 1, kind: 'text', text: 'שלום' },
    { partId: 'p2', order: 2, kind: 'image', url: 'https://media.example/image.jpg', caption: 'תמונה' },
    { partId: 'p3', order: 3, kind: 'video', url: 'https://media.example/video.mp4', caption: 'וידאו' },
    { partId: 'p4', order: 4, kind: 'audio', url: 'https://media.example/audio.ogg', voiceNote: true },
]

function dependencies(overrides = {}) {
    const order = []
    return {
        order,
        resolveParts: vi.fn(async () => ({ parts: resolvedParts })),
        sendText: vi.fn(async () => { order.push('text'); return { accepted: true } }),
        sendImage: vi.fn(async () => { order.push('image'); return { accepted: true } }),
        sendVideo: vi.fn(async () => { order.push('video'); return { accepted: true } }),
        sendAudio: vi.fn(async () => { order.push('audio'); return { accepted: true } }),
        ...overrides,
    }
}

describe('opening mobile test send', () => {
    it('sends the selected published variant sequentially while the experiment is stopped', async () => {
        const deps = dependencies()
        const result = await sendOpeningVariantTest({
            variantId: 'B', recipient: '052-661-8184', experiment,
            variableVersions: {}, legacyLibrary: {}, signDownload: vi.fn(), dependencies: deps,
        })

        expect(result).toEqual({ ok: true, variantId: 'B', variantRevision: 7, sentParts: 4, recipientMasked: '•••8184' })
        expect(deps.order).toEqual(['text', 'image', 'video', 'audio'])
        expect(deps.sendText).toHaveBeenCalledWith('972526618184', 'שלום')
        expect(deps.sendImage).toHaveBeenCalledWith('972526618184', 'https://media.example/image.jpg', 'תמונה')
        expect(deps.sendVideo).toHaveBeenCalledWith('972526618184', 'https://media.example/video.mp4', 'וידאו')
        expect(deps.sendAudio).toHaveBeenCalledWith('972526618184', 'https://media.example/audio.ogg', true)
        expect(deps.resolveParts).toHaveBeenCalledWith(expect.objectContaining({ flow: expect.objectContaining({ id: 'B', revision: 7 }) }))
    })

    it('sends a published dynamic variant by its exact stable id', async () => {
        const deps = dependencies()

        const result = await sendOpeningVariantTest({
            variantId: 'v_aaaaaaaaaaaa',
            recipient: '052-661-8184',
            experiment: dynamicExperiment,
            dependencies: deps,
        })

        expect(result).toMatchObject({
            ok: true,
            variantId: 'v_aaaaaaaaaaaa',
            variantRevision: 1,
            sentParts: 4,
        })
        expect(deps.resolveParts).toHaveBeenCalledWith(expect.objectContaining({
            flow: expect.objectContaining({ id: 'v_aaaaaaaaaaaa', revision: 1 }),
        }))
    })

    it.each(['', '1234', '972126618184'])('fails closed for an invalid fixed test recipient', async recipient => {
        const deps = dependencies()
        await expect(sendOpeningVariantTest({ variantId: 'B', recipient, experiment, dependencies: deps })).rejects.toMatchObject({ code: 'TEST_RECIPIENT_NOT_CONFIGURED' })
        expect(deps.resolveParts).not.toHaveBeenCalled()
        expect(deps.sendText).not.toHaveBeenCalled()
    })

    it('rejects an unknown variant without sending', async () => {
        const deps = dependencies()
        await expect(sendOpeningVariantTest({ variantId: 'A', recipient: '972526618184', experiment, dependencies: deps })).rejects.toMatchObject({ code: 'TEST_VARIANT_NOT_FOUND' })
        expect(deps.resolveParts).not.toHaveBeenCalled()
    })

    it('rejects a well-formed dynamic id that is absent from the published experiment', async () => {
        const deps = dependencies()
        await expect(sendOpeningVariantTest({
            variantId: 'v_bbbbbbbbbbbb',
            recipient: '972526618184',
            experiment: dynamicExperiment,
            dependencies: deps,
        })).rejects.toMatchObject({ code: 'TEST_VARIANT_NOT_FOUND' })
        expect(deps.resolveParts).not.toHaveBeenCalled()
        expect(deps.sendText).not.toHaveBeenCalled()
    })

    it('reports a truthful partial send without exposing provider content', async () => {
        const deps = dependencies({
            sendVideo: vi.fn(async () => { throw new Error('private provider body and phone') }),
        })
        const result = await sendOpeningVariantTest({
            variantId: 'B', recipient: '972526618184', experiment, dependencies: deps,
        })

        expect(result).toEqual({ ok: false, error: 'TEST_SEND_PARTIAL', variantId: 'B', sentParts: 2, totalParts: 4, recipientMasked: '•••8184' })
        expect(JSON.stringify(result)).not.toMatch(/provider|526618184|media\.example/)
        expect(deps.sendAudio).not.toHaveBeenCalled()
    })
})
