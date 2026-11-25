import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    verify: vi.fn(), leads: vi.fn(), books: vi.fn(), settings: vi.fn(), drafts: vi.fn(), samples: vi.fn(), selected: [],
}))

vi.mock('next/server', () => ({
    NextResponse: { json: (body, init) => ({ status: init?.status || 200, json: async () => body }) },
}))
vi.mock('@/lib/firebaseAdmin', () => ({
    adminAuth: { verifyIdToken: mocks.verify },
    adminDb: {
        collection: name => ({
            select: (...fields) => {
                mocks.selected.push({ name, fields })
                return { get: mocks.leads }
            },
        }),
    },
}))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: email => email === 'boss@example.com' }))
vi.mock('@/lib/customerData', () => ({ loadCustomerBooks: mocks.books, readFollowupSettings: mocks.settings }))
vi.mock('@/lib/salesAgent/customerAgent', () => ({ listDrafts: mocks.drafts }))
vi.mock('@/lib/salesAgent/designSamples', () => ({ listSamples: mocks.samples }))

import { GET } from '@/app/api/admin/people/route'

const request = token => ({ headers: { get: name => (name === 'authorization' && token ? `Bearer ${token}` : null) } })
const doc = (id, data) => ({ id, data: () => data })

beforeEach(() => {
    vi.clearAllMocks()
    mocks.selected.length = 0
    mocks.verify.mockResolvedValue({ email: 'boss@example.com' })
    mocks.leads.mockResolvedValue({ docs: [doc('972521111111', { stage: 'ready_to_pay', profileName: 'מיכל', lastInboundAt: Date.now(), turns: [{ role: 'user', text: 'secret-turn' }] })] })
    mocks.books.mockResolvedValue([])
    mocks.settings.mockResolvedValue({ enabled: false, enabledDay: null })
    mocks.drafts.mockResolvedValue([])
    mocks.samples.mockResolvedValue([])
})

describe('GET /api/admin/people', () => {
    it('answers only the super admin', async () => {
        expect((await GET(request())).status).toBe(403)
        mocks.verify.mockResolvedValue({ email: 'someone@example.com' })
        expect((await GET(request('t'))).status).toBe(403)
        expect(mocks.leads).not.toHaveBeenCalled()
    })

    it('reads every lead once, without a limit, and never returns the transcripts', async () => {
        const body = await (await GET(request('t'))).json()

        expect(mocks.leads).toHaveBeenCalledTimes(1)
        expect(mocks.selected[0].name).toBe('sales_leads')
        expect(mocks.selected[0].fields).toContain('lastInboundAt')
        expect(mocks.books.mock.calls[0][0].leads).toHaveLength(1)
        expect(body.rows).toMatchObject([{ key: 'l:972521111111', next: { key: 'ready_to_pay' }, inToday: true }])
        expect(body.counts.today).toBe(1)
        expect(body.unread).toEqual([])
        expect(JSON.stringify(body)).not.toContain('secret-turn')
    })

    it.each([
        ['leads', 'לידים'], ['books', 'ספרים'], ['drafts', 'בקשות לקוחות'], ['samples', 'דוגמאות שלט'],
    ])('says which part it could not read: %s', async (part, name) => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        mocks[part].mockRejectedValue(new Error('down'))

        const response = await GET(request('t'))
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.unread).toContain(name)
    })
})
