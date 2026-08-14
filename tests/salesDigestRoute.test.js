import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    verifyIdToken: vi.fn(),
    isSuperAdmin: vi.fn(),
    listLeads: vi.fn(),
    recordDeliveryEvent: vi.fn(),
    recordDigestOutcome: vi.fn(),
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
