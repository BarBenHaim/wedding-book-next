import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { AUTO_DESIGNS, autoDesignKeyFor, autoBookDesign } from '@/lib/autoDesign'
import { CANONICAL_STYLE_DEFAULTS } from '@/lib/bookDesignSchema'
import { ART_FRAMES, resolvePhotoFrame } from '@/lib/photoFrames'

describe('the design a new event starts with', () => {
    it('each occasion gets its own look, and anything else gets the plain paper one', () => {
        expect(autoDesignKeyFor('wedding')).toBe('wd-blush')
        expect(autoDesignKeyFor('bar_mitzvah')).toBe('bm-tallit')
        expect(autoDesignKeyFor('twins_bar_mitzvah')).toBe('bm-tallit')
        expect(autoDesignKeyFor('bat_mitzvah')).toBe('bm-iceblue')
        expect(autoDesignKeyFor('birthday')).toBe('bd-bunting')
        for (const other of ['poker', 'travel', 'nope', undefined]) expect(autoDesignKeyFor(other)).toBe('cl-letterpress')
    })

    it('is a full book design: every canonical key present, nothing that a server cannot store', () => {
        for (const type of ['wedding', 'bar_mitzvah', 'bat_mitzvah', 'birthday', 'poker']) {
            const d = autoBookDesign(type)
            for (const k of Object.keys(CANONICAL_STYLE_DEFAULTS)) expect(d, `${type}.${k}`).toHaveProperty(k)
            // a font class is a build-time name; it must never be written into a document
            expect(d.fontClass ?? null).toBe(null)
            expect(d.backgroundUrl).toMatch(/^\/backgrounds\/book\/.+\.webp$/)
            expect(d.autoSplit).toBe(false)
        }
    })

    it('uses real files, and the frames it names exist with the slice the registry measured', () => {
        for (const [key, d] of Object.entries(AUTO_DESIGNS)) {
            expect(existsSync(`public${d.backgroundUrl}`), key).toBe(true)
            if (d.photoFrameUrl) {
                expect(existsSync(`public${d.photoFrameUrl}`), key).toBe(true)
                const reg = ART_FRAMES.find(f => f.url === d.photoFrameUrl)
                expect(reg, key).toBeTruthy()
                expect(d.photoFrameSlice).toBe(reg.slicePct)
            } else {
                expect(resolvePhotoFrame(d.photoFrame), key).toBeTruthy()
            }
        }
    })

    it('every house design is also a studio preset the owner can pick (same background and frame)', () => {
        const script = readFileSync('src/lib/studioPresets.js', 'utf8')
        for (const d of Object.values(AUTO_DESIGNS)) expect(script).toContain(d.backgroundUrl)
    })

    it('is written when an order opens the event, once, and only when the event type is known', () => {
        const src = readFileSync('src/app/api/createWedding/route.js', 'utf8')
        expect(src).toContain('bookDesign: autoBookDesign(details.fields.eventType)')
        expect(src.match(/autoBookDesign\(/g).length).toBe(1)
        // the order's own fields still win over it
        expect(src.indexOf('autoBookDesign(')).toBeLessThan(src.indexOf('...details.fields,'))
    })
})
