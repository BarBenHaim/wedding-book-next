// src/lib/greetingScoring.js
//
// Which rough to use for the entries actually in hand.
//
// ── The failure this exists to prevent ───────────────────────────────
//
// A scorer that measures how well a page is FILLED will happily put four
// two-hundred-character blessings on one page. Nothing overflows -
// fontFit shrinks each one - and by every geometric measure the page is
// excellent. It is also unreadable, and you do not find out until the
// book is printed.
//
// So readability is not one term among several here. It is a gate: a
// composition where any blessing lands on the shrink floor is rejected
// outright rather than scored down, because no amount of elegance
// elsewhere makes 6pt Hebrew acceptable. Everything else - shape, air,
// variety - only ranks the compositions that already pass.
//
// ── Determinism ──────────────────────────────────────────────────────
//
// The book renders twice: once on screen, once into the PDF, in separate
// passes. Any Math.random() here and the printed book is not the book
// that was approved. Ties break on a hash of (recipe id, page index).

import { readability, overflowRatio, blessingLength, slotArea } from './greetingCapacity'
import { needsOf, capacityCount } from './greetingRecipes'

/** What material an entry is made of. */
export function classifyEntry(e) {
    const hasText = blessingLength(e) > 0
    const hasPhoto = Boolean(e?.imageUrl)
    if (hasText && hasPhoto) return 'card'
    if (hasText) return 'blessing'
    if (hasPhoto) return 'photo'
    return 'empty'
}

/** The kinds in a window, counted. */
export function countKinds(entries) {
    const c = { card: 0, blessing: 0, photo: 0, empty: 0 }
    for (const e of Array.isArray(entries) ? entries : []) c[classifyEntry(e)]++
    return c
}

/**
 * Can this rough be built from exactly these entries?
 *
 * Exact multiset match, deliberately. A card could physically be poured
 * into a blessing slot by dropping its photograph, and that would make
 * far more roughs "fit" - but silently discarding a guest's photograph
 * to satisfy a layout is a content decision, not a layout one. The
 * planner has an explicit split step for that.
 */
export function matches(recipe, entries) {
    const need = needsOf(recipe)
    const have = countKinds(entries)
    if (have.empty > 0) return false
    return have.card === need.card && have.blessing === need.blessing && have.photo === need.photo
}

/** The area a slot gives to WORDS - the whole slot, or a card's text half. */
export function textAreaOf(slot) {
    const a = slotArea(slot?.area)
    if (slot?.kind === 'card') {
        const share = Number(slot.textShare)
        return a * (Number.isFinite(share) && share > 0 ? share : 0.4)
    }
    return a
}

/** Assign entries to slots by kind, in order. Returns null if it cannot. */
export function assign(recipe, entries) {
    const pool = { card: [], blessing: [], photo: [] }
    for (const e of entries) {
        const k = classifyEntry(e)
        if (k === 'empty') return null
        pool[k].push(e)
    }
    const out = []
    for (const slot of recipe.slots) {
        const e = pool[slot.kind]?.shift()
        if (!e) return null
        out.push({ slot, entry: e })
    }
    return out
}

/** Aspect ratio the recipe would like, vs what the photo is. 0..1. */
function shapeScore(slot, entry, recipe) {
    if (slot.kind !== 'photo' && slot.kind !== 'card') return 1
    const a = Number(entry?.imgAspect)
    if (!Number.isFinite(a) || a <= 0) return 0.85 // unknown shape: mildly neutral
    const want = recipe?.prefer?.photo
    const slotW = slot.area[2]
    const slotH = slot.kind === 'card' ? slot.area[3] * (1 - (slot.textShare ?? 0.4)) : slot.area[3]
    // Page is taller than wide; compare in the same space by folding the
    // page ratio in. A 3:4 page makes a 1.0 slot land as 0.75.
    const slotAspect = slotH > 0 ? (slotW / slotH) * 0.75 : 1
    const ratio = a > slotAspect ? slotAspect / a : a / slotAspect
    let s = Math.max(0, Math.min(1, ratio))
    if (want === 'wide' && a < 1.15) s *= 0.7
    if (want === 'landscape' && a < 1.0) s *= 0.75
    if (want === 'portrait' && a > 1.0) s *= 0.7
    return s
}

/** How many entries a page wants. Two is the sweet spot; four is a lot. */
export const FULLNESS = { 1: 4, 2: 10, 3: 8, 4: 3 }

/** Deterministic tiebreak - FNV-1a over the id, mixed with the page. */
export function tiebreak(id, pageIndex = 0) {
    let h = 2166136261
    const s = `${id}#${pageIndex}`
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 16777619)
    }
    return ((h >>> 0) % 100) / 100
}

/** Below this a composition is not worth using; the planner falls back. */
export const SCORE_FLOOR = 30

/**
 * Score a rough against a window of entries.
 *
 * Returns `{ ok, score, base, why }`. `base` excludes the variety
 * penalty, so the planner can report why a page was chosen without the
 * sequence noise, and `why` carries the readability of every blessing on
 * the page for the explain view.
 */
export function scoreRecipe(recipe, entries, { pageIndex = 0, recent = [], styleSettings } = {}) {
    if (!matches(recipe, entries)) return { ok: false, score: -Infinity, base: -Infinity, why: null }
    const pairs = assign(recipe, entries)
    if (!pairs) return { ok: false, score: -Infinity, base: -Infinity, why: null }

    const reads = []
    let shape = 0
    let shapeN = 0
    let air = 0
    let airN = 0

    for (const { slot, entry } of pairs) {
        if (slot.kind === 'blessing' || slot.kind === 'card') {
            const len = blessingLength(entry)
            const share = textAreaOf(slot)
            const withImage = slot.kind === 'card'
            const r = readability(len, share, { hasImage: withImage, styleSettings })
            const over = overflowRatio(len, share, { hasImage: withImage })
            reads.push({ id: entry.id, len, readability: r, over })
            // A blessing using a quarter of the room it was given leaves a
            // page of empty paper around three words. Some air is the point;
            // a lot of it is an accident.
            const used = Math.min(1, over)
            air += used < 0.25 ? used / 0.25 : 1
            airN++
        }
        if (slot.kind === 'photo' || slot.kind === 'card') {
            shape += shapeScore(slot, entry, recipe)
            shapeN++
        }
    }

    // The gate. One unreadable blessing sinks the whole composition.
    const worst = reads.length ? Math.min(...reads.map(r => r.readability)) : 1
    if (worst <= 0) {
        return { ok: false, score: -Infinity, base: -Infinity, why: { reads, reason: 'unreadable' } }
    }

    const meanRead = reads.length ? reads.reduce((s, r) => s + r.readability, 0) / reads.length : 1
    const meanShape = shapeN ? shape / shapeN : 1
    const meanAir = airN ? air / airN : 1

    let base = 0
    base += meanRead * 45          // the blessing is the book
    base += worst * 20             // and the worst one on the page matters twice
    base += meanShape * 15
    base += meanAir * 8
    base += FULLNESS[capacityCount(recipe)] ?? 0

    // Variety: the same rough twice running reads as a template even when
    // each page is good. The failure is in the sequence, not the page.
    const seen = recent.indexOf(recipe.id)
    const variety = seen === -1 ? 0 : seen === 0 ? 26 : seen === 1 ? 14 : 6

    return {
        ok: true,
        base,
        score: base - variety + tiebreak(recipe.id, pageIndex),
        why: { reads, meanRead, worst, meanShape, meanAir, variety },
    }
}

export default { classifyEntry, countKinds, matches, assign, scoreRecipe, tiebreak, FULLNESS, SCORE_FLOOR, textAreaOf }
