import { describe, it, expect, afterEach } from 'vitest'
import { noCropBox } from '@/lib/photoSlot'
import { measureAspect, aspectCache } from '@/lib/useImageAspect'
import { photoFrameGeometry, photoOverlayGeometry } from '@/lib/photoFrames'
import { expandBookPages } from '@/lib/bookPages'
import { withNoCropOverride, resolveInteriorDesign } from '@/app/wedding/[weddingId]/viewer/defaultStyle'
import { applyPresetClean, resolvePhotoStyle, cleanAlbumPhoto } from '@/lib/bookDesignSchema'

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

// ── The regression this suite exists to pin ─────────────────────────
// Reported summer 2026: the switch held in /viewer, but a couple opening
// the share link on their phone and tapping a design in the preset strip
// got cropped photos back. Cause: every surface that lets someone CHANGE
// the design replaces styleSettings wholesale with applyPresetClean(...),
// which resets photoFit to the canonical 'cover'. Resolving the design
// once at load is therefore not enough — the overlay has to be re-applied
// at the render chokepoint, after the preset.
describe('the switch survives a design change (not just page load)', () => {
    const wedding = { noPhotoCrop: true, bookDesign: { photoFit: 'contain', fontColor: '#000' } }

    it('loads uncropped', () => {
        expect(applyPresetClean(resolveInteriorDesign(wedding)).photoFit).toBe('contain')
    })

    it('shows the bug when a preset is applied WITHOUT the overlay', () => {
        // What the digital-edition strip used to do on tap.
        const afterPreset = applyPresetClean({ backgroundColor: '#fff', template: 'polaroid' })
        expect(afterPreset.photoFit).toBe('cover') // ← the crop coming back
    })

    it('stays uncropped when the overlay is re-applied at render', () => {
        const afterPreset = applyPresetClean({ backgroundColor: '#fff', template: 'polaroid' })
        const rendered = withNoCropOverride(afterPreset, wedding)
        expect(rendered.photoFit).toBe('contain')
        // The rest of the freshly picked preset must survive untouched —
        // the overlay only ever owns photoFit.
        expect(rendered.template).toBe('polaroid')
        expect(rendered.backgroundColor).toBe('#fff')
    })

    it('survives the live-preset link re-applying a studio preset', () => {
        // bookDesignPresetId makes linked books follow the preset's CURRENT
        // studio values; that effect also replaces styleSettings wholesale.
        const live = applyPresetClean({ template: 'classic', imageStyle: { width: 92 } })
        expect(withNoCropOverride(live, wedding).photoFit).toBe('contain')
    })

    it('renders preset THUMBNAILS uncropped too, so the tile matches the result', () => {
        // A cropped tile next to an uncropped book reads as a broken preview.
        const tile = withNoCropOverride(applyPresetClean({}), { noPhotoCrop: true })
        expect(tile.photoFit).toBe('contain')
    })

    it('turning the switch back off re-crops immediately, with no stale design', () => {
        // The overlay is never persisted into bookDesign — so clearing the
        // flag is instant, not "until the next preset pick".
        const stored = applyPresetClean({ template: 'classic' })
        expect(withNoCropOverride(stored, { noPhotoCrop: false }).photoFit).toBe('cover')
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

// ── Album-mode photo overrides ──────────────────────────────────────
// A 4:3 crop and a whole photo need different air on the page, so size
// + margins hold TWO sets of values: the flat keys (cropped mode) and
// `albumPhoto` (uncropped mode). resolvePhotoStyle picks the right set
// at render time. Every assertion about the DEFAULT path here is a
// "nothing changed" assertion — existing presets have no albumPhoto.
describe('resolvePhotoStyle — the per-mode photo values', () => {
    const base = {
        photoFit: 'cover',
        imageMarginTop: 2,
        imageMarginBottom: 2,
        imageStyle: { width: 80, borderRadius: '12px' },
        albumPhoto: { imageMarginTop: 9, imageMarginBottom: 1, imageStyle: { width: 62, height: 46.5 } },
    }

    it('is a no-op — same object identity — while the page crops', () => {
        // Identity matters: a new object every render would defeat the
        // memoisation the page templates rely on.
        expect(resolvePhotoStyle(base)).toBe(base)
        expect(resolvePhotoStyle({ ...base, photoFit: undefined })).toEqual({ ...base, photoFit: undefined })
    })

    it('is a no-op when the design carries no album override', () => {
        const plain = { photoFit: 'contain', imageMarginTop: 2, albumPhoto: null }
        expect(resolvePhotoStyle(plain)).toBe(plain)
    })

    it('swaps in the album margins and width once the page is uncropped', () => {
        const out = resolvePhotoStyle({ ...base, photoFit: 'contain' })
        expect(out.imageMarginTop).toBe(9)
        expect(out.imageMarginBottom).toBe(1)
        expect(out.imageStyle.width).toBe(62)
    })

    it('keeps the shared photo properties — only size and margins split', () => {
        const out = resolvePhotoStyle({ ...base, photoFit: 'contain' })
        // borderRadius lives on the SAME imageStyle object the override
        // replaces width in — a shallow swap would have dropped it.
        expect(out.imageStyle.borderRadius).toBe('12px')
    })

    it('inherits per key — an untouched album slider still follows the crop values', () => {
        const out = resolvePhotoStyle({
            ...base,
            photoFit: 'contain',
            albumPhoto: { imageMarginTop: 9 }, // bottom + width never touched
        })
        expect(out.imageMarginTop).toBe(9)
        expect(out.imageMarginBottom).toBe(2)
        expect(out.imageStyle.width).toBe(80)
    })

    it('never mutates the design it was handed', () => {
        const design = { ...base, photoFit: 'contain' }
        resolvePhotoStyle(design)
        expect(design.imageMarginTop).toBe(2)
        expect(design.imageStyle.width).toBe(80)
    })

    it('survives junk instead of throwing at render time', () => {
        for (const bad of [null, undefined, 'nope', 42]) {
            expect(() => resolvePhotoStyle(bad)).not.toThrow()
        }
        const out = resolvePhotoStyle({ photoFit: 'contain', imageMarginTop: 2, albumPhoto: { imageMarginTop: 'ten' } })
        expect(out.imageMarginTop).toBe(2) // garbage dropped, base kept
    })
})

describe('cleanAlbumPhoto — one canonical shape for "no override"', () => {
    it('collapses every empty form to null', () => {
        // Not {} — the studio compares designs by JSON to decide whether
        // the draft is dirty, so two spellings of "nothing" would show a
        // phantom unsaved change.
        for (const empty of [null, undefined, {}, { imageStyle: {} }, { nope: 1 }, [], 'x']) {
            expect(cleanAlbumPhoto(empty)).toBeNull()
        }
    })

    it('keeps only the supported keys', () => {
        expect(
            cleanAlbumPhoto({
                imageMarginTop: 9,
                imageMarginBottom: 1,
                imageStyle: { width: 62, height: 46.5, borderRadius: '40px' },
                fontColor: '#f00', // not a per-mode property
            })
        ).toEqual({ imageMarginTop: 9, imageMarginBottom: 1, imageStyle: { width: 62, height: 46.5 } })
    })

    it('accepts 0 — a legitimate margin, not "empty"', () => {
        expect(cleanAlbumPhoto({ imageMarginTop: 0 })).toEqual({ imageMarginTop: 0 })
    })
})

describe('applyPresetClean — album overrides survive a preset apply', () => {
    it('defaults to null, so every existing preset is untouched', () => {
        expect(applyPresetClean({}).albumPhoto).toBeNull()
        // And the flat photo keys keep their canonical values.
        expect(applyPresetClean({}).imageMarginTop).toBe(2)
    })

    it('carries a real override through the full reset', () => {
        const out = applyPresetClean({ albumPhoto: { imageMarginTop: 9, imageStyle: { width: 62 } } })
        expect(out.albumPhoto).toEqual({ imageMarginTop: 9, imageStyle: { width: 62 } })
    })

    it('sanitises a malformed override rather than passing it to the renderer', () => {
        expect(applyPresetClean({ albumPhoto: 'contain please' }).albumPhoto).toBeNull()
        expect(applyPresetClean({ albumPhoto: { imageMarginTop: NaN } }).albumPhoto).toBeNull()
    })
})

describe('the operator switch and the album values compose', () => {
    // The ordering contract: withNoCropOverride runs FIRST (it decides
    // photoFit), resolvePhotoStyle second (it branches on the result).
    const design = applyPresetClean({
        imageMarginTop: 2,
        imageMarginBottom: 2,
        imageStyle: { width: 80 },
        albumPhoto: { imageMarginTop: 9, imageStyle: { width: 62 } },
    })

    it('a wedding flipped to album mode gets the album composition too', () => {
        // The whole point: the operator flips ONE switch and the pages are
        // composed for whole photos — not merely uncropped inside a layout
        // that was tuned for 4:3 crops.
        const rendered = resolvePhotoStyle(withNoCropOverride(design, { noPhotoCrop: true }))
        expect(rendered.photoFit).toBe('contain')
        expect(rendered.imageMarginTop).toBe(9)
        expect(rendered.imageStyle.width).toBe(62)
    })

    it('a wedding with the switch off renders the crop values, override or not', () => {
        const rendered = resolvePhotoStyle(withNoCropOverride(design, { noPhotoCrop: false }))
        expect(rendered.photoFit).toBe('cover')
        expect(rendered.imageMarginTop).toBe(2)
        expect(rendered.imageStyle.width).toBe(80)
    })

    it('still holds after the couple taps a design on their phone', () => {
        // Combines both fixes: the preset reset drops photoFit, the
        // wedding overlay puts it back, and the album values follow.
        const afterPreset = applyPresetClean({ template: 'polaroid', albumPhoto: { imageMarginTop: 9 } })
        expect(afterPreset.photoFit).toBe('cover')
        const rendered = resolvePhotoStyle(withNoCropOverride(afterPreset, { noPhotoCrop: true }))
        expect(rendered.photoFit).toBe('contain')
        expect(rendered.imageMarginTop).toBe(9)
    })
})
