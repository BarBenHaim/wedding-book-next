// src/lib/albumRecipes.js
//
// The layout library — what a designer would call "the roughs".
//
// A recipe is NOT a template with photos poured into holes. It describes
// a page's intent: how many pictures it wants, what shapes it would
// prefer them to be, where each one sits, how it meets the paper, and
// what decoration the page can carry. The planner scores recipes against
// the photographs actually in hand and picks the one that fits, so the
// design responds to the pictures instead of the pictures being forced
// into the design.
//
// ── Why there are this many ──────────────────────────────────────────
//
// Twenty photographs is four to six pages. With a handful of roughs
// those pages repeat and the album reads as a template no matter how
// good each page is — the failure is not in any page, it is in the
// sequence. So the library covers one to six pictures a page, with
// several genuinely different answers at every count, and the scorer's
// variety penalty makes it reach for them.
//
// Two multipliers keep it larger than it looks. `mirrorable` flips a
// composition horizontally on alternate uses, so a rough that opens left
// also opens right. And a language decides which roughs exist in its
// world at all — tape and polaroids are not an editorial page with the
// tape removed, they are a different book.
//
// ── Coordinates ──────────────────────────────────────────────────────
//
// `area` is [x, y, w, h] normalised to the PAGE, not to a content box,
// so a recipe owns its own margins. That is the only way one rough can
// legitimately run near the edge while its neighbour keeps a wide quiet
// border.
//
// ── The rule that survives ───────────────────────────────────────────
//
// A photograph is FITTED INSIDE its area, never cropped to it: the area
// is a region of the page the picture may occupy, not a hole it must
// fill. The single exception is an `ambient` layer — a decorative second
// copy behind the real one. See albumScene.js.

const ALL = ['editorial', 'travel', 'heritage']
const QUIET = ['editorial', 'heritage']
const SCRAPBOOK = ['travel']

export const RECIPES = [
    // ══ One photograph ═══════════════════════════════════════════════
    {
        id: 'plate', label: 'לוח', worlds: ALL, density: 'low',
        pageFrame: 'brackets',
        slots: [{ role: 'hero', prefer: 'any', area: [0.13, 0.15, 0.74, 0.70], treatments: ['framed', 'card', 'plain'], rotate: [0, 0] }],
    },
    {
        id: 'plate-fade', label: 'לוח מתמוסס', worlds: ALL, density: 'low',
        slots: [{ role: 'hero', prefer: 'landscape', area: [0.05, 0.10, 0.90, 0.66], treatments: ['soft-edge'], fade: 'bottom', fadeDepth: 0.5, rotate: [0, 0] }],
        title: { at: [0.5, 0.85], align: 'center', size: 'large' },
    },
    {
        id: 'panorama-band', label: 'פס פנורמי', worlds: ALL, density: 'low',
        slots: [{ role: 'hero', prefer: 'wide', area: [0.04, 0.30, 0.92, 0.40], treatments: ['plain', 'soft-edge'], fade: 'sides', fadeDepth: 0.09, rotate: [0, 0] }],
        ornaments: [{ name: 'route', at: [0.5, 0.16], size: 0.34 }],
        title: { at: [0.5, 0.81], align: 'center', size: 'small' },
    },
    {
        id: 'ambient-plate', label: 'לוח על גוון', worlds: ['travel', 'heritage'], density: 'low',
        ambient: { from: 0, style: 'tone' },
        slots: [{ role: 'hero', prefer: 'portrait', area: [0.18, 0.12, 0.64, 0.68], treatments: ['framed', 'card'], rotate: [-1.2, 1.2] }],
        title: { at: [0.5, 0.89], align: 'center', size: 'small' },
    },
    {
        // Deliberately off-centre. The most editorial page in the book:
        // the composition is the empty two-fifths, not the photograph.
        id: 'plate-offset', label: 'לוח לא ממורכז', worlds: QUIET, density: 'low', mirrorable: true,
        slots: [{ role: 'hero', prefer: 'any', area: [0.06, 0.07, 0.60, 0.60], treatments: ['plain', 'framed'], rotate: [0, 0] }],
        title: { at: [0.94, 0.80], align: 'end', size: 'medium' },
    },
    {
        id: 'plate-tall', label: 'לוח לגובה', worlds: ALL, density: 'low',
        pageFrame: 'sides',
        slots: [{ role: 'hero', prefer: 'portrait', area: [0.26, 0.05, 0.48, 0.90], treatments: ['plain', 'framed'], rotate: [0, 0] }],
    },
    {
        id: 'plate-taped', label: 'לוח מודבק', worlds: SCRAPBOOK, density: 'medium',
        slots: [{ role: 'hero', prefer: 'any', area: [0.14, 0.16, 0.72, 0.64], treatments: ['card'], rotate: [-2.5, -0.8] }],
        ornaments: [
            { name: 'tape', at: [0.17, 0.17], size: 0.17, rotate: -34 },
            { name: 'tape', at: [0.84, 0.80], size: 0.17, rotate: 28 },
            { name: 'stamp', at: [0.85, 0.15], size: 0.15, rotate: -11, needsTitle: true },
        ],
    },

    // ══ Two photographs ══════════════════════════════════════════════
    {
        id: 'hero-inset', label: 'ראשית עם שיבוץ', worlds: ALL, density: 'medium', mirrorable: true,
        slots: [
            { role: 'hero', prefer: 'landscape', area: [0.03, 0.07, 0.66, 0.72], treatments: ['soft-edge'], fade: 'right', fadeDepth: 0.34, rotate: [0, 0], z: 1 },
            { role: 'accent', prefer: 'portrait', area: [0.55, 0.44, 0.38, 0.44], treatments: ['framed', 'card'], rotate: [-3.5, -1.5], z: 3 },
        ],
        ornaments: [{ name: 'tape', at: [0.62, 0.44], size: 0.16, rotate: -18 }],
        title: { at: [0.08, 0.90], align: 'start', size: 'large' },
    },
    {
        id: 'editorial-step', label: 'מדרגה', worlds: QUIET, density: 'medium', mirrorable: true,
        slots: [
            { role: 'hero', prefer: 'any', area: [0.07, 0.09, 0.42, 0.48], treatments: ['plain', 'framed'], rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.51, 0.43, 0.42, 0.48], treatments: ['plain', 'framed'], rotate: [0, 0] },
        ],
        title: { at: [0.07, 0.94], align: 'start', size: 'small' },
    },
    {
        id: 'quiet-pair', label: 'זוג שקט', worlds: QUIET, density: 'low',
        slots: [
            { role: 'hero', prefer: 'any', area: [0.09, 0.13, 0.38, 0.74], treatments: ['plain'], rotate: [0, 0], row: 'p' },
            { role: 'support', prefer: 'any', area: [0.53, 0.13, 0.38, 0.74], treatments: ['plain'], rotate: [0, 0], row: 'p' },
        ],
    },
    {
        id: 'taped-duo', label: 'שניים מודבקים', worlds: SCRAPBOOK, density: 'medium',
        slots: [
            { role: 'hero', prefer: 'any', area: [0.06, 0.10, 0.50, 0.52], treatments: ['framed'], rotate: [-2.5, -0.8], z: 2 },
            { role: 'support', prefer: 'any', area: [0.42, 0.42, 0.50, 0.50], treatments: ['framed'], rotate: [1.2, 3.2], z: 3 },
        ],
        ornaments: [
            { name: 'tape', at: [0.09, 0.11], size: 0.15, rotate: -32 },
            { name: 'tape', at: [0.88, 0.90], size: 0.15, rotate: 24 },
        ],
    },
    {
        id: 'duo-stack', label: 'שניים בערימה', worlds: ALL, density: 'medium',
        slots: [
            { role: 'hero', prefer: 'landscape', area: [0.08, 0.08, 0.84, 0.40], treatments: ['plain'], rotate: [0, 0] },
            { role: 'support', prefer: 'landscape', area: [0.08, 0.52, 0.84, 0.40], treatments: ['plain'], rotate: [0, 0] },
        ],
    },
    {
        id: 'duo-offset', label: 'שניים לא סימטריים', worlds: ALL, density: 'medium', mirrorable: true,
        pageFrame: 'rule',
        slots: [
            { role: 'hero', prefer: 'any', area: [0.08, 0.12, 0.50, 0.62], treatments: ['plain', 'framed'], rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.62, 0.48, 0.30, 0.36], treatments: ['plain', 'framed'], rotate: [0, 0] },
        ],
    },
    {
        id: 'duo-band', label: 'רצועה ותמונה', worlds: ALL, density: 'medium',
        slots: [
            { role: 'hero', prefer: 'wide', area: [0.04, 0.09, 0.92, 0.34], treatments: ['soft-edge', 'plain'], fade: 'sides', fadeDepth: 0.08, rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.31, 0.51, 0.38, 0.40], treatments: ['framed', 'plain'], rotate: [0, 0] },
        ],
    },
    {
        id: 'duo-tall', label: 'שני לגובה', worlds: ALL, density: 'low',
        slots: [
            { role: 'hero', prefer: 'portrait', area: [0.07, 0.09, 0.40, 0.80], treatments: ['plain', 'framed'], rotate: [0, 0], row: 'p' },
            { role: 'support', prefer: 'portrait', area: [0.53, 0.09, 0.40, 0.80], treatments: ['plain', 'framed'], rotate: [0, 0], row: 'p' },
        ],
    },
    {
        id: 'duo-overlap', label: 'שניים חופפים', worlds: SCRAPBOOK, density: 'high',
        ambient: { from: 0, style: 'tone' },
        slots: [
            { role: 'hero', prefer: 'any', area: [0.05, 0.14, 0.54, 0.58], treatments: ['card'], rotate: [-3, -1], z: 1 },
            { role: 'accent', prefer: 'any', area: [0.44, 0.36, 0.48, 0.50], treatments: ['card'], rotate: [2, 4.5], z: 3 },
        ],
        ornaments: [{ name: 'pin', at: [0.92, 0.10], size: 0.06 }],
    },

    // ══ Three photographs ════════════════════════════════════════════
    {
        id: 'hero-stack', label: 'ראשית וטור', worlds: ALL, density: 'medium', mirrorable: true,
        slots: [
            { role: 'hero', prefer: 'landscape', area: [0.06, 0.11, 0.55, 0.62], treatments: ['framed', 'plain'], rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.65, 0.11, 0.29, 0.29], treatments: ['plain'], rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.65, 0.44, 0.29, 0.29], treatments: ['plain'], rotate: [0, 0] },
        ],
        title: { at: [0.06, 0.84], align: 'start', size: 'medium' },
    },
    {
        id: 'polaroids', label: 'שלושה פולארויד', worlds: SCRAPBOOK, density: 'high',
        slots: [
            { role: 'support', prefer: 'any', area: [0.04, 0.16, 0.34, 0.42], treatments: ['card'], rotate: [-4.5, -2], z: 1 },
            { role: 'hero', prefer: 'any', area: [0.33, 0.26, 0.36, 0.46], treatments: ['card'], rotate: [1, 2.5], z: 3 },
            { role: 'support', prefer: 'any', area: [0.63, 0.14, 0.33, 0.42], treatments: ['card'], rotate: [3, 5], z: 2 },
        ],
        ornaments: [{ name: 'tape', at: [0.50, 0.24], size: 0.13, rotate: 6 }],
    },
    {
        id: 'three-band', label: 'שלושה בשורה', worlds: QUIET, density: 'medium',
        slots: [
            { role: 'support', prefer: 'any', area: [0.05, 0.29, 0.28, 0.42], treatments: ['plain'], rotate: [0, 0], row: 'r' },
            { role: 'hero', prefer: 'any', area: [0.36, 0.29, 0.28, 0.42], treatments: ['plain'], rotate: [0, 0], row: 'r' },
            { role: 'support', prefer: 'any', area: [0.67, 0.29, 0.28, 0.42], treatments: ['plain'], rotate: [0, 0], row: 'r' },
        ],
        title: { at: [0.5, 0.86], align: 'center', size: 'small' },
    },
    {
        id: 'ambient-trio', label: 'שלישייה על גוון', worlds: ['travel', 'heritage'], density: 'medium',
        ambient: { from: 0, style: 'tone' },
        slots: [
            { role: 'hero', prefer: 'landscape', area: [0.08, 0.10, 0.60, 0.44], treatments: ['framed'], rotate: [-1.5, 0] },
            { role: 'support', prefer: 'portrait', area: [0.60, 0.36, 0.32, 0.40], treatments: ['framed'], rotate: [2, 3.5], z: 3 },
            { role: 'support', prefer: 'any', area: [0.10, 0.58, 0.40, 0.32], treatments: ['framed'], rotate: [-2.5, -1], z: 2 },
        ],
        ornaments: [{ name: 'stamp', at: [0.86, 0.14], size: 0.16, rotate: -12, needsTitle: true }],
    },
    {
        id: 'trio-column', label: 'עמוד ושניים', worlds: ALL, density: 'medium', mirrorable: true,
        slots: [
            { role: 'hero', prefer: 'portrait', area: [0.06, 0.08, 0.34, 0.84], treatments: ['plain', 'framed'], rotate: [0, 0] },
            { role: 'support', prefer: 'landscape', area: [0.45, 0.08, 0.49, 0.40], treatments: ['plain'], rotate: [0, 0] },
            { role: 'support', prefer: 'landscape', area: [0.45, 0.52, 0.49, 0.40], treatments: ['plain'], rotate: [0, 0] },
        ],
    },
    {
        id: 'trio-diagonal', label: 'שלושה באלכסון', worlds: ALL, density: 'medium', mirrorable: true,
        slots: [
            { role: 'support', prefer: 'any', area: [0.04, 0.05, 0.37, 0.33], treatments: ['plain', 'framed'], rotate: [0, 0], z: 1 },
            { role: 'hero', prefer: 'any', area: [0.31, 0.34, 0.38, 0.34], treatments: ['plain', 'framed'], rotate: [0, 0], z: 2 },
            { role: 'support', prefer: 'any', area: [0.59, 0.63, 0.37, 0.33], treatments: ['plain', 'framed'], rotate: [0, 0], z: 1 },
        ],
    },
    {
        id: 'trio-hero-row', label: 'ראשית ושניים', worlds: ALL, density: 'medium',
        slots: [
            { role: 'hero', prefer: 'landscape', area: [0.05, 0.07, 0.90, 0.48], treatments: ['plain', 'soft-edge'], fade: 'bottom', fadeDepth: 0.22, rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.05, 0.60, 0.44, 0.32], treatments: ['plain'], rotate: [0, 0], row: 's' },
            { role: 'support', prefer: 'any', area: [0.51, 0.60, 0.44, 0.32], treatments: ['plain'], rotate: [0, 0], row: 's' },
        ],
    },
    {
        id: 'trio-inset-frame', label: 'שלושה במסגרת', worlds: QUIET, density: 'low',
        pageFrame: 'double',
        slots: [
            { role: 'support', prefer: 'any', area: [0.13, 0.16, 0.32, 0.30], treatments: ['plain'], rotate: [0, 0], row: 't' },
            { role: 'support', prefer: 'any', area: [0.49, 0.16, 0.32, 0.30], treatments: ['plain'], rotate: [0, 0], row: 't' },
            { role: 'hero', prefer: 'any', area: [0.19, 0.52, 0.62, 0.32], treatments: ['plain'], rotate: [0, 0] },
        ],
    },

    // ══ Four photographs ═════════════════════════════════════════════
    {
        id: 'quartet', label: 'רביעייה', worlds: QUIET, density: 'medium',
        slots: [
            { role: 'support', prefer: 'any', area: [0.07, 0.10, 0.40, 0.37], treatments: ['plain'], rotate: [0, 0], row: 'a' },
            { role: 'support', prefer: 'any', area: [0.53, 0.10, 0.40, 0.37], treatments: ['plain'], rotate: [0, 0], row: 'a' },
            { role: 'support', prefer: 'any', area: [0.07, 0.53, 0.40, 0.37], treatments: ['plain'], rotate: [0, 0], row: 'b' },
            { role: 'support', prefer: 'any', area: [0.53, 0.53, 0.40, 0.37], treatments: ['plain'], rotate: [0, 0], row: 'b' },
        ],
    },
    {
        id: 'scatter-four', label: 'ארבעה פזורים', worlds: SCRAPBOOK, density: 'high',
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
        id: 'four-strip', label: 'ארבעה ברצועה', worlds: ALL, density: 'medium',
        slots: [
            { role: 'support', prefer: 'any', area: [0.04, 0.33, 0.22, 0.34], treatments: ['plain'], rotate: [0, 0], row: 'r' },
            { role: 'support', prefer: 'any', area: [0.28, 0.33, 0.22, 0.34], treatments: ['plain'], rotate: [0, 0], row: 'r' },
            { role: 'support', prefer: 'any', area: [0.52, 0.33, 0.22, 0.34], treatments: ['plain'], rotate: [0, 0], row: 'r' },
            { role: 'support', prefer: 'any', area: [0.76, 0.33, 0.22, 0.34], treatments: ['plain'], rotate: [0, 0], row: 'r' },
        ],
        title: { at: [0.5, 0.83], align: 'center', size: 'small' },
    },
    {
        id: 'four-hero-row', label: 'ראשית ושלושה', worlds: ALL, density: 'medium',
        slots: [
            { role: 'hero', prefer: 'landscape', area: [0.05, 0.07, 0.90, 0.45], treatments: ['plain', 'framed'], rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.05, 0.58, 0.29, 0.32], treatments: ['plain'], rotate: [0, 0], row: 's' },
            { role: 'support', prefer: 'any', area: [0.36, 0.58, 0.29, 0.32], treatments: ['plain'], rotate: [0, 0], row: 's' },
            { role: 'support', prefer: 'any', area: [0.67, 0.58, 0.29, 0.32], treatments: ['plain'], rotate: [0, 0], row: 's' },
        ],
    },
    {
        id: 'four-mosaic', label: 'ארבעה — גדולה וטור', worlds: ALL, density: 'medium', mirrorable: true,
        slots: [
            { role: 'hero', prefer: 'any', area: [0.05, 0.10, 0.52, 0.80], treatments: ['plain', 'framed'], rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.61, 0.10, 0.34, 0.24], treatments: ['plain'], rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.61, 0.38, 0.34, 0.24], treatments: ['plain'], rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.61, 0.66, 0.34, 0.24], treatments: ['plain'], rotate: [0, 0] },
        ],
    },
    {
        id: 'four-pinwheel', label: 'ארבעה בסחרור', worlds: ALL, density: 'high',
        slots: [
            { role: 'hero', prefer: 'landscape', area: [0.05, 0.06, 0.56, 0.34], treatments: ['plain', 'framed'], rotate: [0, 0] },
            { role: 'support', prefer: 'portrait', area: [0.65, 0.06, 0.30, 0.52], treatments: ['plain', 'framed'], rotate: [0, 0] },
            { role: 'support', prefer: 'portrait', area: [0.05, 0.44, 0.30, 0.50], treatments: ['plain', 'framed'], rotate: [0, 0] },
            { role: 'support', prefer: 'landscape', area: [0.39, 0.62, 0.56, 0.32], treatments: ['plain', 'framed'], rotate: [0, 0] },
        ],
    },
    {
        id: 'four-taped-grid', label: 'ארבעה מודבקים', worlds: SCRAPBOOK, density: 'high',
        slots: [
            { role: 'support', prefer: 'any', area: [0.06, 0.09, 0.40, 0.36], treatments: ['card'], rotate: [-2.5, -1], z: 1 },
            { role: 'support', prefer: 'any', area: [0.54, 0.12, 0.40, 0.36], treatments: ['card'], rotate: [1.5, 3], z: 2 },
            { role: 'support', prefer: 'any', area: [0.08, 0.54, 0.40, 0.36], treatments: ['card'], rotate: [2, 3.5], z: 2 },
            { role: 'support', prefer: 'any', area: [0.54, 0.51, 0.40, 0.36], treatments: ['card'], rotate: [-3, -1.5], z: 1 },
        ],
        ornaments: [{ name: 'stamp', at: [0.50, 0.50], size: 0.14, rotate: 8, needsTitle: true }],
    },

    // ══ Five photographs ═════════════════════════════════════════════
    {
        id: 'story-strip', label: 'ראשית ורצועה', worlds: ALL, density: 'high',
        slots: [
            { role: 'hero', prefer: 'landscape', area: [0.05, 0.08, 0.90, 0.50], treatments: ['soft-edge'], fade: 'bottom', fadeDepth: 0.28, rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.05, 0.63, 0.21, 0.26], treatments: ['plain'], rotate: [0, 0], row: 'strip' },
            { role: 'support', prefer: 'any', area: [0.28, 0.63, 0.21, 0.26], treatments: ['plain'], rotate: [0, 0], row: 'strip' },
            { role: 'support', prefer: 'any', area: [0.51, 0.63, 0.21, 0.26], treatments: ['plain'], rotate: [0, 0], row: 'strip' },
            { role: 'support', prefer: 'any', area: [0.74, 0.63, 0.21, 0.26], treatments: ['plain'], rotate: [0, 0], row: 'strip' },
        ],
    },
    {
        id: 'five-mosaic', label: 'חמישה — גדולה ורביעייה', worlds: ALL, density: 'high', mirrorable: true,
        slots: [
            { role: 'hero', prefer: 'any', area: [0.05, 0.10, 0.48, 0.80], treatments: ['plain', 'framed'], rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.57, 0.10, 0.18, 0.37], treatments: ['plain'], rotate: [0, 0], row: 'a' },
            { role: 'support', prefer: 'any', area: [0.77, 0.10, 0.18, 0.37], treatments: ['plain'], rotate: [0, 0], row: 'a' },
            { role: 'support', prefer: 'any', area: [0.57, 0.53, 0.18, 0.37], treatments: ['plain'], rotate: [0, 0], row: 'b' },
            { role: 'support', prefer: 'any', area: [0.77, 0.53, 0.18, 0.37], treatments: ['plain'], rotate: [0, 0], row: 'b' },
        ],
    },
    {
        id: 'five-two-three', label: 'שתיים ושלוש', worlds: ALL, density: 'high',
        slots: [
            { role: 'hero', prefer: 'any', area: [0.06, 0.08, 0.42, 0.40], treatments: ['plain'], rotate: [0, 0], row: 'a' },
            { role: 'support', prefer: 'any', area: [0.52, 0.08, 0.42, 0.40], treatments: ['plain'], rotate: [0, 0], row: 'a' },
            { role: 'support', prefer: 'any', area: [0.06, 0.55, 0.27, 0.36], treatments: ['plain'], rotate: [0, 0], row: 'b' },
            { role: 'support', prefer: 'any', area: [0.365, 0.55, 0.27, 0.36], treatments: ['plain'], rotate: [0, 0], row: 'b' },
            { role: 'support', prefer: 'any', area: [0.67, 0.55, 0.27, 0.36], treatments: ['plain'], rotate: [0, 0], row: 'b' },
        ],
    },
    {
        id: 'five-scatter', label: 'חמישה פזורים', worlds: SCRAPBOOK, density: 'high',
        slots: [
            { role: 'hero', prefer: 'any', area: [0.04, 0.05, 0.40, 0.38], treatments: ['card'], rotate: [-3.5, -1.5], z: 2 },
            { role: 'support', prefer: 'any', area: [0.48, 0.04, 0.32, 0.30], treatments: ['card'], rotate: [2, 4], z: 1 },
            { role: 'support', prefer: 'any', area: [0.62, 0.32, 0.34, 0.32], treatments: ['card'], rotate: [-2, -0.5], z: 3 },
            { role: 'support', prefer: 'any', area: [0.05, 0.48, 0.34, 0.32], treatments: ['card'], rotate: [1.5, 3.5], z: 2 },
            { role: 'accent', prefer: 'any', area: [0.36, 0.60, 0.36, 0.34], treatments: ['card'], rotate: [-3, -1], z: 4 },
        ],
        ornaments: [
            { name: 'tape', at: [0.06, 0.06], size: 0.12, rotate: -40 },
            { name: 'tape', at: [0.94, 0.34], size: 0.12, rotate: 34 },
        ],
    },
    {
        id: 'five-column', label: 'עמוד וארבעה', worlds: ALL, density: 'high', mirrorable: true,
        slots: [
            { role: 'hero', prefer: 'portrait', area: [0.05, 0.07, 0.40, 0.86], treatments: ['plain', 'framed'], rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.50, 0.07, 0.45, 0.19], treatments: ['plain'], rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.50, 0.30, 0.45, 0.19], treatments: ['plain'], rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.50, 0.53, 0.45, 0.19], treatments: ['plain'], rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.50, 0.76, 0.45, 0.17], treatments: ['plain'], rotate: [0, 0] },
        ],
    },

    // ══ Six photographs ══════════════════════════════════════════════
    {
        id: 'six-grid', label: 'שישה ברשת', worlds: QUIET, density: 'high',
        pageFrame: 'rule',
        slots: [
            { role: 'support', prefer: 'any', area: [0.08, 0.14, 0.26, 0.32], treatments: ['plain'], rotate: [0, 0], row: 'a' },
            { role: 'support', prefer: 'any', area: [0.37, 0.14, 0.26, 0.32], treatments: ['plain'], rotate: [0, 0], row: 'a' },
            { role: 'support', prefer: 'any', area: [0.66, 0.14, 0.26, 0.32], treatments: ['plain'], rotate: [0, 0], row: 'a' },
            { role: 'support', prefer: 'any', area: [0.08, 0.54, 0.26, 0.32], treatments: ['plain'], rotate: [0, 0], row: 'b' },
            { role: 'support', prefer: 'any', area: [0.37, 0.54, 0.26, 0.32], treatments: ['plain'], rotate: [0, 0], row: 'b' },
            { role: 'support', prefer: 'any', area: [0.66, 0.54, 0.26, 0.32], treatments: ['plain'], rotate: [0, 0], row: 'b' },
        ],
    },
    {
        id: 'six-hero-five', label: 'ראשית וחמישה', worlds: ALL, density: 'high',
        slots: [
            { role: 'hero', prefer: 'landscape', area: [0.05, 0.07, 0.90, 0.46], treatments: ['soft-edge', 'plain'], fade: 'bottom', fadeDepth: 0.2, rotate: [0, 0] },
            { role: 'support', prefer: 'any', area: [0.05, 0.60, 0.17, 0.30], treatments: ['plain'], rotate: [0, 0], row: 's' },
            { role: 'support', prefer: 'any', area: [0.24, 0.60, 0.17, 0.30], treatments: ['plain'], rotate: [0, 0], row: 's' },
            { role: 'support', prefer: 'any', area: [0.43, 0.60, 0.17, 0.30], treatments: ['plain'], rotate: [0, 0], row: 's' },
            { role: 'support', prefer: 'any', area: [0.62, 0.60, 0.17, 0.30], treatments: ['plain'], rotate: [0, 0], row: 's' },
            { role: 'support', prefer: 'any', area: [0.81, 0.60, 0.14, 0.30], treatments: ['plain'], rotate: [0, 0], row: 's' },
        ],
    },
    {
        id: 'six-scatter', label: 'שישה פזורים', worlds: SCRAPBOOK, density: 'high',
        slots: [
            { role: 'support', prefer: 'any', area: [0.03, 0.05, 0.31, 0.29], treatments: ['card'], rotate: [-3, -1], z: 1 },
            { role: 'hero', prefer: 'any', area: [0.36, 0.03, 0.34, 0.31], treatments: ['card'], rotate: [1, 3], z: 2 },
            { role: 'support', prefer: 'any', area: [0.68, 0.08, 0.29, 0.28], treatments: ['card'], rotate: [-2.5, -0.5], z: 1 },
            { role: 'support', prefer: 'any', area: [0.05, 0.38, 0.30, 0.28], treatments: ['card'], rotate: [2, 4], z: 2 },
            { role: 'support', prefer: 'any', area: [0.34, 0.40, 0.33, 0.30], treatments: ['card'], rotate: [-1.5, 0.5], z: 3 },
            { role: 'accent', prefer: 'any', area: [0.30, 0.66, 0.40, 0.31], treatments: ['card'], rotate: [2.5, 4.5], z: 4 },
        ],
        ornaments: [{ name: 'tape', at: [0.04, 0.05], size: 0.11, rotate: -42 }],
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

/** Horizontal mirror of a recipe — a rough that opens left, opening right. */
export function mirrorRecipe(recipe) {
    const flipArea = ([x, y, w, h]) => [1 - x - w, y, w, h]
    return {
        ...recipe,
        id: recipe.id,
        mirrored: true,
        slots: recipe.slots.map(s => ({ ...s, area: flipArea(s.area), fade: flipFade(s.fade) })),
        ornaments: (recipe.ornaments || []).map(o => ({ ...o, at: [1 - o.at[0], o.at[1]], rotate: -(o.rotate || 0) })),
        title: recipe.title
            ? { ...recipe.title, at: [1 - recipe.title.at[0], recipe.title.at[1]], align: flipAlign(recipe.title.align) }
            : null,
    }
}

const flipFade = f => (f === 'right' ? 'left' : f === 'left' ? 'right' : f)
const flipAlign = a => (a === 'start' ? 'end' : a === 'end' ? 'start' : a)
