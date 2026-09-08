import { describe, it, expect } from 'vitest'
import {
    slotArea, capacityOf, readability, overflowRatio, maxReadableLength, blessingLength,
} from '@/lib/greetingCapacity'
import { RECIPES, mirrorRecipe, needsOf, capacityCount } from '@/lib/greetingRecipes'
import { classifyEntry, countKinds, matches, assign, scoreRecipe, tiebreak, textAreaOf } from '@/lib/greetingScoring'
import { planGreetings, presplit, allRoughs, explainPage } from '@/lib/greetingPlan'
import { PAGE_FIT_TARGET, DUO_FIT_TARGET } from '@/lib/fontFit'
import { REFERENCE_TEXT_AREA } from '@/lib/greetingCapacity'

const T = n => 'א'.repeat(n)
const card = (id, len, aspect = 1.4) => ({ id, name: 'x', text: T(len), imageUrl: 'u', imgAspect: aspect })
const letter = (id, len) => ({ id, name: 'x', text: T(len) })
const photo = (id, aspect = 1.4) => ({ id, name: '', text: '', imageUrl: 'u', imgAspect: aspect })

// ── The model itself ────────────────────────────────────────────────
describe('capacity model', () => {
    it('reproduces the hand-tuned half-page constants within ~12%', () => {
        // This is the load-bearing claim of the whole engine: that text
        // capacity tracks AREA. DUO_FIT_TARGET was tuned by eye against
        // real books for a half page, long before this module existed. If
        // the model is right, half the page area predicts those numbers.
        // Half a page gives its words half of what a full page does.
        const halfTextOnly = capacityOf(REFERENCE_TEXT_AREA.textOnly / 2, { hasImage: false })
        const halfWithImage = capacityOf(REFERENCE_TEXT_AREA.withImage / 2, { hasImage: true })
        expect(Math.abs(halfTextOnly - DUO_FIT_TARGET.textOnly) / DUO_FIT_TARGET.textOnly).toBeLessThan(0.12)
        expect(Math.abs(halfWithImage - DUO_FIT_TARGET.withImage) / DUO_FIT_TARGET.withImage).toBeLessThan(0.12)
    })
    it('a full-page text block is exactly the whole-page target', () => {
        expect(capacityOf(REFERENCE_TEXT_AREA.textOnly, { hasImage: false })).toBeCloseTo(PAGE_FIT_TARGET.textOnly, 6)
        expect(capacityOf(REFERENCE_TEXT_AREA.withImage, { hasImage: true })).toBeCloseTo(PAGE_FIT_TARGET.withImage, 6)
    })
    it('a 340-char blessing fits the classic page - the calibration trap', () => {
        // Measured against raw page area this read as a 40% overflow and
        // got split onto two pages. It renders fine in the real template.
        expect(overflowRatio(340, REFERENCE_TEXT_AREA.withImage, { hasImage: true })).toBeLessThan(1.6)
        expect(readability(340, REFERENCE_TEXT_AREA.withImage, { hasImage: true })).toBeGreaterThan(0.3)
    })
    it('slotArea clamps and survives junk', () => {
        expect(slotArea([0, 0, 0.5, 0.5])).toBe(0.25)
        for (const v of [null, undefined, [], [1, 2], 'x']) expect(slotArea(v)).toBe(0)
    })
    it('capacity never divides by zero', () => {
        for (const v of [0, -1, null, undefined, NaN, 'x']) expect(capacityOf(v)).toBeGreaterThan(0)
    })
})

describe('readability', () => {
    it('is 1 when the blessing fits at full size', () => {
        expect(readability(50, REFERENCE_TEXT_AREA.textOnly)).toBe(1)
    })
    it('falls as the text grows', () => {
        const a = readability(400, REFERENCE_TEXT_AREA.textOnly)
        const b = readability(700, REFERENCE_TEXT_AREA.textOnly)
        expect(a).toBeGreaterThan(b)
    })
    it('reaches 0 when the text hits the shrink floor - the unreadable case', () => {
        expect(readability(100000, REFERENCE_TEXT_AREA.textOnly)).toBe(0)
    })
    it('overflowRatio keeps counting past the floor, where the fit factor clamps', () => {
        expect(overflowRatio(3600, REFERENCE_TEXT_AREA.textOnly)).toBeCloseTo(10, 5)
        expect(overflowRatio(0, REFERENCE_TEXT_AREA.textOnly)).toBe(0)
    })
    it('maxReadableLength is the largest blessing that still scores above 0', () => {
        const share = REFERENCE_TEXT_AREA.textOnly / 2
        const max = maxReadableLength(share)
        expect(readability(max - 5, share)).toBeGreaterThan(0)
        expect(readability(max + 200, share)).toBe(0)
    })
})

describe('blessingLength', () => {
    it('collapses whitespace, so a pasted blessing is measured as it renders', () => {
        expect(blessingLength({ text: '  a\n\n\n   b  ' })).toBe(3)
    })
    it('is 0 for anything that is not a string', () => {
        for (const v of [undefined, null, 7, {}, []]) expect(blessingLength({ text: v })).toBe(0)
    })
})

// ── Materials ───────────────────────────────────────────────────────
describe('classifyEntry', () => {
    it('names the three materials and the empty case', () => {
        expect(classifyEntry(card('a', 50))).toBe('card')
        expect(classifyEntry(letter('b', 50))).toBe('blessing')
        expect(classifyEntry(photo('c'))).toBe('photo')
        expect(classifyEntry({ id: 'd', text: '   ' })).toBe('empty')
        expect(classifyEntry(undefined)).toBe('empty')
    })
})

describe('matches', () => {
    const twoLetters = RECIPES.find(r => r.id === 'two-letters')
    it('accepts an exact multiset', () => {
        expect(matches(twoLetters, [letter('a', 40), letter('b', 40)])).toBe(true)
    })
    it('rejects a card where a blessing is required - splitting is not the layout\'s call', () => {
        expect(matches(twoLetters, [letter('a', 40), card('b', 40)])).toBe(false)
    })
    it('rejects the wrong count and any empty entry', () => {
        expect(matches(twoLetters, [letter('a', 40)])).toBe(false)
        expect(matches(twoLetters, [letter('a', 40), { id: 'z' }])).toBe(false)
    })
})

describe('recipe library', () => {
    it('every recipe has slots that match its declared needs', () => {
        for (const r of RECIPES) {
            const need = needsOf(r)
            const bySlot = { card: 0, blessing: 0, photo: 0 }
            for (const s of r.slots) bySlot[s.kind]++
            expect(bySlot, r.id).toEqual(need)
            expect(r.slots.length, r.id).toBe(capacityCount(r))
        }
    })
    it('every slot area is inside the page', () => {
        for (const r of allRoughs()) {
            for (const s of r.slots) {
                const [x, y, w, h] = s.area
                expect(x >= 0 && y >= 0, `${r.id} origin`).toBe(true)
                expect(x + w <= 1.0001, `${r.id} width`).toBe(true)
                expect(y + h <= 1.0001, `${r.id} height`).toBe(true)
            }
        }
    })
    it('ids are unique, mirrors included', () => {
        const ids = allRoughs().map(r => r.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
    it('mirroring is an involution on geometry and leaves non-mirrorable roughs alone', () => {
        const m = RECIPES.find(r => r.mirrorable)
        const once = mirrorRecipe(m)
        expect(once.slots[0].area[0]).toBeCloseTo(1 - m.slots[0].area[0] - m.slots[0].area[2], 6)
        const plain = RECIPES.find(r => !r.mirrorable)
        expect(mirrorRecipe(plain)).toBe(plain)
    })
    it('every material has a one-entry rough, or the planner could not terminate', () => {
        for (const kind of ['card', 'blessing', 'photo']) {
            const solo = RECIPES.find(r => capacityCount(r) === 1 && r.slots[0].kind === kind)
            expect(solo, kind).toBeTruthy()
        }
    })
})

// ── Scoring ─────────────────────────────────────────────────────────
describe('scoreRecipe', () => {
    const fourLetters = RECIPES.find(r => r.id === 'four-letters')
    const letterSolo = RECIPES.find(r => r.id === 'letter')

    it('refuses a composition that would be unreadable, however well it fills', () => {
        // Four essays on one page: nothing overflows, fontFit shrinks them
        // all, and a coverage-only scorer would love it.
        const s = scoreRecipe(fourLetters, [letter('a', 4000), letter('b', 4000), letter('c', 4000), letter('d', 4000)])
        expect(s.ok).toBe(false)
        expect(s.why.reason).toBe('unreadable')
    })
    it('accepts the same rough with short blessings', () => {
        const s = scoreRecipe(fourLetters, [letter('a', 40), letter('b', 45), letter('c', 38), letter('d', 50)])
        expect(s.ok).toBe(true)
        expect(s.score).toBeGreaterThan(0)
    })
    it('prefers the roomy page for a long blessing', () => {
        const long = [letter('a', 330)]
        const solo = scoreRecipe(letterSolo, long)
        const half = scoreRecipe(RECIPES.find(r => r.id === 'two-letters'), [letter('a', 330), letter('b', 330)])
        expect(solo.base).toBeGreaterThan(half.ok ? half.base : -Infinity)
    })
    it('penalises repeating the same rough', () => {
        const w = [letter('a', 40)]
        const fresh = scoreRecipe(letterSolo, w, { recent: [] })
        const stale = scoreRecipe(letterSolo, w, { recent: ['letter'] })
        expect(stale.score).toBeLessThan(fresh.score)
    })
    it('is deterministic - the PDF pass must equal the screen pass', () => {
        const w = [letter('a', 120)]
        const a = scoreRecipe(letterSolo, w, { pageIndex: 3 })
        const b = scoreRecipe(letterSolo, w, { pageIndex: 3 })
        expect(a.score).toBe(b.score)
        expect(tiebreak('x', 1)).toBe(tiebreak('x', 1))
        expect(tiebreak('x', 1)).not.toBe(tiebreak('x', 2))
    })
    it('textAreaOf gives a card only its text half', () => {
        const c = RECIPES.find(r => r.id === 'classic')
        expect(textAreaOf(c.slots[0])).toBeCloseTo(slotArea(c.slots[0].area) * 0.42, 6)
    })
})

describe('assign', () => {
    it('hands each slot an entry of its own material', () => {
        const r = RECIPES.find(r => r.id === 'words-and-picture')
        const pairs = assign(r, [letter('a', 40), photo('b')])
        expect(pairs.map(p => p.entry.id)).toEqual(['a', 'b'])
    })
    it('returns null rather than a half-built page', () => {
        const r = RECIPES.find(r => r.id === 'words-and-picture')
        expect(assign(r, [letter('a', 40), letter('b', 40)])).toBeNull()
    })
})

// ── The planner ─────────────────────────────────────────────────────
describe('presplit', () => {
    it('splits a card whose blessing cannot be read beside its photo', () => {
        const out = presplit([card('a', 900)])
        expect(out).toHaveLength(2)
        expect(out[0]._split).toBe('text')
        expect(out[0].imageUrl).toBeNull()
        expect(out[1]._split).toBe('photo')
        expect(out[1].imgAspect).toBe(1.4)
    })
    it('leaves a card that fits alone', () => {
        expect(presplit([card('a', 120)])).toHaveLength(1)
    })
    it('keeps the photo next to its own words', () => {
        const out = presplit([card('a', 900), letter('b', 30)])
        expect(out.map(e => e._split ?? null)).toEqual(['text', 'photo', null])
    })
})

describe('planGreetings', () => {
    const mixed = [
        card('1', 120, 1.5), letter('2', 60), card('3', 340, 0.75), photo('4', 1.78),
        letter('5', 45), card('6', 210, 1.0), photo('7', 0.7), photo('8', 0.66),
        card('9', 900, 1.4), letter('10', 80), letter('11', 95), card('12', 150, 1.33),
        photo('13', 2.4), letter('14', 70), letter('15', 55), letter('16', 65),
    ]

    it('places every entry exactly once', () => {
        const pages = planGreetings(mixed)
        const ids = pages.flatMap(p => p.entries.map(e => e.id))
        expect(ids).toHaveLength(new Set(ids).size)
        // 16 in; only the 900-character card is unreadable beside its
        // photo, so exactly one splits into two.
        expect(ids).toHaveLength(17)
    })
    it('never leaves a slot empty', () => {
        const pages = planGreetings(mixed)
        expect(pages.flatMap(p => p.slots).filter(s => !s.entry)).toHaveLength(0)
    })
    it('preserves the order guests wrote in', () => {
        const pages = planGreetings(mixed)
        const ids = pages.flatMap(p => p.entries.map(e => String(e.id).replace('__photo', '')))
        const firstSeen = []
        for (const id of ids) if (!firstSeen.includes(id)) firstSeen.push(id)
        expect(firstSeen).toEqual(mixed.map(e => e.id))
    })
    it('composes rather than templating - several pages carry more than one guest', () => {
        const pages = planGreetings(mixed)
        expect(pages.filter(p => p.entries.length > 1).length).toBeGreaterThan(2)
    })
    it('reaches for variety instead of repeating one rough', () => {
        const pages = planGreetings(mixed)
        expect(new Set(pages.map(p => p.recipeId)).size).toBeGreaterThan(4)
    })
    it('never puts the same rough on two pages running', () => {
        const pages = planGreetings(mixed)
        for (let i = 1; i < pages.length; i++) {
            expect(pages[i].recipeId, `page ${i}`).not.toBe(pages[i - 1].recipeId)
        }
    })
    it('is deterministic', () => {
        const a = planGreetings(mixed).map(p => p.recipeId)
        const b = planGreetings(mixed).map(p => p.recipeId)
        expect(a).toEqual(b)
    })
    it('every page it produces is readable', () => {
        for (const p of planGreetings(mixed)) {
            if (p.why?.worst != null) expect(p.why.worst, explainPage(p)).toBeGreaterThan(0)
        }
    })
    it('handles the degenerate inputs without throwing', () => {
        for (const v of [null, undefined, [], 'x', 7]) expect(planGreetings(v)).toEqual([])
        // An entry with neither words nor a picture is dropped, not
        // rendered as a blank leaf.
        expect(planGreetings([{ id: 'e' }])).toEqual([])
        expect(planGreetings([{ id: 'e' }, letter('f', 40)])).toHaveLength(1)
    })
    it('a book of nothing but long letters still terminates, one per page', () => {
        const longs = Array.from({ length: 6 }, (_, i) => letter(`L${i}`, 900))
        const pages = planGreetings(longs)
        expect(pages).toHaveLength(6)
        expect(pages.flatMap(p => p.entries)).toHaveLength(6)
    })
    it('a book of nothing but photos packs them', () => {
        const photos = Array.from({ length: 9 }, (_, i) => photo(`P${i}`, 0.7))
        const pages = planGreetings(photos)
        expect(pages.flatMap(p => p.entries)).toHaveLength(9)
        expect(pages.length).toBeLessThan(9)
    })
})

describe('a split guest stays one guest', () => {
    // The photograph is OF them and the words are THEIRS. Before the two
    // halves were bonded, the photo half scored well beside the NEXT
    // guest's blessing and drifted onto their page - which is exactly the
    // thing splitting was supposed to prevent.
    const list = [card('long', 900, 1.4), letter('next', 80), letter('after', 95)]

    it('emits the words and then the picture, on consecutive pages', () => {
        const pages = planGreetings(list)
        const words = pages.findIndex(p => p.entries.some(e => e.id === 'long'))
        const pic = pages.findIndex(p => p.entries.some(e => String(e.id).endsWith('__photo')))
        expect(words).toBeGreaterThanOrEqual(0)
        expect(pic).toBe(words + 1)
    })
    it('never puts either half on a page with another guest', () => {
        for (const p of planGreetings(list)) {
            const bonded = p.entries.filter(e => e._bond)
            if (bonded.length) expect(p.entries).toHaveLength(1)
        }
    })
    it('marks those pages as bonded, so a renderer can keep them facing', () => {
        const pages = planGreetings(list).filter(p => p.bonded)
        expect(pages).toHaveLength(2)
    })
    it('reports the long blessing as barely readable rather than hiding it', () => {
        // 900 characters does not fit one page at a readable size. The
        // engine says so - score and readability both near the floor -
        // where the old pagination rendered it silently. Continuation
        // pages are the real fix; being able to SEE it is the point here.
        const page = planGreetings(list).find(p => p.entries.some(e => e.id === 'long'))
        expect(page.why.worst).toBeLessThan(0.1)
    })
})

describe('textShare is a HEIGHT, textAreaOf is an AREA', () => {
    // These two are easy to swap and the swap is invisible to every unit
    // test: the plan stays valid, the scores stay sane, and the book only
    // goes wrong when it is drawn. Rendering the engine caught it -
    // giving a card's words a quarter of their box instead of the 42%
    // they were scored against, so text clipped on three pages. Pin the
    // distinction so the next reader cannot make the same mistake.
    const classic = RECIPES.find(r => r.id === 'classic')
    const slot = classic.slots[0]

    it('textShare is the fraction of the SLOT HEIGHT the words get', () => {
        expect(slot.textShare).toBe(0.42)
    })
    it('textAreaOf is the fraction of the PAGE the words cover, and is smaller', () => {
        const area = textAreaOf(slot)
        expect(area).toBeCloseTo(slotArea(slot.area) * slot.textShare, 6)
        expect(area).toBeLessThan(slot.textShare)
    })
    it('a renderer that used the area as a height would starve the text', () => {
        // The failing case, stated as a number: 0.249 of the box instead
        // of 0.42 is 41% less room than the blessing was scored against.
        expect(textAreaOf(slot) / slot.textShare).toBeLessThan(0.65)
    })
    it('every card slot declares a textShare rather than relying on the default', () => {
        for (const r of RECIPES) {
            for (const s of r.slots) {
                if (s.kind === 'card') expect(typeof s.textShare, r.id).toBe('number')
            }
        }
    })
})
