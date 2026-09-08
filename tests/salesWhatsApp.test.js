import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    DAILY_DIGEST_TEMPLATE,
    FOLLOWUP_CLOSE_TEMPLATE,
    FOLLOWUP_HELP_TEMPLATE,
    FOLLOWUP_OFFER_TEMPLATE,
    FOLLOWUP_SITE_TEMPLATE,
    sendWhatsAppAudio,
    sendWhatsAppImage,
    sendWhatsAppTemplate,
    sendWhatsAppText,
    sendWhatsAppVideo,
} from '@/lib/salesAgent/whatsapp'

const providerBody = {
    messaging_product: 'whatsapp',
    contacts: [{ input: 'private-provider-contact-fixture', wa_id: 'private-provider-id-fixture' }],
    messages: [{ id: 'wamid-evidence-fixture' }],
}

beforeEach(() => {
    process.env.WHATSAPP_TOKEN = 'private-token-fixture'
    process.env.WHATSAPP_PHONE_ID = 'private-phone-id-fixture'
    vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('direct WhatsApp Graph evidence', () => {
    it('returns accepted only when messages[0].id exists and parses no contact evidence', async () => {
        fetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(providerBody) })

        await expect(sendWhatsAppText('non-dialable-recipient-fixture', 'hello fixture')).resolves.toEqual({
            accepted: true,
            providerMessageId: 'wamid-evidence-fixture',
        })
    })

    it('normalizes a success response with missing provider evidence as failure', async () => {
        fetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ messages: [] }) })

        await expect(sendWhatsAppText('non-dialable-recipient-fixture', 'hello fixture')).rejects.toMatchObject({
            message: 'whatsapp graph send failed',
            errorCode: 'PROVIDER_MESSAGE_ID_MISSING',
        })
    })

    it('caps request time below the route budget and normalizes timeouts', async () => {
        const timeoutSignal = new AbortController().signal
        const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutSignal)
        fetch.mockRejectedValue(new DOMException('private timeout payload fixture', 'TimeoutError'))

        await expect(sendWhatsAppText('non-dialable-recipient-fixture', 'hello fixture')).rejects.toMatchObject({
            message: 'whatsapp graph send failed',
            errorCode: 'GRAPH_TIMEOUT',
        })
        expect(timeout).toHaveBeenCalledOnce()
        expect(timeout.mock.calls[0][0]).toBeLessThan(15_000)
    })

    it('normalizes Graph rejection without leaking provider body, recipient, token, or payload', async () => {
        fetch.mockResolvedValue({
            ok: false,
            status: 400,
            json: vi.fn().mockResolvedValue({
                error: {
                    code: 132001,
                    error_subcode: 2494002,
                    message: 'private provider body fixture',
                },
            }),
        })
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        let caught
        try {
            await sendWhatsAppText('non-dialable-recipient-fixture', 'private transcript fixture')
        } catch (error) {
            caught = error
        }

        expect(caught).toMatchObject({
            message: 'whatsapp graph send failed',
            errorCode: 'GRAPH_REJECTED',
            providerCode: 132001,
            providerSubcode: 2494002,
        })
        expect(warn).toHaveBeenCalledWith('[sales-agent/whatsapp] graph rejected', {
            providerCode: 132001,
            providerSubcode: 2494002,
        })
        const visible = `${caught.message} ${caught.stack} ${JSON.stringify(warn.mock.calls)}`
        expect(visible).not.toContain('private provider body fixture')
        expect(visible).not.toContain('non-dialable-recipient-fixture')
        expect(visible).not.toContain('private-token-fixture')
        expect(visible).not.toContain('private transcript fixture')
    })

    it('sends image, video, and audio test parts with exact allowlisted Graph shapes', async () => {
        fetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(providerBody) })

        await sendWhatsAppImage('non-dialable-recipient-fixture', 'https://media.example/image.jpg', 'image caption')
        await sendWhatsAppVideo('non-dialable-recipient-fixture', 'https://media.example/video.mp4', 'video caption')
        await sendWhatsAppAudio('non-dialable-recipient-fixture', 'https://media.example/audio.ogg', true)

        expect(fetch.mock.calls.map(([, init]) => JSON.parse(init.body))).toEqual([
            { messaging_product: 'whatsapp', to: 'non-dialable-recipient-fixture', type: 'image', image: { link: 'https://media.example/image.jpg', caption: 'image caption' } },
            { messaging_product: 'whatsapp', to: 'non-dialable-recipient-fixture', type: 'video', video: { link: 'https://media.example/video.mp4', caption: 'video caption' } },
            { messaging_product: 'whatsapp', to: 'non-dialable-recipient-fixture', type: 'audio', audio: { link: 'https://media.example/audio.ogg' } },
        ])
    })
})

describe('approved WhatsApp templates', () => {
    it('sends every approved follow-up template with its exact body parameter count', async () => {
        fetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(providerBody) })

        const approved = [
            [FOLLOWUP_SITE_TEMPLATE, ['משפחה יקרה']],
            [FOLLOWUP_HELP_TEMPLATE, ['משפחה יקרה']],
            [FOLLOWUP_OFFER_TEMPLATE, ['משפחה יקרה', 'BACK48', '10.9.2026']],
            [FOLLOWUP_CLOSE_TEMPLATE, ['משפחה יקרה']],
        ]
        for (const [name, parameters] of approved) {
            await expect(sendWhatsAppTemplate('non-dialable-recipient-fixture', name, parameters))
                .resolves.toEqual({ accepted: true, providerMessageId: 'wamid-evidence-fixture' })
        }

        expect(fetch.mock.calls.map(([, init]) => {
            const payload = JSON.parse(init.body)
            return [payload.template.name, payload.template.components[0].parameters.map(row => row.text)]
        })).toEqual(approved)
    })

    it('rejects the wrong parameter count for every follow-up template before Graph', async () => {
        await expect(sendWhatsAppTemplate('non-dialable-recipient-fixture', FOLLOWUP_SITE_TEMPLATE, []))
            .rejects.toMatchObject({ errorCode: 'TEMPLATE_NOT_CONFIGURED' })
        await expect(sendWhatsAppTemplate('non-dialable-recipient-fixture', FOLLOWUP_HELP_TEMPLATE, ['one', 'two']))
            .rejects.toMatchObject({ errorCode: 'TEMPLATE_NOT_CONFIGURED' })
        await expect(sendWhatsAppTemplate('non-dialable-recipient-fixture', FOLLOWUP_OFFER_TEMPLATE, ['one']))
            .rejects.toMatchObject({ errorCode: 'TEMPLATE_NOT_CONFIGURED' })
        await expect(sendWhatsAppTemplate('non-dialable-recipient-fixture', FOLLOWUP_CLOSE_TEMPLATE, []))
            .rejects.toMatchObject({ errorCode: 'TEMPLATE_NOT_CONFIGURED' })
        expect(fetch).not.toHaveBeenCalled()
    })

    it('allows only the site follow-up template to carry the approved video header', async () => {
        fetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(providerBody) })

        await sendWhatsAppTemplate(
            'non-dialable-recipient-fixture',
            FOLLOWUP_SITE_TEMPLATE,
            ['משפחה יקרה'],
            { headerVideoUrl: 'https://media.example/product.mp4' },
        )

        const payload = JSON.parse(fetch.mock.calls[0][1].body)
        expect(payload.template.components).toEqual([
            { type: 'header', parameters: [{ type: 'video', video: { link: 'https://media.example/product.mp4' } }] },
            { type: 'body', parameters: [{ type: 'text', text: 'משפחה יקרה' }] },
        ])

        await expect(sendWhatsAppTemplate(
            'non-dialable-recipient-fixture',
            FOLLOWUP_HELP_TEMPLATE,
            ['משפחה יקרה'],
            { headerVideoUrl: 'https://media.example/product.mp4' },
        )).rejects.toMatchObject({ errorCode: 'TEMPLATE_NOT_CONFIGURED' })
        expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('sends wt_daily_digest with exactly four safe body parameters', async () => {
        fetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(providerBody) })
        const lines = ['line one', 'line two', 'line three', 'line four']

        await sendWhatsAppTemplate('non-dialable-owner-fixture', DAILY_DIGEST_TEMPLATE, lines)

        const payload = JSON.parse(fetch.mock.calls[0][1].body)
        expect(payload.template.name).toBe('wt_daily_digest')
        expect(payload.template.components[0].parameters.map(parameter => parameter.text)).toEqual(lines)
    })

    it('rejects missing or unapproved template configuration without a free-form fallback', async () => {
        await expect(sendWhatsAppTemplate('non-dialable-recipient-fixture', '', ['fixture']))
            .rejects.toMatchObject({ errorCode: 'TEMPLATE_NOT_CONFIGURED' })
        await expect(sendWhatsAppTemplate('non-dialable-recipient-fixture', 'unapproved_template', ['fixture']))
            .rejects.toMatchObject({ errorCode: 'TEMPLATE_NOT_CONFIGURED' })
        expect(fetch).not.toHaveBeenCalled()
    })
})
