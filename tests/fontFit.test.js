import { describe, it, expect } from 'vitest'
import {
    fitFactor, minFactorOf, pageFitFactor, duoFitFactor, effectiveFontPercent,
    nameFontPercent,
    DEFAULT_MIN_FACTOR, PAGE_FIT_TARGET, DUO_FIT_TARGET, NAME_TO_BODY_RATIO,
} from '@/lib/fontFit'

describe('fitFactor', () => {
    it('leaves short text alone', () => {
        expect(fitFactor(0, 230)).toBe(1)
        expect(fitFactor(100, 230)).toBe(1)
        expect(fitFactor(230, 230)).toBe(1)
    })

    it('shrinks past the target, and keeps shrinking', () => {
        const a = fitFactor(400, 230)
        const b = fitFactor(800, 230)
        expect(a).toBeLessThan(1)
        expect(b).toBeLessThan(a)
    })

    it('never goes below the floor', () => {
        expect(fitFactor(100000, 230)).toBe(DEFAULT_MIN_FACTOR)
        expect(fitFactor(100000, 230, 0.4)).toBe(0.4)
    })

    it('a floor of 1 disables the shrink entirely', () => {
        // This is how the page editor offers "do not shrink this one" —
        // no separate flag, just the floor raised to the ceiling.
        expect(fitFactor(100000, 230, 1)).toBe(1)
    })

    it('survives junk instead of returning NaN into a fontSize', () => {
        expect(fitFactor(NaN, 230)).toBe(1)
        expect(fitFactor(-5, 230)).toBe(1)
        expect(fitFactor(500, 0)).toBe(1)
        expect(fitFactor(500, NaN)).toBe(1)
        expect(fitFactor(500, 230, NaN)).toBeGreaterThan(0)
    })
})

describe('minFactorOf', () => {
    it('reads a real number', () => {
        expect(minFactorOf({ fontMinFactor: 0.8 })).toBe(0.8)
        expect(minFactorOf({ fontMinFactor: 1 })).toBe(1)
    })

    it('falls back on anything that is not a number', () => {
        // Numeric strings are rejected on purpose: that is exactly what
        // the templates did before this module, and a form that starts
        // storing strings should show up as "no effect", not as a silent
        // change in every book.
        for (const v of [undefined, null, '0.8', 'x', NaN]) {
            expect(minFactorOf({ fontMinFactor: v }), String(v)).toBe(DEFAULT_MIN_FACTOR)
        }
        expect(minFactorOf(null)).toBe(DEFAULT_MIN_FACTOR)
    })
})

describe('pageFitFactor', () => {
    it('starts shrinking earlier when a photo shares the page', () => {
        const len = 300
        expect(pageFitFactor({ textLength: len, hasImage: true })).toBeLessThan(1)
        expect(pageFitFactor({ textLength: len, hasImage: false })).toBe(1)
    })

    it('honours a preset-tuned target', () => {
        expect(pageFitFactor({ textLength: 300, hasImage: true, styleSettings: { fontFitTarget: 900 } })).toBe(1)
    })

    it('reproduces the formula the template used', () => {
        const len = 600
        const expected = Math.max(0.62, Math.min(1, Math.sqrt(PAGE_FIT_TARGET.withImage / Math.max(len, PAGE_FIT_TARGET.withImage))))
        expect(pageFitFactor({ textLength: len, hasImage: true })).toBeCloseTo(expected, 12)
    })

    it('survives being called with nothing', () => {
        expect(pageFitFactor()).toBe(1)
    })
})

describe('duoFitFactor', () => {
    it('shrinks sooner than a full page, for the same text', () => {
        const args = { textLength: 250, hasImage: true }
        expect(duoFitFactor(args)).toBeLessThan(pageFitFactor(args))
    })

    it('ignores fontFitTarget but respects the floor', () => {
        // A number tuned against a whole page would leave a half page
        // barely shrinking at all.
        const tuned = { fontFitTarget: 900 }
        expect(duoFitFactor({ textLength: 400, hasImage: true, styleSettings: tuned }))
            .toBe(duoFitFactor({ textLength: 400, hasImage: true }))
        expect(duoFitFactor({ textLength: 99999, hasImage: true, styleSettings: { fontMinFactor: 1 } })).toBe(1)
    })

    it('reproduces the formula the layout used', () => {
        const len = 400
        const expected = Math.max(0.62, Math.min(1, Math.sqrt(DUO_FIT_TARGET.textOnly / Math.max(len, DUO_FIT_TARGET.textOnly))))
        expect(duoFitFactor({ textLength: len, hasImage: false })).toBeCloseTo(expected, 12)
    })
})

describe('effectiveFontPercent', () => {
    it('is what the page really renders — the number the editor must show', () => {
        expect(effectiveFontPercent({ fontSizePercent: 5 }, 1)).toBe(5)
        expect(effectiveFontPercent({ fontSizePercent: 5 }, 0.62)).toBeCloseTo(3.1, 10)
    })

    it('defaults an unset size instead of rendering nothing', () => {
        expect(effectiveFontPercent({}, 1)).toBe(3)
        expect(effectiveFontPercent({ fontSizePercent: null }, 1)).toBe(3)
        expect(effectiveFontPercent(null, 1)).toBe(3)
    })

    it('takes the duo scale factor', () => {
        expect(effectiveFontPercent({ fontSizePercent: 3 }, 1, 0.82)).toBeCloseTo(2.46, 10)
    })

    it('treats a missing factor as no shrink rather than NaN', () => {
        expect(effectiveFontPercent({ fontSizePercent: 4 }, undefined)).toBe(4)
    })
})

describe('nameFontPercent', () => {
    it('follows the blessing at 70% when nobody set a name size', () => {
        // The reason the page editor shows a derived number instead of a
        // constant: raise the blessing on one page and the name goes
        // with it, so a slider reading a fixed 2.1 would be wrong the
        // moment the font-size slider above it moved.
        expect(nameFontPercent({ fontSizePercent: 4 })).toBeCloseTo(2.8, 10)
        expect(nameFontPercent({ fontSizePercent: 3 })).toBeCloseTo(3 * NAME_TO_BODY_RATIO, 10)
    })

    it('falls back to 2.1 when there is no body size to follow', () => {
        expect(nameFontPercent({})).toBe(2.1)
        expect(nameFontPercent(null)).toBe(2.1)
        expect(nameFontPercent({ fontSizePercent: null })).toBe(2.1)
        expect(nameFontPercent({ fontSizePercent: 0 })).toBe(2.1)
    })

    it('an explicit size wins and stops following', () => {
        expect(nameFontPercent({ fontSizePercent: 5, nameFontSizePercent: 2 })).toBe(2)
    })

    it('keeps an explicit zero instead of treating it as unset', () => {
        // != null, not truthiness. A stored 0 is strange but deliberate,
        // and silently replacing it with 2.1 would make the control
        // impossible to trust.
        expect(nameFontPercent({ fontSizePercent: 4, nameFontSizePercent: 0 })).toBe(0)
    })

    it('takes the duo scale', () => {
        expect(nameFontPercent({ nameFontSizePercent: 2 }, 0.85)).toBeCloseTo(1.7, 10)
    })

    it('reproduces what the templates computed before it existed', () => {
        for (const v of [{ fontSizePercent: 2.6 }, { fontSizePercent: 3.6 }, { nameFontSizePercent: 2.4 }, {}]) {
            const old = v.nameFontSizePercent ?? (v.fontSizePercent ? v.fontSizePercent * 0.7 : 2.1)
            expect(nameFontPercent(v), JSON.stringify(v)).toBeCloseTo(old, 12)
        }
    })
})
