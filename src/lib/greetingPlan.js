// src/lib/greetingPlan.js
//
// Turns the guests' blessings into the sequence of pages a book renders.
//
// ── How it differs from expandBookPages ──────────────────────────────
//
// The existing pagination looks at ONE entry and decides what to do with
// it: split it, pair it, pass it through. It cannot ask "these next
// three would make a good page together", because it never looks at
// three. That is the whole ceiling - a rule-per-entry can produce a
// correct book but never a composed one.
//
// This planner looks at a window. At every position it tries every rough
// that could be built from the next one to four entries, scores them all
// against the actual blessings in hand, and takes the best. The page is
// chosen by the content, not applied to it.
//
// ── What is preserved ────────────────────────────────────────────────
//
// Order. Guests arrive in the order they wrote, and a book that
// reshuffles them breaks the one thing a keepsake is for. Windows are
// contiguous, always - a rough may arrange its own slots freely, because
// that is arrangement on a page, but no entry ever jumps a page.
//
// Determinism. Two passes render this book: the screen and the PDF. The
// planner must return the identical plan both times, so there is no
// randomness anywhere in it - see the tiebreak in greetingScoring.
//
// ── Always terminates ────────────────────────────────────────────────
//
// Every material has a one-entry rough (classic / letter / plate-full),
// so the head entry can always be placed on a page of its own. A window
// that scores below the floor falls back to that rather than failing,
// which is why this can never loop or drop a guest.

import { RECIPES, mirrorRecipe, capacityCount } from './greetingRecipes'
import { classifyEntry, scoreRecipe, SCORE_FLOOR } from './greetingScoring'
import { blessingLength, overflowRatio, maxReadableLength, REFERENCE_TEXT_AREA } from './greetingCapacity'

/** The largest window worth trying. */
const MAX_WINDOW = 4

/** How many pages back the variety penalty remembers. */
const RECENT_DEPTH = 3

/** A card whose blessing cannot be read even on a full page gets split. */
const SPLIT_AT_OVERFLOW = 1.9

// What a full page gives a blessing that shares it with a photograph.
// Expressed as a share of the page, matching capacityOf's units - this
// IS the reference area, so a card at exactly this size has capacity
// PAGE_FIT_TARGET.withImage and an overflow of 1.0.
const FULL_PAGE_TEXT_SHARE = REFERENCE_TEXT_AREA.withImage

/** Every rough, plus the mirrored variant of each mirrorable one. */
export function allRoughs() {
    const out = []
    for (const r of RECIPES) {
        out.push(r)
        const m = mirrorRecipe(r)
        if (m !== r) out.push(m)
    }
    return out
}

/**
 * Split the cards nobody could read.
 *
 * A guest who wrote 900 characters AND attached a photograph cannot have
 * both on one page: the words shrink past legibility to make room. Today
 * this is a global on/off switch with a character threshold. Here it is
 * a measurement - the card is split only when its blessing overflows a
 * FULL page, which is the same question the switch was trying to ask but
 * asked of the actual page.
 *
 * The two halves stay adjacent, so the photograph still faces its words.
 */
export function presplit(entries) {
    const out = []
    for (const e of Array.isArray(entries) ? entries : []) {
        if (classifyEntry(e) !== 'card') { out.push(e); continue }
        const len = blessingLength(e)
        if (overflowRatio(len, FULL_PAGE_TEXT_SHARE, { hasImage: true }) < SPLIT_AT_OVERFLOW) { out.push(e); continue }
        const bond = e.id || `b${out.length}`
        out.push({ ...e, imageUrl: null, _split: 'text', _bond: bond })
        out.push({
            id: `${e.id || 'entry'}__photo`,
            name: '',
            text: '',
            imageUrl: e.imageUrl,
            imgAspect: e.imgAspect,
            photoPosition: e.photoPosition,
            photoRotation: e.photoRotation,
            pageStyle: e.pageStyle,
            timestamp: e.timestamp,
            _split: 'photo',
            _bond: bond,
        })
    }
    return out
}

/**
 * Plan the book.
 *
 * @returns {Array} pages, each `{ recipe, entries, slots, score, why }`
 *   where `slots` pairs every slot of the rough with the entry that
 *   fills it, ready for a renderer to place.
 */
export function planGreetings(entries, { styleSettings, split = true } = {}) {
    // An entry with neither words nor a picture has nothing to render.
    // Left in, it reaches the fallback with no rough for its material and
    // produces a page with an empty slot - a blank leaf in a keepsake.
    const source = (Array.isArray(entries) ? entries : []).filter(e => classifyEntry(e) !== 'empty')
    const list = split ? presplit(source) : source.slice()
    const roughs = allRoughs()
    const pages = []
    const recent = []
    let i = 0

    while (i < list.length) {
        const head = list[i]

        // A split guest is not two entries the planner may compose freely.
        // The photograph is OF them and the words are THEIRS, so the two
        // halves are emitted as a fixed pair - words, then picture - and
        // never offered to the window search. Without this the photo half
        // scored well beside the NEXT guest's blessing and drifted onto
        // their page, which is exactly the thing splitting was meant to
        // avoid.
        if (head?._split === 'text' && list[i + 1]?._bond === head._bond) {
            for (const half of [head, list[i + 1]]) {
                const kind = classifyEntry(half)
                const id = kind === 'photo' ? 'plate-full' : 'letter'
                const rough = roughs.find(r => r.id === id)
                const s = scoreRecipe(rough, [half], { pageIndex: pages.length, recent, styleSettings })
                // This half HAS to be placed - it is somebody's blessing and
                // there is nowhere else for it to go. So a failing score is
                // recorded rather than obeyed: the page is marked, and its
                // readability is carried, instead of shipping -Infinity into
                // a UI that has to print something.
                pages.push({
                    index: pages.length,
                    recipeId: rough.id,
                    recipe: rough,
                    entries: [half],
                    slots: [{ slot: rough.slots[0], entry: half }],
                    score: s.ok ? s.score : 0,
                    base: s.ok ? s.base : 0,
                    fallback: !s.ok,
                    unreadable: !s.ok,
                    bonded: true,
                    why: s.why,
                })
                recent.unshift(rough.id)
                if (recent.length > RECENT_DEPTH) recent.pop()
            }
            i += 2
            continue
        }

        const remaining = list.length - i
        let best = null

        for (let n = Math.min(MAX_WINDOW, remaining); n >= 1; n--) {
            const window = list.slice(i, i + n)
            for (const rough of roughs) {
                if (capacityCount(rough) !== n) continue
                const s = scoreRecipe(rough, window, { pageIndex: pages.length, recent, styleSettings })
                if (!s.ok || s.score < SCORE_FLOOR) continue
                if (!best || s.score > best.score) best = { rough, window, ...s }
            }
        }

        // Nothing scored. Place the head entry alone on the one rough that
        // is guaranteed to exist for its material, so the walk always moves.
        if (!best) {
            const solo = { card: 'classic', blessing: 'letter', photo: 'plate-full' }[classifyEntry(head)]
            const rough = roughs.find(r => r.id === solo) || roughs[0]
            const s = scoreRecipe(rough, [head], { pageIndex: pages.length, recent, styleSettings })
            best = {
                rough, window: [head],
                score: s.ok ? s.score : 0,
                base: s.ok ? s.base : 0,
                why: s.why ?? { reason: 'fallback' },
                fallback: true,
                unreadable: !s.ok,
            }
        }

        const assigned = best.rough.slots.map((slot, k) => ({
            slot,
            // assign() ordered the pool by kind; re-derive the same pairing
            // here so the page carries it without a second import.
            entry: pickForSlot(best.window, best.rough.slots, k),
        }))

        pages.push({
            index: pages.length,
            recipeId: best.rough.id,
            recipe: best.rough,
            entries: best.window,
            slots: assigned,
            score: best.score,
            base: best.base,
            fallback: best.fallback === true,
            unreadable: best.unreadable === true,
            why: best.why,
        })

        recent.unshift(best.rough.id)
        if (recent.length > RECENT_DEPTH) recent.pop()
        i += best.window.length
    }

    return pages
}

/**
 * Which entry fills slot `k`.
 *
 * Mirrors assign()'s rule - entries are pooled by material and handed to
 * slots of that material in order - without mutating the caller's array,
 * so calling it per slot gives the same answer as one pass would.
 */
function pickForSlot(window, slots, k) {
    const kind = slots[k].kind
    let nth = 0
    for (let j = 0; j < k; j++) if (slots[j].kind === kind) nth++
    let seen = 0
    for (const e of window) {
        if (classifyEntry(e) !== kind) continue
        if (seen === nth) return e
        seen++
    }
    return null
}

/** A one-line account of a page, for the studio's explain view. */
export function explainPage(page) {
    if (!page) return ''
    const n = page.entries.length
    const worst = page.why?.worst
    const bits = [
        `${page.recipe.label} (${page.recipeId})`,
        `${n} ${n === 1 ? 'ברכה' : 'ברכות'}`,
        page.fallback ? 'ברירת מחדל' : `ציון ${Math.round(page.score)}`,
    ]
    if (Number.isFinite(worst)) bits.push(`קריאות ${Math.round(worst * 100)}%`)
    return bits.join(' · ')
}

export { MAX_WINDOW, SPLIT_AT_OVERFLOW, maxReadableLength }
export default { planGreetings, presplit, allRoughs, explainPage }
