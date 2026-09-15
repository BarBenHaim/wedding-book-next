import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    verifyIdToken: vi.fn(),
    isSuperAdmin: vi.fn(),
    readSalesSettings: vi.fn(),
    saveSalesSettings: vi.fn(),
    listLeads: vi.fn(),
    listMedia: vi.fn(),
    summarizeLiveModelExperiment: vi.fn(),
    benchmarkGet: vi.fn(),
}))

vi.mock('@/lib/firebaseAdmin', () => ({
    adminAuth: { verifyIdToken: mocks.verifyIdToken },
    adminDb: {
        collection: () => ({
            doc: () => ({ get: mocks.benchmarkGet }),
        }),
    },
}))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: mocks.isSuperAdmin }))
vi.mock('@/lib/salesAgent/settingsStore', () => ({
    readSalesSettings: mocks.readSalesSettings,
    saveSalesSettings: mocks.saveSalesSettings,
}))
vi.mock('@/lib/salesAgent/leads', () => ({ listLeads: mocks.listLeads, listMedia: mocks.listMedia }))
vi.mock('@/lib/salesAgent/modelExperimentAnalytics', () => ({
    summarizeLiveModelExperiment: mocks.summarizeLiveModelExperiment,
}))

let GET, POST
const experiment = {
    id: 'sales-models', revision: 2, enabled: true,
    targetVerifiedSalesPerDay: 2, minimumDeliveredPerArm: 30, minimumDays: 7,
    championArmId: 'gemini',
    arms: [
        { id: 'gemini', revision: 1, provider: 'gemini', model: 'gemini-3.6-flash', weight: 80, enabled: true },
        { id: 'claude', revision: 1, provider: 'anthropic', model: 'claude-sonnet-4-5', weight: 20, enabled: true },
    ],
}
const settings = { revision: 5, enabled: true, mode: 'full_sales', modelExperiment: experiment }
const live = {
    summary: {
        experimentId: 'sales-models', experimentRevision: 2, enabled: true,
        championArmId: 'gemini', targetVerifiedSalesPerDay: 2,
        minimumDeliveredPerArm: 30, minimumDays: 7, evidenceReady: false,
        rows: [{ armId: 'gemini', verifiedPaid: 1, verifiedRevenue: 990, delivered: 12 }],
    },
    recommendation: { action: 'insufficient_evidence' },
}
const request = (method, body, secret = 'model-route-secret') => new Request('http://localhost/api/sales-agent/model-experiment', {
    method,
    headers: { 'content-type': 'application/json', 'x-wt-secret': secret },
    body: body == null ? undefined : JSON.stringify(body),
})

beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.SALES_AGENT_SECRET = 'model-route-secret'
    mocks.readSalesSettings.mockResolvedValue(settings)
    mocks.saveSalesSettings.mockResolvedValue({ ...settings, revision: 6 })
    mocks.listLeads.mockResolvedValue([{ phone: 'private-phone', turns: [{ text: 'private text' }] }])
    mocks.listMedia.mockResolvedValue([])
    mocks.summarizeLiveModelExperiment.mockReturnValue(live)
    mocks.benchmarkGet.mockResolvedValue({
        exists: true,
        data: () => ({
            status: 'completed',
            aggregate: { revision: 2, caseCount: 12, callCount: 36, rows: [{ armId: 'gemini', scoreRate: 0.9 }] },
        }),
    })
    ;({ GET, POST } = await import('@/app/api/sales-agent/model-experiment/route'))
})

describe('sales model experiment control route', () => {
    it('authenticates before reading settings, leads, or benchmark data', async () => {
        const response = await GET(request('GET', null, 'wrong'))
        expect(response.status).toBe(401)
        expect(mocks.readSalesSettings).not.toHaveBeenCalled()
        expect(mocks.listLeads).not.toHaveBeenCalled()
        expect(mocks.benchmarkGet).not.toHaveBeenCalled()
    })

    it('returns aggregate revenue, sample, recommendation, and benchmark truth only', async () => {
        const response = await GET(request('GET'))
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toEqual({
            ok: true,
            revision: 5,
            experiment,
            live,
            benchmark: { revision: 2, caseCount: 12, callCount: 36, rows: [{ armId: 'gemini', scoreRate: 0.9 }] },
        })
        expect(JSON.stringify(body)).not.toMatch(/private-phone|private text|turns/)
        expect(mocks.summarizeLiveModelExperiment).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ experiment }))
    })

    it('pauses one unsafe arm and transfers its allocation to the champion', async () => {
        const response = await POST(request('POST', { action: 'pause_arm', revision: 5, armId: 'claude', ignored: 'private' }))

        expect(response.status).toBe(200)
        expect(mocks.saveSalesSettings).toHaveBeenCalledWith(expect.objectContaining({
            revision: 5,
            modelExperiment: expect.objectContaining({
                arms: [
                    expect.objectContaining({ id: 'gemini', enabled: true, weight: 100 }),
                    expect.objectContaining({ id: 'claude', enabled: false, weight: 0 }),
                ],
            }),
        }), expect.objectContaining({ updatedBy: 'shared-secret' }))
        expect(JSON.stringify(mocks.saveSalesSettings.mock.calls[0])).not.toContain('private')
    })

    it('publishes an exact allocation without accepting arbitrary fields', async () => {
        const response = await POST(request('POST', {
            action: 'set_allocation', revision: 5,
            weights: { gemini: 60, claude: 40 }, ignored: 'private',
        }))

        expect(response.status).toBe(200)
        expect(mocks.saveSalesSettings).toHaveBeenCalledWith(expect.objectContaining({
            modelExperiment: expect.objectContaining({
                arms: [
                    expect.objectContaining({ id: 'gemini', weight: 60, enabled: true }),
                    expect.objectContaining({ id: 'claude', weight: 40, enabled: true }),
                ],
            }),
        }), expect.any(Object))
        expect(JSON.stringify(mocks.saveSalesSettings.mock.calls[0])).not.toContain('ignored')
    })

    it.each([
        ['STALE_REVISION', 409],
        ['MODEL_ARM_CREDENTIAL_MISSING', 400],
    ])('returns a safe actionable %s publication error', async (code, status) => {
        mocks.saveSalesSettings.mockRejectedValueOnce(new Error(code))
        const response = await POST(request('POST', { action: 'pause_arm', revision: 5, armId: 'claude' }))
        expect(response.status).toBe(status)
        expect(await response.json()).toEqual({ error: code })
    })
})
