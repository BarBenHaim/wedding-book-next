import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    verifyIdToken: vi.fn(),
    isSuperAdmin: vi.fn(),
    listMedia: vi.fn(),
    readSalesSettings: vi.fn(),
    loadOpeningVariableVersions: vi.fn(),
    signOpeningVariableDownload: vi.fn(),
    sendOpeningVariantTest: vi.fn(),
}))

vi.mock('@/lib/firebaseAdmin', () => ({ adminAuth: { verifyIdToken: mocks.verifyIdToken } }))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: mocks.isSuperAdmin }))
vi.mock('@/lib/salesAgent/leads', () => ({ listMedia: mocks.listMedia }))
vi.mock('@/lib/salesAgent/settingsStore', () => ({ readSalesSettings: mocks.readSalesSettings }))
vi.mock('@/lib/salesAgent/openingVariableRuntimeStore', () => ({
    loadOpeningVariableVersions: mocks.loadOpeningVariableVersions,
    signOpeningVariableDownload: mocks.signOpeningVariableDownload,
}))
vi.mock('@/lib/salesAgent/openingTestSend', () => ({ sendOpeningVariantTest: mocks.sendOpeningVariantTest }))

let POST
const experiment = { enabled: false, variants: [{ id: 'A', revision: 3, blocks: [{ id: 'a', type: 'stop' }] }] }

const request = (body, secret = 'test-secret') => new Request('https://example.test/api/sales-agent/experiment/test-send', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-wt-secret': secret }, body: JSON.stringify(body),
})

beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.SALES_AGENT_SECRET = 'test-secret'
    process.env.SALES_TEST_PHONE = '972526618184'
    mocks.listMedia.mockResolvedValue([])
    mocks.readSalesSettings.mockResolvedValue({ openingExperiment: experiment })
    mocks.loadOpeningVariableVersions.mockResolvedValue({})
    mocks.sendOpeningVariantTest.mockResolvedValue({ ok: true, variantId: 'A', variantRevision: 3, sentParts: 2, recipientMasked: '•••8184' })
    ;({ POST } = await import('@/app/api/sales-agent/experiment/test-send/route'))
})

describe('opening mobile test route', () => {
    it('rejects unauthenticated requests before reading or sending', async () => {
        const response = await POST(request({ variantId: 'A' }, 'wrong'))
        expect(response.status).toBe(401)
        expect(mocks.readSalesSettings).not.toHaveBeenCalled()
        expect(mocks.sendOpeningVariantTest).not.toHaveBeenCalled()
    })

    it.each([
        {},
        { variantId: 'D' },
        { variantId: 'A', phone: 'arbitrary-recipient' },
        { variantId: 'v_short' },
    ])('accepts only one exact valid variant id without a recipient override', async body => {
        const response = await POST(request(body))
        expect(response.status).toBe(400)
        expect(mocks.sendOpeningVariantTest).not.toHaveBeenCalled()
    })

    it('passes a dynamic id to the published-experiment sender', async () => {
        const dynamicId = 'v_aaaaaaaaaaaa'
        const dynamicExperiment = {
            enabled: false,
            variants: [{ id: dynamicId, revision: 1, blocks: [{ id: 'stop', type: 'stop' }] }],
        }
        mocks.readSalesSettings.mockResolvedValue({ openingExperiment: dynamicExperiment })
        mocks.sendOpeningVariantTest.mockResolvedValue({
            ok: true, variantId: dynamicId, variantRevision: 1, sentParts: 1, recipientMasked: '•••8184',
        })

        const response = await POST(request({ variantId: dynamicId }))

        expect(response.status).toBe(200)
        expect(mocks.sendOpeningVariantTest).toHaveBeenCalledWith(expect.objectContaining({
            variantId: dynamicId,
            experiment: dynamicExperiment,
            recipient: '972526618184',
        }))
    })

    it('sends only the published variant to the fixed configured test phone', async () => {
        const response = await POST(request({ variantId: 'A' }))
        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({ ok: true, variantId: 'A', variantRevision: 3, sentParts: 2, recipientMasked: '•••8184' })
        expect(mocks.sendOpeningVariantTest).toHaveBeenCalledWith(expect.objectContaining({
            variantId: 'A', recipient: '972526618184', experiment,
            variableVersions: {}, signDownload: mocks.signOpeningVariableDownload,
        }))
        expect(JSON.stringify(mocks.sendOpeningVariantTest.mock.calls)).not.toContain('phone:')
    })

    it('returns a fixed private error when the test transport is unavailable', async () => {
        mocks.sendOpeningVariantTest.mockRejectedValue(Object.assign(new Error('private provider body'), { code: 'TEST_RECIPIENT_NOT_CONFIGURED' }))
        const response = await POST(request({ variantId: 'A' }))
        expect(response.status).toBe(503)
        await expect(response.json()).resolves.toEqual({ error: 'OPENING_TEST_UNAVAILABLE' })
    })
})
