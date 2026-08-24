import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPENING_EXPERIMENT } from '@/lib/salesAgent/openingExperiment'

const mocks = vi.hoisted(() => ({
    verifyIdToken: vi.fn(),
    isSuperAdmin: vi.fn(),
    readSalesSettings: vi.fn(),
    saveSalesSettings: vi.fn(),
    publishSalesSettingsSnapshot: vi.fn(),
    restoreSalesSettingsRevision: vi.fn(),
    listSalesSettingsHistory: vi.fn(),
    listMedia: vi.fn(),
    listLeads: vi.fn(),
    summarizeOpeningExperiment: vi.fn(),
    openingLeadRow: vi.fn(),
    listOpeningApprovals: vi.fn(),
    generateOpeningApproval: vi.fn(),
    decideOpeningApproval: vi.fn(),
}))

vi.mock('@/lib/firebaseAdmin', () => ({ adminAuth: { verifyIdToken: mocks.verifyIdToken } }))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: mocks.isSuperAdmin }))
vi.mock('@/lib/salesAgent/settingsStore', () => ({
    readSalesSettings: mocks.readSalesSettings,
    saveSalesSettings: mocks.saveSalesSettings,
    publishSalesSettingsSnapshot: mocks.publishSalesSettingsSnapshot,
    restoreSalesSettingsRevision: mocks.restoreSalesSettingsRevision,
    listSalesSettingsHistory: mocks.listSalesSettingsHistory,
}))
vi.mock('@/lib/salesAgent/leads', () => ({ listMedia: mocks.listMedia, listLeads: mocks.listLeads }))
vi.mock('@/lib/salesAgent/openingAnalytics', () => ({
    summarizeOpeningExperiment: mocks.summarizeOpeningExperiment,
    openingLeadRow: mocks.openingLeadRow,
}))
vi.mock('@/lib/salesAgent/openingApprovals', () => ({
    listOpeningApprovals: mocks.listOpeningApprovals,
    generateOpeningApproval: mocks.generateOpeningApproval,
    decideOpeningApproval: mocks.decideOpeningApproval,
}))

let GET, POST

const settings = {
    revision: 7,
    enabled: false,
    mode: 'opening_only',
    openingExperiment: DEFAULT_OPENING_EXPERIMENT,
}

beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.SALES_AGENT_SECRET = 'experiment-route-secret'
    mocks.readSalesSettings.mockResolvedValue(settings)
    mocks.saveSalesSettings.mockResolvedValue({ ...settings, revision: 8 })
    mocks.publishSalesSettingsSnapshot.mockResolvedValue({ ...settings, revision: 8 })
    mocks.restoreSalesSettingsRevision.mockResolvedValue({ ...settings, revision: 8 })
    mocks.listSalesSettingsHistory.mockResolvedValue([{ revision: 6, updatedAt: 123, updatedBy: 'owner', changeNote: 'copy' }])
    mocks.listMedia.mockResolvedValue([{ key: 'owner-voice', kind: 'audio', url: 'https://storage.test/voice.ogg' }])
    mocks.listLeads.mockResolvedValue([{ phone: 'private-phone', openingVariantId: 'A' }])
    mocks.summarizeOpeningExperiment.mockReturnValue({ trendReady: false, variants: {} })
    mocks.openingLeadRow.mockReturnValue({ id: 'safe-row', phone: '•••1234', variantId: 'A' })
    mocks.listOpeningApprovals.mockResolvedValue([])
    mocks.generateOpeningApproval.mockResolvedValue({ id: 'a'.repeat(32), status: 'ready' })
    mocks.decideOpeningApproval.mockResolvedValue({ id: 'a'.repeat(32), status: 'sent' })
    ;({ GET, POST } = await import('@/app/api/sales-agent/experiment/route'))
})

const request = (method, body, secret = 'experiment-route-secret') => new Request('http://localhost/api/sales-agent/experiment', {
    method,
    headers: { 'x-wt-secret': secret, 'content-type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
})

describe('opening experiment route', () => {
    it('authenticates before reading settings, history, or media', async () => {
        const response = await GET(request('GET', undefined, 'wrong'))
        expect(response.status).toBe(401)
        expect(mocks.readSalesSettings).not.toHaveBeenCalled()
        expect(mocks.listSalesSettingsHistory).not.toHaveBeenCalled()
        expect(mocks.listMedia).not.toHaveBeenCalled()
    })

    it('returns only versioned experiment control truth and registered media metadata', async () => {
        const response = await GET(request('GET'))
        const body = await response.json()
        expect(response.status).toBe(200)
        expect(body).toEqual({
            ok: true,
            revision: 7,
            enabled: false,
            experiment: DEFAULT_OPENING_EXPERIMENT,
            history: [{ revision: 6, updatedAt: 123, updatedBy: 'owner', changeNote: 'copy' }],
            media: [{ key: 'owner-voice', kind: 'audio', url: 'https://storage.test/voice.ogg', caption: '', when: '', source: 'upload' }],
            metrics: { trendReady: false, variants: {} },
            leads: [{ id: 'safe-row', phone: '•••1234', variantId: 'A' }],
            approvals: [],
        })
        expect(JSON.stringify(body)).not.toMatch(/transcript|mediaId|experiment-route-secret/)
        expect(mocks.summarizeOpeningExperiment).toHaveBeenCalledWith(
            [{ phone: 'private-phone', openingVariantId: 'A' }],
            expect.objectContaining({ experiment: DEFAULT_OPENING_EXPERIMENT }),
        )
    })

    it('publishes an allowlisted experiment against the expected revision', async () => {
        const experiment = structuredClone(DEFAULT_OPENING_EXPERIMENT)
        experiment.enabled = true
        const response = await POST(request('POST', {
            action: 'publish', revision: 7, experiment, changeNote: 'מפעיל ניסוי', ignored: 'attacker-value',
        }))
        expect(response.status).toBe(200)
        expect(mocks.publishSalesSettingsSnapshot).toHaveBeenCalledWith({
            revision: 7,
            openingExperiment: experiment,
            expectedVariableDrafts: {},
            changeNote: 'מפעיל ניסוי',
        }, expect.objectContaining({
            updatedBy: 'shared-secret',
            registeredMediaKeys: expect.arrayContaining(['owner-voice']),
        }))
        expect(mocks.saveSalesSettings).not.toHaveBeenCalled()
        expect(JSON.stringify(mocks.publishSalesSettingsSnapshot.mock.calls[0])).not.toContain('attacker-value')
    })

    it('restores a historical revision as a new current revision', async () => {
        const response = await POST(request('POST', { action: 'restore', revision: 7, restoreRevision: 3 }))
        expect(response.status).toBe(200)
        expect(mocks.restoreSalesSettingsRevision).toHaveBeenCalledWith(3, expect.objectContaining({
            expectedRevision: 7,
            updatedBy: 'shared-secret',
        }))
    })

    it('returns actionable private publication conflicts without leaking storage details', async () => {
        mocks.publishSalesSettingsSnapshot.mockRejectedValueOnce(new Error('STALE_VARIABLE_DRAFT'))
        const stale = await POST(request('POST', {
            action: 'publish', revision: 7, experiment: DEFAULT_OPENING_EXPERIMENT,
            expectedVariableDrafts: { voice_intro: 'v2' },
        }))
        expect(stale.status).toBe(409)
        expect(await stale.json()).toEqual({ error: 'STALE_VARIABLE_DRAFT' })

        mocks.publishSalesSettingsSnapshot.mockRejectedValueOnce(new Error('OPENING_VARIABLE_VERSION_MISSING'))
        const missing = await POST(request('POST', {
            action: 'publish', revision: 7, experiment: DEFAULT_OPENING_EXPERIMENT,
            expectedVariableDrafts: { voice_intro: 'v2' },
        }))
        expect(missing.status).toBe(404)
        expect(await missing.json()).toEqual({ error: 'OPENING_VARIABLE_VERSION_MISSING' })
    })

    it.each([
        ['generate_approval', mocks.generateOpeningApproval, undefined],
        ['approve', mocks.decideOpeningApproval, 'approve'],
        ['reject', mocks.decideOpeningApproval, 'reject'],
    ])('runs the authenticated %s action against one bounded approval id', async (action, handler, decision) => {
        const approvalId = 'a'.repeat(32)
        const response = await POST(request('POST', { action, approvalId, ignored: 'private-value' }))
        expect(response.status).toBe(200)
        if (decision) expect(handler).toHaveBeenCalledWith(approvalId, decision)
        else expect(handler).toHaveBeenCalledWith(approvalId)
        expect(JSON.stringify(handler.mock.calls)).not.toContain('private-value')
    })

    it('does not run approval actions without authentication or with an invalid id', async () => {
        const denied = await POST(request('POST', { action: 'approve', approvalId: 'a'.repeat(32) }, 'wrong'))
        expect(denied.status).toBe(401)
        const invalid = await POST(request('POST', { action: 'approve', approvalId: 'not-safe' }))
        expect(invalid.status).toBe(400)
        expect(mocks.decideOpeningApproval).not.toHaveBeenCalled()
    })

    it('rejects malformed, oversized, unsupported, and stale requests with fixed errors', async () => {
        expect((await POST(request('POST', '{bad'))).status).toBe(400)
        expect((await POST(request('POST', 'x'.repeat(100_001)))).status).toBe(413)
        expect((await POST(request('POST', { action: 'delete-all', revision: 7 }))).status).toBe(400)
        mocks.publishSalesSettingsSnapshot.mockRejectedValueOnce(new Error('STALE_REVISION'))
        const stale = await POST(request('POST', { action: 'publish', revision: 6, experiment: DEFAULT_OPENING_EXPERIMENT }))
        expect(stale.status).toBe(409)
        expect(await stale.json()).toEqual({ error: 'STALE_REVISION' })
    })
})
