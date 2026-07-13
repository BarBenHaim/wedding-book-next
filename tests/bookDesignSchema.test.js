import { describe, it, expect } from 'vitest'
import { CANONICAL_STYLE_DEFAULTS, applyPresetClean } from '@/lib/bookDesignSchema'

// The bug class under test: preset application used to MERGE over the
// previous styleSettings, so keys the new preset didn't define survived
// from older presets / manual tweaks. applyPresetClean must guarantee a
// deterministic, complete design regardless of history.

describe('applyPresetClean', () => {
    it('returns every canonical key even for an empty preset', () => {
        const out = applyPresetClean({})
        for (const key of Object.keys(CANONICAL_STYLE_DEFAULTS)) {
            expect(out).toHaveProperty(key)
        }
    })

    it('is a FULL RESET — stale keys from a previous design cannot survive', () => {
        // preset A forced right alignment + bold + a custom margin
        const presetA = { textAlign: 'right', fontWeight: 700, imageMarginTop: 6 }
        // preset B doesn't mention any of those
        const presetB = { backgroundColor: '#fdf6e7' }

        const afterA = applyPresetClean(presetA)
        expect(afterA.textAlign).toBe('right')
        expect(afterA.fontWeight).toBe(700)
        expect(afterA.imageMarginTop).toBe(6)

        // applying B is computed from B alone — A's choices are gone
        const afterB = applyPresetClean(presetB)
        expect(afterB.textAlign).toBe(CANONICAL_STYLE_DEFAULTS.textAlign) // 'center'
        expect(afterB.fontWeight).toBe(CANONICAL_STYLE_DEFAULTS.fontWeight) // null
        expect(afterB.imageMarginTop).toBe(CANONICAL_STYLE_DEFAULTS.imageMarginTop) // 2
        expect(afterB.backgroundColor).toBe('#fdf6e7')
    })

    it('is deterministic — same preset, same result, regardless of call order', () => {
        const preset = { backgroundColor: '#111', fontSizePercent: 4 }
        const a = applyPresetClean(preset)
        applyPresetClean({ textAlign: 'right', nameMarginTop: 9 }) // unrelated apply in between
        const b = applyPresetClean(preset)
        expect(b).toEqual(a)
    })

    it('deep-defaults imageStyle so width/borderRadius always exist', () => {
        const onlyWidth = applyPresetClean({ imageStyle: { width: 65 } })
        expect(onlyWidth.imageStyle.width).toBe(65)
        expect(onlyWidth.imageStyle.borderRadius).toBe(
            CANONICAL_STYLE_DEFAULTS.imageStyle.borderRadius,
        )

        const noImageStyle = applyPresetClean({ backgroundColor: '#fff' })
        expect(noImageStyle.imageStyle).toEqual(CANONICAL_STYLE_DEFAULTS.imageStyle)
    })

    it('drops undefined values (Firestore-safe) and detaches references', () => {
        const src = { texture: undefined, imageStyle: { width: 70 } }
        const out = applyPresetClean(src)
        expect(Object.values(out).includes(undefined)).toBe(false)
        expect('texture' in out).toBe(true) // canonical null, not undefined
        expect(out.texture).toBe(null)
        out.imageStyle.width = 999
        expect(src.imageStyle.width).toBe(70) // caller's object untouched
    })

    it('null/garbage input → the pure canonical design', () => {
        expect(applyPresetClean(null)).toEqual(applyPresetClean(undefined))
        expect(applyPresetClean(null).template).toBe('classic')
        expect(applyPresetClean('nope').pagePadding).toBe(4)
    })

    it('canonical defaults mirror the template fallbacks (virgin render unchanged)', () => {
        const d = CANONICAL_STYLE_DEFAULTS
        expect(d.fontSizePercent).toBe(3)
        expect(d.textAlign).toBe('center')
        expect(d.nameMarginTop).toBe(2)
        expect(d.nameMarginBottom).toBe(1)
        expect(d.imageMarginTop).toBe(2)
        expect(d.imageMarginBottom).toBe(2)
        expect(d.textMaxWidth).toBe(85)
        expect(d.textLineHeight).toBe(1.5)
        expect(d.pagePadding).toBe(4)
        expect(d.imageStyle.width).toBe(80)
        expect(d.autoSplit).toBe(false)
        expect(d.splitThreshold).toBe(240)
    })
})
