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
