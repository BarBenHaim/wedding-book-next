import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, statSync } from 'fs'
import { STICKER_LIBRARY, STICKER_LIMITS, STICKER_ANCHORS, STICKER_LABELS_HE, sanitizeStickers, newSticker, stickerById, stickerStyle, stickerShownOn } from '@/lib/stickers'
import sharp from 'sharp'
import { expandBookPages } from '@/lib/bookPages'
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
        expect(src).toContain('<StickerLayer stickers={stickers} split={split} />')
        expect(src).toContain('if (!stickers?.some(st => stickerShownOn(st, split))) return <BookPageBody {...props} />')
    })

    it('the page editor offers the sticker section', () => {
        const src = readFileSync('src/components/PageStyleControls/PageStyleControls.jsx', 'utf8')
        expect(src).toContain("label='מדבקות'")
        expect(src).toContain("set('stickers', list)")
    })
})

describe('the drag stage', () => {
    it('the recorded aspect of every sticker matches its file', async () => {
        for (const s of STICKER_LIBRARY) {
            const m = await sharp(`public${s.url}`).metadata()
            expect(s.ar, s.id).toBeCloseTo(m.width / m.height, 2)
        }
    })

    it('the editor opens the stage with the page(s) of the selected entry', () => {
        const ctl = readFileSync('src/components/PageStyleControls/StickerControls.jsx', 'utf8')
        expect(ctl).toContain('<StickerStage')
        const editor = readFileSync('src/components/PageStyleControls/PageStyleControls.jsx', 'utf8')
        expect(editor).toContain('pages={stickerPages}')
        expect(editor).toContain('expandBookPages([entry]')
        const stage = readFileSync('src/components/PageStyleControls/StickerStage.jsx', 'utf8')
        // a window of its own: a drag must never turn the flipbook
        expect(stage).toContain('createPortal')
        expect(stage).toContain('setPointerCapture')
    })
})

describe('stickers and split pages', () => {
    const long = 'ברכה ארוכה '.repeat(40)
    const entry = {
        id: 'e1', name: 'רחל', text: long, imageUrl: 'https://x/y.jpg',
        pageStyle: { stickers: [{ k: 'peony', pg: 't' }, { k: 'olive', pg: 'p' }, { k: 'gold-heart' }] },
    }
    const pages = expandBookPages([entry], { autoSplit: true, splitThreshold: 50 })

    it('a long blessing with a photo is two pages that carry the same style', () => {
        expect(pages.map(p => p._split)).toEqual(['text', 'photo'])
        expect(pages[0].pageStyle).toBe(pages[1].pageStyle)
    })

    it('a sticker placed on one page of the pair is on that page only', () => {
        const forText = pages[0].pageStyle.stickers.filter(st => stickerShownOn(sanitizeStickers([st])[0], pages[0]._split)).map(st => st.k)
        const forPhoto = pages[1].pageStyle.stickers.filter(st => stickerShownOn(sanitizeStickers([st])[0], pages[1]._split)).map(st => st.k)
        expect(forText).toEqual(['peony', 'gold-heart'])
        expect(forPhoto).toEqual(['olive', 'gold-heart'])
    })

    it('with no side given a sticker shows on both, and a page that is not split shows everything', () => {
        expect(stickerShownOn({ k: 'rose' }, 'text')).toBe(true)
        expect(stickerShownOn({ k: 'rose' }, 'photo')).toBe(true)
        expect(stickerShownOn({ k: 'rose', pg: 'p' }, undefined)).toBe(true)
        expect(stickerShownOn({ k: 'rose', pg: 't' }, undefined)).toBe(true)
    })

    it('the side survives sanitising, and junk sides are dropped', () => {
        expect(sanitizeStickers([{ k: 'rose', pg: 'p' }])[0].pg).toBe('p')
        expect(sanitizeStickers([{ k: 'rose', pg: 'x' }])[0]).not.toHaveProperty('pg')
        expect(newSticker('rose', 'mc', 't').pg).toBe('t')
        expect(newSticker('rose', 'mc')).not.toHaveProperty('pg')
    })
})
