import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash, webcrypto } from 'node:crypto'

// Dummy documents only: every Firebase and Storage operation is in memory.
const h = vi.hoisted(() => {
    const weddings = new Map()
    const entries = new Map()
    const writes = []
    const saveImage = vi.fn()
    const verifyIdToken = vi.fn(async token => {
        if (token === 'invalid') throw new Error('invalid dummy token')
        if (token === 'admin') return { uid: 'admin', email: 'admin@example.test' }
        return { uid: token, email: `${token}@example.test` }
    })
    const entryDoc = (wid, id) => ({
        wid, id,
        get: async () => ({ exists: entries.get(wid)?.has(id) || false, data: () => entries.get(wid)?.get(id) }),
        update: async patch => {
            writes.push({ wid, id, patch })
            entries.get(wid).set(id, { ...entries.get(wid).get(id), ...patch })
        },
    })
    const entryCol = wid => ({
        doc: id => entryDoc(wid, id),
        get: async () => ({ docs: [...(entries.get(wid) || [])].map(([id, data]) => ({ id, data: () => data })) }),
        add: async data => {
            writes.push({ wid, data })
            entries.get(wid).set('legacy-created', data)
        },
    })
    const db = {
        collection: vi.fn(name => {
            if (name !== 'weddings') throw new Error(`Unexpected collection ${name}`)
            return { doc: wid => ({
                get: async () => ({ exists: weddings.has(wid), data: () => weddings.get(wid) }),
                collection: name => {
                    if (name !== 'entries') throw new Error(`Unexpected subcollection ${name}`)
                    return entryCol(wid)
                },
            }) }
        }),
        getAll: async (...refs) => Promise.all(refs.map(async ref => ({ ...(await ref.get()), id: ref.id, ref }))),
        batch: () => {
            const ops = []
            return {
                delete: ref => ops.push(() => { writes.push({ delete: ref.id }); entries.get(ref.wid).delete(ref.id) }),
                update: (ref, patch) => ops.push(() => ref.update(patch)),
                commit: async () => { for (const op of ops) await op() },
            }
        },
    }
    return { weddings, entries, writes, saveImage, verifyIdToken, db }
})

vi.mock('@/lib/firebaseAdmin', () => ({
    adminDb: h.db,
    adminAuth: { verifyIdToken: h.verifyIdToken },
    adminStorage: { bucket: () => ({ name: 'dummy.test', file: () => ({ save: h.saveImage }) }) },
}))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: email => email === 'admin@example.test' }))
vi.mock('sharp', () => ({ default: () => ({ metadata: async () => ({ width: 20, height: 10 }) }) }))

import { POST as edit } from '@/app/api/guest/update-entry/route'
import { POST as remove } from '@/app/api/entries/delete/route'
import { POST as order } from '@/app/api/entries/order/route'
import { GET as list, POST as create } from '@/app/api/entries/route'
import { GET as ownerWedding } from '@/app/api/owner/wedding/route'
import { createGuestEditToken, hashGuestEditToken, guestEditMessage } from '@/lib/guestEditCapability'

const secret = 'a'.repeat(64)
const commitment = (wid, eid, token) => createHash('sha256').update(guestEditMessage(wid, eid, token)).digest('hex')
const req = (body, token, query = '') => new Request(`http://localhost/api/test${query}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
})
const body = { weddingId: 'event-a', entryId: 'entry-a', name: 'Changed', text: 'Dummy updated blessing' }

beforeEach(() => {
    vi.stubGlobal('crypto', webcrypto)
    h.weddings.clear(); h.entries.clear(); h.writes.length = 0
    h.saveImage.mockClear(); h.verifyIdToken.mockClear(); h.db.collection.mockClear()
    h.weddings.set('event-a', { ownerId: 'owner-a', brideName: 'Dummy', ownerPhone: 'PRIVATE', digitalTokens: ['OWNER_BOOK_TOKEN', 'UNUSED_TOKEN'], statsTokens: ['PRIVATE_STATS'], serverSecret: 'PRIVATE', coverDesign: { texture: '/dummy.jpg', secret: 'PRIVATE' } })
    h.weddings.set('event-b', { ownerId: 'owner-b' })
    h.entries.set('event-a', new Map([
        ['entry-a', { name: 'Guest', text: 'Original', imageUrl: 'https://dummy.test/photo.jpg', orderIndex: 1, guestEditTokenHash: commitment('event-a', 'entry-a', secret) }],
        ['legacy', { name: 'Legacy', text: 'Original', orderIndex: 0 }],
        ['copy', { name: 'Copy', guestEditTokenHash: commitment('event-a', 'entry-a', secret) }],
    ]))
    h.entries.set('event-b', new Map([['entry-a', { guestEditTokenHash: commitment('event-a', 'entry-a', secret) }]]))
})

describe('blessing edit authorization', () => {
    it('rejects public IDs before reading entries or writing photos', async () => {
        expect((await edit(req({ ...body, image: 'data:image/jpeg;base64,YQ==' }))).status).toBe(401)
        expect(h.db.collection).not.toHaveBeenCalled()
        expect(h.writes).toEqual([])
        expect(h.saveImage).not.toHaveBeenCalled()
    })

    it.each(['owner-b', 'invalid'])('rejects a foreign or invalid owner credential: %s', async token => {
        expect((await edit(req({ ...body, editToken: secret, removeImage: true }, token))).status).toBe(token === 'invalid' ? 401 : 403)
        expect(h.writes).toEqual([])
        expect(h.saveImage).not.toHaveBeenCalled()
    })

    it.each(['owner-a', 'admin'])('allows the wedding owner and super-admin: %s', async token => {
        expect((await edit(req({ ...body, entryId: 'legacy' }, token))).status).toBe(200)
        expect(h.entries.get('event-a').get('legacy').text).toBe(body.text)
    })

    it('allows the actual guest capability and ignores ownership/order injection', async () => {
        expect((await edit(req({ ...body, editToken: secret, orderIndex: 99, guestEditTokenHash: 'b'.repeat(64), ownerId: 'stranger' }))).status).toBe(200)
        expect(h.entries.get('event-a').get('entry-a')).toMatchObject({ name: 'Changed', text: body.text, orderIndex: 1, guestEditTokenHash: commitment('event-a', 'entry-a', secret) })
        expect(h.writes[0].patch).toEqual({ name: 'Changed', text: body.text })
    })

    it.each([
        { editToken: 'b'.repeat(64) },
        { editToken: commitment('event-a', 'entry-a', secret) },
        { entryId: 'legacy', editToken: secret },
        { entryId: 'copy', editToken: secret },
        { weddingId: 'event-b', editToken: secret },
    ])('rejects forged, legacy, copied and cross-event credentials: %j', async patch => {
        expect((await edit(req({ ...body, ...patch, image: 'data:image/jpeg;base64,YQ==' }))).status).toBe(403)
        expect(h.writes).toEqual([])
        expect(h.saveImage).not.toHaveBeenCalled()
    })

    it('only permits photo replacement after capability authorization', async () => {
        const res = await edit(req({ ...body, editToken: secret, image: 'data:image/jpeg;base64,YQ==' }))
        expect(res.status).toBe(200)
        expect(h.saveImage).toHaveBeenCalledOnce()
        expect(h.entries.get('event-a').get('entry-a')).toMatchObject({ imgAspect: 2 })
    })

    it.each(['../other', 'x/y', 'x\\y'])('rejects malformed wedding paths: %s', async weddingId => {
        expect((await edit(req({ ...body, weddingId }, 'owner-a'))).status).toBe(400)
        expect(h.writes).toEqual([])
    })
})

describe('authenticated owner delete, reorder and legacy API', () => {
    it.each([['missing', undefined, 401], ['foreign', 'owner-b', 403], ['invalid', 'invalid', 401]])('blocks %s credentials on all server entry paths', async (_, token, status) => {
        expect((await remove(req(body, token))).status).toBe(status)
        expect((await order(req({ weddingId: 'event-a', order: ['entry-a'] }, token))).status).toBe(status)
        expect((await create(req({ type: 'text', content: 'dummy' }, token, '?weddingId=event-a'))).status).toBe(status)
        expect((await list(req(null, token, '?weddingId=event-a'))).status).toBe(status)
        expect((await ownerWedding(req(null, token, '?weddingId=event-a'))).status).toBe(status)
        expect(h.writes).toEqual([])
    })

    it.each(['owner-a', 'admin'])('allows %s to reorder, then delete idempotently', async token => {
        expect((await order(req({ weddingId: 'event-a', order: ['entry-a', 'legacy'] }, token))).status).toBe(200)
        expect(h.entries.get('event-a').get('entry-a').orderIndex).toBe(0)
        expect((await remove(req(body, token))).status).toBe(200)
        expect(h.entries.get('event-a').has('entry-a')).toBe(false)
        const retry = await remove(req(body, token))
        expect(await retry.json()).toMatchObject({ ok: true, deleted: [], missing: ['entry-a'] })
        expect(h.entries.get('event-b').has('entry-a')).toBe(true)
    })

    it('lets the owner use the legacy entry API', async () => {
        expect((await list(req(null, 'owner-a', '?weddingId=event-a'))).status).toBe(200)
        expect((await create(req({ type: 'text', content: 'dummy' }, 'owner-a', '?weddingId=event-a'))).status).toBe(200)
        expect(h.writes).toEqual([expect.objectContaining({ wid: 'event-a', data: expect.objectContaining({ user: 'owner-a' }) })])
        const records = await (await list(req(null, 'owner-a', '?weddingId=event-a'))).json()
        expect(records.find(entry => entry.id === 'legacy-created')).toMatchObject({ type: 'text', content: 'dummy', user: 'owner-a' })
    })

    it('validates the owner path before querying Firestore', async () => {
        expect((await order(req({ weddingId: 'a/b', order: ['entry-a'] }, 'owner-a'))).status).toBe(400)
        expect(h.db.collection).not.toHaveBeenCalled()
    })

    it('returns only whitelisted owner metadata and entry fields', async () => {
        const response = await ownerWedding(req(null, 'owner-a', '?weddingId=event-a'))
        expect(response.headers.get('cache-control')).toBe('private, no-store')
        expect(await response.json()).toEqual({ ok: true, wedding: {
            brideName: 'Dummy', digitalTokens: ['OWNER_BOOK_TOKEN'],
            coverDesign: { texture: '/dummy.jpg' }, book: { designSettings: {} },
        } })
        const entryRes = await list(req(null, 'owner-a', '?weddingId=event-a'))
        expect(entryRes.headers.get('cache-control')).toBe('private, no-store')
        const entries = await entryRes.json()
        expect(entries[0]).toMatchObject({ id: 'entry-a', name: 'Guest' })
        expect(JSON.stringify(entries)).not.toContain('guestEditTokenHash')
    })
})

describe('device capability generation', () => {
    it('generates independent 256-bit secrets and matches the server commitment', async () => {
        const token = createGuestEditToken()
        expect(token).toMatch(/^[a-f0-9]{64}$/)
        expect(createGuestEditToken()).not.toBe(token)
        expect(await hashGuestEditToken('event-a', 'entry-a', token)).toBe(commitment('event-a', 'entry-a', token))
        expect(await hashGuestEditToken('event-a', 'copy', token)).not.toBe(commitment('event-a', 'entry-a', token))
    })
})
