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

    it('uniform (default) never composes', () => {
        const out = expandBookPages([photo('P1', 0.6), photo('P2', 0.6)], {})
        expect(out).toHaveLength(2)
        expect(out[0]._photoPair).toBeUndefined()
    })
})
