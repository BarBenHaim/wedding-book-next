import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    buildSystemPrompt: vi.fn(),
    callClaude: vi.fn(),
    parseAgentJson: vi.fn(),
    normalizePhone: vi.fn(value => String(value || '')),
    resolveFollowUp: vi.fn(),
    getLead: vi.fn(),
    saveExchange: vi.fn(),
    toApiMessages: vi.fn(),
    isPausedForHuman: vi.fn(),
    isOwnEcho: vi.fn(),
    parseOwnerCommand: vi.fn(),
    setHuman: vi.fn(),
    findCustomerByPhone: vi.fn(),
    listLeads: vi.fn(),
    recordSpend: vi.fn(),
    listMedia: vi.fn(),
    recordMediaSent: vi.fn(),
    creditPendingMedia: vi.fn(),
    claimInboundEvent: vi.fn(),
    completeInboundEvent: vi.fn(),
    costOfClaudeUsage: vi.fn(),
    resolveSource: vi.fn(),
    mergeMedia: vi.fn(),
    performanceNote: vi.fn(),
    priceDodged: vi.fn(),
    priceFallbackMessage: vi.fn(),
    mediaGuard: vi.fn(),
    assignVariant: vi.fn(),
    summarizeExperiments: vi.fn(),
    summarizeGaps: vi.fn(),
    deriveLead: vi.fn(),
    sortLeads: vi.fn(),
    isoInIsrael: vi.fn(),
    buildDigest: vi.fn(),
}))

vi.mock('@/lib/salesAgent/prompt', () => ({ buildSystemPrompt: mocks.buildSystemPrompt, addDaysISO: vi.fn() }))
vi.mock('@/lib/salesAgent/agent', () => ({
    callClaude: mocks.callClaude,
    parseAgentJson: mocks.parseAgentJson,
    normalizePhone: mocks.normalizePhone,
    resolveFollowUp: mocks.resolveFollowUp,
}))
vi.mock('@/lib/salesAgent/leads', () => ({
    getLead: mocks.getLead, saveExchange: mocks.saveExchange, toApiMessages: mocks.toApiMessages,
    isPausedForHuman: mocks.isPausedForHuman, isOwnEcho: mocks.isOwnEcho,
    parseOwnerCommand: mocks.parseOwnerCommand, setHuman: mocks.setHuman,
    findCustomerByPhone: mocks.findCustomerByPhone, listLeads: mocks.listLeads,
    recordSpend: mocks.recordSpend, listMedia: mocks.listMedia,
    recordMediaSent: mocks.recordMediaSent, creditPendingMedia: mocks.creditPendingMedia,
    claimInboundEvent: mocks.claimInboundEvent, completeInboundEvent: mocks.completeInboundEvent,
}))
vi.mock('@/lib/salesAgent/pricing', () => ({ costOfClaudeUsage: mocks.costOfClaudeUsage }))
vi.mock('@/lib/salesAgent/attribution', () => ({ resolveSource: mocks.resolveSource }))
vi.mock('@/lib/salesAgent/catalog', () => ({ BUSINESS: { brand: 'Test Brand', ownerName: 'הצוות' }, MEDIA: {} }))
vi.mock('@/lib/salesAgent/mediaLibrary', () => ({ mergeMedia: mocks.mergeMedia, performanceNote: mocks.performanceNote }))
vi.mock('@/lib/salesAgent/selling', () => ({ priceDodged: mocks.priceDodged, priceFallbackMessage: mocks.priceFallbackMessage }))
vi.mock('@/lib/salesAgent/mediaGuard', () => ({ mediaGuard: mocks.mediaGuard }))
vi.mock('@/lib/salesAgent/experiments', () => ({ assignVariant: mocks.assignVariant, summarizeExperiments: mocks.summarizeExperiments, summarizeGaps: mocks.summarizeGaps }))
vi.mock('@/lib/salesAgent/leadsView', () => ({ deriveLead: mocks.deriveLead, sortLeads: mocks.sortLeads, isoInIsrael: mocks.isoInIsrael }))
vi.mock('@/lib/salesAgent/digest', () => ({ buildDigest: mocks.buildDigest }))

const lead = { isNew: false, stage: 'engaged', turns: [], followUpCount: 0, imagesSent: [], mediaSent: [] }
const inbound = overrides => ({ eventId: 'event-token', phone: 'test-phone-token', text: '', messageType: 'text', ...overrides })

let POST

async function post(body) {
    const response = await POST(new Request('http://localhost/api/sales-agent/reply', {
        method: 'POST',
        headers: { 'x-wt-secret': 'route-test-secret', 'content-type': 'application/json' },
        body: JSON.stringify(body),
    }))
    return { status: response.status, body: await response.json() }
}

async function postRaw(raw) {
    const response = await POST(new Request('http://localhost/api/sales-agent/reply', {
        method: 'POST',
        headers: { 'x-wt-secret': 'route-test-secret', 'content-type': 'application/json' },
        body: raw,
    }))
    return { status: response.status, body: await response.json() }
}

beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.SALES_AGENT_SECRET = 'route-test-secret'
    process.env.SALES_AGENT_OWNER_PHONE = 'owner-token'
    mocks.claimInboundEvent.mockResolvedValue({ action: 'process', claimToken: 'claim-token', claimGeneration: 1 })
    mocks.completeInboundEvent.mockResolvedValue({ action: 'completed' })
    mocks.getLead.mockResolvedValue(lead)
    mocks.setHuman.mockResolvedValue(undefined)
    mocks.findCustomerByPhone.mockResolvedValue(null)
    mocks.isPausedForHuman.mockReturnValue(false)
    mocks.isOwnEcho.mockReturnValue(false)
    mocks.parseOwnerCommand.mockReturnValue(null)
    ;({ POST } = await import('@/app/api/sales-agent/reply/route'))
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('inbound event duplicate fencing', () => {
    it('returns a completed duplicate as a no-send envelope without calling Claude', async () => {
        mocks.claimInboundEvent.mockResolvedValue({ action: 'cached', outcome: { sendText: '', handoff: false, noReply: true, skipped: 'own-echo' } })

        const result = await post(inbound({ text: 'שלום' }))

        expect(result).toEqual({
            status: 200,
            body: {
                ok: true, duplicate: true, shouldSend: false,
                cachedOutcome: { sendText: '', handoff: false, noReply: true, skipped: 'own-echo' },
                sendText: '', hasImage: false, hasVideo: false, handoff: false,
            },
        })
        expect(mocks.callClaude).not.toHaveBeenCalled()
    })

    it('returns an in-flight duplicate as a no-send envelope without calling Claude', async () => {
        mocks.claimInboundEvent.mockResolvedValue({ action: 'busy' })

        const result = await post(inbound({ text: 'שלום' }))

        expect(result).toEqual({ status: 202, body: { ok: true, duplicate: true, processing: true, shouldSend: false } })
        expect(mocks.callClaude).not.toHaveBeenCalled()
    })
})

describe('inbound failure logging', () => {
    it('logs only the parse reason, never the raw inbound payload', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})

        const result = await postRaw('raw-customer-transcript-token')

        expect(result).toEqual({ status: 400, body: { error: 'bad-json', reason: 'no-fields' } })
        expect(error).toHaveBeenCalledWith('[sales-agent] unreadable body', 'no-fields')
    })
})

describe('non-text inbound media', () => {
    for (const [requestedType, normalizedType] of [
        ['image', 'image'], ['video', 'video'], ['audio', 'audio'], ['document', 'document'], ['sticker', 'document'],
    ]) {
        it(`hands off ${requestedType} as ${normalizedType} without calling Claude`, async () => {
            const result = await post(inbound({ messageType: requestedType }))
            const reason = normalizedType === 'image' ? 'הלקוח שלח תמונה' : `הלקוח שלח ${normalizedType}`

            expect(result.body).toMatchObject({ ok: true, sendText: '', hasImage: false, hasVideo: false, stage: 'handoff', handoff: true })
            expect(mocks.setHuman).toHaveBeenCalledWith('test-phone-token', true, expect.stringContaining(reason))
            expect(mocks.completeInboundEvent).toHaveBeenCalledWith(expect.objectContaining({
                outcome: expect.objectContaining({ handoff: true, noReply: false, stage: 'handoff' }),
            }))
            expect(mocks.callClaude).not.toHaveBeenCalled()
        })
    }

    it('leaves the claim retriable when media handoff persistence fails', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        mocks.setHuman.mockRejectedValue(new Error('persistence unavailable'))

        const result = await post(inbound({ messageType: 'audio' }))

        expect(result).toEqual({ status: 503, body: { error: 'media-handoff-persist-failed' } })
        expect(mocks.completeInboundEvent).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
    })
})

describe('silent terminal outcomes keep their real meaning', () => {
    it('records an empty text event as noReply rather than a handoff', async () => {
        const result = await post(inbound())

        expect(result.body).toMatchObject({ ok: true, skipped: 'empty-text', handoff: false, noReply: true })
        expect(mocks.completeInboundEvent).toHaveBeenCalledWith(expect.objectContaining({
            outcome: expect.objectContaining({ handoff: false, noReply: true, skipped: 'empty-text' }),
        }))
    })

    it('records the bot own echo as noReply rather than a handoff', async () => {
        mocks.isOwnEcho.mockReturnValue(true)

        const result = await post(inbound({ text: 'bot echo', from: 'business-token', businessPhone: 'business-token', to: 'test-phone-token' }))

        expect(result.body).toMatchObject({ skipped: 'own-echo', handoff: false, noReply: true })
        expect(mocks.completeInboundEvent).toHaveBeenCalledWith(expect.objectContaining({ outcome: expect.objectContaining({ handoff: false, noReply: true }) }))
    })

    it('keeps a non-command owner message ahead of media handoff', async () => {
        const result = await post(inbound({ phone: 'owner-token', text: 'not-a-command', messageType: 'image' }))

        expect(result.body).toMatchObject({ skipped: 'owner-message', handoff: false, noReply: true })
        expect(mocks.setHuman).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
    })

    it('keeps an already-paused conversation ahead of media handoff', async () => {
        mocks.isPausedForHuman.mockReturnValue(true)

        const result = await post(inbound({ text: 'image caption', messageType: 'image' }))

        expect(result.body).toMatchObject({ paused: true, handoff: false, noReply: true })
        expect(mocks.setHuman).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
    })

    it('keeps an existing customer ahead of media handoff', async () => {
        mocks.getLead.mockResolvedValue({ ...lead, isNew: true })
        mocks.findCustomerByPhone.mockResolvedValue({ ownerName: 'לקוח קיים' })

        const result = await post(inbound({ text: 'image caption', messageType: 'image' }))

        expect(result.body).toMatchObject({ customer: true, handoff: true })
        expect(mocks.setHuman).toHaveBeenCalledWith('test-phone-token', true, 'לקוח קיים כתב')
        expect(mocks.callClaude).not.toHaveBeenCalled()
    })
})

describe('owner takeover persistence and transport', () => {
    const ownerEcho = { text: 'owner takeover', from: 'business-token', businessPhone: 'business-token', to: 'test-phone-token' }

    it('stores the owner takeover durably but returns only a no-send response', async () => {
        const result = await post(inbound(ownerEcho))

        expect(mocks.setHuman).toHaveBeenCalledWith('test-phone-token', true, 'ענית בעצמך בשיחה')
        expect(mocks.completeInboundEvent).toHaveBeenCalledWith(expect.objectContaining({
            outcome: expect.objectContaining({ handoff: true, noReply: false }),
        }))
        expect(result).toEqual({
            status: 200,
            body: {
                ok: true, send: [], sendText: '', hasImage: false, hasVideo: false,
                shouldSend: false, handoff: false, noReply: true, paused: true, reason: 'owner-replied',
            },
        })
        expect(mocks.callClaude).not.toHaveBeenCalled()
    })

    it('leaves an owner takeover retriable when the human pause cannot persist', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        mocks.setHuman.mockRejectedValue(new Error('persistence unavailable'))

        const result = await post(inbound(ownerEcho))

        expect(result).toEqual({ status: 503, body: { error: 'owner-takeover-persist-failed' } })
        expect(mocks.completeInboundEvent).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
    })
})
