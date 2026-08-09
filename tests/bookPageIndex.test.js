import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildPageIndex, pageLabel, entryIdsOnPage, layoutOptionsFrom, PRINT_LAYOUT } from '@/lib/bookPageIndex'

const IMG = 'https://example.com/p.jpg'
const long = 'א'.repeat(400)

const entry = (id, over = {}) => ({ id, name: id, text: 'ברכה קצרה', ...over })

describe('pageLabel', () => {
    it('shows a single page as a number', () => {
        expect(pageLabel([21])).toBe('21')
    })

    it('collapses a split blessing into a range', () => {
        // This is the case Lord asked for by name.
        expect(pageLabel([21, 22])).toBe('21-22')
    })

    it('keeps a gap visible instead of hiding it in a range', () => {
        // Non-consecutive means the layout did something unexpected, and
        // that is the one case worth looking at.
        expect(pageLabel([21, 24])).toBe('21, 24')
        expect(pageLabel([3, 4, 9, 10])).toBe('3-4, 9-10')
    })

    it('sorts and de-duplicates whatever it is handed', () => {
        expect(pageLabel([22, 21, 21])).toBe('21-22')
    })

    it('says nothing rather than something wrong', () => {
        expect(pageLabel([])).toBeNull()
        expect(pageLabel(null)).toBeNull()
        expect(pageLabel([NaN, undefined])).toBeNull()
    })
})

describe('entryIdsOnPage', () => {
    it('credits nobody for a blank alignment leaf', () => {
        // A divider occupies a page number and belongs to no blessing.
        expect(entryIdsOnPage({ id: '__divider_1', _divider: true })).toEqual([])
    })

    it('credits both blessings sharing a duo page', () => {
        expect(entryIdsOnPage({ id: '__duo_a', _duo: [{ id: 'a' }, { id: 'b' }] })).toEqual(['a', 'b'])
    })

    it('handles a duo holding only one blessing', () => {
        expect(entryIdsOnPage({ id: '__duo_a', _duo: [{ id: 'a' }, null] })).toEqual(['a'])
    })

    it('credits both halves of a photo pair', () => {
        expect(entryIdsOnPage({ id: '__pair_a', _photoPair: [{ id: 'a' }, { id: 'b' }] })).toEqual(['a', 'b'])
    })

    it('maps a split photo page back to the blessing it came from', () => {
        // The synthetic id exists to keep React keys unique. Missing this
        // shows up as a blessing whose page number is silently short.
        expect(entryIdsOnPage({ id: 'abc__photo', _split: 'photo' })).toEqual(['abc'])
    })

    it('handles a plain page and junk', () => {
        expect(entryIdsOnPage({ id: 'abc' })).toEqual(['abc'])
        expect(entryIdsOnPage(null)).toEqual([])
        expect(entryIdsOnPage({})).toEqual([])
    })
})

describe('buildPageIndex', () => {
    it('numbers from 1, not from 0', () => {
        // The exporter names the first file 001.jpg. A 0-based badge
        // would be off by one against every printed page.
        const { byEntry } = buildPageIndex([entry('a'), entry('b')])
        expect(byEntry.a).toEqual([1])
    })

    it('gives a split blessing two consecutive pages', () => {
        const entries = [entry('a'), entry('b', { text: long, imageUrl: IMG }), entry('c')]
        const { byEntry } = buildPageIndex(entries, { autoSplit: true, splitThreshold: 240 })
        expect(byEntry.b).toHaveLength(2)
        expect(pageLabel(byEntry.b)).toMatch(/^\d+-\d+$/)
        // And everything after it shifts, which is the whole reason a
        // card's position is not its page number.
        expect(byEntry.c[0]).toBe(byEntry.b[1] + 1)
    })

    it('honours a per-entry split even with the global switch off', () => {
        const entries = [entry('a', { imageUrl: IMG, forceSplit: true }), entry('b')]
        const { byEntry } = buildPageIndex(entries, { autoSplit: false })
        expect(byEntry.a).toHaveLength(2)
    })

    it('puts both blessings of a duo on the same page', () => {
        const { byEntry } = buildPageIndex([entry('a'), entry('b')], { entriesPerPage: 2 })
        expect(byEntry.a).toEqual(byEntry.b)
    })

    it('leaves nobody without a page', () => {
        const entries = [
            entry('a'),
            entry('b', { text: long, imageUrl: IMG }),
            entry('c', { imageUrl: IMG, text: '' }),
            entry('d'),
        ]
        const { byEntry } = buildPageIndex(entries, { autoSplit: true })
        for (const e of entries) expect(byEntry[e.id], e.id).toBeTruthy()
    })

    it('counts blank alignment leaves in the total, because paper does', () => {
        const { totalPages } = buildPageIndex([entry('a'), entry('b'), entry('c')])
        // padToSpread + spreadOffset 1 can add leaves; the total must
        // never be smaller than the number of blessings.
        expect(totalPages).toBeGreaterThanOrEqual(3)
    })

    it('survives an empty book and junk', () => {
        expect(buildPageIndex([])).toEqual({ byEntry: {}, totalPages: 0 })
        expect(buildPageIndex(null).totalPages).toBe(0)
        expect(buildPageIndex(undefined, null).totalPages).toBe(0)
    })
})

describe('the numbering matches the printed book', () => {
    it('passes exactly the layout flags the print exporter passes', () => {
        // If these ever drift apart the badge becomes a confident lie:
        // it would name a page that does not exist in the file the
        // printer receives.
        expect(PRINT_LAYOUT).toEqual({ padToSpread: true, spreadOffset: 1 })
        const opts = layoutOptionsFrom({ autoSplit: true, splitThreshold: 300, entriesPerPage: 1, photoLayout: 'smart' })
        expect(opts).toEqual({
            autoSplit: true, splitThreshold: 300, entriesPerPage: 1, photoLayout: 'smart',
            padToSpread: true, spreadOffset: 1,
        })
    })

    it('still matches the exporter source', () => {
        // Read the exporter and check it is still calling expandBookPages
        // the same way. A comment saying "keep these in sync" is not a
        // mechanism; this is.
        const src = readFileSync(
            join(process.cwd(), 'src/app/admin/wedding/[weddingId]/picabook-export/page.js'),
            'utf8',
        )
        const call = src.match(/const bookPages = expandBookPages\([^\n]*\)/)?.[0] || ''
        expect(call, 'picabook exporter call not found').toBeTruthy()
        expect(call).toContain('padToSpread: true')
        expect(call).toContain('spreadOffset: 1')
        for (const field of ['autoSplit', 'splitThreshold', 'entriesPerPage', 'photoLayout']) {
            expect(call, field).toContain(field)
        }
    })
})
