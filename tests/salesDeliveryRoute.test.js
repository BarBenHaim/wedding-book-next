import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ recordDeliveryEvent: vi.fn(), resolveProviderMessageOutboundId: vi.fn() }))

vi.mock('@/lib/salesAgent/leads', () => ({
    recordDeliveryEvent: mocks.recordDeliveryEvent,
    resolveProviderMessageOutboundId: mocks.resolveProviderMessageOutboundId,
}))

const valid = {
    eventId: 'status-route-a',
    outboundId: 'followup-hash-route:template',
    channel: 'make',
    status: 'accepted',
    providerMessageId: 'wamid-route-fixture',
    occurredAt: '2026-08-14T10:00:00.000Z',
}

let POST

function request(body, secret = 'route-secret-fixture') {
    return new Request('http://localhost/api/sales-agent/delivery', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-sales-agent-secret': secret },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    })
}

beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.SALES_AGENT_SECRET = 'route-secret-fixture'
    mocks.recordDeliveryEvent.mockResolvedValue({ action: 'applied', status: 'accepted', advanced: false })
    mocks.resolveProviderMessageOutboundId.mockResolvedValue('followup-hash-route:template')
    ;({ POST } = await import('@/app/api/sales-agent/delivery/route'))
})

describe('delivery acknowledgement route', () => {
    it('rejects an invalid shared secret before touching delivery state', async () => {
        const response = await POST(request(valid, 'wrong-secret-fixture'))

        expect(response.status).toBe(401)
        expect(await response.json()).toEqual({ error: 'UNAUTHORIZED' })
        expect(mocks.recordDeliveryEvent).not.toHaveBeenCalled()
    })

    it('returns a stable 400 for malformed JSON or invalid events', async () => {
        const malformed = await POST(request('{broken'))
        expect(malformed.status).toBe(400)
        expect(await malformed.json()).toEqual({ error: 'INVALID_INPUT' })

        const invalid = await POST(request({ ...valid, providerMessageId: undefined }))
        expect(invalid.status).toBe(400)
        expect(await invalid.json()).toEqual({ error: 'PROVIDER_MESSAGE_ID_REQUIRED' })
        expect(mocks.recordDeliveryEvent).not.toHaveBeenCalled()
    })

    it('returns 202 with the explicit idempotent transaction result', async () => {
        mocks.recordDeliveryEvent.mockResolvedValue({ action: 'noop', reason: 'DUPLICATE_STATUS' })

        const response = await POST(request(valid))

        expect(response.status).toBe(202)
        expect(await response.json()).toEqual({ accepted: true, result: { action: 'noop', reason: 'DUPLICATE_STATUS' } })
        expect(mocks.recordDeliveryEvent).toHaveBeenCalledWith(valid)
    })

    it('accepts the complete secondary-image repair event for later persistence', async () => {
        const mediaRepairEvent = {
            eventId: 'followup-image-fixture:accepted',
            outboundId: 'followup-image-fixture:image',
            channel: 'whatsapp_graph',
            status: 'accepted',
            providerMessageId: 'wamid-image-repair-fixture',
            occurredAt: '2026-08-14T10:04:00.000Z',
        }
        const response = await POST(request(mediaRepairEvent))

        expect(response.status).toBe(202)
        expect(await response.json()).toMatchObject({ accepted: true, result: { action: 'applied' } })
        expect(mocks.recordDeliveryEvent).toHaveBeenCalledWith(mediaRepairEvent)
    })

    it('correlates a provider-only Meta status without exposing business identifiers', async () => {
        const providerOnly = {
            eventId: 'meta-status-provider-only',
            channel: 'make',
            status: 'delivered',
            providerMessageId: 'wamid-provider-only-fixture',
            occurredAt: '2026-08-14T10:05:00.000Z',
        }

        const response = await POST(request(providerOnly))

        expect(response.status).toBe(202)
        expect(mocks.resolveProviderMessageOutboundId).toHaveBeenCalledWith('wamid-provider-only-fixture')
        expect(mocks.recordDeliveryEvent).toHaveBeenCalledWith({
            ...providerOnly,
            outboundId: 'followup-hash-route:template',
        })
    })

    it('returns a stable conflict for ambiguous provider correlation', async () => {
        const error = new Error('private correlation detail')
        error.code = 'PROVIDER_MESSAGE_ID_AMBIGUOUS'
        mocks.resolveProviderMessageOutboundId.mockRejectedValue(error)

        const response = await POST(request({ ...valid, outboundId: undefined, status: 'read' }))

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({ error: 'PROVIDER_MESSAGE_ID_AMBIGUOUS' })
        expect(mocks.recordDeliveryEvent).not.toHaveBeenCalled()
    })

    it('acknowledges an unknown provider-only status as an explicit private no-op', async () => {
        const error = new Error('private unknown provider correlation detail')
        error.code = 'PROVIDER_MESSAGE_ID_NOT_FOUND'
        mocks.resolveProviderMessageOutboundId.mockRejectedValue(error)
        const unknownProviderEvent = {
            eventId: 'meta-status-unknown-provider',
            channel: 'make',
            status: 'delivered',
            providerMessageId: 'non-dialable-unknown-provider-sentinel',
            occurredAt: '2026-08-15T10:05:00.000Z',
        }

        const response = await POST(request(unknownProviderEvent))
        const responseText = await response.text()

        expect(response.status).toBe(202)
        expect(JSON.parse(responseText)).toEqual({
            accepted: true,
            result: { action: 'noop', reason: 'PROVIDER_MESSAGE_ID_NOT_FOUND' },
        })
        expect(mocks.recordDeliveryEvent).not.toHaveBeenCalled()
        expect(responseText).not.toContain(unknownProviderEvent.providerMessageId)
        expect(responseText).not.toContain('private unknown provider correlation detail')
    })

    it.each([
        'PROVIDER_MESSAGE_ID_MISMATCH',
        'EVENT_ID_CONFLICT',
        'DELIVERY_STATE_REGRESSION',
    ])('keeps %s callbacks as private conflicts', async code => {
        const error = new Error('provider body and private fixture must not escape')
        error.code = code
        mocks.recordDeliveryEvent.mockRejectedValue(error)

        const response = await POST(request(valid))

        expect(response.status).toBe(409)
        const responseText = await response.text()
        expect(JSON.parse(responseText)).toEqual({ error: code })
        expect(responseText).not.toContain('provider body and private fixture must not escape')
    })

    it('normalizes unexpected persistence failures', async () => {
        mocks.recordDeliveryEvent.mockRejectedValue(new Error('secret payload fixture'))
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

        const response = await POST(request(valid))

        expect(response.status).toBe(503)
        expect(await response.json()).toEqual({ error: 'DELIVERY_UPDATE_FAILED' })
        expect(JSON.stringify(logged.mock.calls)).not.toContain('secret payload fixture')
    })
})
