import { describe, it, expect } from 'vitest'
import { rand, ORNAMENTS, ornamentUrl, PAGE_FRAMES, pageFrameUrl } from '@/lib/albumOrnaments'
import { resolveTreatment, chooseTreatment, toneWash, TREATMENTS } from '@/lib/albumTreatments'
import { RECIPES, recipesForCount, SUPPORTED_COUNTS, mirrorRecipe } from '@/lib/albumRecipes'
import { fitScore, coverage, scoreRecipeParts, planPage, explainPage, SCORE_FLOOR, tiebreak, FULLNESS } from '@/lib/albumScoring'
import { composeScene, planAlbumScenes, containBox } from '@/lib/albumScene'
import { LANGUAGES, LANGUAGE_ORDER, getLanguage } from '@/lib/albumLanguages'
import { safeAspect } from '@/lib/albumLayout'

const TONES = ['#8fa6b8', '#c3a68b', '#9db39a', '#b89aa2']
const P = aspects => aspects.map((a, i) => ({ id: 'p' + i, url: 'u' + i, aspect: a, tone: TONES[i % 4] }))
const PAGE = { pageW: 1000, pageH: 1000 }

describe('ornaments', () => {
    it('are deterministic — the PDF pass must draw the same tape angle as the screen', () => {
        for (const name of Object.keys(ORNAMENTS)) {
            expect(ORNAMENTS[name]({ seed: 5 }), name).toBe(ORNAMENTS[name]({ seed: 5 }))
        }
    })

    it('differ by seed, so page 7 does not look like page 3', () => {
        expect(ORNAMENTS.tape({ seed: 1 })).not.toBe(ORNAMENTS.tape({ seed: 2 }))
    })

    it('carry no network dependency', () => {
        const url = ornamentUrl('stamp', { text: 'ROMA' })
        expect(url.startsWith('data:image/svg+xml')).toBe(true)
        expect(url).not.toMatch(/https?:/)
    })

    it('rand is a pure function of its seed', () => {
        const a = rand(42); const b = rand(42)
        expect([a(), a(), a()]).toEqual([b(), b(), b()])
    })
})

describe('treatments', () => {
    it('never uses a CSS mask or a blur — html2canvas implements neither', () => {
        // A masked or blurred page looks right on screen and prints
        // wrong, which is the worst possible failure for a book.
        for (const t of TREATMENTS) {
            const r = resolveTreatment(t, { paper: '#fff' })
            const json = JSON.stringify(r)
            expect(json, t).not.toMatch(/mask/i)
            expect(json, t).not.toMatch(/blur/i)
        }
    })

    it('fades with a gradient in the paper colour, on the named side only', () => {
        const r = resolveTreatment('soft-edge', { paper: '#FBF6EC', fade: 'bottom' })
        expect(r.overlays).toHaveLength(1)
        expect(r.overlays[0].backgroundImage).toContain('to bottom')
        expect(r.overlays[0].backgroundImage).toContain('#FBF6EC')
    })

    it('fades a wide photo on its sides only', () => {
        expect(resolveTreatment('soft-edge', { fade: 'sides' }).overlays).toHaveLength(2)
        expect(resolveTreatment('soft-edge', { fade: 'all' }).overlays).toHaveLength(4)
    })

    it('marks bleed as the only treatment that crops', () => {
        for (const t of TREATMENTS) {
            expect(resolveTreatment(t).crops, t).toBe(t === 'bleed')
        }
    })

    it('builds a wash from the photo tone, and degrades to plain paper without one', () => {
        expect(toneWash('#8fa6b8', '#fff')).toContain('#8fa6b8')
        expect(toneWash(null, '#fff')).toBe('linear-gradient(180deg, #fff 0%, #fff 100%)')
        expect(toneWash('not-a-colour', '#fff')).not.toContain('not-a-colour')
    })

    it('chooses a treatment from the photo shape, deterministically', () => {
        const allowed = ['framed', 'card', 'soft-edge']
        expect(chooseTreatment(allowed, 2.6)).toBe('soft-edge')
        expect(chooseTreatment(allowed, 0.7)).toBe('framed')
        expect(chooseTreatment(allowed, 1.0)).toBe('card')
        expect(chooseTreatment(allowed, 0.7)).toBe(chooseTreatment(allowed, 0.7))
    })
})

describe('the recipe library', () => {
    it('has unique ids and at least one slot each', () => {
        const ids = RECIPES.map(r => r.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const r of RECIPES) expect(r.slots.length, r.id).toBeGreaterThan(0)
    })

    it('keeps every slot inside the page', () => {
        for (const r of RECIPES) {
            for (const s of r.slots) {
                const [x, y, w, h] = s.area
                expect(x, r.id).toBeGreaterThanOrEqual(0)
                expect(y, r.id).toBeGreaterThanOrEqual(0)
                expect(x + w, r.id).toBeLessThanOrEqual(1.001)
                expect(y + h, r.id).toBeLessThanOrEqual(1.001)
            }
        }
    })

    it('gives every world something to use at every supported size', () => {
        for (const world of LANGUAGE_ORDER) {
            for (const n of SUPPORTED_COUNTS) {
                expect(recipesForCount(n, world).length, `${world}/${n}`).toBeGreaterThan(0)
            }
        }
    })

    it('keeps the scrapbook roughs out of the editorial world', () => {
        // Tape and polaroids are not an editorial page with the tape
        // removed; they are a different book.
        const editorial = new Set(RECIPES.filter(r => !r.worlds || r.worlds.includes('editorial')).map(r => r.id))
        expect(editorial.has('polaroids')).toBe(false)
        expect(editorial.has('taped-duo')).toBe(false)
        expect(editorial.has('scatter-four')).toBe(false)
    })
})

describe('the library is big enough to stop repeating', () => {
    it('offers several genuinely different answers at every count', () => {
        for (const n of SUPPORTED_COUNTS) {
            expect(recipesForCount(n).length, `n=${n}`).toBeGreaterThanOrEqual(3)
        }
        expect(RECIPES.length).toBeGreaterThanOrEqual(30)
    })

    it('lays twenty photographs out without repeating a rough', () => {
        // The failure this guards against is not in any one page: it is
        // in the sequence. Twenty pictures over five pages of the same
        // three roughs reads as a template however good each page is.
        const aspects = [1.5, 0.667, 1.5, 1, 2.6, 0.75, 1.5, 1.333, 0.8, 1.5, 0.667, 1, 1.5, 0.7, 1.5, 1.5, 0.667, 1.78, 1, 0.75]
        for (const languageId of LANGUAGE_ORDER) {
            const scenes = planAlbumScenes(P(aspects), { ...PAGE, languageId })
            const distinct = new Set(scenes.map(s => s.recipeId)).size
            expect(distinct / scenes.length, languageId).toBeGreaterThanOrEqual(0.8)
        }
    })

    it('varies how many photographs a page holds', () => {
        const aspects = Array.from({ length: 30 }, (_, i) => [1.5, 0.667, 1, 1.33, 0.75, 1.78][i % 6])
        const counts = new Set(
            planAlbumScenes(P(aspects), { ...PAGE, languageId: 'heritage' })
                .map(s => s.layers.filter(l => l.type === 'photo').length))
        expect(counts.size).toBeGreaterThanOrEqual(3)
    })

    it('peaks its fullness bonus at four rather than always filling to six', () => {
        expect(FULLNESS[4]).toBeGreaterThan(FULLNESS[2])
        expect(FULLNESS[6]).toBeLessThan(FULLNESS[4])
    })
})

describe('mirroring', () => {
    it('flips a rough without moving it off the page', () => {
        for (const r of RECIPES.filter(x => x.mirrorable)) {
            for (const s of mirrorRecipe(r).slots) {
                expect(s.area[0], r.id).toBeGreaterThanOrEqual(-0.001)
                expect(s.area[0] + s.area[2], r.id).toBeLessThanOrEqual(1.001)
            }
        }
    })

    it('flips the side a photograph fades on, and the side a title sits on', () => {
        const r = RECIPES.find(x => x.mirrorable && x.slots.some(s => s.fade === 'right'))
        if (r) expect(mirrorRecipe(r).slots.find(s => s.fade).fade).toBe('left')
        const t = RECIPES.find(x => x.mirrorable && x.title?.align === 'start')
        if (t) expect(mirrorRecipe(t).title.align).toBe('end')
    })

    it('is its own inverse', () => {
        const r = RECIPES.find(x => x.mirrorable)
        const back = mirrorRecipe(mirrorRecipe(r))
        back.slots.forEach((s, i) => {
            s.area.forEach((v, k) => expect(v).toBeCloseTo(r.slots[i].area[k], 8))
        })
    })
})

describe('page frames', () => {
    it('renders every kind without a network dependency', () => {
        for (const kind of Object.keys(PAGE_FRAMES)) {
            const url = pageFrameUrl(kind, { w: 1000, h: 1000 })
            expect(url, kind).toMatch(/^data:image\/svg\+xml/)
            expect(url, kind).not.toMatch(/https?:/)
        }
    })

    it('draws only frames the language owns', () => {
        for (const languageId of LANGUAGE_ORDER) {
            const allowed = getLanguage(languageId).pageFrames || []
            for (const scene of planAlbumScenes(P(Array.from({ length: 22 }, (_, i) => [1.5, 0.7, 1, 1.3][i % 4])), { ...PAGE, languageId })) {
                for (const L of scene.layers.filter(l => String(l.name).startsWith('pageFrame:'))) {
                    expect(allowed, languageId).toContain(L.name.split(':')[1])
                }
            }
        }
    })
})

describe('scoring', () => {
    it('rewards the shape a slot asked for', () => {
        expect(fitScore(1.5, 'landscape')).toBeGreaterThan(fitScore(0.6, 'landscape'))
        expect(fitScore(0.6, 'portrait')).toBeGreaterThan(fitScore(1.5, 'portrait'))
        expect(fitScore(3.0, 'wide')).toBeGreaterThan(fitScore(1.2, 'wide'))
    })

    it('measures coverage without pixels, and peaks when the shapes agree', () => {
        const square = [0, 0, 0.4, 0.4]
        expect(coverage(1.0, square, 1)).toBeCloseTo(1, 6)
        expect(coverage(2.0, square, 1)).toBeCloseTo(0.5, 6)
        expect(coverage(0.5, square, 1)).toBeCloseTo(0.5, 6)
    })

    it('separates suitability from variety', () => {
        const r = RECIPES.find(x => x.slots.length === 2)
        const photos = P([1.5, 0.7])
        const fresh = scoreRecipeParts(r, photos, { recent: [] })
        const repeat = scoreRecipeParts(r, photos, { recent: [r.id] })
        // Wanting a different rough than the last page is a reason to
        // pick another rough, never a reason to abandon the system.
        expect(repeat.base).toBe(fresh.base)
        expect(repeat.score).toBeLessThan(fresh.score)
    })

    it('refuses a group it has no recipe for', () => {
        const r = RECIPES.find(x => x.slots.length === 2)
        expect(scoreRecipeParts(r, P([1.5]), {}).score).toBe(-1)
    })

    it('prefers a fuller page over a stack of single plates', () => {
        const best = planPage(P([1.5, 1.4, 1.3, 1.45]), { world: 'editorial' })
        expect(best.take).toBeGreaterThan(1)
    })

    it('refuses a rough that would leave one photograph floating in an empty slot', () => {
        // A page average hides one badly matched slot behind three good
        // ones. Empty area inside a composed page reads as a mistake.
        const tall = RECIPES.find(r => r.slots.some(s => s.area[3] > 0.7 && s.area[2] < 0.45))
        if (tall) {
            const good = scoreRecipeParts(tall, P(tall.slots.map(() => 0.6)), {})
            const bad = scoreRecipeParts(tall, P(tall.slots.map(() => 3.0)), {})
            expect(bad.base).toBeLessThan(good.base)
        }
    })

    it('tiebreak is a hash, not a random number', () => {
        expect(tiebreak('plate', 3)).toBe(tiebreak('plate', 3))
        expect(tiebreak('plate', 3)).not.toBe(tiebreak('plate', 4))
        expect(tiebreak('plate', 3)).toBeGreaterThanOrEqual(0)
        expect(tiebreak('plate', 3)).toBeLessThan(1)
    })

    it('explains its choice, best first', () => {
        const rows = explainPage(P([1.5, 0.7, 1.2]), { world: 'travel' })
        expect(rows.length).toBeGreaterThan(1)
        expect(rows[0].score).toBeGreaterThanOrEqual(rows[1].score)
    })
})

describe('composed scenes', () => {
    const ALBUMS = {
        mixed: [1.5, 0.667, 1.5, 1, 2.6, 0.75, 1.5, 1.333, 0.8, 1.5, 0.667, 1, 1.5, 0.7, 1.5, 1.5],
        portraits: Array(12).fill(0.667),
        landscapes: Array(12).fill(1.5),
        squares: Array(9).fill(1),
        extremes: [0.2, 5, 1.5, 0.3, 4.5, 1, 1],
        pair: [1.5, 0.7],
        single: [1.2],
    }

    it('places every photograph exactly once, in order, in every world', () => {
        for (const [name, aspects] of Object.entries(ALBUMS)) {
            for (const languageId of LANGUAGE_ORDER) {
                const photos = P(aspects)
                const scenes = planAlbumScenes(photos, { ...PAGE, languageId })
                const placed = scenes.flatMap(s =>
                    s.layers
                        .filter(l => l.type === 'photo' && l.role === 'primary')
                        // Layers are sorted for painting, and a recipe may
                        // put a later photo underneath an earlier one, so
                        // story order is read off slotIndex.
                        .slice()
                        .sort((a, b) => a.slotIndex - b.slotIndex)
                        .map(l => l.photo.id))
                expect(placed, `${name}/${languageId}`).toEqual(photos.map(p => p.id))
            }
        }
    })

    it('never crops or distorts a photograph the album is showing', () => {
        for (const aspects of Object.values(ALBUMS)) {
            for (const languageId of LANGUAGE_ORDER) {
                for (const scene of planAlbumScenes(P(aspects), { ...PAGE, languageId })) {
                    for (const L of scene.layers) {
                        if (L.type !== 'photo' || L.role !== 'primary') continue
                        expect(L.crops).toBe(false)
                        expect(L.w / L.h).toBeCloseTo(safeAspect(L.photo.aspect), 2)
                        expect(L.x).toBeGreaterThanOrEqual(-1)
                        expect(L.y).toBeGreaterThanOrEqual(-1)
                        expect(L.x + L.w).toBeLessThanOrEqual(1001)
                        expect(L.y + L.h).toBeLessThanOrEqual(1001)
                    }
                }
            }
        }
    })

    it('is deterministic — same photographs, byte-identical album', () => {
        const photos = P(ALBUMS.mixed)
        const a = JSON.stringify(planAlbumScenes(photos, { ...PAGE, languageId: 'travel', title: 'רומא' }))
        const b = JSON.stringify(planAlbumScenes(photos, { ...PAGE, languageId: 'travel', title: 'רומא' }))
        expect(a).toBe(b)
    })

    it('gives three worlds three different books from the same photographs', () => {
        const photos = P(ALBUMS.mixed)
        const seq = LANGUAGE_ORDER.map(id =>
            planAlbumScenes(photos, { ...PAGE, languageId: id }).map(s => s.recipeId).join(','))
        expect(new Set(seq).size).toBeGreaterThan(1)
    })

    it('draws only the ornaments its language owns', () => {
        for (const languageId of LANGUAGE_ORDER) {
            const lang = getLanguage(languageId)
            for (const scene of planAlbumScenes(P(ALBUMS.mixed), { ...PAGE, languageId, title: 'פריז' })) {
                // Page frames are ornament layers too, and they are the
                // page's own border rather than something scattered on
                // it — they have their own allow-list and their own test.
                for (const L of scene.layers.filter(l => l.type === 'ornament' && !String(l.name).startsWith('pageFrame:'))) {
                    expect(lang.ornaments, languageId).toContain(L.name)
                }
            }
        }
    })

    it('leaves the editorial world completely undecorated and unrotated', () => {
        for (const scene of planAlbumScenes(P(ALBUMS.mixed), { ...PAGE, languageId: 'editorial', title: 'פריז' })) {
            expect(scene.layers.filter(l => l.type === 'ornament')).toHaveLength(0)
            for (const L of scene.layers.filter(l => l.type === 'photo')) expect(L.rotate).toBe(0)
        }
    })

    it('omits a stamp when the album has no name to put in it', () => {
        const withTitle = planAlbumScenes(P([1.5, 0.7, 1.2]), { ...PAGE, languageId: 'travel', title: 'ליסבון' })
        const without = planAlbumScenes(P([1.5, 0.7, 1.2]), { ...PAGE, languageId: 'travel' })
        const stamps = s => s.flatMap(x => x.layers.filter(l => l.name === 'stamp')).length
        expect(stamps(withTitle)).toBeGreaterThanOrEqual(stamps(without))
        expect(stamps(without)).toBe(0)
    })

    it('gives row-grouped slots one shared height and one baseline', () => {
        // Four photographs each centred in its own equal box come out at
        // four heights on four baselines — which is exactly what a strip
        // along the foot of a page must not look like.
        const recipe = RECIPES.find(r => r.slots.some(s => s.row))
        const photos = P(recipe.slots.map((_, i) => [1.5, 0.7, 1.2, 1, 0.9][i % 5]))
        const scene = composeScene(recipe, photos, { ...PAGE, languageId: 'editorial' })
        const byRow = {}
        for (const L of scene.layers.filter(l => l.type === 'photo')) {
            const key = recipe.slots[L.slotIndex]?.row
            if (key) (byRow[key] = byRow[key] || []).push(L)
        }
        const groups = Object.values(byRow).filter(g => g.length > 1)
        expect(groups.length).toBeGreaterThan(0)
        for (const g of groups) {
            for (const L of g.slice(1)) {
                expect(L.h).toBeCloseTo(g[0].h, 3)
                expect(L.y).toBeCloseTo(g[0].y, 3)
            }
        }
    })

    it('falls back rather than forcing a page it has no rough for', () => {
        // The safety property: the designer may decline, and the album
        // still gets a page.
        const scenes = planAlbumScenes(P(ALBUMS.extremes), { ...PAGE, languageId: 'editorial' })
        expect(scenes.length).toBeGreaterThan(0)
        expect(SCORE_FLOOR).toBeGreaterThan(0)
    })

    it('handles nothing without throwing', () => {
        expect(planAlbumScenes([], PAGE)).toEqual([])
        expect(planAlbumScenes(null, PAGE)).toEqual([])
    })
})

describe('containBox', () => {
    it('fits a photo whole, centred, in either binding direction', () => {
        const box = { x: 10, y: 20, w: 400, h: 200 }
        const wide = containBox(box, 3)
        expect(wide.w).toBeLessThanOrEqual(box.w + 0.01)
        expect(wide.h).toBeLessThanOrEqual(box.h + 0.01)
        expect(wide.w / wide.h).toBeCloseTo(3, 6)
        const tall = containBox(box, 0.5)
        expect(tall.h).toBeCloseTo(box.h, 6)
        expect(tall.x).toBeGreaterThan(box.x)
    })
})

describe('languages', () => {
    it('all declare a full palette and a type scale', () => {
        for (const id of LANGUAGE_ORDER) {
            const l = LANGUAGES[id]
            for (const k of ['paper', 'ink', 'muted', 'accent', 'frame']) expect(l[k], `${id}.${k}`).toMatch(/^#/)
            for (const s of ['small', 'medium', 'large']) expect(l.type.sizes[s], `${id}.${s}`).toBeGreaterThan(0)
            expect(l.rotationBudget).toBeGreaterThanOrEqual(0)
        }
    })
})
