import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    verifyIdToken: vi.fn(),
    isSuperAdmin: vi.fn(),
    buildFollowUpPrompt: vi.fn(),
    addDaysISO: vi.fn(),
    callClaude: vi.fn(),
    parseAgentJson: vi.fn(),
    resolveFollowUp: vi.fn(),
    dueFollowUps: vi.fn(),
    prepareFollowUpDelivery: vi.fn(),
    recordDeliveryEvent: vi.fn(),
    listLeads: vi.fn(),
    reviveOrphans: vi.fn(),
    listMedia: vi.fn(),
    recordMediaSent: vi.fn(),
    recordFollowUpRun: vi.fn(),
    sendableNow: vi.fn(),
    isFinalAttempt: vi.fn(),
    mergeMedia: vi.fn(),
    performanceNote: vi.fn(),
    findOrphans: vi.fn(),
    findStaleHandoffs: vi.fn(),
    handoffAlert: vi.fn(),
    canSendWhatsApp: vi.fn(),
    sendWhatsAppText: vi.fn(),
    sendWhatsAppImage: vi.fn(),
    sendWhatsAppVideo: vi.fn(),
    sendWhatsAppTemplate: vi.fn(),
    createOutboundId: vi.fn(),
    readSalesSettings: vi.fn(),
}))

vi.mock('@/lib/firebaseAdmin', () => ({ adminAuth: { verifyIdToken: mocks.verifyIdToken } }))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: mocks.isSuperAdmin }))
vi.mock('@/lib/salesAgent/prompt', () => ({ buildFollowUpPrompt: mocks.buildFollowUpPrompt, addDaysISO: mocks.addDaysISO }))
vi.mock('@/lib/salesAgent/agent', () => ({ callClaude: mocks.callClaude, parseAgentJson: mocks.parseAgentJson, resolveFollowUp: mocks.resolveFollowUp }))
vi.mock('@/lib/salesAgent/leads', () => ({
    dueFollowUps: mocks.dueFollowUps,
    prepareFollowUpDelivery: mocks.prepareFollowUpDelivery,
    recordDeliveryEvent: mocks.recordDeliveryEvent,
    listLeads: mocks.listLeads, reviveOrphans: mocks.reviveOrphans,
    listMedia: mocks.listMedia, recordMediaSent: mocks.recordMediaSent,
    recordFollowUpRun: mocks.recordFollowUpRun,
}))
vi.mock('@/lib/salesAgent/followupPolicy', async importOriginal => ({
    ...(await importOriginal()),
    sendableNow: mocks.sendableNow,
    MAX_PER_RUN: 25,
    isFinalAttempt: mocks.isFinalAttempt,
}))
vi.mock('@/lib/salesAgent/catalog', () => ({ MEDIA: {} }))
vi.mock('@/lib/salesAgent/mediaLibrary', () => ({ mergeMedia: mocks.mergeMedia, performanceNote: mocks.performanceNote }))
vi.mock('@/lib/salesAgent/sweep', () => ({ findOrphans: mocks.findOrphans, findStaleHandoffs: mocks.findStaleHandoffs, handoffAlert: mocks.handoffAlert }))
vi.mock('@/lib/salesAgent/whatsapp', () => ({
    canSendWhatsApp: mocks.canSendWhatsApp,
    sendWhatsAppText: mocks.sendWhatsAppText,
    sendWhatsAppImage: mocks.sendWhatsAppImage,
    sendWhatsAppVideo: mocks.sendWhatsAppVideo,
    sendWhatsAppTemplate: mocks.sendWhatsAppTemplate,
    FOLLOWUP_TEMPLATE: 'wt_followup',
}))
vi.mock('@/lib/salesAgent/delivery', () => ({
    createOutboundId: mocks.createOutboundId,
}))
vi.mock('@/lib/salesAgent/settingsStore', () => ({ readSalesSettings: mocks.readSalesSettings }))

const lead = {
    phone: 'private-phone-sentinel',
    name: 'Test lead',
    turns: [],
    stage: 'engaged',
    followUpCount: 0,
    lastInboundAt: 0,
}

let GET

async function runCron(query = '') {
    const response = await GET(new Request(`http://localhost/api/sales-agent/followups${query}`, {
        headers: { authorization: 'Bearer cron-test-secret' },
    }))
    return { status: response.status, body: await response.json() }
}

async function runMake() {
    const response = await GET(new Request('http://localhost/api/sales-agent/followups', {
        headers: { 'x-wt-secret': 'shared-secret-fixture' },
    }))
    return { status: response.status, body: await response.json() }
}

beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'cron-test-secret'
    process.env.SALES_AGENT_SECRET = 'shared-secret-fixture'
    process.env.SALES_AGENT_OWNER_PHONE = 'non-dialable-owner-fixture'
    process.env.SALES_FOLLOWUP_TEMPLATE_ENABLED = 'true'
    delete process.env.SALES_FOLLOWUP_COUPON_CODE
    delete process.env.SALES_FOLLOWUP_COUPON_EXPIRES_AT
    mocks.sendableNow.mockReturnValue({ ok: true })
    mocks.canSendWhatsApp.mockReturnValue(true)
    mocks.listLeads.mockResolvedValue([])
    mocks.findOrphans.mockReturnValue([])
    mocks.findStaleHandoffs.mockReturnValue([])
    mocks.handoffAlert.mockReturnValue(null)
    mocks.dueFollowUps.mockResolvedValue([lead])
    mocks.listMedia.mockResolvedValue([])
    mocks.mergeMedia.mockReturnValue({})
    mocks.performanceNote.mockReturnValue(null)
    mocks.isFinalAttempt.mockReturnValue(false)
    mocks.buildFollowUpPrompt.mockReturnValue('system')
    mocks.callClaude.mockResolvedValue({ text: 'valid' })
    mocks.parseAgentJson.mockReturnValue({
        malformed: false, handoff: false, messages: ['follow-up'], stage: 'engaged', image: null,
        callbackPromised: null, followUpAt: null,
    })
    mocks.resolveFollowUp.mockReturnValue(null)
    mocks.createOutboundId.mockImplementation(({ part }) => `outbound-fixture:${part}`)
    mocks.prepareFollowUpDelivery.mockResolvedValue({ action: 'requested' })
    mocks.sendWhatsAppText.mockResolvedValue({ accepted: true, providerMessageId: 'wamid-text-fixture' })
    mocks.sendWhatsAppImage.mockResolvedValue({ accepted: true, providerMessageId: 'wamid-image-fixture' })
    mocks.sendWhatsAppVideo.mockResolvedValue({ accepted: true, providerMessageId: 'wamid-video-fixture' })
    mocks.sendWhatsAppTemplate.mockResolvedValue({ accepted: true, providerMessageId: 'wamid-template-fixture' })
    mocks.recordDeliveryEvent.mockResolvedValue({ action: 'applied', status: 'accepted', advanced: false })
    mocks.readSalesSettings.mockResolvedValue({ enabled: true, mode: 'full_conversation' })
    ;({ GET } = await import('@/app/api/sales-agent/followups/route'))
})

describe('opening-only mode', () => {
    it('registers the live media library before resolving settings used by a published opening experiment', async () => {
        mocks.listMedia.mockResolvedValue([{ key: 'published-video', kind: 'video' }])
        mocks.mergeMedia.mockReturnValue({
            'published-video': { kind: 'video', url: 'https://cdn.example/video.mp4' },
        })

        const result = await runCron()

        expect(result.status).toBe(200)
        expect(mocks.readSalesSettings).toHaveBeenCalledWith({ registeredMediaKeys: ['published-video'] })
        expect(mocks.listMedia).toHaveBeenCalledTimes(1)
    })

    it('processes scheduled follow-ups while live conversation continuation stays opening-only', async () => {
        mocks.readSalesSettings.mockResolvedValue({ enabled: true, mode: 'opening_only' })

        const result = await runCron()

        expect(result).toMatchObject({
            status: 200,
            body: {
                ok: true,
                delivery: 'direct',
                count: 1,
                items: [expect.objectContaining({
                    outboundId: 'outbound-fixture:template',
                    deliveryStatus: 'accepted',
                })],
            },
        })
        expect(mocks.dueFollowUps).toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expect(mocks.sendWhatsAppText).not.toHaveBeenCalled()
        expect(mocks.sendWhatsAppTemplate).toHaveBeenCalledWith(lead.phone, 'wt_followup', [
            'Test lead, רציתי לשלוח לך שוב דרך קצרה לראות איך ספר הברכות עובד. הסרטון והפרטים מחכים באתר: https://weddingtales.co.il',
        ])
    })

    it('fails closed before customer work when the mode cannot be read', async () => {
        mocks.readSalesSettings.mockRejectedValue(new Error('private-settings-error'))

        const result = await runCron()

        expect(result).toEqual({ status: 503, body: { error: 'SETTINGS_READ_FAILED' } })
        expect(mocks.dueFollowUps).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expect(mocks.sendWhatsAppText).not.toHaveBeenCalled()
        expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled()
    })
})

describe('follow-up failure privacy', () => {
    it('does not expose a lead phone or provider error body when direct send fails', async () => {
        const providerError = new Error('provider-body-sentinel secret-token-sentinel')
        providerError.errorCode = 'GRAPH_REJECTED'
        mocks.sendWhatsAppTemplate.mockRejectedValue(providerError)
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const result = await runCron()
        const captured = JSON.stringify(warn.mock.calls)
        const returned = JSON.stringify(result.body)

        expect(result.status).toBe(200)
        expect(captured).not.toContain('private-phone-sentinel')
        expect(captured).not.toContain('provider-body-sentinel')
        expect(captured).not.toContain('secret-token-sentinel')
        expect(returned).not.toContain('provider-body-sentinel')
        expect(returned).not.toContain('secret-token-sentinel')
        expect(result.body.items[0].sendError).toBe('GRAPH_REJECTED')
    })

    it('does not expose a lead phone or arbitrary model error when composing a lead fails', async () => {
        mocks.dueFollowUps.mockResolvedValue([{ ...lead, lastInboundAt: Date.now() }])
        mocks.callClaude.mockRejectedValue(new Error('model-body-sentinel transcript-sentinel'))
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})

        const result = await runCron()
        const captured = JSON.stringify(error.mock.calls)

        expect(result.status).toBe(200)
        expect(captured).not.toContain('private-phone-sentinel')
        expect(captured).not.toContain('model-body-sentinel')
        expect(captured).not.toContain('transcript-sentinel')
        expect(result.body.items).toEqual([])
    })
})

describe('truthful follow-up transport', () => {
    it('fails closed outside 24 hours without explicit template opt-in and reports only a safe blocked aggregate', async () => {
        delete process.env.SALES_FOLLOWUP_TEMPLATE_ENABLED

        const result = await runCron()

        expect(result.status).toBe(200)
        expect(result.body).toMatchObject({
            count: 0,
            items: [],
            templateDelivery: { status: 'blocked', blockedCount: 1 },
        })
        expect(JSON.stringify(result.body)).not.toContain(lead.phone)
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expect(mocks.prepareFollowUpDelivery).not.toHaveBeenCalled()
        expect(mocks.recordDeliveryEvent).not.toHaveBeenCalled()
        expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled()
        expect(mocks.sendWhatsAppText).not.toHaveBeenCalled()
    })

    it('keeps an in-window follow-up sendable when template delivery is disabled', async () => {
        delete process.env.SALES_FOLLOWUP_TEMPLATE_ENABLED
        mocks.dueFollowUps.mockResolvedValue([{ ...lead, lastInboundAt: Date.now() }])

        const result = await runCron()

        expect(result.body).toMatchObject({
            count: 1,
            templateDelivery: { status: 'disabled', blockedCount: 0 },
        })
        expect(mocks.sendWhatsAppText).toHaveBeenCalledWith(lead.phone, 'follow-up')
        expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled()
    })

    it('parses an ISO lastInboundAt with the same in-window decision as queue ranking', async () => {
        delete process.env.SALES_FOLLOWUP_TEMPLATE_ENABLED
        mocks.dueFollowUps.mockResolvedValue([{
            ...lead,
            lastInboundAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
        }])

        const result = await runCron()

        expect(result.body).toMatchObject({
            count: 1,
            templateDelivery: { status: 'disabled', blockedCount: 0 },
        })
        expect(mocks.sendWhatsAppText).toHaveBeenCalledWith(lead.phone, 'follow-up')
        expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled()
    })

    it('does not trust a recent outbound timestamp when no customer inbound proves an open window', async () => {
        delete process.env.SALES_FOLLOWUP_TEMPLATE_ENABLED
        mocks.dueFollowUps.mockResolvedValue([{
            ...lead,
            lastInboundAt: null,
            lastMessageAt: new Date(Date.now() - 3600_000).toISOString(),
            updatedAt: Date.now(),
        }])

        const result = await runCron()

        expect(result.body).toMatchObject({
            count: 0,
            items: [],
            templateDelivery: { status: 'blocked', blockedCount: 1 },
        })
        expect(mocks.sendWhatsAppText).not.toHaveBeenCalled()
        expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled()
    })

    it('does not revive or identify an outside-window orphan while templates are disabled', async () => {
        delete process.env.SALES_FOLLOWUP_TEMPLATE_ENABLED
        mocks.listLeads.mockResolvedValue([{ ...lead, followUpAt: null }])
        mocks.findOrphans.mockReturnValue([{ ...lead, followUpAt: null }])
        mocks.dueFollowUps.mockResolvedValue([])

        const result = await runCron()

        expect(result.body).toMatchObject({
            count: 0,
            items: [],
            recovered: 0,
            recoveredLeads: [],
            templateDelivery: { status: 'blocked', blockedCount: 1 },
        })
        expect(JSON.stringify(result.body)).not.toContain(lead.phone)
        expect(mocks.reviveOrphans).not.toHaveBeenCalled()
        expect(mocks.prepareFollowUpDelivery).not.toHaveBeenCalled()
        expect(mocks.recordDeliveryEvent).not.toHaveBeenCalled()
    })

    it('uses only the planned approved template outside the service window and records provider acceptance as pending', async () => {
        mocks.parseAgentJson.mockReturnValue({
            malformed: false, handoff: false, messages: ['follow-up'], stage: 'engaged', image: 'book',
            callbackPromised: null, followUpAt: null,
        })
        mocks.mergeMedia.mockReturnValue({ book: { kind: 'image', url: 'https://cdn.example/book.jpg', caption: 'book fixture' } })
        const result = await runCron()

        expect(result.status).toBe(200)
        expect(mocks.sendWhatsAppTemplate).toHaveBeenCalledWith(lead.phone, 'wt_followup', [
            'Test lead, רציתי לשלוח לך שוב דרך קצרה לראות איך ספר הברכות עובד. הסרטון והפרטים מחכים באתר: https://weddingtales.co.il',
        ])
        expect(mocks.sendWhatsAppText).not.toHaveBeenCalled()
        expect(mocks.sendWhatsAppImage).not.toHaveBeenCalled()
        expect(mocks.prepareFollowUpDelivery).toHaveBeenCalledWith(expect.objectContaining({
            phone: lead.phone,
            outboundId: 'outbound-fixture:template',
            channel: 'whatsapp_graph',
            part: 'template',
            templateName: 'wt_followup',
            advancesFollowUp: true,
        }))
        expect(mocks.recordDeliveryEvent).toHaveBeenCalledWith(expect.objectContaining({
            outboundId: 'outbound-fixture:template',
            status: 'accepted',
            providerMessageId: 'wamid-template-fixture',
        }))
        expect(mocks.recordMediaSent).not.toHaveBeenCalled()
        expect(result.body.items[0]).toMatchObject({
            outboundId: 'outbound-fixture:template',
            deliveryStatus: 'accepted',
            hasImage: false,
            sendImage: null,
        })
    })

    it('uses the approved no-media template outside the service window even when a product video exists', async () => {
        mocks.mergeMedia.mockReturnValue({
            product_video: { kind: 'video', url: 'https://cdn.example/product.mp4', caption: 'כך זה עובד' },
        })

        const result = await runCron()

        expect(mocks.sendWhatsAppTemplate).toHaveBeenCalledWith(
            lead.phone,
            'wt_followup',
            ['Test lead, רציתי לשלוח לך שוב דרך קצרה לראות איך ספר הברכות עובד. הסרטון והפרטים מחכים באתר: https://weddingtales.co.il'],
        )
        expect(mocks.sendWhatsAppVideo).not.toHaveBeenCalled()
        expect(mocks.prepareFollowUpDelivery).toHaveBeenCalledWith(expect.objectContaining({
            part: 'template',
            advancesFollowUp: true,
            demoEvidence: false,
            followUpMediaKind: 'none',
        }))
        expect(result.body.items[0]).toMatchObject({
            strategyId: 'proof_site',
            hasVideo: false,
            sendVideo: null,
            templateHeaderVideo: null,
        })
    })

    it('uses free-form text inside an open service window and gives media its own phone-free outbound ID', async () => {
        mocks.dueFollowUps.mockResolvedValue([{ ...lead, lastInboundAt: Date.now() }])
        mocks.parseAgentJson.mockReturnValue({
            malformed: false, handoff: false, messages: ['follow-up'], stage: 'engaged', image: 'book',
            callbackPromised: null, followUpAt: null,
        })
        mocks.mergeMedia.mockReturnValue({ book: { kind: 'image', url: 'https://cdn.example/book.jpg', caption: 'book fixture' } })

        const result = await runCron()

        expect(mocks.sendWhatsAppText).toHaveBeenCalledWith(lead.phone, 'follow-up')
        expect(mocks.sendWhatsAppImage).toHaveBeenCalledWith(lead.phone, 'https://cdn.example/book.jpg', 'book fixture')
        expect(mocks.prepareFollowUpDelivery).toHaveBeenCalledWith(expect.objectContaining({
            part: 'text', advancesFollowUp: true, demoEvidence: false,
        }))
        expect(mocks.prepareFollowUpDelivery).toHaveBeenCalledWith(expect.objectContaining({
            part: 'image', advancesFollowUp: false, demoEvidence: true,
        }))
        const preparedParts = mocks.prepareFollowUpDelivery.mock.calls.map(([delivery]) => delivery)
        expect(preparedParts[0].logicalAttemptId).toBe('outbound-fixture:logical')
        expect(preparedParts[1].logicalAttemptId).toBe(preparedParts[0].logicalAttemptId)
        expect(result.body.items[0].outboundParts).toEqual({
            text: 'outbound-fixture:text',
            image: 'outbound-fixture:image',
        })
        expect(mocks.recordMediaSent).not.toHaveBeenCalled()
    })

    it('uses one unsent product video on the first in-window follow-up and keeps it secondary', async () => {
        mocks.dueFollowUps.mockResolvedValue([{ ...lead, lastInboundAt: Date.now() }])
        mocks.mergeMedia.mockReturnValue({
            product_video: { kind: 'video', url: 'https://cdn.example/product.mp4', caption: 'כך זה עובד' },
        })

        const result = await runCron()

        expect(mocks.sendWhatsAppText).toHaveBeenCalledWith(lead.phone, 'follow-up')
        expect(mocks.sendWhatsAppVideo).toHaveBeenCalledWith(lead.phone, 'https://cdn.example/product.mp4', 'כך זה עובד')
        expect(mocks.prepareFollowUpDelivery).toHaveBeenCalledWith(expect.objectContaining({
            part: 'video', advancesFollowUp: false, followUpMediaKind: 'video',
        }))
        expect(result.body.items[0]).toMatchObject({
            strategyId: 'proof_site',
            hasVideo: true,
            sendVideo: 'https://cdn.example/product.mp4',
            mediaDeliveryStatus: 'accepted',
        })
    })

    it('does not repeat a product video already recorded on the lead', async () => {
        mocks.dueFollowUps.mockResolvedValue([{ ...lead, lastInboundAt: Date.now(), mediaSent: ['product_video'] }])
        mocks.mergeMedia.mockReturnValue({
            product_video: { kind: 'video', url: 'https://cdn.example/product.mp4', caption: 'כך זה עובד' },
        })

        const result = await runCron()

        expect(mocks.sendWhatsAppVideo).not.toHaveBeenCalled()
        expect(result.body.items[0]).toMatchObject({ strategyId: 'proof_site', hasVideo: false })
    })

    it('uses the blocker template on the second outside-window follow-up', async () => {
        mocks.dueFollowUps.mockResolvedValue([{ ...lead, stage: 'ready_to_pay', followUpCount: 1 }])

        const result = await runCron()

        expect(mocks.sendWhatsAppTemplate).toHaveBeenCalledWith(lead.phone, 'wt_followup', [
            'Test lead, רציתי לבדוק אם עצרה אתכם שאלה על החבילה, תקלה בתשלום או פשוט התזמון. אפשר לענות לי כאן במשפט אחד.',
        ])
        expect(result.body.items[0]).toMatchObject({ strategyId: 'resolve_blocker', templateName: 'wt_followup' })
    })

    it('uses a configured 48-hour offer only for a high-intent final follow-up', async () => {
        process.env.SALES_FOLLOWUP_COUPON_CODE = 'BACK48'
        process.env.SALES_FOLLOWUP_COUPON_EXPIRES_AT = new Date(Date.now() + 36 * 3600 * 1000).toISOString()
        mocks.dueFollowUps.mockResolvedValue([{ ...lead, stage: 'offer_sent', followUpCount: 2 }])
        mocks.isFinalAttempt.mockReturnValue(true)

        const result = await runCron()

        expect(mocks.sendWhatsAppTemplate).toHaveBeenCalledWith(
            lead.phone,
            'wt_followup',
            [expect.stringContaining('BACK48')],
        )
        expect(result.body.items[0]).toMatchObject({ strategyId: 'qualified_offer', templateName: 'wt_followup' })
    })

    it('records normalized template rejection as failed and leaves the item unaccepted', async () => {
        const error = new Error('private graph rejection fixture')
        error.errorCode = 'GRAPH_REJECTED'
        mocks.sendWhatsAppTemplate.mockRejectedValue(error)

        const result = await runCron()

        expect(mocks.recordDeliveryEvent).toHaveBeenCalledWith(expect.objectContaining({
            outboundId: 'outbound-fixture:template',
            status: 'failed',
            errorCode: 'GRAPH_REJECTED',
        }))
        expect(result.body.items[0]).toMatchObject({ sendError: 'GRAPH_REJECTED', deliveryStatus: 'failed' })
        expect(result.body.items[0]).not.toHaveProperty('delivered')
    })

    it('preserves provider acceptance when acknowledgement persistence fails and does not record failed', async () => {
        mocks.recordDeliveryEvent.mockRejectedValueOnce(new Error('firestore unavailable fixture'))

        const result = await runCron()
        const callbacks = mocks.recordDeliveryEvent.mock.calls.map(([callback]) => callback)

        expect(callbacks).toHaveLength(1)
        expect(callbacks[0]).toMatchObject({ status: 'accepted', providerMessageId: 'wamid-template-fixture' })
        expect(result.body.items[0]).toMatchObject({
            accepted: true,
            deliveryStatus: 'accepted',
            providerMessageId: 'wamid-template-fixture',
            persistenceDegraded: true,
            repair: { endpoint: '/api/sales-agent/delivery' },
        })
    })

    it('does not send again when a prior requested lease owns the lead', async () => {
        mocks.prepareFollowUpDelivery.mockResolvedValue({ action: 'busy', outboundId: 'earlier-outbound', status: 'requested' })
        const result = await runCron()
        expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled()
        expect(result.body.items[0]).toMatchObject({ deliveryStatus: 'requested', outboundId: 'earlier-outbound' })
    })

    it('keeps primary acceptance pending when a separate image part fails', async () => {
        mocks.dueFollowUps.mockResolvedValue([{ ...lead, lastInboundAt: Date.now() }])
        mocks.parseAgentJson.mockReturnValue({
            malformed: false, handoff: false, messages: ['follow-up'], stage: 'engaged', image: 'book',
            callbackPromised: null, followUpAt: null,
        })
        mocks.mergeMedia.mockReturnValue({ book: { kind: 'image', url: 'https://cdn.example/book.jpg', caption: 'book fixture' } })
        const imageError = new Error('private image failure fixture')
        imageError.errorCode = 'GRAPH_REJECTED'
        mocks.sendWhatsAppImage.mockRejectedValue(imageError)

        const result = await runCron()

        const callbacks = mocks.recordDeliveryEvent.mock.calls.map(([callback]) => callback)
        expect(callbacks).toEqual(expect.arrayContaining([
            expect.objectContaining({ outboundId: 'outbound-fixture:text', status: 'accepted' }),
            expect.objectContaining({ outboundId: 'outbound-fixture:image', status: 'failed', errorCode: 'GRAPH_REJECTED' }),
        ]))
        expect(callbacks).not.toContainEqual(expect.objectContaining({ outboundId: 'outbound-fixture:text', status: 'failed' }))
        expect(result.body.items[0]).toMatchObject({
            deliveryStatus: 'accepted',
            mediaDeliveryStatus: 'failed',
            mediaSendError: 'GRAPH_REJECTED',
        })
    })

    it('returns a privacy-safe repair event when image acceptance persistence fails without recording failed', async () => {
        mocks.dueFollowUps.mockResolvedValue([{ ...lead, lastInboundAt: Date.now() }])
        mocks.parseAgentJson.mockReturnValue({
            malformed: false, handoff: false, messages: ['follow-up'], stage: 'engaged', image: 'book',
            callbackPromised: null, followUpAt: null,
        })
        mocks.mergeMedia.mockReturnValue({ book: { kind: 'image', url: 'https://cdn.example/book.jpg', caption: 'book fixture' } })
        mocks.recordDeliveryEvent
            .mockResolvedValueOnce({ action: 'applied', status: 'accepted', advanced: false })
            .mockRejectedValueOnce(new Error('image persistence body sentinel'))

        const result = await runCron()
        const item = result.body.items[0]
        const callbacks = mocks.recordDeliveryEvent.mock.calls.map(([callback]) => callback)

        expect(callbacks).toHaveLength(2)
        expect(callbacks).not.toContainEqual(expect.objectContaining({ status: 'failed' }))
        expect(item.mediaDeliveryStatus).toBe('accepted')
        expect(item.mediaPersistenceDegraded).toBe(true)
        expect(item.mediaRepair).toEqual({
            endpoint: '/api/sales-agent/delivery',
            event: {
                eventId: 'outbound-fixture:image:accepted',
                outboundId: 'outbound-fixture:image',
                channel: 'whatsapp_graph',
                status: 'accepted',
                providerMessageId: 'wamid-image-fixture',
                occurredAt: expect.any(String),
            },
        })
        expect(JSON.stringify(item.mediaRepair)).not.toContain('private-phone-sentinel')
        expect(JSON.stringify(item.mediaRepair)).not.toContain('image persistence body sentinel')
        expect(JSON.stringify(item.mediaRepair)).not.toMatch(/token|secret|provider body/i)
    })

    it('prepares Make outbound metadata but waits for Make acknowledgement before marking pending', async () => {
        const result = await runMake()

        expect(result.body.delivery).toBe('make')
        expect(mocks.prepareFollowUpDelivery).toHaveBeenCalledWith(expect.objectContaining({ channel: 'make' }))
        expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled()
        expect(mocks.sendWhatsAppText).not.toHaveBeenCalled()
        expect(mocks.recordDeliveryEvent).not.toHaveBeenCalled()
        expect(result.body.items[0]).toMatchObject({ outboundId: 'outbound-fixture:template', deliveryStatus: 'requested' })
    })

    it('dry-run composes without creating delivery state or sending any transport', async () => {
        const response = await GET(new Request('http://localhost/api/sales-agent/followups?dry=1', {
            headers: { authorization: 'Bearer cron-test-secret' },
        }))
        const body = await response.json()

        expect(body.delivery).toBe('dry')
        expect(mocks.prepareFollowUpDelivery).not.toHaveBeenCalled()
        expect(mocks.recordDeliveryEvent).not.toHaveBeenCalled()
        expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled()
        expect(mocks.sendWhatsAppText).not.toHaveBeenCalled()
    })

    it('dry-run still previews an outside-window template while production template delivery is disabled', async () => {
        delete process.env.SALES_FOLLOWUP_TEMPLATE_ENABLED

        const response = await GET(new Request('http://localhost/api/sales-agent/followups?dry=1', {
            headers: { authorization: 'Bearer cron-test-secret' },
        }))
        const body = await response.json()

        expect(body).toMatchObject({
            delivery: 'dry',
            count: 1,
            items: [expect.objectContaining({ withinWindow: false, deliveryStatus: 'dry' })],
            templateDelivery: { status: 'disabled', blockedCount: 0 },
        })
        expect(mocks.reviveOrphans).not.toHaveBeenCalled()
        expect(mocks.prepareFollowUpDelivery).not.toHaveBeenCalled()
        expect(mocks.recordDeliveryEvent).not.toHaveBeenCalled()
        expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled()
        expect(mocks.sendWhatsAppText).not.toHaveBeenCalled()
    })

    it('keeps an owner handoff alert inspectable without a free-form cron send', async () => {
        mocks.handoffAlert.mockReturnValue('inspectable owner alert fixture')

        const result = await runCron()

        expect(result.body.alert).toBe('inspectable owner alert fixture')
        expect(mocks.sendWhatsAppText).not.toHaveBeenCalledWith(
            process.env.SALES_AGENT_OWNER_PHONE,
            'inspectable owner alert fixture',
        )
    })

    // The health card reads sales_runtime/followups.lastRunAtMs; until 18.9
    // nothing wrote it, so "did the cron run" was unanswerable from the admin.
    it('stamps the run for the health card, and never on a dry run', async () => {
        mocks.recordFollowUpRun.mockClear()
        await runCron()
        expect(mocks.recordFollowUpRun).toHaveBeenCalledTimes(1)
        expect(mocks.recordFollowUpRun.mock.calls[0][0]).toMatchObject({ dry: false })

        mocks.recordFollowUpRun.mockClear()
        await runCron('?dry=1')
        expect(mocks.recordFollowUpRun).toHaveBeenCalledTimes(1)
        expect(mocks.recordFollowUpRun.mock.calls[0][0]).toMatchObject({ dry: true })
    })

    it('caps a dry run at ten leads so it returns before the function is cut', async () => {
        mocks.dueFollowUps.mockClear()
        await runCron('?dry=1')
        expect(mocks.dueFollowUps).toHaveBeenCalledWith(expect.any(String), 10)
    })
})
