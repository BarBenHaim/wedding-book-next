import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expandBookPages } from '@/lib/bookPages'
import { blankPageDoc, insertAfter, isBlankPage, withoutBlankPages, BLANK_KIND } from '@/lib/entryKinds'

const blessing = id => ({ id, name: 'דנה', text: 'מזל טוב!', imageUrl: null })
const blank = id => ({ id, kind: BLANK_KIND, name: '', text: '', imageUrl: null })

describe('entryKinds', () => {
    it('recognises a blank page and nothing else', () => {
        expect(isBlankPage(blank('b'))).toBe(true)
        expect(isBlankPage(blessing('a'))).toBe(false)
        expect(isBlankPage({ name: '', text: '', imageUrl: null })).toBe(false)
        expect(isBlankPage(null)).toBe(false)
    })

    it('creates a document with nothing on it and room for the order', () => {
        const d = blankPageDoc({ createdBy: 'admin@example.test', timestamp: 7 })
        expect(d).toEqual({ kind: 'blank', name: '', text: '', imageUrl: null, orderIndex: null, timestamp: 7, createdBy: 'admin@example.test' })
        expect(Object.keys(d).length).toBeLessThanOrEqual(12)
    })

    it('inserts after the anchor, at the end when there is none, and never duplicates', () => {
        expect(insertAfter(['a', 'b', 'c'], 'b', 'x')).toEqual(['a', 'b', 'x', 'c'])
        expect(insertAfter(['a', 'b', 'c'], null, 'x')).toEqual(['a', 'b', 'c', 'x'])
        expect(insertAfter(['a', 'b', 'c'], 'zzz', 'x')).toEqual(['a', 'b', 'c', 'x'])
        expect(insertAfter(['a', 'x', 'b'], 'b', 'x')).toEqual(['a', 'b', 'x'])
    })

    it('counts blessings without the blank leaves', () => {
        expect(withoutBlankPages([blessing('a'), blank('b'), blessing('c')]).map(e => e.id)).toEqual(['a', 'c'])
    })
})

describe('a blank page through the paginator', () => {
    it('passes through untouched in the classic and split modes', () => {
        const list = [blessing('a'), blank('b'), { ...blessing('c'), imageUrl: 'u', forceSplit: true }]
        const out = expandBookPages(list, { autoSplit: true, splitThreshold: 10 })
        expect(out.map(p => p.id)).toEqual(['a', 'b', 'c', 'c__photo'])
        expect(isBlankPage(out[1])).toBe(true)
    })

    it('is never half of a duo, and pairing restarts after it', () => {
        const out = expandBookPages([blessing('a'), blank('x'), blessing('b'), blessing('c'), blessing('d')], { entriesPerPage: 2 })
        expect(out.map(p => (p._duo ? p._duo.map(e => e.id).join('+') : p.id))).toEqual(['a', 'x', 'b+c', 'd'])
        expect(isBlankPage(out[1])).toBe(true)
    })

    it('flows through the smart photo layout as its own page', () => {
        const out = expandBookPages([blank('x'), { id: 'p', name: '', text: '', imageUrl: 'u', imgAspect: 1.5 }], { photoLayout: 'smart' })
        expect(out.map(p => p.id)).toEqual(['x', 'p'])
        expect(out[0]._photo).toBeUndefined()
    })
})

// ── The route ────────────────────────────────────────────────────────
const harness = vi.hoisted(() => {
    const entries = new Map()
    const added = []
    const verifyIdToken = vi.fn(async () => ({ email: 'admin@example.test' }))
    const entryDoc = id => ({ _id: id })
    const col = {
        get: async () => ({ docs: [...entries.entries()].map(([id, data]) => ({ id, data: () => data })) }),
        doc: entryDoc,
        add: async data => { const id = `new-${added.length + 1}`; entries.set(id, { ...data }); added.push(id); return { id } },
    }
    const db = {
        collection: name => {
            if (name !== 'weddings') throw new Error('unexpected ' + name)
            return { doc: id => ({ get: async () => ({ exists: id === 'w1' }), collection: () => col }) }
        },
        batch: () => {
            const ops = []
            return {
                update: (ref, value) => ops.push({ ref, value }),
                commit: async () => { for (const { ref, value } of ops) entries.set(ref._id, { ...entries.get(ref._id), ...value }) },
            }
        },
    }
    return { entries, added, verifyIdToken, db, reset() { entries.clear(); added.length = 0; verifyIdToken.mockClear() } }
})
vi.mock('@/lib/firebaseAdmin', () => ({ adminDb: harness.db, adminAuth: { verifyIdToken: harness.verifyIdToken } }))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: email => email === 'admin@example.test' }))

import { POST } from '@/app/api/entries/blank/route'

const req = (body, token = 't') => new Request('http://localhost/api/entries/blank', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : {},
    body: JSON.stringify(body),
})

describe('POST /api/entries/blank', () => {
    beforeEach(() => {
        harness.reset()
        harness.entries.set('a', { name: 'A', orderIndex: 0, timestamp: 1 })
        harness.entries.set('b', { name: 'B', orderIndex: 1, timestamp: 2 })
        harness.entries.set('c', { name: 'C', orderIndex: 2, timestamp: 3 })
    })

    it('refuses anyone but a super-admin', async () => {
        harness.verifyIdToken.mockResolvedValueOnce({ email: 'owner@example.test' })
        expect((await POST(req({ weddingId: 'w1' }))).status).toBe(401)
        expect((await POST(req({ weddingId: 'w1' }, ''))).status).toBe(401)
        expect(harness.added).toEqual([])
    })

    it('creates the blank entry after the anchor and rewrites the order on the server', async () => {
        const res = await POST(req({ weddingId: 'w1', afterEntryId: 'a' }))
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data).toMatchObject({ ok: true, id: 'new-1', order: ['a', 'new-1', 'b', 'c'] })
        expect(harness.entries.get('new-1')).toMatchObject({ kind: 'blank', name: '', text: '', imageUrl: null, orderIndex: 1, createdBy: 'admin@example.test' })
        expect(harness.entries.get('b').orderIndex).toBe(2)
        expect(harness.entries.get('c').orderIndex).toBe(3)
    })

    it('goes to the end without an anchor, and 404s on an unknown anchor or wedding', async () => {
        const res = await POST(req({ weddingId: 'w1' }))
        expect((await res.json()).order).toEqual(['a', 'b', 'c', 'new-1'])
        expect((await POST(req({ weddingId: 'w1', afterEntryId: 'ghost' }))).status).toBe(404)
        expect((await POST(req({ weddingId: 'nope', afterEntryId: 'a' }))).status).toBe(404)
        expect(harness.added).toEqual(['new-1'])
    })
})
