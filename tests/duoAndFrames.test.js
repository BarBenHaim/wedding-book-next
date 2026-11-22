import { describe, it, expect } from 'vitest'
import { expandBookPages } from '@/lib/bookPages'
import { PHOTO_FRAMES, resolvePhotoFrame, photoFrameGeometry, photoOverlayGeometry } from '@/lib/photoFrames'
import { CANONICAL_STYLE_DEFAULTS, applyPresetClean } from '@/lib/bookDesignSchema'

const entry = (id, text = 'מזל טוב', imageUrl = 'x.jpg') => ({ id, name: `n${id}`, text, imageUrl })

describe('expandBookPages — duo composition (entriesPerPage: 2)', () => {
    it('pairs entries in order, two per page', () => {
        const pages = expandBookPages([entry(1), entry(2), entry(3), entry(4)], { entriesPerPage: 2 })
        expect(pages).toHaveLength(2)
        expect(pages[0]._duo.map(e => e.id)).toEqual([1, 2])
        expect(pages[1]._duo.map(e => e.id)).toEqual([3, 4])
    })

    it('odd tail renders as a duo page with a single block', () => {
        const pages = expandBookPages([entry(1), entry(2), entry(3)], { entriesPerPage: 2 })
        expect(pages).toHaveLength(2)
        expect(pages[1]._duo).toHaveLength(1)
        expect(pages[1]._duo[0].id).toBe(3)
    })

    it('duo ignores autoSplit — no _split pages are produced', () => {
        const long = 'א'.repeat(500)
        const pages = expandBookPages([entry(1, long), entry(2, long)], {
            entriesPerPage: 2,
            autoSplit: true,
            splitThreshold: 240,
        })
        expect(pages).toHaveLength(1)
        expect(pages.every(p => !p._split)).toBe(true)
    })

    it('padToSpread evens out an odd duo count with a divider leaf', () => {
        const pages = expandBookPages([entry(1), entry(2), entry(3), entry(4), entry(5), entry(6)], {
            entriesPerPage: 2,
        })
        expect(pages).toHaveLength(3)
        const padded = expandBookPages([entry(1), entry(2), entry(3), entry(4), entry(5), entry(6)], {
            entriesPerPage: 2,
            padToSpread: true,
        })
        expect(padded).toHaveLength(4)
        expect(padded[3]._divider).toBe(true)
    })

    it('entriesPerPage: 1 (or absent) keeps the classic behavior', () => {
        const classic = expandBookPages([entry(1), entry(2)], { entriesPerPage: 1 })
        expect(classic).toHaveLength(2)
        expect(classic[0]._duo).toBeUndefined()
    })
})

describe('photo frames registry', () => {
    it('every frame resolves by id and has a label', () => {
        for (const f of PHOTO_FRAMES) {
            expect(resolvePhotoFrame(f.id)).toBe(f)
            expect(typeof f.label).toBe('string')
        }
    })

    it('null / unknown ids resolve to null (bare photo)', () => {
        expect(resolvePhotoFrame(null)).toBe(null)
        expect(resolvePhotoFrame('nope-nope')).toBe(null)
        expect(photoFrameGeometry(null, 200)).toBe(null)
    })

    it('geometry keeps the footprint and the 4:3 photo lock', () => {
        for (const f of PHOTO_FRAMES) {
            const geo = photoFrameGeometry(f.id, 200)
            expect(geo.matStyle.width).toBe(200)
            expect(geo.photoW).toBeLessThanOrEqual(200)
            expect(geo.photoW).toBeGreaterThan(0)
            expect(geo.photoH).toBeCloseTo(geo.photoW * 0.75, 5)
        }
    })

    it('uploaded-overlay geometry insets the photo and keeps 4:3', () => {
        const geo = photoOverlayGeometry(200, 8)
        expect(geo.inset).toBe(16)
        expect(geo.photoW).toBe(200 - 32)
        expect(geo.photoH).toBeCloseTo(geo.photoW * 0.75, 5)
        expect(photoOverlayGeometry(0)).toBe(null)
    })
})

describe('canonical schema — composition + photo layers', () => {
    it('includes entriesPerPage and photoFrame with safe defaults', () => {
        expect(CANONICAL_STYLE_DEFAULTS.entriesPerPage).toBe(1)
        expect(CANONICAL_STYLE_DEFAULTS.photoFrame).toBe(null)
        const clean = applyPresetClean({})
        expect(clean.entriesPerPage).toBe(1)
        expect(clean.photoFrame).toBe(null)
    })

    it('a duo+framed preset round-trips through applyPresetClean', () => {
        const out = applyPresetClean({ entriesPerPage: 2, photoFrame: 'gallery-depth' })
        expect(out.entriesPerPage).toBe(2)
        expect(out.photoFrame).toBe('gallery-depth')
        // and switching to a plain preset resets both — no haunting
        const next = applyPresetClean({ backgroundColor: '#fff' })
        expect(next.entriesPerPage).toBe(1)
        expect(next.photoFrame).toBe(null)
    })

    it('uploaded-overlay keys are canonical and reset cleanly', () => {
        expect(CANONICAL_STYLE_DEFAULTS.photoFrameUrl).toBe(null)
        expect(CANONICAL_STYLE_DEFAULTS.photoFrameInset).toBe(6)
        const out = applyPresetClean({ photoFrameUrl: 'https://x/frame.png', photoFrameInset: 9 })
        expect(out.photoFrameUrl).toBe('https://x/frame.png')
        expect(out.photoFrameInset).toBe(9)
        const next = applyPresetClean({})
        expect(next.photoFrameUrl).toBe(null)
        expect(next.photoFrameInset).toBe(6)
    })
})

import { existsSync, statSync } from 'fs'
import { ART_FRAMES, artFrameByUrl } from '@/lib/photoFrames'
import { readFileSync } from 'fs'

describe('the art frames', () => {
    it('are real files with a usable slice, and unique ids', () => {
        const ids = new Set()
        for (const f of ART_FRAMES) {
            expect(existsSync(`public${f.url}`), f.url).toBe(true)
            expect(f.slicePct).toBeGreaterThanOrEqual(4)
            expect(f.slicePct).toBeLessThanOrEqual(45)
            expect(ids.has(f.id)).toBe(false)
            ids.add(f.id)
            expect(artFrameByUrl(f.url)).toBe(f)
        }
        expect(artFrameByUrl('/nope.png')).toBe(null)
    })
})

describe('the page backgrounds on offer', () => {
    // studioPresets.js starts Firebase on import, so the registry is read as text.
    const src = readFileSync('src/lib/studioPresets.js', 'utf8')
    const staticBlock = src.slice(src.indexOf('export const STATIC_BACKGROUNDS'), src.indexOf('// ── Retired from the picker'))

    it('every static background is a real file', () => {
        const files = [...staticBlock.matchAll(/src: '([^']+)'/g)].map(m => m[1])
        expect(files.length).toBeGreaterThanOrEqual(13)
        for (const f of files) expect(existsSync(`public${f}`), f).toBe(true)
    })

    it('the house backgrounds are small enough for a phone', () => {
        const files = [...staticBlock.matchAll(/src: '(\/backgrounds\/book\/[^']+)'/g)].map(m => m[1])
        expect(files.length).toBe(13)
        for (const f of files) expect(statSync(`public${f}`).size).toBeLessThan(200 * 1024)
    })

    it('textures and borders that bake a frame into the page are retired from the picker', () => {
        const retired = src.slice(src.indexOf('export const RETIRED_BACKGROUND_IDS'), src.indexOf('const offered'))
        for (const gone of ['tex3', 'tex4', 'tex6', 'tex7', 'frame1', 'frame2', 'frame4']) expect(retired).toContain(`'${gone}'`)
        expect(src).toContain('].filter(offered)')
        expect(src).toContain('offered(b) && !hidden.has(b.id)')
    })
})
