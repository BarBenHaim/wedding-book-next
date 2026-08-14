import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ recordDeliveryEvent: vi.fn() }))

vi.mock('@/lib/salesAgent/leads', () => ({ recordDeliveryEvent: mocks.recordDeliveryEvent }))

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

    it('rejects a mismatched or regressive callback without leaking details', async () => {
        const error = new Error('provider body and private fixture must not escape')
        error.code = 'PROVIDER_MESSAGE_ID_MISMATCH'
        mocks.recordDeliveryEvent.mockRejectedValue(error)

        const response = await POST(request(valid))

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({ error: 'PROVIDER_MESSAGE_ID_MISMATCH' })
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
