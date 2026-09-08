// src/lib/greetingRecipes.js
//
// The layout library for a BLESSINGS book, as opposed to a photo album.
//
// ── What makes this a different library ──────────────────────────────
//
// albumRecipes composes photographs. Every slot there holds the same
// kind of thing, and any photograph can go in any slot - only the shape
// argues. Here a page is built from three materials that behave nothing
// alike:
//
//   'card'      a blessing WITH its own photograph. The two belong to
//               one guest and must never be separated onto different
//               pages - the photo is of them, and the words are theirs.
//   'blessing'  words alone. Scales badly: see greetingCapacity.
//   'photo'     a picture alone. Scales freely.
//
// So a recipe cannot just say "I want four things". It has to say what
// KIND of things, because a rough built for two long blessings is a
// disaster with two photographs in it and vice versa.
//
// ── The proportions ──────────────────────────────────────────────────
//
// A real book is mostly cards, with photo-only and text-only pages as
// punctuation - a full-bleed photograph after four dense pages is what
// makes the dense pages readable. The library is weighted that way on
// purpose, and the planner's fullness curve (greetingScoring) keeps it
// there rather than filling every page to the brim because it can.
//
// ── Coordinates ──────────────────────────────────────────────────────
//
// `area` is [x, y, w, h] normalised to the PAGE, so a recipe owns its
// margins - one rough can breathe while its neighbour runs close to the
// trim. `textShare` on a card says how much of that area the words take,
// which is what the scorer measures readability against; the rest is the
// picture.
//
// ── The constraint that shapes everything ────────────────────────────
//
// The printed book is produced by html2canvas + jsPDF. No mask-image, no
// filter: blur, no blend modes - they render on screen and vanish in the
// PDF. Nothing here asks for any of them.

/** Every kind of material a slot can hold. */
export const SLOT_KINDS = ['card', 'blessing', 'photo']

// Shorthand for the three moods a page can be in. A book that is all
// 'calm' is a template; all 'busy' is exhausting. The planner alternates.
const CALM = 'calm'
const MEDIUM = 'medium'
const BUSY = 'busy'

export const RECIPES = [
    // ══ One guest, one page ══════════════════════════════════════════
    {
        id: 'classic', label: 'קלאסי', density: CALM,
        needs: { card: 1 },
        slots: [{ kind: 'card', area: [0.12, 0.10, 0.76, 0.78], textShare: 0.42, align: 'center' }],
    },
    {
        id: 'portrait-tall', label: 'דיוקן גבוה', density: CALM,
        needs: { card: 1 },
        prefer: { photo: 'portrait' },
        slots: [{ kind: 'card', area: [0.16, 0.06, 0.68, 0.86], textShare: 0.30, align: 'center' }],
    },
    {
        id: 'wide-over-words', label: 'רחב מעל המילים', density: CALM, mirrorable: true,
        needs: { card: 1 },
        prefer: { photo: 'landscape' },
        slots: [{ kind: 'card', area: [0.08, 0.08, 0.84, 0.80], textShare: 0.46, align: 'start' }],
    },
    {
        // The page for the guest who wrote an essay. No picture competes
        // with it; the photograph gets its own page next door.
        id: 'letter', label: 'מכתב', density: CALM,
        needs: { blessing: 1 },
        slots: [{ kind: 'blessing', area: [0.14, 0.12, 0.72, 0.74], align: 'center' }],
    },
    {
        id: 'letter-offset', label: 'מכתב לא ממורכז', density: CALM, mirrorable: true,
        needs: { blessing: 1 },
        slots: [{ kind: 'blessing', area: [0.10, 0.16, 0.62, 0.66], align: 'start' }],
    },
    {
        id: 'plate-full', label: 'תמונה מלאה', density: CALM,
        needs: { photo: 1 },
        slots: [{ kind: 'photo', area: [0.05, 0.07, 0.90, 0.86], treatment: 'plain' }],
    },
    {
        id: 'plate-framed', label: 'תמונה במסגרת', density: CALM,
        needs: { photo: 1 },
        slots: [{ kind: 'photo', area: [0.14, 0.14, 0.72, 0.68], treatment: 'framed' }],
    },
    {
        id: 'band', label: 'פס רוחב', density: CALM,
        needs: { photo: 1 },
        prefer: { photo: 'wide' },
        slots: [{ kind: 'photo', area: [0.04, 0.30, 0.92, 0.40], treatment: 'plain' }],
    },

    // ══ Two guests ═══════════════════════════════════════════════════
    {
        id: 'two-letters', label: 'שתי ברכות', density: MEDIUM,
        needs: { blessing: 2 },
        slots: [
            { kind: 'blessing', area: [0.12, 0.08, 0.76, 0.38], align: 'center' },
            { kind: 'blessing', area: [0.12, 0.54, 0.76, 0.38], align: 'center' },
        ],
        divider: { at: 0.5 },
    },
    {
        id: 'words-and-picture', label: 'מילים ותמונה', density: MEDIUM, mirrorable: true,
        needs: { blessing: 1, photo: 1 },
        slots: [
            { kind: 'blessing', area: [0.08, 0.10, 0.40, 0.76], align: 'start' },
            { kind: 'photo', area: [0.54, 0.16, 0.38, 0.62], treatment: 'framed' },
        ],
    },
    {
        id: 'picture-over-words', label: 'תמונה מעל מילים', density: MEDIUM,
        needs: { blessing: 1, photo: 1 },
        prefer: { photo: 'wide' },
        slots: [
            { kind: 'photo', area: [0.07, 0.07, 0.86, 0.44], treatment: 'plain' },
            { kind: 'blessing', area: [0.14, 0.58, 0.72, 0.32], align: 'center' },
        ],
    },
    {
        id: 'photo-pair', label: 'צמד תמונות', density: MEDIUM,
        needs: { photo: 2 },
        prefer: { photo: 'portrait' },
        slots: [
            { kind: 'photo', area: [0.05, 0.20, 0.43, 0.58], treatment: 'plain' },
            { kind: 'photo', area: [0.52, 0.20, 0.43, 0.58], treatment: 'plain' },
        ],
    },
    {
        id: 'card-and-letter', label: 'ברכה מלאה וברכה', density: MEDIUM, mirrorable: true,
        needs: { card: 1, blessing: 1 },
        slots: [
            { kind: 'card', area: [0.07, 0.07, 0.86, 0.52], textShare: 0.34, align: 'center' },
            { kind: 'blessing', area: [0.14, 0.64, 0.72, 0.28], align: 'center' },
        ],
    },

    // ══ Three ════════════════════════════════════════════════════════
    {
        id: 'three-letters', label: 'שלוש ברכות', density: BUSY,
        needs: { blessing: 3 },
        slots: [
            { kind: 'blessing', area: [0.12, 0.06, 0.76, 0.25], align: 'center' },
            { kind: 'blessing', area: [0.12, 0.37, 0.76, 0.25], align: 'center' },
            { kind: 'blessing', area: [0.12, 0.68, 0.76, 0.25], align: 'center' },
        ],
        divider: { at: 0.335, second: 0.645 },
    },
    {
        id: 'card-and-two', label: 'ברכה מלאה ושתיים', density: BUSY, mirrorable: true,
        needs: { card: 1, blessing: 2 },
        slots: [
            { kind: 'card', area: [0.07, 0.06, 0.52, 0.60], textShare: 0.36, align: 'start' },
            { kind: 'blessing', area: [0.63, 0.10, 0.30, 0.26], align: 'start' },
            { kind: 'blessing', area: [0.63, 0.42, 0.30, 0.24], align: 'start' },
        ],
    },
    {
        id: 'letter-two-photos', label: 'ברכה ושתי תמונות', density: BUSY, mirrorable: true,
        needs: { blessing: 1, photo: 2 },
        slots: [
            { kind: 'blessing', area: [0.10, 0.08, 0.80, 0.30], align: 'center' },
            { kind: 'photo', area: [0.07, 0.45, 0.42, 0.46], treatment: 'plain' },
            { kind: 'photo', area: [0.53, 0.45, 0.40, 0.46], treatment: 'plain' },
        ],
    },
    {
        id: 'three-photos', label: 'שלוש תמונות', density: BUSY,
        needs: { photo: 3 },
        slots: [
            { kind: 'photo', area: [0.06, 0.08, 0.88, 0.40], treatment: 'plain' },
            { kind: 'photo', area: [0.06, 0.54, 0.42, 0.38], treatment: 'plain' },
            { kind: 'photo', area: [0.52, 0.54, 0.42, 0.38], treatment: 'plain' },
        ],
    },

    // ══ Four — the busiest the book goes ═════════════════════════════
    {
        id: 'four-letters', label: 'ארבע ברכות', density: BUSY,
        needs: { blessing: 4 },
        slots: [
            { kind: 'blessing', area: [0.07, 0.07, 0.40, 0.38], align: 'center' },
            { kind: 'blessing', area: [0.53, 0.07, 0.40, 0.38], align: 'center' },
            { kind: 'blessing', area: [0.07, 0.55, 0.40, 0.38], align: 'center' },
            { kind: 'blessing', area: [0.53, 0.55, 0.40, 0.38], align: 'center' },
        ],
    },
    {
        id: 'mosaic', label: 'פסיפס', density: BUSY, mirrorable: true,
        needs: { card: 1, blessing: 1, photo: 1 },
        slots: [
            { kind: 'card', area: [0.06, 0.06, 0.50, 0.54], textShare: 0.34, align: 'start' },
            { kind: 'photo', area: [0.60, 0.06, 0.34, 0.36], treatment: 'plain' },
            { kind: 'blessing', area: [0.06, 0.66, 0.88, 0.26], align: 'center' },
        ],
    },
]

/** Mirror a recipe horizontally. Same rough, opening the other way. */
export function mirrorRecipe(recipe) {
    if (!recipe || recipe.mirrorable !== true) return recipe
    return {
        ...recipe,
        id: `${recipe.id}-m`,
        mirrored: true,
        slots: recipe.slots.map(s => ({
            ...s,
            area: [1 - s.area[0] - s.area[2], s.area[1], s.area[2], s.area[3]],
            align: s.align === 'start' ? 'end' : s.align === 'end' ? 'start' : s.align,
        })),
    }
}

/** How many entries of each kind a recipe consumes. */
export function needsOf(recipe) {
    const n = recipe?.needs || {}
    return {
        card: n.card || 0,
        blessing: n.blessing || 0,
        photo: n.photo || 0,
    }
}

/** Total entries a recipe consumes. */
export function capacityCount(recipe) {
    const n = needsOf(recipe)
    return n.card + n.blessing + n.photo
}

export default { RECIPES, SLOT_KINDS, mirrorRecipe, needsOf, capacityCount }
