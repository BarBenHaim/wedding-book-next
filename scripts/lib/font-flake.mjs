// scripts/lib/font-flake.mjs
//
// Did this build fail only because of Google Fonts? Used by next-build.mjs
// to decide whether building again can help. Pure, so it can be tested.

export const MAX_ATTEMPTS = 5
export const RETRY_DELAY_MS = 15_000

// What next/font prints when the download from Google is the problem:
//  - the loader crashing on a font URL it cannot parse,
//  - Google not answering, or answering without the font.
const FONT_ERRORS = [/An error occurred in `next\/font`/, /Failed to fetch `[^`]+` from Google Fonts/, /Failed to fetch font (file from|`)/]

// A real mistake in the code must not be retried, even when a font error is
// printed next to it.
const REAL_ERRORS = [/Module not found/, /Syntax ?Error/, /Type error:/, /ESLint:/, /Unknown font/, /Unknown (weight|subset|style)/, /Missing (weight|subset)/]

export function isFontFlake(output) {
    const text = String(output || '')
    if (!FONT_ERRORS.some(re => re.test(text))) return false
    return !REAL_ERRORS.some(re => re.test(text))
}
