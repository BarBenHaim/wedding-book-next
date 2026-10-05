import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), get: vi.fn(), collection: vi.fn() }))
vi.mock('@/lib/firebaseAdmin', () => ({ adminAuth: { verifyIdToken: mock.auth }, adminDb: { collection: mock.collection } }))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: mock.admin }))
import { GET } from '@/app/api/sales-agent/cohorts/route'
const query = '?from=2026-10-01T00:00:00Z&to=2026-10-02T00:00:00Z'
const request = (suffix = query, headers = { authorization: 'Bearer synthetic-token' }) => new Request(`https://example.test/api/sales-agent/cohorts${suffix}`, { headers })
beforeEach(() => {
    vi.clearAllMocks()
    mock.auth.mockResolvedValue({ uid: 'synthetic-admin', email: 'synthetic@example.test', email_verified: true })
    mock.admin.mockReturnValue(true)
    mock.get.mockResolvedValue({ docs: [] })
    const chain = { orderBy: () => chain, limit: () => chain, get: mock.get }
    mock.collection.mockReturnValue(chain)
})
describe('private aggregate cohort API', () => {
    it('requires revoked-token-checked verified admin identity', async () => {
        expect((await GET(request(query, {}))).status).toBe(401)
        mock.admin.mockReturnValue(false)
        expect((await GET(request())).status).toBe(403)
        expect(mock.auth).toHaveBeenCalledWith('synthetic-token', true)
        expect(mock.collection).not.toHaveBeenCalled()
    })
    it('rejects a missing window and oversized query', async () => {
        expect((await GET(request(''))).status).toBe(400)
        expect((await GET(request('?from=2020-01-01&to=2026-10-02'))).status).toBe(400)
        expect(mock.collection).not.toHaveBeenCalled()
    })
    it('returns an honest empty report, not invented conversions', async () => {
        const result = await GET(request())
        expect(result.status).toBe(200)
        expect(await result.json()).toMatchObject({ ok: true, partial: false, cohorts: [] })
    })
    it('refuses misleading rates when the bounded population is truncated', async () => {
        mock.get.mockResolvedValueOnce({ docs: Array.from({ length: 5001 }, () => ({ id: 'synthetic', data: () => ({}) })) })
        expect(await (await GET(request())).json()).toMatchObject({ ok: false, partial: true, cohorts: [] })
    })
    it('reports a source failure instead of zero conversions', async () => {
        mock.get.mockRejectedValueOnce(new Error('synthetic source failure'))
        expect((await GET(request())).status).toBe(503)
    })
})
