import { describe, it, expect } from 'vitest'
import { expandBookPages } from '@/lib/bookPages'

// Smart album composition: pages arranged by each photo's measured
// aspect — landscape full-width, consecutive portrait PAIRS side by
// side, lone portrait tall, square classic. Nothing is ever dropped,
// order is preserved, and the rhythm (pair flip) is deterministic.

const photo = (id, imgAspect) => ({ id, name: '', text: '', imageUrl: `u${id}`, imgAspect })
const blessing = (id) => ({ id, name: 'דנה', text: 'מזל טוב!', imageUrl: null })

describe('expandBookPages photoLayout smart', () => {
    it('landscape → wide page; portrait pair → one _photoPair page', () => {
        const out = expandBookPages(
            [photo('L', 1.5), photo('P1', 0.66), photo('P2', 0.7), photo('S', 1.0)],
            { photoLayout: 'smart' },
        )
        expect(out.map(p => p._photoPair ? 'pair' : p._photo)).toEqual(['wide', 'pair', 'square'])
        expect(out[1]._photoPair.map(p => p.id)).toEqual(['P1', 'P2'])
    })

    it('lone portrait → tall page; blessings flow through untouched', () => {
        const out = expandBookPages(
            [blessing('B'), photo('P', 0.6), photo('L', 1.6)],
            { photoLayout: 'smart' },
        )
        expect(out[0].name).toBe('דנה')
        expect(out[0]._photo).toBeUndefined()
        expect(out[1]._photo).toBe('tall')
        expect(out[2]._photo).toBe('wide')
    })

    it('pair order flips on every second pair (deterministic rhythm)', () => {
        const out = expandBookPages(
            [photo('A', 0.6), photo('B', 0.6), photo('C', 0.6), photo('D', 0.6)],
            { photoLayout: 'smart' },
        )
        expect(out[0]._photoPair.map(p => p.id)).toEqual(['A', 'B'])
        expect(out[1]._photoPair.map(p => p.id)).toEqual(['D', 'C'])
    })

    it('no stored aspect → passes through untouched (legacy photos)', () => {
        const out = expandBookPages([photo('X', undefined)], { photoLayout: 'smart' })
        expect(out[0]._photo).toBeUndefined()
        expect(out[0]._photoPair).toBeUndefined()
        expect(out[0].id).toBe('X')
    })

    it('forceSplit splits ONE chosen blessing even with autoSplit off', () => {
        const e = { id: 'F', name: 'רון', text: 'ברכה קצרה', imageUrl: 'u', forceSplit: true }
        const plain = { id: 'N', name: 'גל', text: 'עוד ברכה', imageUrl: 'u2' }
        const out = expandBookPages([e, plain], {})
        expect(out).toHaveLength(3)
        expect(out[0]._split).toBe('text')
        expect(out[0].imageUrl).toBeNull()
        expect(out[1]._split).toBe('photo')
        expect(out[1].imageUrl).toBe('u')
        expect(out[2].id).toBe('N')
        expect(out[2]._split).toBeUndefined()
    })

    it('padToSpread aligns a forced pair to the spread — offset 0 (2-up files)', () => {
        const plain = { id: 'N', name: 'גל', text: 'ברכה', imageUrl: 'u2' }
        const split = { id: 'F', name: 'רון', text: 'טקסט', imageUrl: 'u', forceSplit: true }
        const out = expandBookPages([plain, split], { padToSpread: true })
        // plain(0) → divider(1) → text(2) + photo(3): the pair shares spread (2,3)
        expect(out.map(p => p._divider ? 'pad' : (p._split || 'page'))).toEqual(['page', 'pad', 'text', 'photo'])
    })

    it('padToSpread with spreadOffset 1 (page 1 alone) shifts the alignment', () => {
        const plain = { id: 'N', name: 'גל', text: 'ברכה', imageUrl: 'u2' }
        const split = { id: 'F', name: 'רון', text: 'טקסט', imageUrl: 'u', forceSplit: true }
        // Spreads are (1,2),(3,4)… — after one plain page (index 0 = page 1,
        // alone by binding) the pair may start immediately at index 1.
        const out = expandBookPages([plain, split], { padToSpread: true, spreadOffset: 1 })
        expect(out.map(p => p._divider ? 'pad' : (p._split || 'page'))).toEqual(['page', 'text', 'photo'])
    })

    it('uniform (default) never composes', () => {
        const out = expandBookPages([photo('P1', 0.6), photo('P2', 0.6)], {})
        expect(out).toHaveLength(2)
        expect(out[0]._photoPair).toBeUndefined()
    })
})

// ── Composed mode ───────────────────────────────────────────────────
describe('expandBookPages composition: smart', () => {
    const T = n => 'א'.repeat(n)
    const list = [
        { id: '1', name: 'a', text: T(120), imageUrl: 'u', imgAspect: 1.5 },
        { id: '2', name: 'b', text: T(60) },
        { id: '3', name: '', text: '', imageUrl: 'u', imgAspect: 1.7 },
        { id: '4', name: 'd', text: T(70) },
        { id: '5', name: 'e', text: T(90), imageUrl: 'u', imgAspect: 0.8 },
    ]

    it('returns composed page objects the template can dispatch on', () => {
        const pages = expandBookPages(list, { composition: 'smart' })
        expect(pages.length).toBeGreaterThan(0)
        for (const p of pages) {
            if (p._divider) continue
            expect(p._composed).toBeTruthy()
            expect(p.id).toMatch(/^__composed_/)
        }
    })
    it('places every entry, and none twice', () => {
        const pages = expandBookPages(list, { composition: 'smart' })
        const ids = pages.filter(p => p._composed).flatMap(p => p._composed.entries.map(e => e.id))
        expect(new Set(ids).size).toBe(ids.length)
        expect(ids).toHaveLength(list.length)
    })
    it('supersedes the narrower modes rather than stacking with them', () => {
        // duo, autoSplit and smart-photo are three narrow answers to the
        // question the planner answers generally. If composition ran after
        // them it would be handed a list already chewed into decisions.
        const withDuo = expandBookPages(list, { composition: 'smart', entriesPerPage: 2 })
        const alone = expandBookPages(list, { composition: 'smart' })
        expect(withDuo.map(p => p.id)).toEqual(alone.map(p => p.id))
        expect(withDuo.every(p => !p._duo)).toBe(true)
    })
    it('every slot on every page has an entry', () => {
        for (const p of expandBookPages(list, { composition: 'smart' })) {
            if (!p._composed) continue
            for (const s of p._composed.slots) expect(s.entry).toBeTruthy()
        }
    })
    it('leaves the other modes untouched when not asked for', () => {
        const classic = expandBookPages(list, {})
        expect(classic).toHaveLength(list.length)
        expect(classic.every(p => !p._composed)).toBe(true)
    })
    it('pads to a whole spread when asked, like every other mode', () => {
        const pages = expandBookPages(list, { composition: 'smart', padToSpread: true })
        expect(pages.length % 2).toBe(0)
    })
})
