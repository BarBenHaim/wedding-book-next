import { describe, expect, it } from 'vitest'
import { keepsWholePhoto, photoDrawPlan, FULL_PHOTO_MAX_EDGE } from '@/lib/fullPhoto'

describe('whole photo: which events', () => {
    it('follows the "do not crop photos" switch of the event, and nothing else', () => {
        expect(keepsWholePhoto({ noPhotoCrop: true })).toBe(true)
        expect(keepsWholePhoto({ noPhotoCrop: false })).toBe(false)
        expect(keepsWholePhoto({ noPhotoCrop: 'true' })).toBe(false)
        expect(keepsWholePhoto({})).toBe(false)
        expect(keepsWholePhoto(null)).toBe(false)
    })
})

describe('whole photo: what gets uploaded', () => {
    it('keeps the entire picture, in its own shape', () => {
        // A portrait phone photo, small enough to keep as is.
        const p = photoDrawPlan({ wholePhoto: true, naturalWidth: 1200, naturalHeight: 1600, crop: null })
        expect(p).toEqual({ sx: 0, sy: 0, sw: 1200, sh: 1600, width: 1200, height: 1600 })
    })

    it('ignores a crop box left over from the cropper', () => {
        const p = photoDrawPlan({ wholePhoto: true, naturalWidth: 800, naturalHeight: 600, crop: { x: 100, y: 50, width: 400, height: 300 } })
        expect(p.sx).toBe(0)
        expect(p.sw).toBe(800)
        expect(p.sh).toBe(600)
    })

    it('scales a huge photo down to what the printer can use, same shape', () => {
        const p = photoDrawPlan({ wholePhoto: true, naturalWidth: 3024, naturalHeight: 4032 })
        expect(p.height).toBe(FULL_PHOTO_MAX_EDGE)
        expect(p.width).toBe(1800)
        expect(p.sw).toBe(3024)
        expect(p.sh).toBe(4032)
        expect(Math.abs(p.width / p.height - 3024 / 4032)).toBeLessThan(0.001)
        // Landscape and panorama too; never upscaled.
        expect(photoDrawPlan({ wholePhoto: true, naturalWidth: 4800, naturalHeight: 1200 })).toMatchObject({ width: 2400, height: 600 })
        expect(photoDrawPlan({ wholePhoto: true, naturalWidth: 640, naturalHeight: 480 })).toMatchObject({ width: 640, height: 480 })
    })

    it('has nothing to draw for a picture with no size', () => {
        expect(photoDrawPlan({ wholePhoto: true, naturalWidth: 0, naturalHeight: 100 })).toBe(null)
        expect(photoDrawPlan({ wholePhoto: true })).toBe(null)
    })
})

describe('cropped photo: unchanged', () => {
    it('draws exactly the box the guest framed, at its own size', () => {
        const p = photoDrawPlan({ wholePhoto: false, naturalWidth: 4000, naturalHeight: 3000, crop: { x: 400, y: 300, width: 3200, height: 2400 } })
        expect(p).toEqual({ sx: 400, sy: 300, sw: 3200, sh: 2400, width: 3200, height: 2400 })
    })

    it('rejects the empty boxes the cropper can briefly emit', () => {
        expect(photoDrawPlan({ wholePhoto: false, crop: { x: 0, y: 0, width: 0, height: 300 } })).toBe(null)
        expect(photoDrawPlan({ wholePhoto: false, crop: { x: 0, y: 0, width: 300, height: 0.4 } })).toBe(null)
        expect(photoDrawPlan({ wholePhoto: false, crop: null })).toBe(null)
    })
})
