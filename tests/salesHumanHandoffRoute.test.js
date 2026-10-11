import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
const deps = vi.hoisted(() => ({ verifyIdToken: vi.fn(), getHumanHandoff: vi.fn(), listHumanHandoffs: vi.fn(), requestHumanHandoff: vi.fn(), updateHumanHandoff: vi.fn() }))
vi.mock('@/lib/firebaseAdmin', () => ({ adminAuth: { verifyIdToken: deps.verifyIdToken } }))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: email => email === 'admin@example.test' }))
vi.mock('@/lib/salesAgent/leads', () => deps)
import { GET, POST } from '@/app/api/sales-agent/handoffs/route'
const ID = 'a'.repeat(32)
const request = (body, token = 'test-token', method = 'POST') => new Request('http://localhost/api/sales-agent/handoffs', { method, headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'x-wt-secret': 'fixture-secret' }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) })
beforeEach(() => {
    vi.clearAllMocks()
    deps.verifyIdToken.mockResolvedValue({ uid: 'fixture-admin', email: 'admin@example.test', email_verified: true })
    deps.updateHumanHandoff.mockResolvedValue({ ok: true, taskId: ID, status: 'released' })
    deps.requestHumanHandoff.mockResolvedValue({ ok: true, taskId: ID, status: 'requested' })
    deps.listHumanHandoffs.mockResolvedValue([])
    vi.stubEnv('SALES_AGENT_SECRET', 'fixture-secret')
})
afterEach(() => vi.unstubAllEnvs())
describe('authenticated service task API', () => {
    it('rejects webhook secret-only access for reads and lifecycle writes', async () => {
        expect((await GET(request(null, null, 'GET'))).status).toBe(401)
        expect((await POST(request({ phone: 'fixture-41', taskId: ID, action: 'release' }, null))).status).toBe(401)
        expect(deps.updateHumanHandoff).not.toHaveBeenCalled()
    })
    it.each([{ uid: 'test', email: 'customer@example.test', email_verified: true }, { uid: 'test', email: 'admin@example.test', email_verified: false }, { email: 'admin@example.test', email_verified: true }])('rejects non-admin or unverified identities', async identity => {
        deps.verifyIdToken.mockResolvedValue(identity)
        expect((await POST(request({ phone: 'fixture-41', taskId: ID, action: 'release' }))).status).toBe(401)
    })
    it('requires a matching task reference for intentional release and checks revocation', async () => {
        expect((await POST(request({ phone: 'fixture-41', action: 'release' }))).status).toBe(400)
        const response = await POST(request({ phone: 'fixture-41', taskId: ID, action: 'release' }))
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ humanTakeover: false, status: 'released' })
        expect(deps.verifyIdToken).toHaveBeenLastCalledWith('test-token', true)
        expect(deps.updateHumanHandoff).toHaveBeenCalledWith({ phone: '41', taskId: ID, action: 'release', actor: 'admin:fixture-admin' })
    })
    it('resolving retains human takeover and exposes storage failure honestly', async () => {
        deps.updateHumanHandoff.mockResolvedValueOnce({ ok: true, taskId: ID, status: 'resolved' })
        expect(await (await POST(request({ phone: 'fixture-41', taskId: ID, action: 'resolve' }))).json()).toMatchObject({ humanTakeover: true })
        deps.requestHumanHandoff.mockRejectedValueOnce(new Error('storage unavailable with internal details'))
        const response = await POST(request({ phone: 'fixture-41', action: 'request' }))
        expect(response.status).toBe(503)
        expect(await response.json()).toEqual({ error: 'handoff-store-unavailable' })
    })
    it('returns conflict when a stale task ID targets a newer human request', async () => {
        deps.updateHumanHandoff.mockRejectedValueOnce(Object.assign(new Error('stale task'), { code: 'TASK_MISMATCH' }))
        expect((await POST(request({ phone: 'fixture-41', taskId: ID, action: 'release' }))).status).toBe(409)
    })
})
