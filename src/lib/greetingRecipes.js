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
// ── What makes a page special, as opposed to correct ─────────────────
//
// Geometry alone produces correct pages and boring books. Three cheap
// multipliers do most of the work of making one feel designed, and all
// three survive html2canvas:
//
//   pageFrame   a drawn edge - a hairline rule, a double rule, corner
//               brackets, two side rules. Reused from albumOrnaments,
//               where they are SVG data URLs and therefore print-safe.
//   treatment   how a photograph meets the paper: plain, framed, a
//               matted card, fading into the page. albumTreatments
//               builds fades as gradient OVERLAYS rather than masks,
//               exactly so they survive the print pass.
//   typography  the part an album does not need and a blessings book
//               lives on. An oversized opening letter, a quotation mark
//               set large and quiet behind the words, the guest's name
//               flanked by hairlines instead of just centred.
//
// A rough may ask for any of them. None is required, and a rough that
// asks for nothing is still a valid, quiet page - which the book needs
// as much as it needs the loud ones.
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
        id: 'classic',
        pageFrame: 'rule',
        typography: { nameStyle: 'rule' }, label: 'קלאסי', density: CALM,
        needs: { card: 1 },
        slots: [{ kind: 'card', area: [0.12, 0.10, 0.76, 0.78], textShare: 0.42, align: 'center' }],
    },
    {
        id: 'portrait-tall',
        pageFrame: 'sides',
        typography: { nameStyle: 'spaced' }, label: 'דיוקן גבוה', density: CALM,
        needs: { card: 1 },
        prefer: { photo: 'portrait' },
        slots: [{ kind: 'card', area: [0.16, 0.06, 0.68, 0.86], textShare: 0.30, align: 'center', treatment: 'framed' }],
    },
    {
        id: 'wide-over-words',
        typography: { initial: true, nameStyle: 'spaced' }, label: 'רחב מעל המילים', density: CALM, mirrorable: true,
        needs: { card: 1 },
        prefer: { photo: 'landscape' },
        slots: [{ kind: 'card', area: [0.08, 0.08, 0.84, 0.80], textShare: 0.46, align: 'start' }],
    },
    {
        // The page for the guest who wrote an essay. No picture competes
        // with it; the photograph gets its own page next door.
        id: 'letter',
        pageFrame: 'brackets',
        typography: { quote: true, initial: true, nameStyle: 'rule' }, label: 'מכתב', density: CALM,
        needs: { blessing: 1 },
        slots: [{ kind: 'blessing', area: [0.14, 0.12, 0.72, 0.74], align: 'center' }],
    },
    {
        id: 'letter-offset',
        typography: { initial: true, nameStyle: 'spaced' },
        ornaments: [{ name: 'cornerRule', at: [0.88, 0.12], size: 0.16 }], label: 'מכתב לא ממורכז', density: CALM, mirrorable: true,
        needs: { blessing: 1 },
        slots: [{ kind: 'blessing', area: [0.10, 0.16, 0.62, 0.66], align: 'start' }],
    },
    {
        id: 'plate-full', label: 'תמונה מלאה', density: CALM,
        needs: { photo: 1 },
        slots: [{ kind: 'photo', area: [0.05, 0.07, 0.90, 0.86], treatment: 'soft-edge', fade: 'bottom', fadeDepth: 0.22 }],
    },
    {
        id: 'plate-framed',
        pageFrame: 'double', label: 'תמונה במסגרת', density: CALM,
        needs: { photo: 1 },
        slots: [{ kind: 'photo', area: [0.14, 0.14, 0.72, 0.68], treatment: 'card' }],
    },
    {
        id: 'band',
        ornaments: [{ name: 'cornerRule', at: [0.5, 0.12], size: 0.14 }], label: 'פס רוחב', density: CALM,
        needs: { photo: 1 },
        prefer: { photo: 'wide' },
        slots: [{ kind: 'photo', area: [0.04, 0.30, 0.92, 0.40], treatment: 'soft-edge', fade: 'sides', fadeDepth: 0.10 }],
    },

    // ══ Two guests ═══════════════════════════════════════════════════
    {
        id: 'two-letters',
        typography: { nameStyle: 'rule' }, label: 'שתי ברכות', density: MEDIUM,
        needs: { blessing: 2 },
        slots: [
            { kind: 'blessing', area: [0.12, 0.08, 0.76, 0.38], align: 'center' },
            { kind: 'blessing', area: [0.12, 0.54, 0.76, 0.38], align: 'center' },
        ],
        divider: { at: 0.5 },
    },
    {
        id: 'words-and-picture',
        typography: { initial: true, nameStyle: 'spaced' }, label: 'מילים ותמונה', density: MEDIUM, mirrorable: true,
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
        id: 'card-and-letter',
        pageFrame: 'rule',
        typography: { nameStyle: 'rule' }, label: 'ברכה מלאה וברכה', density: MEDIUM, mirrorable: true,
        needs: { card: 1, blessing: 1 },
        slots: [
            { kind: 'card', area: [0.07, 0.07, 0.86, 0.52], textShare: 0.34, align: 'center' },
            { kind: 'blessing', area: [0.14, 0.64, 0.72, 0.28], align: 'center' },
        ],
    },

    // ══ Three ════════════════════════════════════════════════════════
    {
        id: 'three-letters',
        typography: { nameStyle: 'spaced' }, label: 'שלוש ברכות', density: BUSY,
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
        id: 'mosaic',
        typography: { nameStyle: 'spaced' }, label: 'פסיפס', density: BUSY, mirrorable: true,
        needs: { card: 1, blessing: 1, photo: 1 },
        slots: [
            { kind: 'card', area: [0.06, 0.06, 0.50, 0.54], textShare: 0.34, align: 'start' },
            { kind: 'photo', area: [0.60, 0.06, 0.34, 0.36], treatment: 'plain' },
            { kind: 'blessing', area: [0.06, 0.66, 0.88, 0.26], align: 'center' },
        ],
    },

    // ══ The editorial pages ══════════════════════════════════════════
    //
    // These are the ones that make somebody stop turning. Each is built
    // around a single idea rather than around fitting things in, which
    // is why several deliberately waste space - the empty two-fifths IS
    // the composition.
    {
        // A blessing set as a pull-quote: short, large, centred in air,
        // with the quotation mark doing the decorating. Scored so only a
        // genuinely short blessing can land here - a long one would fill
        // the air that makes the page work.
        id: 'pull-quote', label: 'ציטוט', density: CALM,
        needs: { blessing: 1 },
        pageFrame: 'brackets',
        typography: { quote: 'large', nameStyle: 'rule', scale: 1.45 },
        maxLength: 150,
        slots: [{ kind: 'blessing', area: [0.16, 0.28, 0.68, 0.40], align: 'center' }],
    },
    {
        // Tall photograph, narrow column of words beside it. The most
        // magazine-like page in the book.
        id: 'column', label: 'טור', density: MEDIUM, mirrorable: true,
        needs: { blessing: 1, photo: 1 },
        prefer: { photo: 'portrait' },
        typography: { initial: true, nameStyle: 'spaced' },
        slots: [
            { kind: 'photo', area: [0.04, 0.06, 0.52, 0.88], treatment: 'plain' },
            { kind: 'blessing', area: [0.62, 0.18, 0.30, 0.60], align: 'center' },
        ],
    },
    {
        // The photograph runs to three edges and the words sit on the
        // quiet quarter. Uses a bottom fade so the type has paper to
        // stand on without a box drawn round it.
        id: 'edge-bleed', label: 'יוצא מהדף', density: CALM,
        needs: { card: 1 },
        prefer: { photo: 'landscape' },
        typography: { nameStyle: 'spaced' },
        slots: [{
            kind: 'card', area: [0.0, 0.0, 1.0, 0.94], textShare: 0.26, align: 'center',
            treatment: 'soft-edge', fade: 'bottom', fadeDepth: 0.34,
        }],
    },
    {
        // Two blessings, unequal on purpose. A symmetrical pair reads as
        // a form; an asymmetrical one reads as a spread.
        id: 'uneven-pair', label: 'זוג לא שווה', density: MEDIUM, mirrorable: true,
        needs: { blessing: 2 },
        typography: { initial: true, nameStyle: 'rule' },
        slots: [
            { kind: 'blessing', area: [0.08, 0.08, 0.84, 0.46], align: 'center' },
            { kind: 'blessing', area: [0.22, 0.62, 0.56, 0.28], align: 'center' },
        ],
        divider: { at: 0.575 },
    },
    {
        // A scrapbook page - the one place the book allows a tilt. The
        // angles are fixed numbers, not random: the PDF pass has to
        // produce the same page as the screen.
        id: 'taped', label: 'מודבק', density: BUSY,
        needs: { photo: 2, blessing: 1 },
        ornaments: [
            { name: 'tape', at: [0.28, 0.09], size: 0.20, rotate: -6 },
            { name: 'tape', at: [0.74, 0.42], size: 0.18, rotate: 5 },
        ],
        typography: { nameStyle: 'spaced' },
        slots: [
            { kind: 'photo', area: [0.08, 0.10, 0.40, 0.34], treatment: 'framed', rotate: -2.2 },
            { kind: 'photo', area: [0.54, 0.43, 0.38, 0.32], treatment: 'framed', rotate: 1.8 },
            { kind: 'blessing', area: [0.10, 0.78, 0.80, 0.16], align: 'center' },
        ],
    },
    {
        // Three guests, one wide picture holding them together.
        id: 'chorus', label: 'מקהלה', density: BUSY,
        needs: { photo: 1, blessing: 3 },
        prefer: { photo: 'wide' },
        typography: { nameStyle: 'spaced' },
        slots: [
            { kind: 'photo', area: [0.06, 0.05, 0.88, 0.34], treatment: 'soft-edge', fade: 'sides', fadeDepth: 0.12 },
            { kind: 'blessing', area: [0.07, 0.45, 0.27, 0.46], align: 'center' },
            { kind: 'blessing', area: [0.37, 0.45, 0.26, 0.46], align: 'center' },
            { kind: 'blessing', area: [0.66, 0.45, 0.27, 0.46], align: 'center' },
        ],
    },
    {
        // A vignette softens all four edges, so the picture sits IN the
        // paper rather than on it. Quiet, and expensive-looking.
        id: 'locket', label: 'מדליון', density: CALM,
        needs: { card: 1 },
        pageFrame: 'double',
        typography: { nameStyle: 'rule', quote: true },
        slots: [{
            kind: 'card', area: [0.14, 0.08, 0.72, 0.78], textShare: 0.34, align: 'center',
            treatment: 'vignette',
        }],
    },
    {
        // Four small pictures and nothing else. A breath between dense
        // pages of words, and the page where a grid is the right answer.
        id: 'grid-four', label: 'ארבע', density: BUSY,
        needs: { photo: 4 },
        pageFrame: 'rule',
        slots: [
            { kind: 'photo', area: [0.07, 0.08, 0.40, 0.38], treatment: 'framed' },
            { kind: 'photo', area: [0.53, 0.08, 0.40, 0.38], treatment: 'framed' },
            { kind: 'photo', area: [0.07, 0.54, 0.40, 0.38], treatment: 'framed' },
            { kind: 'photo', area: [0.53, 0.54, 0.40, 0.38], treatment: 'framed' },
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
