import { beforeEach, describe, expect, it, vi } from 'vitest'

// The photos-only page of the manage link: taking a photo out of the
// book and putting it back, through the real route, against a tiny
// in-memory Firestore (entries, entries_trash, arrange_links).
const harness = vi.hoisted(() => {
    const DELETE = { __delete: true }
    const weddings = new Map()
    const cols = new Map() // `${weddingId}/${name}` -> Map(id -> data)
    const links = new Map()

    const col = (wid, name) => {
        const key = `${wid}/${name}`
        if (!cols.has(key)) cols.set(key, new Map())
        return cols.get(key)
    }
    const merge = (current, value) => {
        const next = { ...current }
        for (const [k, v] of Object.entries(value)) {
            if (v === DELETE) delete next[k]
            else next[k] = v
        }
        return next
    }
    const snap = (exists, data) => ({ exists, data: () => data })
    const docRef = (wid, name, id) => ({
        id,
        _wid: wid,
        _name: name,
        get: async () => snap(col(wid, name).has(id), col(wid, name).get(id)),
        set: async (value, options) => {
            const c = col(wid, name)
            c.set(id, options?.merge ? merge(c.get(id) || {}, value) : merge({}, value))
        },
    })
    const weddingDoc = wid => ({
        get: async () => snap(weddings.has(wid), weddings.get(wid)),
        collection: name => ({
            get: async () => ({ docs: [...col(wid, name).entries()].map(([id, data]) => ({ id, data: () => data })) }),
            doc: id => docRef(wid, name, id),
        }),
    })
    const db = {
        collection: name => {
            if (name === 'weddings') return { doc: weddingDoc }
            if (name === 'arrange_links') {
                return {
                    doc: token => ({
                        id: token,
                        get: async () => snap(links.has(token), links.get(token)),
                        set: async (value, options) => {
                            links.set(token, options?.merge ? { ...(links.get(token) || {}), ...value } : value)
                        },
                    }),
                }
            }
            throw new Error('unexpected collection ' + name)
        },
        batch: () => {
            const ops = []
            return {
                set: (ref, value) => ops.push(() => col(ref._wid, ref._name).set(ref.id, merge({}, value))),
                delete: ref => ops.push(() => col(ref._wid, ref._name).delete(ref.id)),
                commit: async () => { ops.forEach(op => op()) },
            }
        },
    }
    return {
        DELETE, weddings, links, db, col,
        reset() { weddings.clear(); cols.clear(); links.clear() },
    }
})

vi.mock('@/lib/firebaseAdmin', () => ({ adminDb: harness.db, adminAuth: {} }))
vi.mock('firebase-admin/firestore', () => ({
    FieldValue: { serverTimestamp: () => 'SERVER_TIME', increment: n => ({ __inc: n }), delete: () => harness.DELETE },
}))

import { GET, POST } from '@/app/api/manage/[token]/route'
import { planPhotoRemoval, planPhotoReturn, publicRemovedPage, managePhotosUrl, shownPhotoUrl } from '@/lib/manageLinks'

const TOKEN = 'B'.repeat(43)
const WID = '6172'
const PHOTO = n => `https://firebasestorage.googleapis.com/v0/b/wt.appspot.com/o/weddings%2F${WID}%2F${n}.jpg?alt=media&token=t`

const ctx = { params: Promise.resolve({ token: TOKEN }) }
const post = body => POST(new Request('https://app.test/api/manage/x', { method: 'POST', body: JSON.stringify(body) }), ctx)
const get = (qs = '') => GET(new Request(`https://app.test/api/manage/x${qs}`), ctx)
const entry = id => harness.col(WID, 'entries').get(id)
const trashed = id => harness.col(WID, 'entries_trash').get(id)

beforeEach(() => {
    harness.reset()
    harness.weddings.set(WID, { eventType: 'bar_mitzvah', celebrantName: 'אליה' })
    harness.links.set(TOKEN, { weddingId: WID, scope: 'manage', active: true })
    const e = harness.col(WID, 'entries')
    e.set('withText', { name: 'סבתא רחל', text: 'מזל טוב אליה', imageUrl: PHOTO('a'), imgAspect: 1.5, orderIndex: 0, photoPosition: '50% 30%' })
    e.set('photoOnly', { name: '', text: null, imageUrl: PHOTO('b'), imgAspect: 0.75, orderIndex: 1 })
    e.set('swapped', { name: 'דוד', text: 'באהבה', imageUrl: PHOTO('c'), imgAspect: 1.33, imageUrlOverride: PHOTO('c2'), imgAspectOverride: 0.8, orderIndex: 2 })
    e.set('noPhoto', { name: 'נועה', text: 'המון אושר', imageUrl: null, orderIndex: 3 })
    e.set('blank', { kind: 'blank', orderIndex: 4, pageStyle: { backgroundUrl: PHOTO('bg') } })
})

describe('the plan, without a database', () => {
    it('builds the photos link under the manage link', () => {
        expect(managePhotosUrl('https://app.weddingtales.co.il/', 'tok')).toBe('https://app.weddingtales.co.il/manage/tok/photos')
    })

    it('a blessing with words keeps its page; the photo fields move aside', () => {
        const plan = planPhotoRemoval({ text: 'ברכה', imageUrl: 'u', imgAspect: 1.5 })
        expect(plan.mode).toBe('photo')
        expect(plan.fields.imageUrl).toBeNull()
        expect(plan.fields.imgAspect).toBeNull()
        expect(plan.fields.removedPhoto).toEqual({ imageUrl: 'u', imgAspect: 1.5, imageUrlOverride: null, imgAspectOverride: null })
    })

    it('a page that is only a photo goes out whole', () => {
        expect(planPhotoRemoval({ text: null, imageUrl: 'u' })).toEqual({ ok: true, mode: 'page' })
        expect(planPhotoRemoval({ text: '   ', name: 'רק שם', imageUrl: 'u' })).toEqual({ ok: true, mode: 'page' })
    })

    it('refuses when there is no photo, and never touches a blank page', () => {
        expect(planPhotoRemoval({ text: 'ברכה', imageUrl: null }).ok).toBe(false)
        expect(planPhotoRemoval({ kind: 'blank', imageUrl: 'u' }).ok).toBe(false)
        expect(planPhotoRemoval(null).ok).toBe(false)
    })

    it('returning never writes over a photo that was added since', () => {
        const waiting = { text: 'ברכה', imageUrl: null, removedPhoto: { imageUrl: 'old' } }
        expect(planPhotoReturn(waiting)).toEqual({ ok: true, fields: { imageUrl: 'old', imgAspect: null, imageUrlOverride: null, imgAspectOverride: null } })
        expect(planPhotoReturn({ ...waiting, imageUrlOverride: 'new' })).toEqual({ ok: false, error: 'entry-has-photo' })
        expect(planPhotoReturn({ text: 'ברכה' })).toEqual({ ok: false, error: 'nothing-removed' })
    })

    it('lists a trashed page only when it was nothing but a photo', () => {
        expect(publicRemovedPage({ id: 'p', imageUrl: 'u', text: null })).toEqual({ id: 'p', name: '', imageUrl: 'u', photoRotation: 0 })
        expect(publicRemovedPage({ id: 'p', imageUrl: 'u', text: 'ברכה שלמה' })).toBeNull()
        expect(publicRemovedPage({ id: 'p', text: null })).toBeNull()
        expect(publicRemovedPage({ id: 'p', kind: 'blank', imageUrl: 'u' })).toBeNull()
    })
})

describe('taking a photo out of the book', () => {
    it('keeps the blessing, clears the photo everywhere, and keeps a copy', async () => {
        const res = await post({ action: 'removePhoto', entryId: 'withText' })
        const json = await res.json()
        expect(res.status).toBe(200)
        expect(json.mode).toBe('photo')
        expect(json.entry.imageUrl).toBeNull()
        expect(json.entry.removedPhotoUrl).toBe(PHOTO('a'))

        const doc = entry('withText')
        expect(doc.text).toBe('מזל טוב אליה')
        // The field every reader of the book looks at.
        expect(doc.imageUrl).toBeNull()
        expect(shownPhotoUrl(doc)).toBeNull()
        expect(doc.removedPhoto.imageUrl).toBe(PHOTO('a'))
        expect(doc.removedPhoto.imgAspect).toBe(1.5)
        expect(doc.removedPhoto.removedVia).toBe('manage-link')
        // Framing stays with the entry, for when the photo comes back.
        expect(doc.photoPosition).toBe('50% 30%')
    })

    it('takes a swapped photo out together with the guest original, and brings both back', async () => {
        await post({ action: 'removePhoto', entryId: 'swapped' })
        const doc = entry('swapped')
        expect(doc.imageUrl).toBeNull()
        expect(doc.imageUrlOverride).toBeNull()
        expect(doc.removedPhoto).toMatchObject({ imageUrl: PHOTO('c'), imageUrlOverride: PHOTO('c2'), imgAspect: 1.33, imgAspectOverride: 0.8 })

        const back = await (await post({ action: 'returnPhoto', entryId: 'swapped' })).json()
        expect(back.entry.imageUrl).toBe(PHOTO('c2'))
        expect(back.entry.photoReplaced).toBe(true)
        expect(entry('swapped')).toMatchObject({ imageUrl: PHOTO('c'), imageUrlOverride: PHOTO('c2'), imgAspect: 1.33, imgAspectOverride: 0.8 })
        expect(entry('swapped').removedPhoto).toBeUndefined()
    })

    it('sends a photo-only page to the trash whole, and returns it whole', async () => {
        const out = await (await post({ action: 'removePhoto', entryId: 'photoOnly' })).json()
        expect(out.mode).toBe('page')
        expect(out.page).toEqual({ id: 'photoOnly', name: '', imageUrl: PHOTO('b'), photoRotation: 0 })
        expect(entry('photoOnly')).toBeUndefined()
        expect(trashed('photoOnly')).toMatchObject({ imageUrl: PHOTO('b'), orderIndex: 1, deletedVia: 'manage-link' })

        const back = await (await post({ action: 'returnPhoto', entryId: 'photoOnly' })).json()
        expect(back.mode).toBe('page')
        expect(back.entry.imageUrl).toBe(PHOTO('b'))
        expect(trashed('photoOnly')).toBeUndefined()
        // Exactly what it was — no trash bookkeeping left on the page.
        expect(entry('photoOnly')).toEqual({ name: '', text: null, imageUrl: PHOTO('b'), imgAspect: 0.75, orderIndex: 1 })
    })

    it('answers plainly when there is nothing to take out or bring back', async () => {
        expect((await post({ action: 'removePhoto', entryId: 'noPhoto' })).status).toBe(404)
        expect((await post({ action: 'returnPhoto', entryId: 'noPhoto' })).status).toBe(404)
        expect((await post({ action: 'returnPhoto', entryId: 'never-existed' })).status).toBe(404)
        expect((await post({ action: 'removePhoto', entryId: 'blank' })).status).toBe(403)
        expect(entry('blank').pageStyle.backgroundUrl).toBe(PHOTO('bg'))
    })

    it('does not write an old photo over one the owner added afterwards', async () => {
        await post({ action: 'removePhoto', entryId: 'withText' })
        await post({ action: 'photo', entryId: 'withText', imageUrl: PHOTO('new'), imgAspect: 1 })
        const res = await post({ action: 'returnPhoto', entryId: 'withText' })
        expect(res.status).toBe(409)
        expect((await res.json()).error).toBe('entry-has-photo')
        expect(entry('withText').imageUrlOverride).toBe(PHOTO('new'))
        expect(entry('withText').removedPhoto.imageUrl).toBe(PHOTO('a'))
    })

    it('a revoked or arrange-only link can do none of it', async () => {
        harness.links.set(TOKEN, { weddingId: WID, active: true }) // no scope → arrange link
        expect((await post({ action: 'removePhoto', entryId: 'withText' })).status).toBe(404)
        expect(entry('withText').imageUrl).toBe(PHOTO('a'))
    })
})

describe('what the photos page loads', () => {
    it('lists the photos in the book, the ones waiting on a blessing, and trashed photo pages', async () => {
        await post({ action: 'removePhoto', entryId: 'withText' })
        await post({ action: 'removePhoto', entryId: 'photoOnly' })
        // A whole blessing deleted from the main page is not a "photo".
        await post({ action: 'delete', entryId: 'noPhoto' })

        const json = await (await get('?photos=1')).json()
        const byId = Object.fromEntries(json.entries.map(e => [e.id, e]))
        expect(byId.swapped.imageUrl).toBe(PHOTO('c2'))
        expect(byId.swapped.hasText).toBe(true)
        expect(byId.withText.imageUrl).toBeNull()
        expect(byId.withText.removedPhotoUrl).toBe(PHOTO('a'))
        expect(byId.photoOnly).toBeUndefined()
        expect(json.removedPages).toEqual([{ id: 'photoOnly', name: '', imageUrl: PHOTO('b'), photoRotation: 0 }])
    })

    it('the main manage page does not pay for the trash read', async () => {
        const json = await (await get()).json()
        expect(json.removedPages).toBeUndefined()
        expect(json.entries).toHaveLength(5)
    })
})
