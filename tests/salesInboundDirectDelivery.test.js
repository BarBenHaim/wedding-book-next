import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/salesAgent/leads', () => ({ recordDeliveryEvent: vi.fn() }))
vi.mock('../src/lib/salesAgent/whatsapp', () => ({
    sendWhatsAppText: vi.fn(), sendWhatsAppImage: vi.fn(), sendWhatsAppVideo: vi.fn(), sendWhatsAppAudio: vi.fn(),
}))

import { sendInboundSequenceDirect } from '../src/lib/salesAgent/inboundDirectDelivery'

const transport = (overrides = {}) => ({
    sendText: vi.fn(async () => ({ accepted: true, providerMessageId: 'provider-text' })),
    sendImage: vi.fn(async () => ({ accepted: true, providerMessageId: 'provider-image' })),
    sendVideo: vi.fn(async () => ({ accepted: true, providerMessageId: 'provider-video' })),
    sendAudio: vi.fn(async () => ({ accepted: true, providerMessageId: 'provider-audio' })),
    recordDelivery: vi.fn(async () => ({ action: 'apply' })),
    ...overrides,
})

describe('direct inbound WhatsApp delivery', () => {
    it('sends the ordered sequence and acknowledges every provider acceptance', async () => {
        const deps = transport()
        const parts = [
            { partId: 'part-text', kind: 'text', text: 'customer-visible text' },
            { partId: 'part-video', kind: 'video', url: 'https://media.test/video.mp4', caption: 'video' },
            { partId: 'part-close', kind: 'text', text: 'closing text' },
        ]

        const result = await sendInboundSequenceDirect({ phone: 'test-recipient', parts, dependencies: deps })

        expect(result).toEqual({ status: 'accepted', acceptedParts: 3, totalParts: 3, persistenceDegraded: false })
        expect(deps.sendText).toHaveBeenNthCalledWith(1, 'test-recipient', 'customer-visible text')
        expect(deps.sendVideo).toHaveBeenCalledWith('test-recipient', 'https://media.test/video.mp4', 'video')
        expect(deps.sendText).toHaveBeenNthCalledWith(2, 'test-recipient', 'closing text')
        expect(deps.recordDelivery).toHaveBeenCalledTimes(3)
        expect(deps.recordDelivery).toHaveBeenCalledWith(expect.objectContaining({
            outboundId: 'part-video', channel: 'whatsapp_graph', status: 'accepted', providerMessageId: 'provider-video',
        }))
        expect(JSON.stringify(result)).not.toMatch(/customer-visible|media\.test|test-recipient|provider-video/)
    })

    it('records a normalized terminal failure and stops before later parts', async () => {
        const error = Object.assign(new Error('private provider body'), { errorCode: 'GRAPH_REJECTED' })
        const deps = transport({ sendImage: vi.fn(async () => { throw error }) })
        const parts = [
            { partId: 'part-text', kind: 'text', text: 'first' },
            { partId: 'part-image', kind: 'image', url: 'https://media.test/image.jpg' },
            { partId: 'part-close', kind: 'text', text: 'must not send' },
        ]

        const result = await sendInboundSequenceDirect({ phone: 'test-recipient', parts, dependencies: deps })

        expect(result).toEqual({ status: 'partial', acceptedParts: 1, totalParts: 3, persistenceDegraded: false, errorCode: 'GRAPH_REJECTED' })
        expect(deps.sendText).toHaveBeenCalledTimes(1)
        expect(deps.recordDelivery).toHaveBeenLastCalledWith(expect.objectContaining({
            outboundId: 'part-image', channel: 'whatsapp_graph', status: 'failed', errorCode: 'GRAPH_REJECTED',
        }))
        expect(JSON.stringify(result)).not.toMatch(/private|provider body|test-recipient/)
    })

    it('does not resend after provider acceptance when acknowledgement persistence is degraded', async () => {
        const deps = transport({ recordDelivery: vi.fn(async () => { throw new Error('private firestore error') }) })

        const result = await sendInboundSequenceDirect({
            phone: 'test-recipient',
            parts: [{ partId: 'part-text', kind: 'text', text: 'hello' }],
            dependencies: deps,
        })

        expect(result).toEqual({ status: 'accepted', acceptedParts: 1, totalParts: 1, persistenceDegraded: true })
        expect(deps.sendText).toHaveBeenCalledTimes(1)
    })
})

describe('strict pre-send and media-failure boundary', () => {
    it('suppresses every part after newer inbound or human takeover', async () => {
        const deps = transport()
        const check = vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValue({ ok: false, reason: 'conversation-changed' })
        const result = await sendInboundSequenceDirect({ phone: 'synthetic-contact', dependencies: deps, validateBeforePart: check, parts: [
            { kind: 'text', partId: 'answer', text: 'first' }, { kind: 'image', partId: 'demo', url: 'https://example.test/demo.jpg' },
        ] })
        expect(result.status).toBe('suppressed')
        expect(deps.sendText).toHaveBeenCalledTimes(1)
        expect(deps.sendImage).not.toHaveBeenCalled()
    })
    it('retries approved media once only after a definite rejection', async () => {
        const deps = transport({ sendImage: vi.fn().mockRejectedValueOnce(Object.assign(new Error('synthetic'), { errorCode: 'GRAPH_REJECTED', providerCode: 131053 })).mockResolvedValue({ providerMessageId: 'synthetic-accepted' }) })
        const result = await sendInboundSequenceDirect({ phone: 'synthetic-contact', dependencies: deps, allowMediaRetry: true, parts: [{ kind: 'image', partId: 'demo', url: 'https://example.test/demo.jpg' }] })
        expect(result.status).toBe('accepted')
        expect(deps.sendImage).toHaveBeenCalledTimes(2)
        expect(deps.recordDelivery).toHaveBeenCalledTimes(1)
    })
    it('does not retry uncertain acceptance and registers a distinct truthful text fallback', async () => {
        const deps = transport({ sendImage: vi.fn().mockRejectedValue(Object.assign(new Error('synthetic'), { errorCode: 'GRAPH_TIMEOUT' })) })
        const fallback = vi.fn(async () => ({ part: { kind: 'text', partId: 'separate-fallback', text: 'Delivery is unconfirmed.' } }))
        const result = await sendInboundSequenceDirect({ phone: 'synthetic-contact', dependencies: deps, allowMediaRetry: true, onMediaFailure: fallback, parts: [{ kind: 'image', partId: 'demo', url: 'https://example.test/demo.jpg' }] })
        expect(deps.sendImage).toHaveBeenCalledTimes(1)
        expect(fallback).toHaveBeenCalledTimes(1)
        expect(result.fallbackStatus).toBe('accepted')
        expect(deps.recordDelivery).toHaveBeenNthCalledWith(1, expect.objectContaining({ outboundId: 'demo', status: 'failed' }))
        expect(deps.recordDelivery).toHaveBeenNthCalledWith(2, expect.objectContaining({ outboundId: 'separate-fallback', status: 'accepted' }))
    })
})
