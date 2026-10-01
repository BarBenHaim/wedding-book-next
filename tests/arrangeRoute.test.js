import { beforeEach, describe, expect, it, vi } from 'vitest'

// A tiny in-memory Firestore: `weddings/{id}` docs, their `entries`
// subcollection, and the closed `arrange_links` collection. Enough for
// the three routes to run end to end without Firebase.
const harness = vi.hoisted(() => {
    const weddings = new Map()
    const entries = new Map() // weddingId -> Map(entryId -> data)
    const links = new Map()
    const batches = []
    const verifyIdToken = vi.fn(async () => ({ email: 'admin@example.test', uid: 'admin-uid' }))

    const docSnap = (exists, data) => ({ exists, data: () => data })
    const entryCol = wid => ({
        get: async () => ({ docs: [...(entries.get(wid) || new Map()).entries()].map(([id, data]) => ({ id, data: () => data })) }),
        doc: id => ({ _wid: wid, _id: id }),
    })
    const weddingDoc = id => ({
        get: async () => docSnap(weddings.has(id), weddings.get(id)),
        collection: name => { if (name !== 'entries') throw new Error('unexpected ' + name); return entryCol(id) },
    })
    const linkDoc = token => ({
        get: async () => docSnap(links.has(token), links.get(token)),
        set: async (value, options) => {
            const current = links.get(token) || {}
            links.set(token, options?.merge ? { ...current, ...value } : value)
        },
    })
    const db = {
        collection: vi.fn(name => {
            if (name === 'weddings') return { doc: weddingDoc }
            if (name === 'arrange_links') {
                return {
                    doc: linkDoc,
                    where: (field, op, value) => ({
                        get: async () => ({
                            docs: [...links.entries()].filter(([, d]) => d[field] === value).map(([id, d]) => ({ id, data: () => d })),
                        }),
                    }),
                }
            }
            throw new Error('unexpected collection ' + name)
        }),
        batch: () => {
            const ops = []
            const b = {
                update: (ref, value) => { ops.push({ ref, value }) },
                commit: async () => {
                    for (const { ref, value } of ops) {
                        const col = entries.get(ref._wid)
                        if (!col || !col.has(ref._id)) throw new Error('missing ' + ref._id)
                        col.set(ref._id, { ...col.get(ref._id), ...value })
                    }
                    batches.push(ops.length)
                },
            }
            return b
        },
    }
    return {
        weddings, entries, links, batches, verifyIdToken, db,
        reset() {
            weddings.clear(); entries.clear(); links.clear(); batches.length = 0
            verifyIdToken.mockClear()
        },
    }
})

vi.mock('@/lib/firebaseAdmin', () => ({ adminDb: harness.db, adminAuth: { verifyIdToken: harness.verifyIdToken } }))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: email => email === 'admin@example.test' }))
vi.mock('firebase-admin/firestore', () => ({
    FieldValue: { serverTimestamp: () => 'SERVER_TIME', increment: n => ({ __inc: n }) },
}))

import { POST as mint, GET as list, DELETE as revoke } from '@/app/api/admin/arrange-links/route'
import { GET as readArrange, POST as saveArrange } from '@/app/api/arrange/[token]/route'
import { POST as ownerSave } from '@/app/api/entries/order/route'

const TOKEN = 'A'.repeat(43)

function adminReq(method, body, { query = '', token = 'admin-token' } = {}) {
    return new Request(`http://localhost/api/admin/arrange-links${query}`, {
        method,
        headers: token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
    })
}
const params = token => ({ params: Promise.resolve({ token }) })
const arrangeReq = (token, body) => new Request(`http://localhost/api/arrange/${token}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
})

beforeEach(() => {
    harness.reset()
    harness.weddings.set('w1', { ownerId: 'owner-uid', ownerName: 'דנה כהן', eventType: 'bar_mitzvah', celebrantName: 'אריאל', ownerPhone: '0521234567' })
    harness.entries.set('w1', new Map([
        ['e1', { name: 'סבתא', text: 'מזל טוב', orderIndex: 0, timestamp: 100, imageUrlOverride: 'https://o/override.jpg', imageUrl: 'https://o/orig.jpg' }],
        ['e2', { name: 'דוד', text: 'בהצלחה', orderIndex: 1, timestamp: 200 }],
        ['e3', { name: 'חבר', text: 'חדש', orderIndex: null, timestamp: 300 }],
    ]))
})

describe('super-admin mint / list / revoke', () => {
    it('refuses anyone who is not a super-admin', async () => {
        harness.verifyIdToken.mockResolvedValueOnce({ email: 'owner@example.test', uid: 'owner-uid' })
        const res = await mint(adminReq('POST', { weddingId: 'w1' }))
        expect(res.status).toBe(403)
        expect((await mint(adminReq('POST', { weddingId: 'w1' }, { token: '' }))).status).toBe(401)
    })

    it('mints a link in the closed collection and returns a WhatsApp-ready message', async () => {
        const res = await mint(adminReq('POST', { weddingId: 'w1' }))
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.ok).toBe(true)
        expect(data.link).toBe(`http://localhost/arrange/${data.token}`)
        expect(harness.links.get(data.token)).toMatchObject({ weddingId: 'w1', createdBy: 'admin@example.test', revokedAt: null })
        expect(data.message).toContain('היי דנה')
        expect(data.message).toContain('בר מצווה של אריאל')
        expect(data.message).toContain(data.link)
    })

    it('404s for an event that does not exist', async () => {
        expect((await mint(adminReq('POST', { weddingId: 'nope' }))).status).toBe(404)
    })

    it('lists only active links of that event, newest first, and revokes by token', async () => {
        harness.links.set(TOKEN, { weddingId: 'w1', createdAt: { toDate: () => new Date('2026-09-01') }, revokedAt: null, saves: 2 })
        harness.links.set('B'.repeat(43), { weddingId: 'w1', createdAt: { toDate: () => new Date('2026-09-20') }, revokedAt: null })
        harness.links.set('C'.repeat(43), { weddingId: 'w1', createdAt: { toDate: () => new Date('2026-09-25') }, revokedAt: 'x' })
        harness.links.set('D'.repeat(43), { weddingId: 'w2', createdAt: { toDate: () => new Date('2026-09-25') }, revokedAt: null })

        const res = await list(adminReq('GET', null, { query: '?weddingId=w1' }))
        const data = await res.json()
        expect(data.links.map(l => l.token)).toEqual(['B'.repeat(43), TOKEN])
        expect(data.links[1]).toMatchObject({ saves: 2, link: `http://localhost/arrange/${TOKEN}` })

        const del = await revoke(adminReq('DELETE', { token: TOKEN }))
        expect(del.status).toBe(200)
        expect(harness.links.get(TOKEN).revokedAt).toBe('SERVER_TIME')
        expect((await revoke(adminReq('DELETE', { token: 'short' }))).status).toBe(400)
    })
})

describe('the no-login arrange API', () => {
    beforeEach(() => {
        harness.links.set(TOKEN, { weddingId: 'w1', revokedAt: null })
    })

    it('returns the event and the blessings in book order, with the photo override applied and internals stripped', async () => {
        const res = await readArrange(arrangeReq(TOKEN), params(TOKEN))
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.wedding).toEqual({ id: 'w1', title: 'אריאל', eventType: 'bar_mitzvah' })
        expect(data.entries.map(e => e.id)).toEqual(['e1', 'e2', 'e3'])
        expect(data.entries[0].imageUrl).toBe('https://o/override.jpg')
        expect(data.entries[0]).not.toHaveProperty('imageUrlOverride')
    })

    it('answers 404 for a revoked, unknown or malformed token — the same answer for all three', async () => {
        harness.links.set('B'.repeat(43), { weddingId: 'w1', revokedAt: 'gone' })
        expect((await readArrange(arrangeReq('B'.repeat(43)), params('B'.repeat(43)))).status).toBe(404)
        expect((await readArrange(arrangeReq('Z'.repeat(43)), params('Z'.repeat(43)))).status).toBe(404)
        expect((await readArrange(arrangeReq('x'), params('x'))).status).toBe(404)
        expect((await saveArrange(arrangeReq('x', { order: ['e1'] }), params('x'))).status).toBe(404)
    })

    it('writes the new order through the admin SDK and reconciles against the live entries', async () => {
        // The client saw e1,e2 only; e3 arrived meanwhile; 'ghost' was deleted.
        const res = await saveArrange(arrangeReq(TOKEN, { order: ['e2', 'ghost', 'e1'] }), params(TOKEN))
        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toMatchObject({ ok: true, count: 3, dropped: 1, appended: 1 })
        const col = harness.entries.get('w1')
        expect(col.get('e2').orderIndex).toBe(0)
        expect(col.get('e1').orderIndex).toBe(1)
        expect(col.get('e3').orderIndex).toBe(2)
        expect(harness.batches).toEqual([3])
        // Bookkeeping on the link doc, so the admin sees it was used.
        expect(harness.links.get(TOKEN)).toMatchObject({ lastUsedAt: 'SERVER_TIME', saves: { __inc: 1 } })
    })

    it('rejects a body that is not an order', async () => {
        expect((await saveArrange(arrangeReq(TOKEN, { order: [] }), params(TOKEN))).status).toBe(400)
        expect((await saveArrange(arrangeReq(TOKEN, { nope: 1 }), params(TOKEN))).status).toBe(400)
    })
})

describe('the owner route shares the writer', () => {
    const req = (body, token = 'owner-token') => new Request('http://localhost/api/entries/order', {
        method: 'POST',
        headers: token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    })

    it('lets the owner save and refuses a stranger', async () => {
        harness.verifyIdToken.mockResolvedValueOnce({ email: 'owner@example.test', uid: 'owner-uid' })
        const ok = await ownerSave(req({ weddingId: 'w1', order: ['e3', 'e1', 'e2'] }))
        expect(ok.status).toBe(200)
        expect(harness.entries.get('w1').get('e3').orderIndex).toBe(0)

        harness.verifyIdToken.mockResolvedValueOnce({ email: 'someone@example.test', uid: 'other-uid' })
        expect((await ownerSave(req({ weddingId: 'w1', order: ['e1'] }))).status).toBe(403)
        expect((await ownerSave(req({ weddingId: 'w1', order: ['e1'] }, ''))).status).toBe(401)
    })
})
