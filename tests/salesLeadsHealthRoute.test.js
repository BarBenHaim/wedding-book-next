import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    listLeads: vi.fn(),
    readSpend: vi.fn(),
    readSalesHealthRuntime: vi.fn(),
    dueFollowUps: vi.fn(),
}))

vi.mock('@/lib/firebaseAdmin', () => ({ adminAuth: { verifyIdToken: vi.fn() } }))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: vi.fn(() => false) }))
vi.mock('@/lib/salesAgent/leads', () => ({
    listLeads: mocks.listLeads,
    getLead: vi.fn(),
    adminPatchLead: vi.fn(),
    deleteLeads: vi.fn(),
    isTestPhone: vi.fn(),
    readSpend: mocks.readSpend,
    readSalesHealthRuntime: mocks.readSalesHealthRuntime,
    dueFollowUps: mocks.dueFollowUps,
}))

let GET

beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.SALES_AGENT_SECRET = 'health-route-secret'
    mocks.listLeads.mockResolvedValue([])
    mocks.readSpend.mockResolvedValue(null)
    mocks.dueFollowUps.mockResolvedValue([])
    mocks.readSalesHealthRuntime.mockResolvedValue({
        inbound: {
            lastHeartbeatAtMs: Date.now() - 1000,
            makeStatus: 'active',
            operationsStatus: 'unknown',
            payload: 'private-runtime-payload-sentinel',
        },
        breaker: { consecutiveFailures: 0, secret: 'private-breaker-secret-sentinel' },
        deliveryAttempts: [{
            status: 'accepted',
            deliveryPendingUntilMs: Date.now() + 60_000,
            providerMessageId: 'private-provider-id-sentinel',
            leadId: 'private-lead-id-sentinel',
        }],
        followupsLastRunAtMs: Date.now() - 2000,
    })
    ;({ GET } = await import('@/app/api/sales-agent/leads/route'))
})

describe('sales leads health response', () => {
    it('aggregates real runtime and due queue data into a sanitized health object', async () => {
        mocks.dueFollowUps.mockResolvedValue(Array.from({ length: 26 }, (_, i) => ({
            phone: `non-dialable-followup-${i}`,
            text: `private-followup-text-${i}`,
        })))

        const response = await GET(new Request('http://localhost/api/sales-agent/leads', {
            headers: { 'x-wt-secret': 'health-route-secret' },
        }))
        const body = await response.json()
        const health = JSON.stringify(body.health)

        expect(response.status).toBe(200)
        expect(body.health.whatsapp).toMatchObject({ status: 'amber', accepted: 1, delivered: 0, read: 0 })
        expect(body.health.followups).toMatchObject({ status: 'red', due: 26 })
        expect(mocks.readSalesHealthRuntime).toHaveBeenCalledTimes(1)
        expect(mocks.dueFollowUps).toHaveBeenCalledWith(body.today, 26)
        for (const forbidden of ['runtime-payload', 'breaker-secret', 'provider-id', 'lead-id', 'non-dialable-followup', 'followup-text']) {
            expect(health).not.toContain(forbidden)
        }
    })

    it('returns a normalized failure instead of leaking a Firestore error', async () => {
        mocks.readSalesHealthRuntime.mockRejectedValue(new Error('private firestore body sentinel'))
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

        const response = await GET(new Request('http://localhost/api/sales-agent/leads', {
            headers: { 'x-wt-secret': 'health-route-secret' },
        }))

        expect(response.status).toBe(500)
        expect(await response.json()).toEqual({ error: 'health-read-failed' })
        expect(JSON.stringify(logged.mock.calls)).not.toContain('private firestore body sentinel')
    })
})
