import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    readSalesSettings: vi.fn(), listMedia: vi.fn(), listLeads: vi.fn(), readHealth: vi.fn(), readDue: vi.fn(),
    summarizeHealth: vi.fn(), summarizeModel: vi.fn(), claim: vi.fn(), finish: vi.fn(), buildPayload: vi.fn(), send: vi.fn(),
}))
vi.mock('@/lib/firebaseAdmin', () => ({ adminDb: { safe: true } }))
vi.mock('@/lib/salesAgent/settingsStore', () => ({ readSalesSettings: mocks.readSalesSettings }))
vi.mock('@/lib/salesAgent/leads', () => ({
    listMedia: mocks.listMedia, listLeads: mocks.listLeads,
    readSalesHealthRuntime: mocks.readHealth, readDueFollowUpHealth: mocks.readDue,
}))
vi.mock('@/lib/salesAgent/leadsCore', () => ({ summarizeSalesHealth: mocks.summarizeHealth }))
vi.mock('@/lib/salesAgent/modelExperimentAnalytics', () => ({ summarizeLiveModelExperiment: mocks.summarizeModel }))
vi.mock('@/lib/salesAgent/ownerStatus', () => ({
    claimOwnerStatusNotification: mocks.claim,
    finishOwnerStatusNotification: mocks.finish,
    buildOwnerStatusPayload: mocks.buildPayload,
}))
vi.mock('@/lib/salesAgent/whatsapp', () => ({ DAILY_DIGEST_TEMPLATE: 'wt_daily_digest', sendWhatsAppTemplate: mocks.send }))

let GET
const request = secret => new Request('https://wedding.test/api/cron/sales-model-status', {
    headers: { authorization: `Bearer ${secret}` },
})

beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'cron-secret'
    process.env.SALES_AGENT_OWNER_PHONE = 'non-dialable-owner-fixture'
    mocks.readSalesSettings.mockResolvedValue({ modelExperiment: { targetVerifiedSalesPerDay: 2 } })
    mocks.listMedia.mockResolvedValue([])
    mocks.listLeads.mockResolvedValue([])
    mocks.readHealth.mockResolvedValue({})
    mocks.readDue.mockResolvedValue({ dueFollowUps: 0, scanSaturated: false })
    mocks.summarizeHealth.mockReturnValue({ inbound: { status: 'green' }, whatsapp: { status: 'green' }, followups: { status: 'green' } })
    mocks.summarizeModel.mockReturnValue({
        summary: { verifiedPaidToday: 1, targetVerifiedSalesPerDay: 2, rows: [] },
        recommendation: { action: 'insufficient_evidence' },
    })
    mocks.claim.mockResolvedValue({ action: 'claimed', eventKey: 'event-hash', decision: { kind: 'daily_digest', current: {} } })
    mocks.buildPayload.mockReturnValue(['line 1', 'line 2', 'line 3', 'line 4'])
    mocks.send.mockResolvedValue({ accepted: true, providerMessageId: 'provider-fixture' })
    mocks.finish.mockResolvedValue({ action: 'recorded' })
    ;({ GET } = await import('@/app/api/cron/sales-model-status/route'))
})

describe('sales model owner status cron', () => {
    it('authenticates before reading or claiming anything', async () => {
        const response = await GET(request('wrong'))
        expect(response.status).toBe(401)
        expect(mocks.readSalesSettings).not.toHaveBeenCalled()
        expect(mocks.claim).not.toHaveBeenCalled()
    })

    it('claims before using the approved four-line template and records provider acceptance', async () => {
        const response = await GET(request('cron-secret'))
        const body = await response.json()

        expect(mocks.claim.mock.invocationCallOrder[0]).toBeLessThan(mocks.send.mock.invocationCallOrder[0])
        expect(mocks.send).toHaveBeenCalledWith('non-dialable-owner-fixture', 'wt_daily_digest', ['line 1', 'line 2', 'line 3', 'line 4'])
        expect(mocks.finish).toHaveBeenCalledWith(expect.anything(), 'event-hash', expect.objectContaining({ status: 'accepted' }))
        expect(body).toEqual({ ok: true, action: 'accepted', kind: 'daily_digest' })
        expect(JSON.stringify(body)).not.toMatch(/owner-fixture|provider-fixture/)
    })

    it('sends nothing when the transactional claim reports no material update', async () => {
        mocks.claim.mockResolvedValueOnce({ action: 'none' })
        const response = await GET(request('cron-secret'))
        expect(await response.json()).toEqual({ ok: true, action: 'none' })
        expect(mocks.send).not.toHaveBeenCalled()
    })

    it('records normalized not-sent truth when the template transport is unavailable', async () => {
        mocks.send.mockRejectedValueOnce(Object.assign(new Error('private provider body'), { errorCode: 'GRAPH_REJECTED' }))
        const response = await GET(request('cron-secret'))
        expect(response.status).toBe(503)
        expect(await response.json()).toEqual({ error: 'OWNER_STATUS_NOT_SENT', reason: 'GRAPH_REJECTED' })
        expect(mocks.finish).toHaveBeenCalledWith(expect.anything(), 'event-hash', expect.objectContaining({ status: 'not_sent', reason: 'GRAPH_REJECTED' }))
    })

    it('keeps Graph acceptance truthful when final persistence is degraded', async () => {
        mocks.finish.mockRejectedValueOnce(new Error('private firestore body'))
        const response = await GET(request('cron-secret'))
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ ok: true, action: 'accepted', kind: 'daily_digest', persistenceDegraded: true })
        expect(mocks.send).toHaveBeenCalledTimes(1)
    })
})
