import { describe, it, expect, afterEach } from 'vitest'
import { noCropBox } from '@/lib/photoSlot'
import { measureAspect, aspectCache } from '@/lib/useImageAspect'
import { photoFrameGeometry, photoOverlayGeometry } from '@/lib/photoFrames'
import { expandBookPages } from '@/lib/bookPages'
import { withNoCropOverride, resolveInteriorDesign } from '@/app/wedding/[weddingId]/viewer/defaultStyle'

// The whole point of the toggle: existing books must render EXACTLY as
// before unless a super-admin turns it on. Most of these tests are
// therefore "nothing changed" assertions.

describe('withNoCropOverride — the sticky per-wedding switch', () => {
    it('passes the design through untouched when the flag is absent', () => {
        const design = { photoFit: 'cover', fontColor: '#000' }
        expect(withNoCropOverride(design, {})).toBe(design)
        expect(withNoCropOverride(design, { noPhotoCrop: false })).toBe(design)
        // Truthy-but-not-true must not enable it (guards a stray string).
        expect(withNoCropOverride(design, { noPhotoCrop: 'yes' })).toBe(design)
    })

    it('forces contain when the flag is on, leaving other keys alone', () => {
        const out = withNoCropOverride({ photoFit: 'cover', fontColor: '#000' }, { noPhotoCrop: true })
        expect(out.photoFit).toBe('contain')
        expect(out.fontColor).toBe('#000')
    })

    it('applies even when the wedding has no design object at all', () => {
        expect(withNoCropOverride(null, { noPhotoCrop: true })).toEqual({ photoFit: 'contain' })
    })

    it('overrides a design that explicitly asked for cover', () => {
        // The operator switch is the authority — a preset saying 'cover'
        // must not win over it, or the toggle would look broken.
        const w = { noPhotoCrop: true, bookDesign: { photoFit: 'cover' } }
        expect(resolveInteriorDesign(w).photoFit).toBe('contain')
    })

    it('reaches designs resolved from the legacy fallbacks too', () => {
        expect(resolveInteriorDesign({ noPhotoCrop: true, coverDesign: { fontColor: '#111' } }).photoFit).toBe('contain')
        expect(resolveInteriorDesign({ noPhotoCrop: true, book: { designSettings: {} } }).photoFit).toBe('contain')
    })

    it('leaves an untoggled wedding on the classic cover behaviour', () => {
        expect(resolveInteriorDesign({ bookDesign: { photoFit: 'cover' } }).photoFit).toBe('cover')
        expect(resolveInteriorDesign({ bookDesign: {} }).photoFit).toBeUndefined()
    })
})

describe('noCropBox — slot geometry', () => {
    it('keeps the fixed 4:3 slot when no-crop is off, whatever the photo is', () => {
        expect(noCropBox({ width: 400, aspect: 0.5, noCrop: false })).toEqual({ width: 400, height: 300 })
    })

    it('gives a portrait photo a portrait slot', () => {
        const box = noCropBox({ width: 400, aspect: 0.75, noCrop: true })
        expect(box.width).toBe(400)
        expect(box.height).toBeCloseTo(533.33, 1)
    })

    it('gives a landscape photo a wide slot', () => {
        const box = noCropBox({ width: 400, aspect: 2, noCrop: true })
        expect(box).toEqual({ width: 400, height: 200 })
    })

    it('scales width down (not the aspect) when a tall photo hits maxHeight', () => {
        const box = noCropBox({ width: 400, aspect: 0.5, maxHeight: 300, noCrop: true })
        expect(box.height).toBe(300)
        expect(box.width).toBe(150) // 300 * 0.5 — aspect preserved
        expect(box.width / box.height).toBeCloseTo(0.5, 6)
    })

    it('does not upscale a short photo to fill maxHeight', () => {
        const box = noCropBox({ width: 400, aspect: 2, maxHeight: 900, noCrop: true })
        expect(box).toEqual({ width: 400, height: 200 })
    })

    it('inverts the slot for quarter-turn rotations', () => {
        // A portrait photo rotated 90° reads as landscape, so the slot must
        // too — otherwise the bars the toggle exists to remove come back.
        const box = noCropBox({ width: 400, aspect: 0.5, rotation: 90, noCrop: true })
        expect(box.height).toBe(200) // 400 / (1/0.5)
        const half = noCropBox({ width: 400, aspect: 0.5, rotation: 180, noCrop: true })
        expect(half.height).toBe(800) // 180° keeps the original orientation
    })

    it('falls back to a tall-ish box while a legacy aspect is still unknown', () => {
        const box = noCropBox({ width: 400, aspect: null, noCrop: true })
        expect(box.width).toBe(400)
        expect(box.height).toBeCloseTo(460, 6)
    })

    it('ignores a garbage aspect rather than producing NaN', () => {
        for (const bad of [0, -3, NaN, 'abc', undefined]) {
            const box = noCropBox({ width: 400, aspect: bad, noCrop: true })
            expect(Number.isFinite(box.width)).toBe(true)
            expect(Number.isFinite(box.height)).toBe(true)
        }
    })
})

describe('frame geometry stays 4:3 by default', () => {
    it('photoFrameGeometry default arg reproduces the old * 0.75 exactly', () => {
        const geo = photoFrameGeometry('gallery-depth', 400)
        expect(geo.photoH).toBeCloseTo(geo.photoW * 0.75, 10)
    })

    it('photoFrameGeometry follows the photo when given a real aspect', () => {
        const geo = photoFrameGeometry('gallery-depth', 400, 0.75)
        expect(geo.photoH).toBeCloseTo(geo.photoW / 0.75, 10)
    })

    it('photoOverlayGeometry default arg is unchanged, and slotH stays consistent', () => {
        const geo = photoOverlayGeometry(400, 6)
        expect(geo.photoH).toBeCloseTo(geo.photoW * 0.75, 10)
        expect(geo.slotH).toBeCloseTo(geo.photoH + 2 * geo.inset, 10)
    })

    it('photoOverlayGeometry grows the slot for a portrait aspect', () => {
        const geo = photoOverlayGeometry(400, 6, 0.75)
        expect(geo.photoH).toBeCloseTo(geo.photoW / 0.75, 10)
        expect(geo.slotH).toBeCloseTo(geo.photoH + 2 * geo.inset, 10)
    })
})

// Legacy entries — the ones already in existing books — have no stored
// imgAspect, so the aspect is measured from the bitmap. This is what
// makes the toggle work without a backfill.
describe('measureAspect — the legacy fallback', () => {
    const install = ({ w, h, fail = false }) => {
        const loaded = []
        globalThis.window = {
            Image: class {
                set src(v) {
                    this._src = v
                    loaded.push(v)
                    queueMicrotask(() => {
                        if (fail) return this.onerror?.()
                        this.naturalWidth = w
                        this.naturalHeight = h
                        this.onload?.()
                    })
                }
            },
        }
        return loaded
    }
    afterEach(() => {
        delete globalThis.window
        aspectCache.clear()
    })

    it('measures a portrait bitmap to its real aspect', async () => {
        install({ w: 600, h: 900 })
        expect(await measureAspect('p.jpg')).toBeCloseTo(600 / 900, 10)
    })

    it('caches the result so repeat renders (and the export DOM) do not refetch', async () => {
        const loaded = install({ w: 800, h: 400 })
        await measureAspect('c.jpg')
        await measureAspect('c.jpg')
        expect(loaded).toHaveLength(1)
        expect(aspectCache.get('c.jpg')).toBeCloseTo(2, 10)
    })

    it('shares one decode between concurrent callers', async () => {
        const loaded = install({ w: 800, h: 400 })
        const [a, b] = await Promise.all([measureAspect('s.jpg'), measureAspect('s.jpg')])
        expect(loaded).toHaveLength(1)
        expect(a).toBe(b)
    })

    it('resolves null on a broken image and does not poison the cache', async () => {
        install({ fail: true })
        expect(await measureAspect('bad.jpg')).toBeNull()
        // Not cached → a later mount can retry rather than being stuck.
        expect(aspectCache.has('bad.jpg')).toBe(false)
    })

    it('resolves null (never throws) when there is no browser', async () => {
        // SSR: the slot falls back to the safe box, still uncropped.
        expect(await measureAspect('ssr.jpg')).toBeNull()
    })
})

describe('expandBookPages — split photo pages carry the aspect', () => {
    it('forwards imgAspect onto the generated photo-only page', () => {
        // Without this the split photo page — the one that shows the photo
        // LARGEST — had no shape to size its no-crop slot from.
        const pages = expandBookPages(
            [{ id: 1, name: 'n', text: 'א'.repeat(300), imageUrl: 'x.jpg', imgAspect: 0.75 }],
            { autoSplit: true }
        )
        expect(pages).toHaveLength(2)
        expect(pages[1]._split).toBe('photo')
        expect(pages[1].imgAspect).toBe(0.75)
    })

    it('leaves imgAspect undefined for legacy entries that never had one', () => {
        const pages = expandBookPages([{ id: 1, name: 'n', text: 'א'.repeat(300), imageUrl: 'x.jpg' }], {
            autoSplit: true,
        })
        expect(pages[1].imgAspect).toBeUndefined()
    })
})
