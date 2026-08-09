// src/lib/bookPageIndex.js
//
// Which page of the printed book each blessing lands on.
//
// The blessings screen shows cards in the order the couple arranged them.
// That order is not page numbers, and the difference is not cosmetic:
// a long blessing with a photo becomes TWO pages, two short ones can
// share ONE, and spread padding inserts blank leaves that occupy a page
// number without belonging to anybody. So card #14 is very often not
// page 14, and when somebody asks "which page is grandma on" the only
// honest way to answer today is to open the export and count.
//
// ── Why this is a derivation and not a stored field ─────────────────
//
// The temptation is to write a pageNumber onto each entry. That would be
// wrong within a minute: every reorder, every split toggle, every design
// change re-flows the whole book, and a stored number would be a
// confident lie for everything after the edit. The page list is a pure
// function of (entries, design), so the number is too.
//
// ── One numbering, and it is the printed one ────────────────────────
//
// expandBookPages returns a 0-based array with no page numbers on it;
// position IS the page. What turns that into a number a human can use is
// a convention, and the codebase currently has two.
//
// The Picabook exporter - the square 20x20 book that is the actual
// product - runs expandBookPages on the entries in admin order with
// padToSpread and spreadOffset 1, then names files index+1. That is the
// physical book, so that is what these numbers mean, and the constants
// below are deliberately the same ones so the two cannot drift.
//
// The Lulu PDF path in /viewer reverses the entries first and would give
// different numbers. That difference is a real question about the
// product, not a detail for this module to paper over. See AGENTS.md.

import { expandBookPages } from './bookPages'

// Kept identical to the Picabook exporter's call. If that changes, this
// has to change with it, which is exactly what the test asserts.
export const PRINT_LAYOUT = { padToSpread: true, spreadOffset: 1 }

/**
 * The blessings that appear on one page object.
 *
 * A page can carry nobody (a blank spread-alignment leaf), one entry, or
 * two - and the two-entry cases arrive under three different markers
 * because they were built for three different reasons. Missing one of
 * them shows up as a blessing with no page number at all, which reads as
 * a bug in the book rather than a gap here.
 */
export function entryIdsOnPage(page) {
    if (!page || page._divider) return []
    if (Array.isArray(page._duo)) return page._duo.filter(Boolean).map(e => e?.id).filter(Boolean)
    if (Array.isArray(page._photoPair)) return page._photoPair.filter(Boolean).map(e => e?.id).filter(Boolean)
    // The photo half of a split carries a synthetic id so React keys stay
    // unique; the blessing it belongs to is the part before the suffix.
    if (page._split === 'photo' && typeof page.id === 'string') {
        return [page.id.replace(/__photo$/, '')]
    }
    return page.id ? [page.id] : []
}

/**
 * The design fields that actually change pagination, and nothing else.
 *
 * Normalised rather than defaulted in the signature: a default parameter
 * does not fire for an explicit null, and `wedding.bookDesign` is null on
 * every event whose design was never opened. That is most of them.
 */
export function layoutOptionsFrom(styleSettings) {
    const s = styleSettings || {}
    return {
        autoSplit: s.autoSplit,
        splitThreshold: s.splitThreshold,
        entriesPerPage: s.entriesPerPage,
        photoLayout: s.photoLayout,
        ...PRINT_LAYOUT,
    }
}

/**
 * entry id → the 1-based printed page numbers it occupies.
 *
 * Returns the total too, because "page 21 of 48" is a different piece of
 * information from "page 21" and the screen wants both.
 */
export function buildPageIndex(entries, styleSettings) {
    const pages = expandBookPages(Array.isArray(entries) ? entries : [], layoutOptionsFrom(styleSettings))
    const byEntry = {}
    pages.forEach((page, i) => {
        for (const id of entryIdsOnPage(page)) {
            if (!byEntry[id]) byEntry[id] = []
            byEntry[id].push(i + 1)
        }
    })
    return { byEntry, totalPages: pages.length }
}

/**
 * "21", "21-22", or "21, 24" — what goes on the card.
 *
 * Consecutive pages collapse to a range because that is what a split
 * blessing is: one blessing that turned into a spread. Non-consecutive
 * stays listed, because it means something unexpected happened to the
 * layout and hiding it behind a range would be a lie in the one case
 * worth looking at.
 */
export function pageLabel(numbers) {
    const list = [...new Set((Array.isArray(numbers) ? numbers : []).filter(Number.isFinite))].sort((a, b) => a - b)
    if (!list.length) return null
    if (list.length === 1) return String(list[0])

    const runs = []
    let start = list[0]
    let prev = list[0]
    for (const n of list.slice(1)) {
        if (n === prev + 1) { prev = n; continue }
        runs.push([start, prev])
        start = n
        prev = n
    }
    runs.push([start, prev])

    return runs.map(([a, b]) => (a === b ? String(a) : `${a}-${b}`)).join(', ')
}

export default { PRINT_LAYOUT, entryIdsOnPage, layoutOptionsFrom, buildPageIndex, pageLabel }
