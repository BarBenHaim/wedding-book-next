// src/lib/bookFormats.js
//
// Lulu-compliant book format presets. Super admin "Download PDFs" uses these
// to produce correctly-sized content + cover PDFs in-browser. The live
// "Send to Print" flow on the viewer keeps its own hard-coded config for now
// (we don't want to touch the shipped Lulu wiring while adding this feature).
//
// Dimensions are in millimetres (Lulu accepts mm or inches — we use mm).
// All content PDFs include a 3.175mm (0.125") bleed on every side, which
// Lulu requires for print. DPI is always 300 (Lulu's minimum).
//
// Spine width depends on page count and paper weight. Lulu publishes these
// ratios; we use the 60# Uncoated-White figure (0.0572 mm per page) for PB
// and a slightly thicker figure for hardcover board-paper.
//
// References:
//   https://developers.lulu.com/api-reference/reference/openapi.v1.yaml/paths/~1print-job-cost-calculations~1/post
//   https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf

const MM_PER_INCH = 25.4
const BLEED_INCH = 0.125
const BLEED_MM = BLEED_INCH * MM_PER_INCH // 3.175mm

// Hardcover wrap margin — the flap that folds around the binder's board.
const WRAP_INCH = 0.625
const WRAP_MM = WRAP_INCH * MM_PER_INCH // 15.875mm

// Square 8.5" trim is the only size the app currently supports, so every
// preset here is based on it. If you later add 6x9 or 8x10, this is the
// place to branch.
const TRIM_MM = 8.5 * MM_PER_INCH // 215.9mm

// Spine thickness per page. Lulu's PDF spec gives these ratios.
const SPINE_PER_PAGE_MM = {
    perfectBound: 0.0572, // 0.002252" — 60# UW standard
    hardcover: 0.0720, // slightly thicker for hardcover text paper
    saddleStitch: 0, // no spine
}

/**
 * BOOK_FORMATS — the 3 presets surfaced in super admin.
 *
 * Each entry documents:
 *   - `label` / `description` — the Hebrew UI copy
 *   - `podPackage` — Lulu's SKU for this format (informational; the live
 *     print flow sends a different one until we wire this in)
 *   - `minPages` / `maxPages` — admin guard-rails (warn, don't block)
 *   - `content` — PDF dimensions for the interior (trim + bleed, mm, dpi)
 *   - `cover.compute(pageCount)` — returns the full cover spread dimensions
 *     for this page count. Saddle-stitch returns no spine; PB/hardcover
 *     return a spine proportional to page count.
 */
export const BOOK_FORMATS = {
    classic: {
        id: 'classic',
        label: 'קלאסי — כריכה רכה 8.5"',
        description:
            'Perfect Bound, 8.5×8.5 inch. מה שהאפליקציה שולחת כברירת-מחדל ללולו. מינ׳ 32 עמודים, מקס׳ 800.',
        podPackage: '0850X0850FCPREPB060UW444GXX',
        minPages: 32,
        maxPages: 800,
        content: {
            // Trim + 0.125" bleed per side = 8.75" × 8.75" = 222.25mm
            widthMM: TRIM_MM + 2 * BLEED_MM,
            heightMM: TRIM_MM + 2 * BLEED_MM,
            dpi: 300,
        },
        cover: {
            compute(pageCount) {
                const spineMM = pageCount * SPINE_PER_PAGE_MM.perfectBound
                return {
                    // 0.125" bleed + trim + spine + trim + 0.125" bleed
                    widthMM: 2 * (TRIM_MM + BLEED_MM) + spineMM,
                    heightMM: TRIM_MM + 2 * BLEED_MM, // 222.25mm
                    spineMM,
                    dpi: 300,
                }
            },
        },
    },

    hardcover: {
        id: 'hardcover',
        label: 'כריכה קשה 8.5" (Case Wrap)',
        description:
            'הדפסה מלאה על כריכה קשה, 8.5×8.5 inch. המראה הקלאסי של אלבום חתונה. מינ׳ 32 עמודים.',
        // Casewrap hardcover: CW + 080 paper + M (matte) as a reasonable default.
        // Double-check against Lulu's pod-package lookup before enabling the
        // live send flow.
        podPackage: '0850X0850FCPRECW080CW444MXX',
        minPages: 32,
        maxPages: 500,
        content: {
            widthMM: TRIM_MM + 2 * BLEED_MM,
            heightMM: TRIM_MM + 2 * BLEED_MM,
            dpi: 300,
        },
        cover: {
            compute(pageCount) {
                const spineMM = pageCount * SPINE_PER_PAGE_MM.hardcover
                return {
                    // Hardcover cover has a 0.625" wrap on every side (folds
                    // around the board), not a 0.125" bleed. Spine is also
                    // thicker because of the binder board.
                    widthMM: 2 * (TRIM_MM + WRAP_MM) + spineMM,
                    heightMM: TRIM_MM + 2 * WRAP_MM,
                    spineMM,
                    wrapMM: WRAP_MM,
                    dpi: 300,
                }
            },
        },
    },

    booklet: {
        id: 'booklet',
        label: 'ספרון (Saddle Stitch) — עד 24 עמודים',
        description:
            'חוברת עם סיכות באמצע, 8.5×8.5 inch, בלי שדרה. מינ׳ 8 עמודים, מקס׳ 48.',
        podPackage: '0850X0850FCPRESS060UW444GXX',
        minPages: 8,
        maxPages: 48,
        content: {
            widthMM: TRIM_MM + 2 * BLEED_MM,
            heightMM: TRIM_MM + 2 * BLEED_MM,
            dpi: 300,
        },
        cover: {
            // Saddle-stitch has NO spine. Matches the Lulu cover template the
            // user shared: 17.25" × 8.75" = 438.15mm × 222.25mm.
            compute() {
                return {
                    widthMM: 2 * (TRIM_MM + BLEED_MM), // 438.15mm
                    heightMM: TRIM_MM + 2 * BLEED_MM, // 222.25mm
                    spineMM: 0,
                    dpi: 300,
                }
            },
        },
    },
}

// Convenience accessors -----------------------------------------------------

export const BOOK_FORMAT_IDS = Object.keys(BOOK_FORMATS)

export function getBookFormat(id) {
    return BOOK_FORMATS[id] || null
}

/**
 * Resolves both the content and cover configs for a given format and page
 * count. Returns a shape compatible with the viewer's generatePdfFromRef
 * helper ({ widthMM, heightMM, dpi, spineMM? }).
 */
export function resolveFormatConfig(formatId, pageCount) {
    const fmt = getBookFormat(formatId)
    if (!fmt) return null
    return {
        format: fmt,
        content: fmt.content,
        cover: fmt.cover.compute(pageCount || fmt.minPages),
    }
}
