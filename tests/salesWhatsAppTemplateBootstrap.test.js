import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWhatsAppTemplateBootstrapHandler } from '@/lib/salesAgent/whatsappTemplateBootstrap'

const config = {
    secret: 'private-sales-secret-fixture',
    token: 'private-whatsapp-token-fixture',
    phoneId: 'non-dialable-phone-id-fixture',
}

const request = ({ secret = config.secret, confirm = 'ENSURE_FOLLOWUP_SITE_TEMPLATE' } = {}) => new Request(
    'https://app.example.test/api/sales-agent/template-bootstrap',
    {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(secret ? { 'x-wt-secret': secret } : {}),
        },
        body: JSON.stringify({ confirm }),
    },
)

const response = body => ({ ok: true, json: vi.fn().mockResolvedValue(body) })

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('WhatsApp follow-up template bootstrap', () => {
    it('rejects missing authentication before Meta', async () => {
        const handle = createWhatsAppTemplateBootstrapHandler({ getConfig: () => config })

        expect(await handle(request({ secret: '' }))).toEqual({ status: 401, body: { ok: false, error: 'UNAUTHORIZED' } })
        expect(fetch).not.toHaveBeenCalled()
    })

    it('requires an explicit fixed-template confirmation', async () => {
        const handle = createWhatsAppTemplateBootstrapHandler({ getConfig: () => config })

        expect(await handle(request({ confirm: 'anything-else' }))).toEqual({ status: 400, body: { ok: false, error: 'CONFIRMATION_REQUIRED' } })
        expect(fetch).not.toHaveBeenCalled()
    })

    it('fails closed when the production WhatsApp credentials are incomplete', async () => {
        const handle = createWhatsAppTemplateBootstrapHandler({ getConfig: () => ({ ...config, token: '' }) })

        expect(await handle(request())).toEqual({ status: 503, body: { ok: false, error: 'WHATSAPP_NOT_CONFIGURED' } })
        expect(fetch).not.toHaveBeenCalled()
    })

    it('returns the existing Hebrew template status without creating a duplicate', async () => {
        fetch
            .mockResolvedValueOnce(response({ whatsapp_business_account: { id: 'waba-fixture' } }))
            .mockResolvedValueOnce(response({ data: [{ name: 'wt_followup_site', language: 'he', status: 'APPROVED' }] }))
        const handle = createWhatsAppTemplateBootstrapHandler({ getConfig: () => config })

        expect(await handle(request())).toEqual({
            status: 200,
            body: { ok: true, result: 'TEMPLATE_EXISTS', templateStatus: 'APPROVED' },
        })
        expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('submits only the fixed no-media Hebrew website template when it is missing', async () => {
        fetch
            .mockResolvedValueOnce(response({ whatsapp_business_account: { id: 'waba-fixture' } }))
            .mockResolvedValueOnce(response({ data: [] }))
            .mockResolvedValueOnce(response({ id: 'template-fixture', status: 'PENDING', category: 'MARKETING' }))
        const handle = createWhatsAppTemplateBootstrapHandler({ getConfig: () => config })

        expect(await handle(request())).toEqual({
            status: 200,
            body: { ok: true, result: 'TEMPLATE_SUBMITTED', templateStatus: 'PENDING' },
        })
        expect(fetch).toHaveBeenCalledTimes(3)
        const [url, init] = fetch.mock.calls[2]
        expect(url).toBe('https://graph.facebook.com/v25.0/waba-fixture/message_templates')
        expect(init.method).toBe('POST')
        const payload = JSON.parse(init.body)
        expect(payload).toEqual({
            name: 'wt_followup_site',
            language: 'he',
            category: 'MARKETING',
            components: [
                {
                    type: 'BODY',
                    text: '{{1}}, רציתי לשלוח לך שוב דרך קצרה לראות איך ספר הברכות עובד. הסרטון והפרטים מחכים באתר: https://weddingtales.co.il',
                    example: { body_text: [['משפחה יקרה']] },
                },
                {
                    type: 'BUTTONS',
                    buttons: [{ type: 'URL', text: 'לצפייה בפרטים', url: 'https://weddingtales.co.il' }],
                },
            ],
        })
        expect(JSON.stringify(payload)).not.toContain(config.token)
        expect(JSON.stringify(payload)).not.toContain(config.phoneId)
        expect(JSON.stringify(payload)).not.toContain('HEADER')
    })

    it('normalizes provider failures to a numeric code without leaking bodies or credentials', async () => {
        fetch.mockResolvedValue({
            ok: false,
            status: 400,
            json: vi.fn().mockResolvedValue({ error: { code: 200, message: 'private provider body fixture' } }),
        })
        const handle = createWhatsAppTemplateBootstrapHandler({ getConfig: () => config })

        const result = await handle(request())

        expect(result).toEqual({ status: 502, body: { ok: false, error: 'META_REJECTED', metaCode: 200 } })
        const visible = JSON.stringify(result)
        expect(visible).not.toContain('private provider body fixture')
        expect(visible).not.toContain(config.token)
        expect(visible).not.toContain(config.phoneId)
    })
})
