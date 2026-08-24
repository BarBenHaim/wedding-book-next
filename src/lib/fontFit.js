// src/lib/fontFit.js
//
// How much a long blessing shrinks so that it still fits its page.
//
// The rule lived twice — once in BookPageTemplate, once in
// DuoPageLayout — with the same shape and different constants. It now
// needs a third caller, and that third caller is the reason to pull it
// out: the per-page editor has to tell the operator what their font-size
// slider will ACTUALLY render as.
//
// Without that, the control lies. Set a page to 5% on a long blessing
// and the book renders 3.1%, because the fit factor quietly multiplies
// it down. The slider would sit there reading 5, the page would not
// change, and the only way to find out why is to read the template.
//
// Three copies of a formula is three chances to drift, and drift here is
// invisible until a printed book comes back with text that does not
// match what the screen promised.

/** The readable floor. Text never shrinks below this share of its size. */
export const DEFAULT_MIN_FACTOR = 0.62

/** Character counts past which a classic page starts to shrink. */
export const PAGE_FIT_TARGET = { withImage: 230, textOnly: 360 }

/** Half a page holds far less, so the shrink starts much earlier. */
export const DUO_FIT_TARGET = { withImage: 110, textOnly: 200 }

/** The size a blessing renders at when nothing overrides it. */
export const BASE_FONT_PERCENT = 3

/**
 * The raw curve: 1 up to `target` characters, then sqrt-decay to a floor.
 *
 * sqrt rather than linear because the text block is two-dimensional —
 * halving the font roughly quarters the area a paragraph needs, so a
 * linear shrink overshoots badly on the long ones.
 */
export function fitFactor(textLength, target, minFactor = DEFAULT_MIN_FACTOR) {
    const t = Number(target)
    if (!Number.isFinite(t) || t <= 0) return 1
    const floor = Number.isFinite(minFactor) ? minFactor : DEFAULT_MIN_FACTOR
    const rawLen = Number(textLength)
    const len = Number.isFinite(rawLen) && rawLen > 0 ? rawLen : 0
    return Math.max(floor, Math.min(1, Math.sqrt(t / Math.max(len, t))))
}

/**
 * The floor for these settings.
 *
 * `Number.isFinite` on the raw value, deliberately: a string "0.8" is
 * NOT accepted, exactly as the templates behaved before this module
 * existed. Setting it to 1 disables the shrink entirely, which is how
 * the page editor offers "do not shrink this one".
 */
export function minFactorOf(styleSettings) {
    const v = styleSettings?.fontMinFactor
    return Number.isFinite(v) ? v : DEFAULT_MIN_FACTOR
}

/** What a classic page does. Honours a per-preset `fontFitTarget`. */
export function pageFitFactor({ textLength = 0, hasImage = false, styleSettings = {} } = {}) {
    const explicit = styleSettings?.fontFitTarget
    const target = Number.isFinite(explicit)
        ? explicit
        : (hasImage ? PAGE_FIT_TARGET.withImage : PAGE_FIT_TARGET.textOnly)
    return fitFactor(textLength, target, minFactorOf(styleSettings))
}

/**
 * What a two-up page does.
 *
 * Deliberately ignores `fontFitTarget`: that number is tuned against a
 * whole page, and a half page that adopted it would barely shrink at
 * all. Only the floor is shared.
 */
export function duoFitFactor({ textLength = 0, hasImage = false, styleSettings = {} } = {}) {
    const target = hasImage ? DUO_FIT_TARGET.withImage : DUO_FIT_TARGET.textOnly
    return fitFactor(textLength, target, minFactorOf(styleSettings))
}

/**
 * The size the blessing actually renders at, in page-height percent.
 *
 * `?? BASE_FONT_PERCENT` rather than a Number() coercion, to match the
 * templates: an explicit null means "unset", and a zero would mean an
 * invisible page rather than a default one.
 */
export function effectiveFontPercent(styleSettings, factor, scale = 1) {
    const base = styleSettings?.fontSizePercent ?? BASE_FONT_PERCENT
    const f = Number.isFinite(factor) ? factor : 1
    return base * scale * f
}

/** The guest name rides at this share of the body text by default. */
export const NAME_TO_BODY_RATIO = 0.7

/** And this when there is no body size to ride on. */
export const BASE_NAME_PERCENT = 2.1

/**
 * The guest name's size in page-height percent.
 *
 * The name has no size of its own unless someone sets one: it follows
 * the body text at 70%, so raising the blessing size raises the name
 * with it and the page keeps its proportions. That rule was written out
 * in four files — both page templates, the start wizard and the studio
 * slider — which is four chances for a book to render one thing while a
 * control claims another.
 *
 * `!= null` rather than a truthiness check, matching the `??` the
 * templates used: a stored 0 is a deliberate (if strange) choice, while
 * null means "unset, follow the body".
 */
export function nameFontPercent(styleSettings, scale = 1) {
    const explicit = styleSettings?.nameFontSizePercent
    if (explicit !== null && explicit !== undefined) return explicit * scale
    const body = styleSettings?.fontSizePercent
    return (body ? body * NAME_TO_BODY_RATIO : BASE_NAME_PERCENT) * scale
}

export default {
    DEFAULT_MIN_FACTOR, PAGE_FIT_TARGET, DUO_FIT_TARGET, BASE_FONT_PERCENT,
    NAME_TO_BODY_RATIO, BASE_NAME_PERCENT,
    fitFactor, minFactorOf, pageFitFactor, duoFitFactor, effectiveFontPercent,
    nameFontPercent,
}
