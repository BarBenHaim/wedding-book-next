import { describe, expect, it } from 'vitest'
import { isFontFlake, MAX_ATTEMPTS } from '../scripts/lib/font-flake.mjs'

// The real tail of the Vercel build that failed on 11.11.2026.
const KIT_URL_CRASH = `
   Creating an optimized production build ...
Failed to compile.

src/app/landing/LandingClient.jsx
An error occurred in \`next/font\`.

TypeError: Cannot read properties of null (reading '1')
    at /vercel/path0/node_modules/next/dist/compiled/@next/font/dist/google/loader.js:122:78
    at async nextFontGoogleFontLoader (/vercel/path0/node_modules/next/dist/compiled/@next/font/dist/google/loader.js:104:33)

> Build failed because of webpack errors
`

describe('build: is it only Google Fonts?', () => {
    it('builds again when next/font crashed on what Google sent', () => {
        expect(isFontFlake(KIT_URL_CRASH)).toBe(true)
    })

    it('builds again when Google did not send the font at all', () => {
        expect(isFontFlake('Failed to compile.\n\nsrc/app/fonts.js\n`next/font` error:\nFailed to fetch `Heebo` from Google Fonts.')).toBe(true)
    })

    it('does not retry a real mistake in the code', () => {
        expect(isFontFlake("Failed to compile.\n\n./src/app/page.js\nModule not found: Can't resolve '@/lib/nope'")).toBe(false)
        expect(isFontFlake('Failed to compile.\n\n./src/app/page.js:3:1\nType error: x is not assignable')).toBe(false)
        expect(isFontFlake('Error occurred prerendering page "/login"')).toBe(false)
        expect(isFontFlake('')).toBe(false)
        expect(isFontFlake(undefined)).toBe(false)
    })

    it('does not retry a font we configured wrongly', () => {
        expect(isFontFlake('An error occurred in `next/font`.\n\nUnknown font `Heeboo`')).toBe(false)
        expect(isFontFlake('An error occurred in `next/font`.\n\nUnknown weight `950` for font `Heebo`.')).toBe(false)
        expect(isFontFlake('An error occurred in `next/font`.\n\nMissing weight for font `Assistant`.')).toBe(false)
    })

    it('stops trying after a handful of builds', () => {
        expect(MAX_ATTEMPTS).toBeGreaterThan(1)
        expect(MAX_ATTEMPTS).toBeLessThanOrEqual(6)
    })
})
