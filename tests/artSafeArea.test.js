import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { artSafeBottomPct, artSafeTopPct, SQUEEZE_STEPS, contentFits, MAX_SQUEEZED_TEXT_WIDTH_PCT } from '@/lib/artSafeArea'

describe('art safe area', () => {
    it('knows the bands of the house backgrounds, by file name, wherever the URL points', () => {
        expect(artSafeBottomPct('/backgrounds/book/bm-jerusalem.webp')).toBeGreaterThan(10)
        expect(artSafeBottomPct('https://app.weddingtales.co.il/backgrounds/book/bm-tallit.webp?v=2')).toBeGreaterThan(10)
        expect(artSafeTopPct('/backgrounds/book/bd-arches.webp')).toBeGreaterThan(10)
    })

    it('has no band for an unknown or missing background (nothing changes for it)', () => {
        for (const v of [undefined, null, '', '/textures/tex1.png', 'x']) {
            expect(artSafeBottomPct(v)).toBe(0)
            expect(artSafeTopPct(v)).toBe(0)
        }
    })

    it('every named background exists as a file', () => {
        const dir = path.join(process.cwd(), 'public', 'backgrounds', 'book')
        const files = fs.readdirSync(dir)
        for (const name of ['bd-arches', 'bd-balloons', 'bd-splash', 'bm-jerusalem-gold', 'bm-jerusalem', 'bm-tallit', 'cl-indigo-wash', 'cl-peach-sky', 'nt-linen', 'wd-silk']) {
            expect(files, name).toContain(`${name}.webp`)
            expect(artSafeBottomPct(`/backgrounds/book/${name}.webp`), name).toBeGreaterThan(0)
        }
    })
})

describe('the squeeze ladder', () => {
    it('starts as the design and only ever shrinks or widens, step by step', () => {
        expect(SQUEEZE_STEPS[0]).toEqual({ photo: 1, text: 1, wide: 1 })
        for (let i = 1; i < SQUEEZE_STEPS.length; i += 1) {
            const a = SQUEEZE_STEPS[i - 1]
            const b = SQUEEZE_STEPS[i]
            expect(b.photo).toBeLessThanOrEqual(a.photo)
            expect(b.text).toBeLessThanOrEqual(a.text)
            expect(b.wide).toBeGreaterThanOrEqual(a.wide)
        }
    })

    it('never makes the blessing unreadably small or the column wider than the art margins allow', () => {
        const last = SQUEEZE_STEPS.at(-1)
        expect(last.text).toBeGreaterThanOrEqual(0.7)
        expect(MAX_SQUEEZED_TEXT_WIDTH_PCT).toBeLessThanOrEqual(88)
    })
})

describe('contentFits', () => {
    const page = { pageHeight: 1000, padTop: 40, padBottom: 40 }

    it('lets content that ends before the padding stand', () => {
        expect(contentFits({ ...page, top: 100, bottom: 950 })).toBe(true)
    })

    it('rejects content that runs into the bottom padding or past the page', () => {
        expect(contentFits({ ...page, top: 100, bottom: 990 })).toBe(false)
        expect(contentFits({ ...page, top: 100, bottom: 1300 })).toBe(false)
    })

    it('uses the art band when it is deeper than the padding', () => {
        expect(contentFits({ ...page, top: 100, bottom: 900, artBottom: 140 })).toBe(false)
        expect(contentFits({ ...page, top: 100, bottom: 850, artBottom: 140 })).toBe(true)
    })

    it('checks the top only for a centred page, which grows both ways', () => {
        expect(contentFits({ ...page, top: -20, bottom: 900 })).toBe(true) // top-anchored: the design decides the top
        expect(contentFits({ ...page, top: -20, bottom: 900, centered: true })).toBe(false)
        expect(contentFits({ ...page, top: 120, bottom: 880, centered: true, artTop: 100 })).toBe(true)
    })
})
