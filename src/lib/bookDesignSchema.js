// src/lib/bookDesignSchema.js
//
// THE single source of truth for what a book design object contains.
//
// The bug this kills: presets used to be applied by MERGING their
// values over whatever styleSettings the wedding had accumulated —
// previous presets, manual tweaks (font size, bold, alignment), or
// legacy fields. Any key the new preset didn't define survived from
// the past, so the SAME preset rendered differently per wedding /
// per user ("the text stayed right-aligned from the previous preset",
// "the photo sits lower here", "margins don't match").
//
// The rule now: applying a preset is a FULL RESET. The design that
// gets rendered and persisted is always
//
//     { ...CANONICAL_STYLE_DEFAULTS, ...presetValues }
//
// so every key the page templates read is explicitly present, and
// nothing from a previous design can haunt the new one.
//
// CANONICAL_STYLE_DEFAULTS mirrors BookPageTemplate's own `??`
// fallbacks 1:1 (null means "let the template chain to its runtime
// fallback", e.g. nameColor → fontColor). A design equal to the
// defaults renders pixel-identical to a virgin book — so this is a
// correctness change, not a visual redesign.
//
// Pure JS, no imports — usable from client components, server routes
// (Admin SDK paths) and unit tests alike.

// ── Preset architecture — the four layers every preset is built from ─
//
//   1. COMPOSITION  — how entries become pages: `template` (page
//      renderer), `blessingTemplate` (separate renderer for text-only
//      pages), `autoSplit`/`splitThreshold` (long blessing → 2 pages),
//      `entriesPerPage` (1 = classic, 2 = duo: two blessings share one
//      elegantly divided page; duo ignores autoSplit).
//   2. SURFACE      — the page itself: `backgroundColor`,
//      `backgroundUrl` (unified gallery), `texture`, `frame` (page
//      overlay).
//   3. TYPOGRAPHY   — fonts, sizes (as % of page edge), weights,
//      colors, alignment for the body and the guest name.
//   4. PHOTO        — the photo slot: `imageStyle` (width % + radius),
//      margins, `photoFrame` (built-in code-drawn frame), and
//      `photoFrameUrl`/`photoFrameInset` (uploaded overlay artwork).
//
// A preset = canonical defaults + any overrides. Rendering and
// persisting always go through applyPresetClean(), so every layer is
// fully specified and deterministic.
export const CANONICAL_STYLE_DEFAULTS = {
    // ── Layout / behavior (composition) ──────────────────────────────
    template: 'classic',
    blessingTemplate: null, // null/'inherit' → main template everywhere
    autoSplit: false,
    splitThreshold: 240,
    entriesPerPage: 1, // 1 = page per blessing; 2 = duo page

    // ── Page surface ─────────────────────────────────────────────────
    backgroundColor: '#ffffff',
    backgroundUrl: null, // unified background (spring 2026); wins over texture
    texture: null,
    frame: null,

    // ── Typography ───────────────────────────────────────────────────
    fontClass: null, // next/font className; null → template's font stack
    fontClassLatin: null, // separate face for English blessings
    nameFontClass: null, // null → fontClass
    fontColor: '#000000',
    nameColor: null, // null → fontColor
    fontSizePercent: 3, // % of page height
    nameFontSizePercent: null, // null → fontSizePercent * 0.7
    fontWeight: null, // null → the font file's natural weight
    nameFontWeight: null, // null → fontWeight

    // ── Alignment ────────────────────────────────────────────────────
    textAlign: 'center', // 'auto' | 'right' | 'center' | 'left'
    nameAlign: 'center',
    imageAlign: 'center', // 'left' | 'center' | 'right'

    // ── Name block ───────────────────────────────────────────────────
    // nameMarginTop 1 (was 2): the name hugs the top of the page —
    // user feedback was that pages "start too low". pagePadding still
    // provides the base 4% breathing room; authors who want more air
    // have the studio slider.
    nameMarginTop: 1, // % of page height
    nameMarginBottom: 1,
    nameMaxWidth: 60, // % of page width

    // ── Photo block (4:3-locked slot) ────────────────────────────────
    imageStyle: { width: 80, borderRadius: '12px' },
    // 'cover' (default) crops into the uniform 4:3 slot; 'contain' NEVER
    // crops — the photo-album mode (books of photos, no blessings).
    photoFit: 'cover',
    imageMarginTop: 2,
    imageMarginBottom: 2,
    photoFrame: null, // built-in frame id from PHOTO_FRAMES (null = none)
    photoFrameUrl: null, // uploaded overlay PNG/SVG (wins over photoFrame)
    photoFrameInset: 6, // % of slot width the photo insets under an overlay

    // ── Text block ───────────────────────────────────────────────────
    textMaxWidth: 85, // % of page width
    textMarginTop: 0,
    textLineHeight: 1.5,

    // ── Page box ─────────────────────────────────────────────────────
    pagePadding: 4, // % of page height
    borderRadius: 0, // % of page width

    // ── Long-blessing font fitting (null = template's smart default) ─
    fontFitTarget: null,
    fontMinFactor: null,
}

function isPlainObject(v) {
    return v != null && typeof v === 'object' && !Array.isArray(v)
}

// Apply a preset (or fill a stored design) over the canonical schema.
// Always returns a NEW, JSON-safe object (no undefined values — the
// Firestore client SDK rejects them) where every canonical key exists.
// `imageStyle` merges one level deep so a preset that only sets width
// still gets the canonical borderRadius, and vice-versa.
export function applyPresetClean(values) {
    const v = isPlainObject(values) ? values : {}
    // Drop explicit `undefined` values BEFORE merging — a spread would
    // copy them over the canonical default, and the JSON round-trip
    // below would then erase the key entirely, breaking the "every
    // canonical key always exists" guarantee.
    const defined = {}
    for (const [key, val] of Object.entries(v)) {
        if (val !== undefined) defined[key] = val
    }
    const out = { ...CANONICAL_STYLE_DEFAULTS, ...defined }
    out.imageStyle = {
        ...CANONICAL_STYLE_DEFAULTS.imageStyle,
        ...(isPlainObject(defined.imageStyle) ? defined.imageStyle : {}),
    }
    // JSON round-trip: strips any remaining `undefined` (Firestore-safe)
    // and detaches every nested reference from the caller's object.
    return JSON.parse(JSON.stringify(out))
}
