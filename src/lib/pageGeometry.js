// src/lib/pageGeometry.js
//
// Shared pixel-math helpers for book page layouts.
//
// Every layout component (BookPageTemplate, PolaroidPageLayout,
// ScrapbookPageLayout, NotebookPageLayout, CollagePageLayout, …)
// historically copied the same two arrow functions and the
// BASE_SIZE constant:
//
//     const w = percent => (percent / 100) * scaledWidth
//     const h = percent => (percent / 100) * scaledHeight
//
// Centralising them here means a future change to the base print
// resolution, or to the way percentages resolve, is a one-line
// edit instead of touching every layout.
//
// IMPORTANT: this module must stay pure. No React, no Firebase, no
// state. The layouts are rendered inside a flipbook + a PDF export
// pipeline, both of which assume these helpers are deterministic.

/**
 * Lulu's print resolution at 300 DPI for our default page format.
 * Layouts express positions as percentages of the rendered page,
 * but a few legacy call-sites still need the raw base value.
 */
export const BASE_SIZE = 2362

/**
 * Build the percent-to-pixel converters for a given rendered page size.
 *
 * Returns `{ w, h }` where:
 *   w(percent) → percent of page WIDTH in pixels
 *   h(percent) → percent of page HEIGHT in pixels
 *
 * Example:
 *   const { w, h } = pageScale(scaledWidth, scaledHeight)
 *   <div style={{ width: w(70), height: h(50) }} />
 */
export function pageScale(scaledWidth, scaledHeight) {
    return {
        w: percent => (percent / 100) * scaledWidth,
        h: percent => (percent / 100) * scaledHeight,
    }
}
