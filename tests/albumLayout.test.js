import { describe, it, expect } from 'vitest'
import {
    safeAspect, orientation, isPanorama, pageBox, solveRow, splitBalanced,
    justifiedBlock, soloBlock, pairBlock, featureBlock, planAlbum, toSpreads,
    chooseComposition, takeCount, LANDSCAPE, PORTRAIT, SQUARE,
} from '@/lib/albumLayout'

const P = (aspects) => aspects.map((a, i) => ({ id: 'p' + i, url: 'u' + i, aspect: a }))
const UNIT = 1000
const OPTS = { pageW: UNIT, pageH: UNIT }

/** The two promises the engine makes, checked on every page it plans. */
function assertHonest(pages, opts = OPTS) {
    for (const page of pages) {
        for (const it of page.items) {
            // Nothing is stretched: the box is the photo's own shape.
            expect(it.width / it.height, `${page.kind} aspect`).toBeCloseTo(safeAspect(it.photo.aspect), 2)
            // Nothing runs off the page, so nothing is cropped by the trim.
            expect(it.x, `${page.kind} left`).toBeGreaterThanOrEqual(-0.6)
            expect(it.y, `${page.kind} top`).toBeGreaterThanOrEqual(-0.6)
            expect(it.x + it.width, `${page.kind} right`).toBeLessThanOrEqual(opts.pageW + 0.6)
            expect(it.y + it.height, `${page.kind} bottom`).toBeLessThanOrEqual(opts.pageH + 0.6)
        }
    }
}

describe('safeAspect', () => {
    it('falls back to 3:2 for anything unusable', () => {
        for (const bad of [undefined, null, 0, -1, NaN, 'x', Infinity]) {
            expect(safeAspect(bad)).toBe(1.5)
        }
    })

    it('clamps the extremes rather than letting one photo wreck a row', () => {
        // A 10:1 strip in a row of four would squash its neighbours to
        // slivers; the clamp is what keeps one odd photo from deciding
        // the whole page.
        expect(safeAspect(10)).toBe(4)
        expect(safeAspect(0.05)).toBe(0.25)
    })
})

describe('orientation', () => {
    it('sorts the three shapes', () => {
        expect(orientation(1.5)).toBe(LANDSCAPE)
        expect(orientation(0.667)).toBe(PORTRAIT)
        expect(orientation(1)).toBe(SQUARE)
    })

    it('treats near-square as square, not as a weak landscape', () => {
        expect(orientation(1.1)).toBe(SQUARE)
        expect(orientation(0.92)).toBe(SQUARE)
    })

    it('calls a wide photo a panorama only past 2.2', () => {
        expect(isPanorama(1.78)).toBe(false)
        expect(isPanorama(2.4)).toBe(true)
    })
})

describe('solveRow', () => {
    it('fills the width exactly, whatever the shapes', () => {
        const { height, widths } = solveRow([1.5, 0.667, 1], 800, 20)
        const total = widths.reduce((a, b) => a + b, 0) + 20 * 2
        expect(total).toBeCloseTo(800, 6)
        // One height for the row is the whole idea — it is what makes a
        // row of mixed shapes sit on a shared baseline.
        for (let i = 0; i < widths.length; i++) {
            expect(widths[i] / height).toBeCloseTo([1.5, 0.667, 1][i], 6)
        }
    })

    it('survives an empty row', () => {
        expect(solveRow([], 800, 20)).toEqual({ height: 0, widths: [] })
    })
})

describe('splitBalanced', () => {
    it('returns exactly the number of rows asked for', () => {
        for (const R of [1, 2, 3, 4]) {
            expect(splitBalanced(P([1.5, 1, 0.7, 1.5, 1.2, 0.8]), R).length).toBe(R)
        }
    })

    it('never asks for more rows than there are photos', () => {
        expect(splitBalanced(P([1.5, 1]), 4).length).toBe(2)
    })

    it('keeps the photos in the order they were given', () => {
        // The upload order is the order the evening happened in. An
        // album that reshuffles it to make prettier rows tells the story
        // wrong, so the split is contiguous by construction.
        const photos = P([1.5, 0.7, 1, 1.5, 0.8])
        const flat = splitBalanced(photos, 3).flat().map(p => p.id)
        expect(flat).toEqual(photos.map(p => p.id))
    })
})

describe('the compositions', () => {
    const box = pageBox(OPTS)

    it('solo gives one photo the page without cropping it', () => {
        for (const a of [0.4, 0.7, 1, 1.5, 3.5]) {
            const [it] = soloBlock(P([a]), box)
            expect(it.width / it.height).toBeCloseTo(safeAspect(a), 3)
            expect(it.width).toBeLessThanOrEqual(box.width + 0.6)
            expect(it.height).toBeLessThanOrEqual(box.height + 0.6)
        }
    })

    it('pairs two landscapes by stacking them, not by shrinking them side by side', () => {
        const items = pairBlock(P([1.5, 1.4]), box)
        expect(items.length).toBe(2)
        expect(items[1].y).toBeGreaterThan(items[0].y + items[0].height - 1)
    })

    it('puts a mixed pair on one row so they share a baseline', () => {
        const items = pairBlock(P([1.5, 0.66]), box)
        expect(items[0].y).toBeCloseTo(items[1].y, 3)
        expect(items[0].height).toBeCloseTo(items[1].height, 3)
    })

    it('feature keeps the hero at its own shape rather than a fixed split', () => {
        for (const heroAspect of [0.66, 1, 1.5]) {
            const items = featureBlock(P([heroAspect, 1.5, 1.5]), box)
            expect(items.length).toBe(3)
            expect(items[0].width / items[0].height).toBeCloseTo(heroAspect, 2)
        }
    })

    it('justified fits the page for any mix', () => {
        const items = justifiedBlock(P([1.5, 0.66, 1, 1.33, 0.75, 2]), box)
        const bottom = Math.max(...items.map(i => i.y + i.height))
        const right = Math.max(...items.map(i => i.x + i.width))
        expect(bottom).toBeLessThanOrEqual(box.top + box.height + 0.6)
        expect(right).toBeLessThanOrEqual(box.left + box.width + 0.6)
    })
})

describe('planAlbum', () => {
    it('places every photo exactly once, in order', () => {
        const photos = P([1.5, 0.66, 1.5, 1, 2.6, 0.75, 1.5, 1.33, 0.8, 1.5, 0.7, 1, 1.5])
        const pages = planAlbum(photos, OPTS)
        const placed = pages.flatMap(p => p.items.map(i => i.photo.id))
        expect(placed).toEqual(photos.map(p => p.id))
    })

    it('never crops and never distorts, across very different albums', () => {
        const albums = {
            mixed: [1.5, 0.66, 1.5, 1, 2.6, 0.75, 1.5, 1.33, 0.8, 1.5, 0.7, 1, 1.5, 1.5, 0.9],
            allPortrait: Array(11).fill(0.66),
            allLandscape: Array(11).fill(1.5),
            allSquare: Array(7).fill(1),
            extremes: [0.2, 5, 1.5, 0.3, 4.5, 1, 1, 0.9, 3.2],
            single: [0.7],
            couple: [1.5, 1.5],
        }
        for (const aspects of Object.values(albums)) {
            assertHonest(planAlbum(P(aspects), OPTS))
        }
    })

    it('is deterministic — the PDF pass must agree with the screen pass', () => {
        // The print export re-plans in a separate render. If planning
        // were random the printed book would not be the book the
        // customer approved.
        const photos = P([1.5, 0.66, 1, 2.4, 0.8, 1.5, 1.2])
        expect(JSON.stringify(planAlbum(photos, OPTS))).toBe(JSON.stringify(planAlbum(photos, OPTS)))
    })

    it('gives a panorama the page to itself', () => {
        const pages = planAlbum(P([1.5, 1.5, 1.5, 3.0, 1.5, 1.5, 1.5]), OPTS)
        const pano = pages.find(p => p.items.some(i => i.photo.aspect === 3.0))
        expect(pano.items.length).toBe(1)
    })

    it('does not end on a stranded photograph', () => {
        // A last page holding one leftover photo reads as having run
        // out rather than having ended.
        for (let n = 2; n <= 24; n++) {
            const pages = planAlbum(P(Array.from({ length: n }, (_, i) => [1.5, 0.7, 1, 1.33][i % 4])), OPTS)
            const last = pages[pages.length - 1]
            if (pages.length > 1 && last.items.length === 1) {
                // Allowed only when it is a solo by intent (a panorama)
                // or the album is an odd single photo overall.
                expect(last.kind, `n=${n}`).toBe('solo')
                expect(isPanorama(last.items[0].photo.aspect) || n <= 2, `n=${n} stranded`).toBe(true)
            }
        }
    })

    it('ignores entries with no image', () => {
        const pages = planAlbum([{ id: 'a', aspect: 1.5 }, { id: 'b', url: 'u', aspect: 1 }], OPTS)
        expect(pages.flatMap(p => p.items).map(i => i.photo.id)).toEqual(['b'])
    })

    it('returns nothing for nothing', () => {
        expect(planAlbum([], OPTS)).toEqual([])
        expect(planAlbum(null, OPTS)).toEqual([])
    })

    it('honours a preset asking for a wider solo page', () => {
        const tight = planAlbum(P([1.5]), { ...OPTS, margin: 10, soloMargin: 2 })
        const loose = planAlbum(P([1.5]), { ...OPTS, margin: 10, soloMargin: 20 })
        expect(tight[0].items[0].width).toBeGreaterThan(loose[0].items[0].width)
    })
})

describe('chooseComposition and takeCount', () => {
    it('never strands a single photo out of a justified cluster', () => {
        // Six left with a five-photo cluster would leave one alone, so
        // the cluster takes all six.
        expect(takeCount('justified', P(Array(6).fill(1.5)))).toBe(6)
        expect(takeCount('justified', P(Array(7).fill(1.5)))).toBe(5)
    })

    it('closes on a pair or a feature rather than a lone page', () => {
        expect(chooseComposition(P([1.5, 1.5]), 1)).toBe('pair')
        expect(chooseComposition(P([1.5, 1.5, 1.5]), 0)).toBe('feature')
    })

    it('has nothing to say about an empty queue', () => {
        expect(chooseComposition([], 0)).toBe(null)
    })
})

describe('toSpreads', () => {
    it('pairs pages and leaves the last right-hand page empty when odd', () => {
        const pages = planAlbum(P([1.5, 0.7, 1, 1.5, 0.8]), OPTS)
        const spreads = toSpreads(pages)
        expect(spreads.length).toBe(Math.ceil(pages.length / 2))
        if (pages.length % 2) expect(spreads[spreads.length - 1].right).toBe(null)
    })
})
