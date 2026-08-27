import { describe, it, expect } from 'vitest'
import { panelRect, fitScale } from '@/lib/framedPanel'

// The night asset and its measured rails.
const ASSET = { assetW: 1080, assetH: 1919 }
const RAILS = { top: 14.4, bottom: 86.5, left: 10.5, right: 89.6 }

describe('panelRect', () => {
    it('tracks the panel when cover crops the top and bottom', () => {
        // A phone is narrower than the asset, so cover scales by height
        // and the sides hang off screen. The panel goes with them — which
        // is the whole reason a form positioned in viewport percentages
        // drifts off the rails.
        const r = panelRect({ viewportW: 390, viewportH: 844, ...ASSET, rails: RAILS })
        const scale = 844 / 1919
        const dispW = 1080 * scale
        expect(r.width).toBeCloseTo((dispW * (89.6 - 10.5)) / 100, 6)
        // Vertically the whole asset is visible, so the rails land at
        // their plain percentage of the viewport.
        expect(r.top).toBeCloseTo(844 * 0.144, 6)
        expect(r.top + r.height).toBeCloseTo(844 * 0.865, 6)
    })

    it('tracks it the other way when cover crops the sides', () => {
        // A wide window: now width drives, the asset is taller than the
        // window, and the panel's TOP is off-screen-negative rather than
        // at 14.4% of the viewport. Percentages of the viewport would be
        // wrong here by hundreds of pixels.
        const r = panelRect({ viewportW: 1400, viewportH: 800, ...ASSET, rails: RAILS })
        const scale = 1400 / 1080
        const dispH = 1919 * scale
        const offY = (800 - dispH) / 2
        expect(r.top).toBeCloseTo(offY + (dispH * 14.4) / 100, 6)
        expect(r.left).toBeCloseTo((1400 * 10.5) / 100, 6)
    })

    it('keeps the panel visually centred on every phone', () => {
        // Not exactly centred: the measured rails are 10.5 and 89.6, so
        // the panel's own middle sits at 50.05% of the asset. Asserting
        // perfect symmetry would be asserting something about my
        // measurement rather than about the maths — a couple of pixels
        // is what "centred" means here.
        for (const [w, h] of [[360, 800], [390, 844], [430, 932], [412, 915]]) {
            const r = panelRect({ viewportW: w, viewportH: h, ...ASSET, rails: RAILS })
            const leftGap = r.left
            const rightGap = w - (r.left + r.width)
            expect(Math.abs(leftGap - rightGap), `${w}x${h}`).toBeLessThan(2)
        }
    })

    it('survives junk instead of positioning a form at NaN', () => {
        for (const args of [
            {}, { viewportW: 0, viewportH: 800, ...ASSET, rails: RAILS },
            { viewportW: 390, viewportH: 844, ...ASSET, rails: null },
            { viewportW: 390, viewportH: 844, ...ASSET, rails: { top: 90, bottom: 10, left: 0, right: 100 } },
            { viewportW: 390, viewportH: 844, assetW: 0, assetH: 0, rails: RAILS },
        ]) {
            expect(panelRect(args), JSON.stringify(args)).toBeNull()
        }
    })
})

describe('fitScale', () => {
    const panel = { panelW: 370, panelH: 610 }

    it('never scales a design up past itself', () => {
        // A form blown up on a tablet looks like a poster of a form.
        const r = fitScale({ ...panel, panelW: 2000, panelH: 2000, designW: 360, contentH: 200 })
        expect(r.scale).toBe(1)
    })

    it('shrinks to whichever axis runs out first', () => {
        // 900 rather than 1200 on purpose: at 1200 the answer lands
        // under the floor, and then the floor is what decides — which is
        // a different behaviour, tested separately below.
        const tall = fitScale({ ...panel, designW: 360, contentH: 900 })
        const wide = fitScale({ ...panel, panelW: 200, designW: 360, contentH: 100 })
        expect(tall.scale).toBeLessThan(1)
        expect(wide.scale).toBeLessThan(1)
        expect(tall.clamped).toBe(false)
        // Taller content than the panel → height decides, not width.
        expect(tall.scale).toBeCloseTo(tall.innerH / 900, 6)
    })

    it('uses width alone until the content has been measured', () => {
        // The first paint happens before the height is known; it must
        // produce something sane rather than a zero-scale flash.
        const r = fitScale({ ...panel, designW: 360, contentH: 0 })
        expect(r.scale).toBeGreaterThan(0)
        expect(r.scale).toBeCloseTo(Math.min(r.innerW / 360, 1), 6)
    })

    it('has a floor, and says when it hit it', () => {
        // Past a point, shrinking further trades one broken thing for
        // another. The caller gets told rather than being handed 0.2.
        const r = fitScale({ panelW: 120, panelH: 90, designW: 360, contentH: 900, minScale: 0.55 })
        expect(r.scale).toBe(0.55)
        expect(r.clamped).toBe(true)
    })

    it('does not claim to be clamped when it is not', () => {
        expect(fitScale({ ...panel, designW: 360, contentH: 500 }).clamped).toBe(false)
    })

    it('survives junk', () => {
        expect(fitScale({})).toBeNull()
        expect(fitScale({ panelW: 300, panelH: 400, designW: 0 })).toBeNull()
        const r = fitScale({ panelW: 300, panelH: 400, designW: 360, contentH: 'x', padPct: 'y' })
        expect(Number.isFinite(r.scale)).toBe(true)
    })
})

describe('panelRect().visible', () => {
    it('is the panel itself when the panel is fully on screen', () => {
        const r = panelRect({ viewportW: 390, viewportH: 844, ...ASSET, rails: RAILS })
        expect(r.visible.top).toBeCloseTo(r.top, 6)
        expect(r.visible.height).toBeCloseTo(r.height, 6)
    })

    it('clips to the window in landscape, where most of the panel is off screen', () => {
        // The case the rails-only check passed and the eye did not: at
        // 844×390 the rails land at roughly -338 and 743, so a form
        // fitted to the panel's full height is taller than the window.
        const r = panelRect({ viewportW: 844, viewportH: 390, ...ASSET, rails: RAILS })
        expect(r.top).toBeLessThan(0)
        expect(r.top + r.height).toBeGreaterThan(390)
        expect(r.visible.top).toBe(0)
        expect(r.visible.height).toBe(390)
    })

    it('never returns a negative box', () => {
        for (const [w, h] of [[360, 800], [844, 390], [1280, 800], [200, 1200]]) {
            const v = panelRect({ viewportW: w, viewportH: h, ...ASSET, rails: RAILS }).visible
            expect(v.width, `${w}x${h}`).toBeGreaterThanOrEqual(0)
            expect(v.height, `${w}x${h}`).toBeGreaterThanOrEqual(0)
            expect(v.left).toBeGreaterThanOrEqual(0)
            expect(v.top).toBeGreaterThanOrEqual(0)
        }
    })
})
