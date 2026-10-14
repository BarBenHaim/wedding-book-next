import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ settings: vi.fn(), due: vi.fn(), leads: vi.fn(), media: vi.fn(), prepare: vi.fn(), send: vi.fn(), model: vi.fn(), auth: vi.fn() }))
vi.mock('@/lib/firebaseAdmin', () => ({ adminDb: {}, adminAuth: { verifyIdToken: mocks.auth } }))
vi.mock('@/lib/salesAgent/settingsStore', () => ({ readSalesSettings: mocks.settings }))
vi.mock('@/lib/salesAgent/leads', () => ({ dueFollowUps: mocks.due, prepareFollowUpDelivery: mocks.prepare,
    recordDeliveryEvent: vi.fn(), listLeads: mocks.leads, reviveOrphans: vi.fn(), settleStaleDeliveries: vi.fn(), listMedia: mocks.media, recordFollowUpRun: vi.fn() }))
vi.mock('@/lib/salesAgent/agent', () => ({ callClaude: mocks.model, parseAgentJson: vi.fn(), resolveFollowUp: vi.fn() }))
vi.mock('@/lib/salesAgent/whatsapp', () => ({ canSendWhatsApp: vi.fn(() => true), sendWhatsAppText: mocks.send,
    sendWhatsAppImage: mocks.send, sendWhatsAppVideo: mocks.send, sendWhatsAppTemplate: mocks.send }))
import { GET } from '@/app/api/sales-agent/followups/route'

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('CRON_SECRET', 'synthetic-cron-secret'); vi.stubEnv('SALES_AGENT_SECRET', 'synthetic-make-secret') })
afterEach(() => vi.unstubAllEnvs())

describe('follow-up-only incident containment', () => {
    it.each([
        [{ authorization: 'Bearer synthetic-cron-secret' }, ''],
        [{ 'x-wt-secret': 'synthetic-make-secret' }, ''],
        [{ 'x-wt-secret': 'synthetic-make-secret' }, '?dry=1'],
    ])('returns no sendable items before queue/model/provider work for %j %s', async (headers, query) => {
        const response = await GET(new Request(`https://app.example.invalid/api/sales-agent/followups${query}`, { headers }))
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ ok: true, skipped: 'followups-paused-for-repair', delivery: 'none', count: 0, items: [] })
        for (const work of [mocks.settings, mocks.due, mocks.leads, mocks.media, mocks.prepare, mocks.send, mocks.model]) expect(work).not.toHaveBeenCalled()
    })
    it('retains authentication while paused', async () => {
        const response = await GET(new Request('https://app.example.invalid/api/sales-agent/followups'))
        expect(response.status).toBe(401)
        expect(mocks.due).not.toHaveBeenCalled()
        expect(mocks.send).not.toHaveBeenCalled()
    })
})
