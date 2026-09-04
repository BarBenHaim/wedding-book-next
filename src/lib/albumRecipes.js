// src/lib/albumRecipes.js
//
// The layout library — what a designer would call "the roughs".
//
// A recipe is NOT a template with photos poured into holes. It is a
// description of a page's intent: how many pictures it wants, what
// shapes it would prefer them to be, where each one sits, how it meets
// the paper, and what decoration the page can carry. The planner scores
// recipes against the photographs actually in hand and picks the one
// that fits — so the design responds to the pictures instead of the
// pictures being forced into the design.
//
// ── Coordinates ──────────────────────────────────────────────────────
//
// `area` is [x, y, w, h] normalised to the PAGE, not to a content box.
// Recipes therefore own their own margins, which is the only way a
// recipe can legitimately run to the edge while its neighbour keeps a
// wide quiet border. The design language supplies a default margin for
// the fallback engine; recipes here set their own.
//
// ── The rule that survives ───────────────────────────────────────────
//
// A photograph is FITTED INSIDE its area, never cropped to it: the area
// is a region of the page the picture may occupy, not a hole it must
// fill. The one exception is an `ambient` layer, which is a second,
// decorative copy of a photo behind the real one — see albumScene.js
// for why that is not a loophole.

/** prefer: 'landscape' | 'portrait' | 'square' | 'wide' | 'any' */

export const RECIPES = [
    // ── One picture ──────────────────────────────────────────────────
    {
        id: 'plate', worlds: ['editorial','travel','heritage'],
        label: 'לוח',
        density: 'low',
        slots: [{
            role: 'hero', prefer: 'any', area: [0.13, 0.15, 0.74, 0.70],
            treatments: ['framed', 'card', 'plain'], rotate: [0, 0],
        }],
        ornaments: [{ name: 'cornerRule', at: [0.07, 0.09], size: 0.09 },
                    { name: 'cornerRule', at: [0.93, 0.91], size: 0.09, flip: true }],
    },
    {
        id: 'plate-fade', worlds: ['editorial','travel','heritage'],
        label: 'לוח מתמוסס',
        density: 'low',
        slots: [{
            role: 'hero', prefer: 'landscape', area: [0.05, 0.10, 0.90, 0.66],
            treatments: ['soft-edge'], fade: 'bottom', fadeDepth: 0.5, rotate: [0, 0],
        }],
        title: { at: [0.5, 0.85], align: 'center', size: 'large' },
    },
    {
        id: 'panorama-band', worlds: ['editorial','travel','heritage'],
        label: 'פס פנורמי',
        density: 'low',
        slots: [{
            role: 'hero', prefer: 'wide', area: [0.04, 0.30, 0.92, 0.40],
            treatments: ['plain', 'soft-edge'], fade: 'sides', fadeDepth: 0.13, rotate: [0, 0],
        }],
        ornaments: [{ name: 'route', at: [0.5, 0.16], size: 0.34 }],
        title: { at: [0.5, 0.81], align: 'center', size: 'small' },
    },
    {
        id: 'ambient-plate', worlds: ['travel','heritage'],
        label: 'לוח על גוון',
        density: 'low',
        // The page is washed in the photograph's own colour, and the
        // photograph itself sits on that wash whole.
        ambient: { from: 0, style: 'tone' },
        slots: [{
            role: 'hero', prefer: 'portrait', area: [0.18, 0.12, 0.64, 0.68],
            treatments: ['framed', 'card'], rotate: [-1.2, 1.2],
        }],
        title: { at: [0.5, 0.89], align: 'center', size: 'small' },
    },

    // ── Two pictures ─────────────────────────────────────────────────
    {
        id: 'hero-inset', worlds: ['editorial','travel','heritage'],
        label: 'ראשית עם שיבוץ',
        density: 'medium',
        slots: [
            { role: 'hero', prefer: 'landscape', area: [0.03, 0.07, 0.66, 0.72],
              treatments: ['soft-edge'], fade: 'right', fadeDepth: 0.34, rotate: [0, 0], z: 1 },
            { role: 'accent', prefer: 'portrait', area: [0.55, 0.44, 0.38, 0.44],
              treatments: ['framed', 'card'], rotate: [-3.5, -1.5], z: 3 },
        ],
        ornaments: [{ name: 'tape', at: [0.62, 0.44], size: 0.16, rotate: -18 }],
        title: { at: [0.08, 0.90], align: 'start', size: 'large' },
    },
    {
        id: 'editorial-step', worlds: ['editorial','heritage'],
        label: 'מדרגה',
        density: 'medium',
        slots: [
            { role: 'hero', prefer: 'any', area: [0.07, 0.09, 0.42, 0.48],
              treatments: ['plain', 'framed'], rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.51, 0.43, 0.42, 0.48],
              treatments: ['plain', 'framed'], rotate: [0, 0] },
        ],
        title: { at: [0.07, 0.94], align: 'start', size: 'small' },
    },
    {
        id: 'quiet-pair', worlds: ['editorial','heritage'],
        label: 'זוג שקט',
        density: 'low',
        slots: [
            { role: 'hero', prefer: 'any', area: [0.09, 0.13, 0.38, 0.74], treatments: ['plain'], rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.53, 0.13, 0.38, 0.74], treatments: ['plain'], rotate: [0, 0] },
        ],
    },
    {
        id: 'taped-duo', worlds: ['travel'],
        label: 'שניים מודבקים',
        density: 'medium',
        slots: [
            { role: 'hero', prefer: 'any', area: [0.06, 0.10, 0.50, 0.52],
              treatments: ['framed'], rotate: [-2.5, -0.8], z: 2 },
            { role: 'support', prefer: 'any', area: [0.42, 0.42, 0.50, 0.50],
              treatments: ['framed'], rotate: [1.2, 3.2], z: 3 },
        ],
        ornaments: [
            { name: 'tape', at: [0.09, 0.11], size: 0.15, rotate: -32 },
            { name: 'tape', at: [0.88, 0.90], size: 0.15, rotate: 24 },
        ],
    },

    // ── Three pictures ───────────────────────────────────────────────
    {
        id: 'hero-stack', worlds: ['editorial','travel','heritage'],
        label: 'ראשית וטור',
        density: 'medium',
        slots: [
            { role: 'hero', prefer: 'landscape', area: [0.06, 0.11, 0.55, 0.62], treatments: ['framed', 'plain'], rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.65, 0.11, 0.29, 0.29], treatments: ['plain'], rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.65, 0.44, 0.29, 0.29], treatments: ['plain'], rotate: [0, 0] },
        ],
        title: { at: [0.06, 0.84], align: 'start', size: 'medium' },
    },
    {
        id: 'polaroids', worlds: ['travel'],
        label: 'שלושה פולארויד',
        density: 'high',
        slots: [
            { role: 'support', prefer: 'any', area: [0.04, 0.16, 0.34, 0.42], treatments: ['card'], rotate: [-4.5, -2], z: 1 },
            { role: 'hero', prefer: 'any', area: [0.33, 0.26, 0.36, 0.46], treatments: ['card'], rotate: [1, 2.5], z: 3 },
            { role: 'support', prefer: 'any', area: [0.63, 0.14, 0.33, 0.42], treatments: ['card'], rotate: [3, 5], z: 2 },
        ],
        ornaments: [{ name: 'tape', at: [0.50, 0.24], size: 0.13, rotate: 6 }],
    },
    {
        id: 'three-band', worlds: ['editorial','heritage'],
        label: 'שלושה בשורה',
        density: 'medium',
        slots: [
            { role: 'support', prefer: 'any', area: [0.05, 0.29, 0.28, 0.42], treatments: ['plain'], rotate: [0, 0] },
            { role: 'hero', prefer: 'any', area: [0.36, 0.24, 0.28, 0.52], treatments: ['plain'], rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.67, 0.29, 0.28, 0.42], treatments: ['plain'], rotate: [0, 0] },
        ],
        title: { at: [0.5, 0.86], align: 'center', size: 'small' },
    },
    {
        id: 'ambient-trio', worlds: ['travel','heritage'],
        label: 'שלישייה על גוון',
        density: 'medium',
        ambient: { from: 0, style: 'tone' },
        slots: [
            { role: 'hero', prefer: 'landscape', area: [0.08, 0.10, 0.60, 0.44], treatments: ['framed'], rotate: [-1.5, 0] },
            { role: 'support', prefer: 'portrait', area: [0.60, 0.36, 0.32, 0.40], treatments: ['framed'], rotate: [2, 3.5], z: 3 },
            { role: 'support', prefer: 'any', area: [0.10, 0.58, 0.40, 0.32], treatments: ['framed'], rotate: [-2.5, -1], z: 2 },
        ],
        ornaments: [{ name: 'stamp', at: [0.86, 0.14], size: 0.16, rotate: -12, needsTitle: true }],
    },

    // ── Four and five ────────────────────────────────────────────────
    {
        id: 'quartet', worlds: ['editorial','heritage'],
        label: 'רביעייה',
        density: 'medium',
        slots: [
            { role: 'support', prefer: 'any', area: [0.07, 0.10, 0.40, 0.37], treatments: ['plain'], rotate: [0, 0] , row: 'a' },
            { role: 'support', prefer: 'any', area: [0.53, 0.10, 0.40, 0.37], treatments: ['plain'], rotate: [0, 0] , row: 'a' },
            { role: 'support', prefer: 'any', area: [0.07, 0.53, 0.40, 0.37], treatments: ['plain'], rotate: [0, 0] , row: 'b' },
            { role: 'support', prefer: 'any', area: [0.53, 0.53, 0.40, 0.37], treatments: ['plain'], rotate: [0, 0] , row: 'b' },
        ],
    },
    {
        id: 'scatter-four', worlds: ['travel'],
        label: 'ארבעה פזורים',
        density: 'high',
        slots: [
            { role: 'hero', prefer: 'any', area: [0.05, 0.07, 0.44, 0.44], treatments: ['framed'], rotate: [-3, -1], z: 1 },
            { role: 'support', prefer: 'any', area: [0.53, 0.13, 0.36, 0.32], treatments: ['framed'], rotate: [2, 4], z: 2 },
            { role: 'support', prefer: 'any', area: [0.10, 0.53, 0.36, 0.34], treatments: ['framed'], rotate: [1.5, 3], z: 3 },
            { role: 'accent', prefer: 'any', area: [0.52, 0.50, 0.40, 0.40], treatments: ['framed'], rotate: [-4, -2], z: 4 },
        ],
        ornaments: [
            { name: 'tape', at: [0.07, 0.08], size: 0.13, rotate: -38 },
            { name: 'pin', at: [0.93, 0.06], size: 0.06 },
        ],
    },
    {
        id: 'story-strip', worlds: ['editorial','travel','heritage'],
        label: 'ראשית ורצועה',
        density: 'high',
        slots: [
            { role: 'hero', prefer: 'landscape', area: [0.05, 0.08, 0.90, 0.50],
              treatments: ['soft-edge'], fade: 'bottom', fadeDepth: 0.28, rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.05, 0.63, 0.21, 0.26], treatments: ['plain'], rotate: [0, 0], row: 'strip' },
            { role: 'support', prefer: 'any', area: [0.28, 0.63, 0.21, 0.26], treatments: ['plain'], rotate: [0, 0], row: 'strip' },
            { role: 'support', prefer: 'any', area: [0.51, 0.63, 0.21, 0.26], treatments: ['plain'], rotate: [0, 0], row: 'strip' },
            { role: 'support', prefer: 'any', area: [0.74, 0.63, 0.21, 0.26], treatments: ['plain'], rotate: [0, 0], row: 'strip' },
        ],
    },
]

export const RECIPES_BY_ID = Object.fromEntries(RECIPES.map(r => [r.id, r]))

/**
 * Recipes that take exactly this many photographs, in this world.
 *
 * The world filter is what makes three languages three different books
 * rather than one book in three colourways: polaroids and washi tape do
 * not belong in the editorial world at any palette, and a page of four
 * scattered snapshots is not the same page with the tape removed.
 */
export function recipesForCount(n, world = null) {
    return RECIPES.filter(r => r.slots.length === n && (!world || !r.worlds || r.worlds.includes(world)))
}

/** The group sizes any recipe can serve. */
export const SUPPORTED_COUNTS = [...new Set(RECIPES.map(r => r.slots.length))].sort((a, b) => a - b)
