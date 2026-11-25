import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    email: 'barbenbh@gmail.com',
    writes: [],
    load: vi.fn(),
    readSettings: vi.fn(),
    writeSettings: vi.fn(),
    test: vi.fn(),
    exists: true,
    close: vi.fn(),
}))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'now', delete: () => 'deleted' } }))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: email => email === 'barbenbh@gmail.com' }))
vi.mock('@/lib/firebaseAdmin', () => ({
    adminAuth: { verifyIdToken: async token => { if (token !== 'good') throw new Error('bad'); return { email: mocks.email } } },
    adminDb: {
        collection: name => ({
            doc: id => ({
                get: async () => ({ exists: mocks.exists }),
                set: async data => { mocks.writes.push([`${name}/${id}`, data]) },
            }),
        }),
    },
}))
vi.mock('@/lib/customerData', () => ({
    FOLLOWUPS_COLLECTION: 'customer_followups', closeOpenRequests: mocks.close,
    loadCustomerBooks: mocks.load, readFollowupSettings: mocks.readSettings, writeFollowupSettings: mocks.writeSettings,
}))
vi.mock('@/lib/customerFollowupsRunner', () => ({ sendTestFollowup: mocks.test }))

import { GET, POST } from '@/app/api/admin/customers/route'

const request = (method, body, token = 'good') => new Request('http://localhost/api/admin/customers', {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
})
const post = async body => { const res = await POST(request('POST', body)); return { status: res.status, body: await res.json() } }

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-09T07:00:00Z'))
    mocks.writes.length = 0
    mocks.exists = true
    mocks.close.mockReset().mockResolvedValue(0)
    mocks.email = 'barbenbh@gmail.com'
    mocks.load.mockReset().mockResolvedValue([])
    mocks.readSettings.mockReset().mockResolvedValue({ enabled: false, enabledDay: null })
    mocks.writeSettings.mockReset().mockResolvedValue({ enabled: true, enabledDay: '2026-12-09' })
    mocks.test.mockReset().mockResolvedValue({ providerMessageId: 'wamid.t' })
    process.env.SALES_AGENT_OWNER_PHONE = '972500000001'
})
afterEach(() => vi.useRealTimers())

describe('access', () => {
    it('refuses anyone but the super admin, for reading and writing', async () => {
        mocks.email = 'someone@example.com'

        expect((await GET(request('GET'))).status).toBe(403)
        expect((await POST(request('POST', { op: 'settings', enabled: true }))).status).toBe(403)
        expect((await GET(request('GET', null, 'bad'))).status).toBe(403)
        expect(mocks.writeSettings).not.toHaveBeenCalled()
        expect(mocks.load).not.toHaveBeenCalled()
    })
})

describe('GET', () => {
    it('returns the board with the sends of the coming week', async () => {
        mocks.load.mockResolvedValue([{
            w: { id: 'w1', amountPaid: 990, createdVia: 'order', createdAt: '2026-11-30T10:00:00Z', weddingDate: '2026-12-10', slug: 's', celebrantName: 'איתמר', ownerPhone: '0501234567' },
            facts: { entries: 3 },
        }])

        const body = await (await GET(request('GET'))).json()

        expect(body.today).toBe('2026-12-09')
        expect(body.settings).toEqual({ enabled: false, enabledDay: null })
        expect(body.rows).toHaveLength(1)
        expect(body.counts.today).toBe(1)
        expect(body.sends[0]).toMatchObject({ id: 'w1', key: 'eve', day: '2026-12-09' })
    })
})

describe('POST', () => {
    it.each([
        ['delivered', { deliveredAt: 'now' }],
        ['in_print', { printOrderedAt: 'now' }],
        ['handle', { triagedAt: 'now' }],
        ['closed', { closedAt: 'now', closedReason: 'other' }],
    ])('sorts an old event as %s', async (result, fields) => {
        expect((await post({ op: 'triage', weddingId: 'w1', result })).status).toBe(200)
        expect(mocks.writes).toEqual([['weddings/w1', expect.objectContaining(fields)]])
    })

    it('marks and unmarks a milestone', async () => {
        await post({ op: 'mark', weddingId: 'w1', field: 'shippedAt', on: true })
        await post({ op: 'mark', weddingId: 'w1', field: 'shippedAt', on: false })

        expect(mocks.writes.map(([, data]) => data.shippedAt)).toEqual(['now', 'deleted'])
    })

    it('defers by whole days from today in Israel', async () => {
        await post({ op: 'defer', weddingId: 'w1', days: 3 })

        expect(mocks.writes[0][1]).toMatchObject({ boardDeferUntil: '2026-12-12' })
    })

    it('records a message Lord sent himself so it is never sent again', async () => {
        await post({ op: 'sentByHand', weddingId: 'w1', key: 'eve' })

        expect(mocks.writes).toEqual([
            ['weddings/w1', expect.objectContaining({ lifecycleSent: { eve: Date.now() } })],
            ['customer_followups/w1_eve', expect.objectContaining({ status: 'manual', key: 'eve' })],
        ])
    })

    it('closes the open messages of a customer', async () => {
        mocks.close.mockResolvedValue(2)

        const result = await post({ op: 'handled', weddingId: 'w1' })

        expect(result.body).toMatchObject({ closed: 2 })
        expect(mocks.close).toHaveBeenCalledWith('w1')
    })

    it('undoes a sorting mark, and the reason with a closing', async () => {
        await post({ op: 'mark', weddingId: 'w1', field: 'triagedAt', on: false })
        await post({ op: 'mark', weddingId: 'w1', field: 'closedAt', on: false })

        expect(mocks.writes[0][1].triagedAt).toBe('deleted')
        expect(mocks.writes[1][1]).toMatchObject({ closedAt: 'deleted', closedReason: 'deleted' })
    })

    it.each([
        { op: 'mark', weddingId: 'w1', field: 'amountPaid', on: true },
        { op: 'triage', weddingId: 'w1', result: 'whatever' },
        { op: 'defer', weddingId: 'w1', days: 400 },
        { op: 'sentByHand', weddingId: 'w1', key: 'nope' },
        { op: 'note', weddingId: 'a/b', text: 'x' },
        { op: 'unknown' },
    ])('refuses %j', async body => {
        expect((await post(body)).status).toBe(400)
        expect(mocks.writes).toEqual([])
    })

    it('does not create a book that does not exist', async () => {
        mocks.exists = false

        expect((await post({ op: 'mute', weddingId: 'gone', on: true })).status).toBe(404)
        expect(mocks.writes).toEqual([])
    })

    it('turns automatic sending on with today as its first day', async () => {
        const result = await post({ op: 'settings', enabled: true })

        expect(mocks.writeSettings).toHaveBeenCalledWith({ enabled: true, today: '2026-12-09', by: 'barbenbh@gmail.com' })
        expect(result.body.settings.enabled).toBe(true)
    })

    it('sends a test only to the owner phone and passes Meta\'s refusal on', async () => {
        await post({ op: 'test', key: 'eve', phone: '972599999999' })
        expect(mocks.test).toHaveBeenCalledWith(expect.objectContaining({ key: 'eve', phone: '972500000001' }))

        mocks.test.mockRejectedValue(Object.assign(new Error('x'), { errorCode: 'GRAPH_REJECTED', providerCode: 132001 }))
        expect(await post({ op: 'test', key: 'eve' })).toEqual({ status: 502, body: { error: 'GRAPH_REJECTED', providerCode: 132001 } })
    })
})
