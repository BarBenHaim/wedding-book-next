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
    markFollowUpSent: vi.fn(),
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
}))

vi.mock('@/lib/firebaseAdmin', () => ({ adminAuth: { verifyIdToken: mocks.verifyIdToken } }))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: mocks.isSuperAdmin }))
vi.mock('@/lib/salesAgent/prompt', () => ({ buildFollowUpPrompt: mocks.buildFollowUpPrompt, addDaysISO: mocks.addDaysISO }))
vi.mock('@/lib/salesAgent/agent', () => ({ callClaude: mocks.callClaude, parseAgentJson: mocks.parseAgentJson, resolveFollowUp: mocks.resolveFollowUp }))
vi.mock('@/lib/salesAgent/leads', () => ({
    dueFollowUps: mocks.dueFollowUps, markFollowUpSent: mocks.markFollowUpSent,
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

beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'cron-test-secret'
    delete process.env.SALES_AGENT_SECRET
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
    ;({ GET } = await import('@/app/api/sales-agent/followups/route'))
})

describe('follow-up failure privacy', () => {
    it('does not expose a lead phone or provider error body when direct send fails', async () => {
        mocks.sendWhatsAppText.mockRejectedValue(new Error('provider-body-sentinel secret-token-sentinel'))
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
        expect(result.body.items[0].sendError).toBe('whatsapp-send-failed')
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
