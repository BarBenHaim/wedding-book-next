import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    verifyIdToken: vi.fn(),
    isSuperAdmin: vi.fn(),
    readSalesSettings: vi.fn(),
    saveSalesSettings: vi.fn(),
    listMedia: vi.fn(),
    buildSystemPrompt: vi.fn(),
}))

vi.mock('@/lib/firebaseAdmin', () => ({ adminAuth: { verifyIdToken: mocks.verifyIdToken } }))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: mocks.isSuperAdmin }))
vi.mock('@/lib/salesAgent/settingsStore', () => ({
    readSalesSettings: mocks.readSalesSettings,
    saveSalesSettings: mocks.saveSalesSettings,
}))
vi.mock('@/lib/salesAgent/leads', () => ({ listMedia: mocks.listMedia }))
vi.mock('@/lib/salesAgent/prompt', () => ({ buildSystemPrompt: mocks.buildSystemPrompt }))

let GET, PUT

const settings = {
    revision: 3, enabled: true, provider: 'auto', model: 'claude-sonnet-4-5',
    fallbackModel: 'claude-haiku-4-5', businessInstructions: '',
    activeOpeningIds: ['question_first'], openingMediaSequence: [],
    immutablePolicy: 'אין שיחות טלפון', updatedAt: null, updatedBy: null,
    openingExperiment: { enabled: false, minSamplePerVariant: 30, variants: [] },
}

beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.SALES_AGENT_SECRET = 'settings-route-secret'
    mocks.readSalesSettings.mockResolvedValue(settings)
    mocks.saveSalesSettings.mockResolvedValue({ ...settings, revision: 4 })
    mocks.listMedia.mockResolvedValue([{ key: 'photo-a', kind: 'image', url: 'https://example.test/a.jpg' }])
    mocks.buildSystemPrompt.mockReturnValue('effective prompt preview')
    ;({ GET, PUT } = await import('@/app/api/sales-agent/settings/route'))
})

const request = (method, body, secret = 'settings-route-secret') => new Request('http://localhost/api/sales-agent/settings', {
    method,
    headers: { 'x-wt-secret': secret, 'content-type': 'application/json' },
    body: body == null ? undefined : JSON.stringify(body),
})

describe('sales agent settings route', () => {
    it('rejects unauthenticated reads before storage work', async () => {
        const response = await GET(request('GET', null, 'wrong'))
        expect(response.status).toBe(401)
        expect(mocks.readSalesSettings).not.toHaveBeenCalled()
    })

    it('returns effective settings, prompt, model registry, media and executable openings without secrets', async () => {
        const response = await GET(request('GET'))
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toMatchObject({ ok: true, settings, effectivePrompt: 'effective prompt preview' })
        expect(body.models).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'claude-sonnet-4-5' })]))
        expect(body.media).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'photo-a', kind: 'image' })]))
        expect(body.openings.some(row => row.id === 'call_offer')).toBe(false)
        expect(JSON.stringify(body)).not.toContain('settings-route-secret')
    })

    it('publishes with the authenticated identity and registered media allowlist', async () => {
        const response = await PUT(request('PUT', {
            revision: 3, enabled: true, provider: 'auto', model: 'claude-sonnet-4-5',
            businessInstructions: 'להציג מחיר מוקדם', activeOpeningIds: ['price_upfront'],
            openingMediaSequence: ['photo-a'], changeNote: 'ניסוי',
        }))

        expect(response.status).toBe(200)
        expect(mocks.saveSalesSettings).toHaveBeenCalledWith(expect.objectContaining({ revision: 3 }), expect.objectContaining({
            updatedBy: 'shared-secret', registeredMediaKeys: expect.arrayContaining(['photo-a']),
        }))
    })

    it('requires the dedicated immutable-snapshot endpoint for opening experiment changes', async () => {
        const response = await PUT(request('PUT', {
            revision: 3,
            openingExperiment: { enabled: true, minSamplePerVariant: 30, variants: [] },
        }))

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({ error: 'OPENING_EXPERIMENT_REQUIRES_PUBLISH' })
        expect(mocks.saveSalesSettings).not.toHaveBeenCalled()
    })

    it('returns a private stale-revision conflict', async () => {
        mocks.saveSalesSettings.mockRejectedValue(new Error('STALE_REVISION'))
        const response = await PUT(request('PUT', { revision: 2 }))
        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({ error: 'STALE_REVISION' })
    })
})
