import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHistorySyncProbeHandler } from '@/lib/salesAgent/historySyncProbe'

const configured = {
    enabled: 'true',
    secret: 'private-probe-secret-fixture',
    token: 'private-existing-token-fixture',
    phoneId: 'non-dialable-phone-id-fixture',
}

function request({ secret = configured.secret, confirm = 'REQUEST_180_DAY_HISTORY' } = {}) {
    return new Request('https://app.example.test/api/sales-agent/history-sync-probe', {
        method: 'POST',
        headers: secret ? { 'x-history-probe-secret': secret, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm }),
    })
}

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('one-shot WhatsApp history sync probe', () => {
    it('stays unavailable while the production kill switch is disabled', async () => {
        const handle = createHistorySyncProbeHandler({ getConfig: () => ({ ...configured, enabled: 'false' }) })

        const result = await handle(request())

        expect(result).toEqual({ status: 404, body: { ok: false, error: 'NOT_FOUND' } })
        expect(fetch).not.toHaveBeenCalled()
    })

    it.each([
        { label: 'missing secret', options: { secret: '' } },
        { label: 'wrong secret', options: { secret: 'wrong-secret-fixture' } },
    ])('rejects an authenticated probe with $label before Graph', async ({ options }) => {
        const handle = createHistorySyncProbeHandler({ getConfig: () => configured })

        const result = await handle(request(options))

        expect(result).toEqual({ status: 401, body: { ok: false, error: 'UNAUTHORIZED' } })
        expect(fetch).not.toHaveBeenCalled()
    })

    it('requires an explicit 180-day confirmation before Graph', async () => {
        const handle = createHistorySyncProbeHandler({ getConfig: () => configured })

        const result = await handle(request({ confirm: 'anything-else' }))

        expect(result).toEqual({ status: 400, body: { ok: false, error: 'CONFIRMATION_REQUIRED' } })
        expect(fetch).not.toHaveBeenCalled()
    })

    it('fails closed when the existing Wedding WhatsApp configuration is incomplete', async () => {
        const handle = createHistorySyncProbeHandler({ getConfig: () => ({ ...configured, token: '' }) })

        const result = await handle(request())

        expect(result).toEqual({ status: 503, body: { ok: false, error: 'WHATSAPP_NOT_CONFIGURED' } })
        expect(fetch).not.toHaveBeenCalled()
    })

    it('requests history through the existing Wedding token without sending a message', async () => {
        fetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ success: true }) })
        const handle = createHistorySyncProbeHandler({ getConfig: () => configured })

        const result = await handle(request())

        expect(result).toEqual({ status: 200, body: { ok: true, result: 'HISTORY_REQUEST_ACCEPTED' } })
        expect(fetch).toHaveBeenCalledOnce()
        expect(fetch).toHaveBeenCalledWith(
            'https://graph.facebook.com/v25.0/non-dialable-phone-id-fixture/smb_app_data',
            expect.objectContaining({
                method: 'POST',
                headers: {
                    Authorization: 'Bearer private-existing-token-fixture',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: 'history' }),
            }),
        )
        expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty('to')
    })

    it('returns only the numeric Meta code from a provider rejection', async () => {
        fetch.mockResolvedValue({
            ok: false,
            status: 400,
            json: vi.fn().mockResolvedValue({
                error: { code: 135000, message: 'private provider body fixture', error_data: { details: 'private account fixture' } },
            }),
        })
        const handle = createHistorySyncProbeHandler({ getConfig: () => configured })

        const result = await handle(request())

        expect(result).toEqual({ status: 200, body: { ok: false, error: 'META_REJECTED', metaCode: 135000 } })
        const visible = JSON.stringify(result)
        expect(visible).not.toContain('private provider body fixture')
        expect(visible).not.toContain('private account fixture')
        expect(visible).not.toContain(configured.token)
        expect(visible).not.toContain(configured.phoneId)
    })

    it('normalizes timeouts and network failures without leaking provider errors', async () => {
        const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(new AbortController().signal)
        const handle = createHistorySyncProbeHandler({ getConfig: () => configured })

        fetch.mockRejectedValueOnce(new DOMException('private timeout fixture', 'TimeoutError'))
        await expect(handle(request())).resolves.toEqual({ status: 200, body: { ok: false, error: 'META_TIMEOUT' } })

        fetch.mockRejectedValueOnce(new Error('private network fixture'))
        await expect(handle(request())).resolves.toEqual({ status: 200, body: { ok: false, error: 'META_UNAVAILABLE' } })

        expect(timeout).toHaveBeenCalledTimes(2)
        expect(timeout.mock.calls[0][0]).toBeLessThan(9_000)
    })
})
