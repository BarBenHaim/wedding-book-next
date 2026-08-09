import { describe, it, expect } from 'vitest'
import {
    PAGE_OVERRIDABLE_KEYS, PAGINATION_KEYS,
    sanitizePageStyle, mergePageStyle, pageStyleOf, hasOverrides, overriddenKeys,
} from '@/lib/pageStyle'
import { CANONICAL_STYLE_DEFAULTS } from '@/lib/bookDesignSchema'

describe('what a page is allowed to override', () => {
    it('refuses the four keys that decide which pages exist', () => {
        // A page cannot ask to be paginated differently: it does not
        // exist until pagination has already run. Overriding these would
        // either be silently ignored or change the page count under the
        // operator's cursor on the second render.
        for (const key of PAGINATION_KEYS) {
            expect(PAGE_OVERRIDABLE_KEYS, key).not.toContain(key)
            expect(sanitizePageStyle({ [key]: 2 }), key).toEqual({})
        }
    })

    it('covers everything Lord actually asked for', () => {
        for (const key of [
            'imageMarginTop', 'imageMarginBottom', // spacing above/below the photo
            'backgroundColor', 'backgroundUrl',    // a different background here
            'photoFit',                            // don't crop just this one
            'imageStyle',                          // its size
            'photoFrame', 'photoFrameUrl',         // a frame on it
        ]) {
            expect(PAGE_OVERRIDABLE_KEYS, key).toContain(key)
        }
    })

    it('only names keys the schema actually has', () => {
        // A whitelisted key that no longer exists in the schema is a
        // control that silently does nothing.
        for (const key of PAGE_OVERRIDABLE_KEYS) {
            expect(CANONICAL_STYLE_DEFAULTS, key).toHaveProperty(key)
        }
    })
})

describe('sanitizePageStyle', () => {
    it('drops anything not on the whitelist', () => {
        expect(sanitizePageStyle({ backgroundColor: '#000', locale: 'he', nope: 1 }))
            .toEqual({ backgroundColor: '#000' })
    })

    it('drops undefined, because Firestore rejects it', () => {
        expect(sanitizePageStyle({ backgroundColor: undefined, pagePadding: 6 }))
            .toEqual({ pagePadding: 6 })
    })

    it('keeps an explicit null, because null means something here', () => {
        // "no background image on this page" is a real thing to want in a
        // book whose global design has one.
        expect(sanitizePageStyle({ backgroundUrl: null })).toEqual({ backgroundUrl: null })
    })

    it('cleans nested objects one level', () => {
        expect(sanitizePageStyle({ imageStyle: { width: 95, borderRadius: undefined } }))
            .toEqual({ imageStyle: { width: 95 } })
        expect(sanitizePageStyle({ imageStyle: {} })).toEqual({})
        expect(sanitizePageStyle({ imageStyle: 'wide' })).toEqual({})
    })

    it('survives junk', () => {
        expect(sanitizePageStyle(null)).toEqual({})
        expect(sanitizePageStyle('x')).toEqual({})
        expect(sanitizePageStyle([1, 2])).toEqual({})
    })
})

describe('mergePageStyle', () => {
    const global = {
        backgroundColor: '#fff', photoFit: 'cover', imageMarginTop: 2,
        imageStyle: { width: 80, borderRadius: '12px' },
    }

    it('returns the global object untouched when there is nothing to override', () => {
        // Identity, not a copy: this runs on every page of every render,
        // and a fresh object each time would break memo equality upstream.
        expect(mergePageStyle(global, null)).toBe(global)
        expect(mergePageStyle(global, {})).toBe(global)
        expect(mergePageStyle(global, { entriesPerPage: 2 })).toBe(global)
    })

    it('lets the page win on the keys it pinned', () => {
        const out = mergePageStyle(global, { imageMarginTop: 10, backgroundColor: '#111' })
        expect(out.imageMarginTop).toBe(10)
        expect(out.backgroundColor).toBe('#111')
    })

    it('keeps inheriting everything else', () => {
        // The point of sparse overrides: change the book's design and the
        // overridden page still follows on every axis it did not pin.
        const out = mergePageStyle(global, { imageMarginTop: 10 })
        expect(out.photoFit).toBe('cover')
        expect(out.backgroundColor).toBe('#fff')
    })

    it('merges imageStyle one level so pinning width keeps the radius', () => {
        const out = mergePageStyle(global, { imageStyle: { width: 100 } })
        expect(out.imageStyle).toEqual({ width: 100, borderRadius: '12px' })
    })

    it('lets one page crop inside a no-crop book', () => {
        // This is the case the whole feature exists for, and it only
        // works because the merge runs AFTER the wedding-level no-crop
        // overlay. More specific wins; that is what "per page" means.
        const albumBook = { ...global, photoFit: 'contain' }
        expect(mergePageStyle(albumBook, { photoFit: 'cover' }).photoFit).toBe('cover')
    })

    it('does not mutate the global design', () => {
        const before = JSON.stringify(global)
        mergePageStyle(global, { imageStyle: { width: 100 }, backgroundColor: '#000' })
        expect(JSON.stringify(global)).toBe(before)
    })

    it('copes with a global that has no imageStyle yet', () => {
        expect(mergePageStyle({}, { imageStyle: { width: 90 } }).imageStyle).toEqual({ width: 90 })
        expect(mergePageStyle(null, { pagePadding: 5 }).pagePadding).toBe(5)
    })
})

describe('pageStyleOf', () => {
    it('reads the override off a normal page', () => {
        expect(pageStyleOf({ id: 'a', pageStyle: { pagePadding: 8 } })).toEqual({ pagePadding: 8 })
    })

    it('returns null when there is nothing pinned', () => {
        expect(pageStyleOf({ id: 'a' })).toBeNull()
        expect(pageStyleOf({ id: 'a', pageStyle: {} })).toBeNull()
        expect(pageStyleOf(null)).toBeNull()
    })

    it('takes the first override on a shared page', () => {
        // Two blessings, one sheet of paper, one background. Picking the
        // first is at least predictable.
        const duo = { _duo: [{ id: 'a' }, { id: 'b', pageStyle: { backgroundColor: '#111' } }] }
        expect(pageStyleOf(duo)).toEqual({ backgroundColor: '#111' })
        const pair = { _photoPair: [{ id: 'a', pageStyle: { photoFit: 'contain' } }, { id: 'b', pageStyle: { photoFit: 'cover' } }] }
        expect(pageStyleOf(pair)).toEqual({ photoFit: 'contain' })
    })

    it('returns null for a shared page where nobody pinned anything', () => {
        expect(pageStyleOf({ _duo: [{ id: 'a' }, { id: 'b' }] })).toBeNull()
        expect(pageStyleOf({ _duo: [null, undefined] })).toBeNull()
    })
})

describe('hasOverrides / overriddenKeys', () => {
    it('ignores keys that would have been thrown away anyway', () => {
        expect(hasOverrides({ entriesPerPage: 2 })).toBe(false)
        expect(hasOverrides({ pagePadding: 6 })).toBe(true)
        expect(hasOverrides(null)).toBe(false)
    })

    it('lists what departs from the book, sorted', () => {
        expect(overriddenKeys({ pagePadding: 6, backgroundColor: '#000', autoSplit: true }))
            .toEqual(['backgroundColor', 'pagePadding'])
    })
})
