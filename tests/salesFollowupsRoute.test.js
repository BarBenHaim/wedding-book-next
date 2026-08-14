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
    sendWhatsAppTemplate: vi.fn(),
    createOutboundId: vi.fn(),
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
}))
vi.mock('@/lib/salesAgent/followupPolicy', () => ({ sendableNow: mocks.sendableNow, MAX_PER_RUN: 25, isFinalAttempt: mocks.isFinalAttempt }))
vi.mock('@/lib/salesAgent/catalog', () => ({ MEDIA: {} }))
vi.mock('@/lib/salesAgent/mediaLibrary', () => ({ mergeMedia: mocks.mergeMedia, performanceNote: mocks.performanceNote }))
vi.mock('@/lib/salesAgent/sweep', () => ({ findOrphans: mocks.findOrphans, findStaleHandoffs: mocks.findStaleHandoffs, handoffAlert: mocks.handoffAlert }))
vi.mock('@/lib/salesAgent/whatsapp', () => ({
    canSendWhatsApp: mocks.canSendWhatsApp,
    sendWhatsAppText: mocks.sendWhatsAppText,
    sendWhatsAppImage: mocks.sendWhatsAppImage,
    sendWhatsAppTemplate: mocks.sendWhatsAppTemplate,
    FOLLOWUP_TEMPLATE: 'wt_followup',
}))
vi.mock('@/lib/salesAgent/delivery', () => ({
    createOutboundId: mocks.createOutboundId,
}))

const lead = {
    phone: 'private-phone-sentinel',
    name: 'Test lead',
    turns: [],
    stage: 'engaged',
    followUpCount: 0,
    lastInboundAt: 0,
}

let GET

async function runCron() {
    const response = await GET(new Request('http://localhost/api/sales-agent/followups', {
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
    mocks.sendWhatsAppTemplate.mockResolvedValue({ accepted: true, providerMessageId: 'wamid-template-fixture' })
    mocks.recordDeliveryEvent.mockResolvedValue({ action: 'applied', status: 'accepted', advanced: false })
    ;({ GET } = await import('@/app/api/sales-agent/followups/route'))
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
    it('uses only wt_followup outside the service window and records provider acceptance as pending', async () => {
        mocks.parseAgentJson.mockReturnValue({
            malformed: false, handoff: false, messages: ['follow-up'], stage: 'engaged', image: 'book',
            callbackPromised: null, followUpAt: null,
        })
        mocks.mergeMedia.mockReturnValue({ book: { kind: 'image', url: 'https://cdn.example/book.jpg', caption: 'book fixture' } })
        const result = await runCron()

        expect(result.status).toBe(200)
        expect(mocks.sendWhatsAppTemplate).toHaveBeenCalledWith(lead.phone, 'wt_followup', ['follow-up'])
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
        expect(mocks.prepareFollowUpDelivery).toHaveBeenCalledWith(expect.objectContaining({ part: 'text', advancesFollowUp: true }))
        expect(mocks.prepareFollowUpDelivery).toHaveBeenCalledWith(expect.objectContaining({ part: 'image', advancesFollowUp: false }))
        const preparedParts = mocks.prepareFollowUpDelivery.mock.calls.map(([delivery]) => delivery)
        expect(preparedParts[0].logicalAttemptId).toBe('outbound-fixture:logical')
        expect(preparedParts[1].logicalAttemptId).toBe(preparedParts[0].logicalAttemptId)
        expect(result.body.items[0].outboundParts).toEqual({
            text: 'outbound-fixture:text',
            image: 'outbound-fixture:image',
        })
        expect(mocks.recordMediaSent).not.toHaveBeenCalled()
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

    it('keeps an owner handoff alert inspectable without a free-form cron send', async () => {
        mocks.handoffAlert.mockReturnValue('inspectable owner alert fixture')

        const result = await runCron()

        expect(result.body.alert).toBe('inspectable owner alert fixture')
        expect(mocks.sendWhatsAppText).not.toHaveBeenCalledWith(
            process.env.SALES_AGENT_OWNER_PHONE,
            'inspectable owner alert fixture',
        )
    })
})
