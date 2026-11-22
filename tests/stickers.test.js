import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, statSync } from 'fs'
import { STICKER_LIBRARY, STICKER_LIMITS, STICKER_ANCHORS, STICKER_LABELS_HE, sanitizeStickers, newSticker, stickerById, stickerStyle } from '@/lib/stickers'
import { sanitizePageStyle, mergePageStyle, pageStyleOf, overriddenKeys } from '@/lib/pageStyle'

describe('the sticker library', () => {
    it('every sticker is a real, small, transparent picture with a Hebrew name', () => {
        const ids = new Set()
        for (const s of STICKER_LIBRARY) {
            expect(ids.has(s.id)).toBe(false)
            ids.add(s.id)
            expect(existsSync(`public${s.url}`), s.url).toBe(true)
            expect(statSync(`public${s.url}`).size).toBeLessThan(260 * 1024)
            expect(STICKER_LABELS_HE[s.id], s.id).toBeTruthy()
        }
        expect(STICKER_LIBRARY.length).toBe(20)
    })
})

describe('sanitizeStickers', () => {
    it('keeps known stickers, drops unknown ones and junk', () => {
        const out = sanitizeStickers([{ k: 'peony', x: 10, y: 20, s: 30, r: 5, f: 1 }, { k: 'nope' }, null, 'x', { x: 1 }])
        expect(out).toEqual([{ k: 'peony', x: 10, y: 20, s: 30, r: 5, f: 1 }])
        expect(sanitizeStickers('peony')).toEqual([])
        expect(sanitizeStickers(undefined)).toEqual([])
    })

    it('clamps size, rotation and position, and caps the count', () => {
        const [a] = sanitizeStickers([{ k: 'rose', x: 999, y: -999, s: 1000, r: 720 }])
        expect(a.s).toBe(STICKER_LIMITS.maxSize)
        expect(a.r).toBe(STICKER_LIMITS.maxRot)
        expect(a.x).toBe(110)
        expect(a.y).toBe(-10)
        const many = Array.from({ length: 40 }, () => ({ k: 'daisy' }))
        expect(sanitizeStickers(many).length).toBe(STICKER_LIMITS.max)
    })

    it('fills missing numbers with sensible defaults', () => {
        expect(sanitizeStickers([{ k: 'gold-heart' }])[0]).toEqual({ k: 'gold-heart', x: 50, y: 50, s: 20, r: 0, f: 0 })
    })

    it('a new sticker lands inside the page, tape is wider and tilted', () => {
        const heart = newSticker('gold-heart', 'tr')
        expect(heart.x).toBeGreaterThan(50)
        expect(heart.y).toBeLessThan(50)
        const tape = newSticker('tape-blush')
        expect(tape.s).toBeGreaterThan(heart.s)
        expect(tape.r).not.toBe(0)
        expect(newSticker('nope')).toBe(null)
        for (const a of STICKER_ANCHORS) expect(a.x >= 0 && a.x <= 100 && a.y >= 0 && a.y <= 100).toBe(true)
    })

    it('mirrors with scaleX and positions by percent', () => {
        const css = stickerStyle({ k: 'rose', x: 30, y: 40, s: 22, r: -10, f: 1 })
        expect(css.left).toBe('30%')
        expect(css.top).toBe('40%')
        expect(css.width).toBe('22%')
        expect(css.transform).toContain('rotate(-10deg)')
        expect(css.transform).toContain('scaleX(-1)')
        expect(stickerById('rose')).toBeTruthy()
    })
})

describe('stickers in the page style', () => {
    it('are a per-page key, sanitised, and an empty list is no override at all', () => {
        const ps = sanitizePageStyle({ stickers: [{ k: 'olive', x: 5, y: 5, s: 20, r: 0, f: 0 }, { k: 'bad' }] })
        expect(ps.stickers).toHaveLength(1)
        expect(sanitizePageStyle({ stickers: [] })).toEqual({})
        expect(sanitizePageStyle({ stickers: [{ k: 'bad' }] })).toEqual({})
        expect(overriddenKeys({ stickers: [{ k: 'olive' }] })).toContain('stickers')
    })

    it('reach the page through the merge and the entry', () => {
        const entry = { pageStyle: { stickers: [{ k: 'olive' }] } }
        expect(pageStyleOf(entry).stickers[0].k).toBe('olive')
        expect(mergePageStyle({ fontColor: '#000' }, entry.pageStyle).stickers).toHaveLength(1)
    })
})

describe('where they are drawn', () => {
    it('every page goes through BookPageTemplate, which wraps only a page that has stickers', () => {
        const src = readFileSync('src/components/BookPageTemplate/BookPageTemplate.jsx', 'utf8')
        expect(src).toContain('<StickerLayer stickers={stickers} />')
        expect(src).toContain('if (!stickers?.length) return <BookPageBody {...props} />')
    })

    it('the page editor offers the sticker section', () => {
        const src = readFileSync('src/components/PageStyleControls/PageStyleControls.jsx', 'utf8')
        expect(src).toContain("label='מדבקות'")
        expect(src).toContain("set('stickers', list)")
    })
})
