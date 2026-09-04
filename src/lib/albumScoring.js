// src/lib/albumScoring.js
//
// Choosing a layout by looking at the photographs.
//
// This is the part that makes the album feel designed rather than
// generated. The old engine asked "how do I arrange whatever comes
// next"; this one asks "which of my thirty roughs was drawn for
// pictures shaped like these" — and answers with a number, so the
// choice is inspectable, testable and reproducible.
//
// Three signals, and nothing else:
//
//   FIT       Does a photo of this shape belong in this slot? A recipe
//             that asks for a portrait and gets a panorama is wrong even
//             if the panorama technically fits on the page.
//
//   COVERAGE  How much of the slot the photo actually occupies once it
//             is contained inside it. This is the signal that quietly
//             does most of the work: a 3:2 photo in a slot drawn for 3:2
//             fills it; the same photo in a tall slot leaves half the
//             area empty, and empty area inside a composed page reads as
//             a mistake, not as air.
//
//   VARIETY   A penalty for a recipe used recently. Without it a run of
//             similar photographs produces eight identical pages, which
//             is exactly the "template" feeling the whole system exists
//             to avoid.
//
// No randomness. Same photographs in the same order always produce the
// same album, on screen and in the PDF.

import { safeAspect, orientation, isPanorama, LANDSCAPE, PORTRAIT, SQUARE } from './albumLayout'
import { RECIPES, recipesForCount, SUPPORTED_COUNTS } from './albumRecipes'

/** How well one photo's shape suits one slot's stated preference. */
export function fitScore(aspect, prefer) {
    const a = safeAspect(aspect)
    const o = orientation(a)
    if (!prefer || prefer === 'any') return 22
    if (prefer === 'wide') return isPanorama(a) ? 40 : a >= 1.6 ? 22 : 2
    if (prefer === LANDSCAPE) return o === LANDSCAPE ? 34 : o === SQUARE ? 16 : 2
    if (prefer === PORTRAIT) return o === PORTRAIT ? 34 : o === SQUARE ? 16 : 2
    if (prefer === SQUARE) return o === SQUARE ? 34 : 14
    return 12
}

/**
 * The fraction of a slot's area a contained photo actually covers.
 *
 * Both the slot and the photo are described by aspect ratios, so this
 * needs no pixels: containing a photo of aspect `a` in a box of aspect
 * `s` uses min(a/s, s/a) of it.
 */
export function coverage(aspect, slotArea, pageRatio = 1) {
    const a = safeAspect(aspect)
    // Slot aspect in real page proportions: a [w,h] of [.4,.4] on a
    // square page is square, but on a tall page it is wide.
    const s = (slotArea[2] / (slotArea[3] || 1)) / (pageRatio || 1)
    if (!(s > 0)) return 0
    return Math.min(a / s, s / a)
}

// Below this a composed page is worse than a plain justified one and we
// hand the photographs to the old engine instead. It is measured against
// the score BEFORE the variety penalty: wanting a different rough than
// the last page is a reason to pick another rough, never a reason to
// abandon the design system for that page.
export const SCORE_FLOOR = 38

/**
 * Score one recipe against one ordered group of photographs.
 *
 * Photos fill slots in order, never re-sorted: the upload order is the
 * order the evening happened in.
 */
export function scoreRecipe(recipe, photos, opts = {}) {
    const s = scoreRecipeParts(recipe, photos, opts)
    return s.score
}

/**
 * The score in two halves: `base` is how well the rough suits these
 * photographs, `score` also carries the variety penalty. They are
 * separated because they answer different questions — base decides
 * whether ANY composed page is appropriate, score decides which one.
 */
export function scoreRecipeParts(recipe, photos, opts = {}) {
    const { pageRatio = 1, recent = [] } = opts
    if (!recipe || recipe.slots.length !== photos.length) return { base: -1, score: -1 }

    let total = 0
    recipe.slots.forEach((slot, i) => {
        const a = photos[i].aspect
        total += fitScore(a, slot.prefer)
        // Coverage is worth up to 30 and is the tie-breaker between two
        // recipes that both "accept" the shapes.
        total += coverage(a, slot.area, pageRatio) * 30
    })
    let base = total / recipe.slots.length

    // A panorama in a slot not asking for one wastes it; a panorama in a
    // 'wide' slot is already rewarded by fitScore.
    recipe.slots.forEach((slot, i) => {
        if (isPanorama(photos[i].aspect) && slot.prefer !== 'wide' && recipe.slots.length > 1) base -= 14
    })

    // Variety. The most recent page matters more than the one before it.
    let score = base
    const idx = recent.lastIndexOf(recipe.id)
    if (idx >= 0) score -= [26, 14, 7][recent.length - 1 - idx] ?? 0

    // A dense page beside another dense page makes a tiring spread.
    if (recipe.density === 'high' && recent[recent.length - 1] === recipe.id) score -= 8

    return { base, score }
}

/**
 * Plan one page: how many photographs to take, and which rough to use.
 *
 * Every supported group size is tried against every recipe of that size,
 * and the best score wins — with a nudge toward taking more photos, so
 * an album of forty does not become forty single-photo pages.
 */
export function planPage(queue, opts = {}) {
    const { pageRatio = 1, recent = [], world = null } = opts
    let best = null
    for (const n of SUPPORTED_COUNTS) {
        if (n > queue.length) continue
        // Never strand a single photograph on the last page.
        if (queue.length - n === 1 && queue.length > 2) continue
        const group = queue.slice(0, n)
        for (const recipe of recipesForCount(n, world)) {
            const { base, score: ranked } = scoreRecipeParts(recipe, group, { pageRatio, recent })
            // A fuller page is worth real points, not a rounding nudge.
            // Without this the scorer drifts toward single-photo pages —
            // one picture always covers a large area well, so it wins on
            // coverage every time — and forty photographs become forty
            // plates, which is a portfolio, not an album.
            const score = ranked + (n - 1) * 6
            if (!best || score > best.score) best = { score, raw: base, recipe, take: n }
        }
    }
    return best
}

/** Every recipe, scored against a group — for the studio's "why this page" view. */
export function explainPage(photos, opts = {}) {
    const world = opts.world || null
    return RECIPES.filter(r => r.slots.length === photos.length && (!world || !r.worlds || r.worlds.includes(world)))
        .map(r => ({ id: r.id, label: r.label, score: Math.round(scoreRecipe(r, photos, opts) * 10) / 10 }))
        .sort((a, b) => b.score - a.score)
}
