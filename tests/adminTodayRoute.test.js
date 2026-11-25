import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    email: 'barbenbh@gmail.com',
    books: vi.fn(), followups: vi.fn(), drafts: vi.fn(), samples: vi.fn(), requests: vi.fn(), sampleSwitch: vi.fn(),
    claude: vi.fn(), settings: vi.fn(), media: vi.fn(), getAll: vi.fn(),
}))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: email => email === 'barbenbh@gmail.com' }))
vi.mock('@/lib/firebaseAdmin', () => ({
    adminAuth: { verifyIdToken: async token => { if (token !== 'good') throw new Error('bad'); return { email: mocks.email } } },
    adminDb: { collection: name => ({ doc: id => ({ path: `${name}/${id}` }) }), getAll: mocks.getAll },
}))
vi.mock('@/lib/customerData', () => ({ loadCustomerBooks: mocks.books, readFollowupSettings: mocks.followups }))
vi.mock('@/lib/salesAgent/customerAgent', () => ({ listDrafts: mocks.drafts, readAgentSettings: mocks.requests }))
vi.mock('@/lib/salesAgent/designSamples', () => ({ listSamples: mocks.samples, readDesignSettings: mocks.sampleSwitch }))
vi.mock('@/lib/salesAgent/claudeHealth', () => ({ readClaudeHealth: mocks.claude }))
vi.mock('@/lib/salesAgent/settingsStore', () => ({ readSalesSettings: mocks.settings }))
vi.mock('@/lib/salesAgent/leads', () => ({ listMedia: mocks.media }))

import { GET } from '@/app/api/admin/today/route'

const request = (token = 'good') => new Request('http://localhost/api/admin/today', { headers: { authorization: `Bearer ${token}` } })

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-25T10:00:00Z'))
    mocks.email = 'barbenbh@gmail.com'
    mocks.books.mockReset().mockResolvedValue([])
    mocks.followups.mockReset().mockResolvedValue({ enabled: false, enabledDay: null })
    mocks.drafts.mockReset().mockResolvedValue([])
    mocks.samples.mockReset().mockResolvedValue([])
    mocks.requests.mockReset().mockResolvedValue({ enabled: true, testPhones: ['x'] })
    mocks.sampleSwitch.mockReset().mockResolvedValue({ enabled: false, testPhones: [] })
    mocks.claude.mockReset().mockResolvedValue({ alert: null })
    mocks.media.mockReset().mockResolvedValue([])
    mocks.settings.mockReset().mockResolvedValue({ enabled: true, mode: 'full_sales', provider: 'anthropic', model: 'claude-opus-5-5', modelExperiment: { enabled: false } })
    mocks.getAll.mockReset().mockImplementation(async (...refs) => refs.map(ref => ({
        exists: ref.path === 'sales_usage/2026-11-25', data: () => ({ usd: 1.2, anthropicUsd: 1.2, calls: 5 }),
    })))
})

describe('the today screen data', () => {
    it('is for the super admin only', async () => {
        mocks.email = 'someone@example.com'
        expect((await GET(request())).status).toBe(403)
        expect((await GET(request('bad'))).status).toBe(403)
        expect(mocks.books).not.toHaveBeenCalled()
    })

    it('reads this month day by day and shows who answers, without any phone list', async () => {
        const body = await (await GET(request())).json()

        expect(mocks.getAll.mock.calls[0]).toHaveLength(25)
        expect(body.spend).toEqual({ month: 1.2, anthropic: 1.2, openai: 0, other: 0 })
        expect(body.bot).toMatchObject({ model: 'claude-opus-5-5', modelLabel: 'Claude Opus 5.5', mode: 'full_sales', callsToday: 5, switches: { requests: true, samples: false, followups: false } })
        expect(JSON.stringify(body)).not.toContain('testPhones')
    })

    it('says a running experiment decides the model, rather than naming one', async () => {
        mocks.settings.mockResolvedValue({ enabled: true, mode: 'full_sales', model: 'gpt-4.1-mini', modelExperiment: { enabled: true } })

        expect((await (await GET(request())).json()).bot.modelLabel).toBe('לפי ניסוי מודלים')
    })

    it('still answers when parts cannot be read, and names them', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        mocks.drafts.mockRejectedValue(new Error('x'))
        mocks.settings.mockRejectedValue(new Error('x'))
        mocks.getAll.mockRejectedValue(new Error('x'))

        const response = await GET(request())
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.unread).toContain('בקשות לקוחות')
        expect(body.bot).toBeNull()
        expect(body.spend).toBeNull()
    })
})
