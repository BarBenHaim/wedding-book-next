import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    verifyIdToken: vi.fn(),
    isSuperAdmin: vi.fn(),
    listLeads: vi.fn(),
    recordDeliveryEvent: vi.fn(),
    recordDigestOutcome: vi.fn(),
    prepareDigestDelivery: vi.fn(),
    deriveLead: vi.fn(value => value),
    sortLeads: vi.fn(value => value),
    isoInIsrael: vi.fn(() => '2026-08-14'),
    summarizeExperiments: vi.fn(() => null),
    summarizeGaps: vi.fn(() => []),
    buildDigest: vi.fn(),
    sendWhatsAppTemplate: vi.fn(),
    createOutboundId: vi.fn(() => 'digest-hash-fixture:template'),
}))

vi.mock('@/lib/firebaseAdmin', () => ({ adminAuth: { verifyIdToken: mocks.verifyIdToken } }))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: mocks.isSuperAdmin }))
vi.mock('@/lib/salesAgent/leads', () => ({
    listLeads: mocks.listLeads,
    prepareDigestDelivery: mocks.prepareDigestDelivery,
    recordDeliveryEvent: mocks.recordDeliveryEvent,
    recordDigestOutcome: mocks.recordDigestOutcome,
}))
vi.mock('@/lib/salesAgent/leadsView', () => ({
    deriveLead: mocks.deriveLead,
    sortLeads: mocks.sortLeads,
    isoInIsrael: mocks.isoInIsrael,
}))
vi.mock('@/lib/salesAgent/experiments', () => ({
    summarizeExperiments: mocks.summarizeExperiments,
    summarizeGaps: mocks.summarizeGaps,
}))
vi.mock('@/lib/salesAgent/digest', () => ({ buildDigest: mocks.buildDigest }))
vi.mock('@/lib/salesAgent/whatsapp', () => ({
    DAILY_DIGEST_TEMPLATE: 'wt_daily_digest',
    sendWhatsAppTemplate: mocks.sendWhatsAppTemplate,
}))
vi.mock('@/lib/salesAgent/delivery', () => ({ createOutboundId: mocks.createOutboundId }))

const digest = {
    hasNews: true,
    date: '2026-08-13',
    text: 'inspectable digest fixture',
    lines: ['waiting fixture', 'followups fixture', 'yesterday fixture', 'ready fixture'],
    counts: { waiting: 1, readyToPay: 0, dueToday: 0, activeYesterday: 1, newYesterday: 1, wonYesterday: 0 },
}

let GET

async function runCron() {
    const response = await GET(new Request('http://localhost/api/sales-agent/digest', {
        headers: { authorization: 'Bearer digest-cron-secret-fixture' },
    }))
    return { status: response.status, body: await response.json() }
}

beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'digest-cron-secret-fixture'
    process.env.SALES_AGENT_SECRET = 'digest-shared-secret-fixture'
    process.env.SALES_AGENT_OWNER_PHONE = 'non-dialable-owner-fixture'
    mocks.listLeads.mockResolvedValue([])
    mocks.buildDigest.mockReturnValue(digest)
    mocks.sendWhatsAppTemplate.mockResolvedValue({ accepted: true, providerMessageId: 'wamid-digest-fixture' })
    mocks.recordDeliveryEvent.mockResolvedValue({ action: 'applied', status: 'accepted', advanced: false })
    mocks.recordDigestOutcome.mockResolvedValue(undefined)
    mocks.prepareDigestDelivery.mockResolvedValue({ action: 'requested', outboundId: 'digest-hash-fixture:template' })
    ;({ GET } = await import('@/app/api/sales-agent/digest/route'))
})

describe('scheduled owner digest delivery', () => {
    it('uses only wt_daily_digest and reports provider acceptance, never delivery', async () => {
        const result = await runCron()

        expect(result.status).toBe(200)
        expect(mocks.sendWhatsAppTemplate).toHaveBeenCalledWith(
            'non-dialable-owner-fixture',
            'wt_daily_digest',
            digest.lines,
        )
        expect(mocks.recordDeliveryEvent).toHaveBeenCalledWith(expect.objectContaining({
            outboundId: 'digest-hash-fixture:template',
            status: 'accepted',
            providerMessageId: 'wamid-digest-fixture',
        }))
        expect(mocks.recordDigestOutcome).toHaveBeenCalledWith(expect.objectContaining({ status: 'digest_accepted' }))
        expect(result.body).toMatchObject({
            ok: true,
            text: 'inspectable digest fixture',
            delivery: { status: 'accepted', providerMessageId: 'wamid-digest-fixture' },
        })
        expect(JSON.stringify(result.body)).not.toContain('delivered')
    })

    it('keeps the digest inspectable and stores digest_failed when the owner phone is missing', async () => {
        delete process.env.SALES_AGENT_OWNER_PHONE

        const result = await runCron()

        expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled()
        expect(mocks.recordDeliveryEvent).toHaveBeenCalledWith(expect.objectContaining({
            status: 'failed', errorCode: 'OWNER_PHONE_MISSING',
        }))
        expect(mocks.recordDigestOutcome).toHaveBeenCalledWith(expect.objectContaining({
            status: 'digest_failed', errorCode: 'OWNER_PHONE_MISSING',
        }))
        expect(result.body).toMatchObject({
            text: 'inspectable digest fixture',
            delivery: { status: 'failed', errorCode: 'OWNER_PHONE_MISSING' },
        })
    })

    it('normalizes template rejection without exposing provider body or claiming delivery', async () => {
        const providerError = new Error('private provider body fixture')
        providerError.errorCode = 'GRAPH_REJECTED'
        mocks.sendWhatsAppTemplate.mockRejectedValue(providerError)

        const result = await runCron()

        expect(mocks.recordDeliveryEvent).toHaveBeenCalledWith(expect.objectContaining({
            status: 'failed', errorCode: 'GRAPH_REJECTED',
        }))
        expect(mocks.recordDigestOutcome).toHaveBeenCalledWith(expect.objectContaining({
            status: 'digest_failed', errorCode: 'GRAPH_REJECTED',
        }))
        expect(result.body.delivery).toEqual({ status: 'failed', errorCode: 'GRAPH_REJECTED' })
        expect(JSON.stringify(result.body)).not.toContain('private provider body fixture')
        expect(JSON.stringify(result.body)).not.toContain('delivered')
    })

    it('preclaims before Graph and short-circuits requested, accepted, or failed replay attempts', async () => {
        for (const status of ['requested', 'accepted', 'failed']) {
            vi.clearAllMocks()
            mocks.listLeads.mockResolvedValue([])
            mocks.buildDigest.mockReturnValue(digest)
            mocks.prepareDigestDelivery.mockResolvedValue({ action: 'existing', outboundId: 'digest-hash-fixture:template', status })
            const result = await runCron()
            expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled()
            expect(result.body.delivery).toMatchObject({ status: 'not_sent', reason: 'existing_attempt', existingStatus: status })
        }
    })

    it('sends Graph once when concurrent cron requests race for the same attempt', async () => {
        let claimed = false
        mocks.prepareDigestDelivery.mockImplementation(async ({ outboundId }) => {
            if (claimed) return { action: 'existing', outboundId, status: 'requested' }
            claimed = true
            return { action: 'requested', outboundId }
        })
        const results = await Promise.all([runCron(), runCron()])
        expect(mocks.sendWhatsAppTemplate).toHaveBeenCalledTimes(1)
        expect(results.map(result => result.body.delivery.status).sort()).toEqual(['accepted', 'not_sent'])
    })

    it('preserves Graph acceptance when delivery acknowledgement persistence fails', async () => {
        mocks.recordDeliveryEvent.mockRejectedValueOnce(new Error('delivery persistence fixture'))
        const result = await runCron()
        expect(mocks.recordDeliveryEvent).toHaveBeenCalledTimes(1)
        expect(mocks.recordDeliveryEvent).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
        expect(result.body.delivery).toMatchObject({
            status: 'accepted', accepted: true, providerMessageId: 'wamid-digest-fixture', persistenceDegraded: true,
            repair: { endpoint: '/api/sales-agent/delivery' },
        })
    })

    it('keeps accepted delivery truth when digest health persistence fails', async () => {
        mocks.recordDigestOutcome.mockRejectedValueOnce(new Error('health persistence fixture'))
        const result = await runCron()
        expect(mocks.recordDeliveryEvent).toHaveBeenCalledTimes(1)
        expect(result.body.delivery).toMatchObject({
            status: 'accepted', accepted: true, healthPersistenceDegraded: true,
        })
    })

    it('supports a deliberate distinct retry attempt ID', async () => {
        mocks.createOutboundId.mockImplementation(({ attempt }) => `digest-attempt-${attempt}:template`)
        const response = await GET(new Request('http://localhost/api/sales-agent/digest?attempt=2', {
            headers: { authorization: 'Bearer digest-cron-secret-fixture' },
        }))
        await response.json()
        expect(mocks.createOutboundId).toHaveBeenCalledWith(expect.objectContaining({ attempt: 2 }))
        expect(mocks.prepareDigestDelivery).toHaveBeenCalledWith(expect.objectContaining({
            outboundId: 'digest-attempt-2:template', attemptNumber: 2,
        }))
    })

    it('does not send from the shared-secret inspection path or on a quiet day', async () => {
        const sharedResponse = await GET(new Request('http://localhost/api/sales-agent/digest', {
            headers: { 'x-wt-secret': 'digest-shared-secret-fixture' },
        }))
        expect((await sharedResponse.json()).delivery).toEqual({ status: 'not_requested' })
        expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled()

        mocks.buildDigest.mockReturnValue({ ...digest, hasNews: false })
        const quiet = await runCron()
        expect(quiet.body.delivery).toEqual({ status: 'skipped', reason: 'no_news' })
        expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled()
    })
})
