import { describe, expect, it } from 'vitest'
import { isStorageUrl, viaOurDomain, firstStorageUrl, allStorageUrls, verdict, BOOK_WIDTH, BOOK_QUALITY } from '@/lib/storageReach'
import { parseImgRequest } from '@/lib/imgProxy'

const SITE = 'https://app.weddingtales.co.il'
const A = 'https://firebasestorage.googleapis.com/v0/b/b.firebasestorage.app/o/weddings%2F1%2Fa.jpg?alt=media&token=t1'
const B = 'https://firebasestorage.googleapis.com/v0/b/b.firebasestorage.app/o/covers%2Fc.png?alt=media&token=t2'

describe('browsers that cannot reach the storage host', () => {
    it('decides "blocked" only when storage fails and our own domain works', () => {
        expect(verdict({ direct: false, viaUs: true })).toBe(true)
        expect(verdict({ direct: true, viaUs: true })).toBe(false)
        // Both fail: that one file is broken, the network is not the problem.
        expect(verdict({ direct: false, viaUs: false })).toBe(false)
        expect(verdict({ direct: true, viaUs: false })).toBe(false)
    })

    it('recognises a storage address and nothing else', () => {
        expect(isStorageUrl(A)).toBe(true)
        expect(isStorageUrl('/frames/gold.png')).toBe(false)
        expect(isStorageUrl('https://app.weddingtales.co.il/x.png')).toBe(false)
        expect(isStorageUrl('data:image/png;base64,AAAA')).toBe(false)
        expect(isStorageUrl(null)).toBe(false)
    })

    it('finds a picture to probe with, wherever it sits', () => {
        expect(firstStorageUrl([{ id: 1, text: 'hi' }, { id: 2, imageUrl: A }], { coverImage: B })).toBe(A)
        expect(firstStorageUrl([], { coverImage: B })).toBe(B)
        expect(firstStorageUrl([{ imageUrl: null }], { frame: '/frames/x.png' }, null)).toBe(null)
    })

    it('checks every picture, not just the first — a cover can load while the photos do not', () => {
        const page = { imageUrl: A, _duo: [{ imageUrl: A }, { imageUrl: B }] }
        expect(allStorageUrls(page, { backgroundUrl: B, frame: '/frames/x.png' }).sort()).toEqual([A, B].sort())
        expect(allStorageUrls({ text: 'no pictures' }, null, undefined)).toEqual([])
    })
})

describe('pointing a page at our own domain', () => {
    const pages = [
        { id: 'e1', name: 'דנה', text: 'מזל טוב', imageUrl: A, pageStyle: { backgroundUrl: B, size: 3 }, timestamp: new Date(0) },
        { id: 'e2', name: 'אבי', text: A + ' is mentioned inside a sentence', imageUrl: null },
    ]

    it('leaves everything alone when the browser can reach storage', () => {
        expect(viaOurDomain(pages, false)).toBe(pages)
    })

    it('rewrites every storage address, at any depth, and only those', () => {
        const out = viaOurDomain(pages, true)
        expect(out).not.toBe(pages)
        expect(out[0].imageUrl.startsWith('/api/img?url=')).toBe(true)
        expect(out[0].pageStyle.backgroundUrl.startsWith('/api/img?url=')).toBe(true)
        // What it built is a request our resizer accepts, for the same file.
        const back = parseImgRequest(new URL(out[0].imageUrl, SITE).searchParams, SITE)
        expect(back).toMatchObject({ ok: true, src: A, width: BOOK_WIDTH, quality: BOOK_QUALITY })
        // Untouched: text, numbers, dates, a sentence that merely contains
        // an address, and the entry with no photo (same object back).
        expect(out[0].name).toBe('דנה')
        expect(out[0].pageStyle.size).toBe(3)
        expect(out[0].timestamp).toBe(pages[0].timestamp)
        expect(out[1]).toBe(pages[1])
    })

    it('does not change the saved data it was given', () => {
        const before = JSON.stringify(pages)
        viaOurDomain(pages, true)
        expect(JSON.stringify(pages)).toBe(before)
    })

    it('returns the same object when there is nothing to rewrite', () => {
        const style = { fontSizePercent: 3, frame: '/frames/gold.png', nested: { list: [1, 2] } }
        expect(viaOurDomain(style, true)).toBe(style)
    })
})
