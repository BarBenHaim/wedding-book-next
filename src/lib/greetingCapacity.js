// src/lib/greetingCapacity.js
//
// How much blessing fits in a piece of a page.
//
// ── Why the album engine could not simply be pointed at blessings ────
//
// albumScoring asks one question of a photograph in a slot: how much of
// that slot does the picture cover once it is fitted whole? A photograph
// is infinitely scalable, so the only failure is empty paper.
//
// Text is not scalable. A blessing has a length, and a length needs a
// readable font, and a readable font needs area. Put 600 characters in a
// quarter-page slot and nothing overflows - fontFit quietly shrinks it -
// but the page is a wall of 6pt Hebrew that nobody reads, and worse, it
// LOOKS fine to any scorer measuring coverage. That is the whole reason
// this module exists: it turns "will this blessing be readable here"
// into a number, so the planner can refuse a composition instead of
// producing a beautiful unreadable one.
//
// ── The bridge, and the trap in it ───────────────────────────────────
//
// fontFit already knows the capacity of two containers, tuned by hand
// against real printed books:
//
//     whole page   360 chars text-only, 230 sharing with a photo
//     half page    200 chars text-only, 110 sharing with a photo
//
// Halving the container roughly halves the capacity, so capacity tracks
// AREA. That is the model, and it is not a guess - it is the existing
// constants read as a ratio.
//
// The trap is what "whole page" means. Those 360 characters are not
// spread over the whole sheet of paper; they sit in the text block the
// template draws, which is a little over half the page for a text-only
// layout and about a quarter of it when a photograph takes the top. So
// a slot covering 55% of the page does not hold 55% of 360 - it holds
// ALL of it, because 55% of the page IS what a full page gives its
// words.
//
// Getting this backwards makes the engine reject its own best layouts:
// a 340-character blessing on the classic page renders comfortably in
// the real template, but measured against "0.25 of a page x 360" it
// looks like a 40% overflow and gets split onto two pages for no
// reason. Hence the reference areas below - capacity is measured in
// multiples of what a full page already gives, never in raw page area.

import { fitFactor, PAGE_FIT_TARGET, DEFAULT_MIN_FACTOR, minFactorOf } from './fontFit'

/**
 * How much of the page a real template hands to WORDS.
 *
 * Derived from the templates, not invented: a text-only page runs the
 * blessing down most of the sheet; a page sharing with a photograph
 * gives the words roughly the bottom quarter. These two numbers are
 * what make PAGE_FIT_TARGET mean something geometric.
 */
export const REFERENCE_TEXT_AREA = { textOnly: 0.55, withImage: 0.25 }

/** [x, y, w, h] normalised to the page -> the fraction of page it covers. */
export function slotArea(area) {
    if (!Array.isArray(area) || area.length < 4) return 0
    const w = Number(area[2])
    const h = Number(area[3])
    if (!Number.isFinite(w) || !Number.isFinite(h)) return 0
    return Math.max(0, Math.min(1, w)) * Math.max(0, Math.min(1, h))
}

/**
 * Characters a text block of this size holds before anything shrinks.
 *
 * `textFraction` is the share of the PAGE given to words - for a card
 * slot that is the slot's area times its textShare, not the whole slot.
 * `hasImage` says whether the words share their page with a picture,
 * which is the condition the two fontFit targets were measured under.
 *
 * Floored at 1 so a degenerate slot reads as "holds almost nothing"
 * rather than dividing by zero.
 */
export function capacityOf(textFraction, { hasImage = false } = {}) {
    const f = Number(textFraction)
    if (!Number.isFinite(f) || f <= 0) return 1
    const target = hasImage ? PAGE_FIT_TARGET.withImage : PAGE_FIT_TARGET.textOnly
    const reference = hasImage ? REFERENCE_TEXT_AREA.withImage : REFERENCE_TEXT_AREA.textOnly
    return Math.max(1, target * (Math.min(1, f) / reference))
}

/**
 * How much the blessing has to shrink to live here. 1 = not at all.
 *
 * Same curve as a whole page, because it IS the same curve - only the
 * target moves with the area.
 */
export function slotFitFactor(textLength, textFraction, { hasImage = false, styleSettings } = {}) {
    return fitFactor(textLength, capacityOf(textFraction, { hasImage }), minFactorOf(styleSettings))
}

/**
 * Readability, 0..1. The number the scorer actually wants.
 *
 * 1.0  the blessing sits at full size
 * ~0.5 it shrank halfway to the floor - tight, still fine
 * 0.0  it is ON the floor, which means fontFit stopped shrinking and the
 *      text is now overflowing rather than fitting
 *
 * The floor is the honest failure line. Below it fitFactor clamps and
 * stops reporting the problem, so a scorer that only read the factor
 * would see 0.62 for a blessing needing 0.3 and think it merely snug.
 * Hence `overflowRatio`, which keeps counting past the edge.
 */
export function readability(textLength, textFraction, opts = {}) {
    const floor = minFactorOf(opts.styleSettings)
    const f = slotFitFactor(textLength, textFraction, opts)
    if (floor >= 1) return f >= 1 ? 1 : 0
    return Math.max(0, Math.min(1, (f - floor) / (1 - floor)))
}

/**
 * How far past the block the blessing runs, as a multiple of capacity.
 *
 * <= 1 means it fits at full size. 2 means twice as much text as the
 * block was measured to hold. Unlike the fit factor this never clamps,
 * so the planner can tell "slightly over" from "hopeless" - and the
 * second should become its own page rather than a smaller font.
 */
export function overflowRatio(textLength, textFraction, { hasImage = false } = {}) {
    const len = Number(textLength)
    if (!Number.isFinite(len) || len <= 0) return 0
    return len / capacityOf(textFraction, { hasImage })
}

/**
 * The longest blessing this block can take and still stay readable.
 *
 * Inverts the sqrt curve: fitFactor floors at `minFactor` when
 * len = target / minFactor^2.
 */
export function maxReadableLength(textFraction, { hasImage = false, styleSettings } = {}) {
    const floor = minFactorOf(styleSettings)
    const cap = capacityOf(textFraction, { hasImage })
    if (!(floor > 0) || floor >= 1) return cap
    return Math.round(cap / (floor * floor))
}

/** Blessing length as the page sees it - trimmed, whitespace collapsed. */
export function blessingLength(entry) {
    const t = entry?.text
    if (typeof t !== 'string') return 0
    return t.replace(/\s+/g, ' ').trim().length
}

export { DEFAULT_MIN_FACTOR, PAGE_FIT_TARGET }

export default {
    slotArea, capacityOf, slotFitFactor, readability, overflowRatio,
    maxReadableLength, blessingLength,
}
