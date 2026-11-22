import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { keepsWholePhoto, photoDrawPlan, FULL_PHOTO_MAX_EDGE } from '@/lib/fullPhoto'

describe('photos kept whole', () => {
    it('the switch is the noPhotoCrop flag on the event, and only a true one', () => {
        expect(keepsWholePhoto({ noPhotoCrop: true })).toBe(true)
        for (const v of [{}, { noPhotoCrop: false }, { noPhotoCrop: 'yes' }, null, undefined]) expect(keepsWholePhoto(v)).toBe(false)
    })

    it('keeps the whole picture of any shape, scaled down only past what a printer can use', () => {
        const portrait = photoDrawPlan({ wholePhoto: true, naturalWidth: 3000, naturalHeight: 5000 })
        expect(portrait.sx).toBe(0)
        expect(portrait.sy).toBe(0)
        expect(portrait.sw).toBe(3000)
        expect(portrait.sh).toBe(5000)
        expect(Math.max(portrait.width, portrait.height)).toBeLessThanOrEqual(FULL_PHOTO_MAX_EDGE)
        expect(portrait.width / portrait.height).toBeCloseTo(0.6, 2)
        const small = photoDrawPlan({ wholePhoto: true, naturalWidth: 800, naturalHeight: 600 })
        expect([small.width, small.height]).toEqual([800, 600])
    })

    it('a camera capture keeps the whole frame on such an event, and the viewfinder shows all of it', () => {
        const src = readFileSync('src/app/wedding/[weddingId]/photo/page.js', 'utf8')
        expect(src).toContain('An event that keeps photos whole')
        expect(src).toMatch(/if \(wholePhoto\) \{\s*\/\/ An event that keeps photos whole/)
        expect(src.match(/wholePhoto \? 'object-contain' : 'object-cover'/g).length).toBe(2)
    })

    it('a new event from an order keeps photos whole, written with the rest of the event', () => {
        const src = readFileSync('src/app/api/createWedding/route.js', 'utf8')
        expect(src).toContain('...(details.fields.eventType ? { noPhotoCrop: true } : {})')
        expect(src.indexOf('noPhotoCrop: true')).toBeLessThan(src.indexOf('...details.fields,'))
    })
})
