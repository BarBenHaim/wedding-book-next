// spacingContract.test.js
//
// The "once and for all" spacing contract:
//
//   1. Every layout fallback hard-coded in BookPageTemplate (`?? n`)
//      must EQUAL the canonical default in bookDesignSchema. If they
//      ever drift, a preset that omits a key renders differently in a
//      legacy doc (template fallback) vs a freshly-applied design
//      (canonical fill) — the exact class of "the same preset looks
//      different here and there" bugs this suite exists to kill.
//
//   2. The classic page stays TOP-ANCHORED: `justify-center` may only
//      appear behind the centerBlock condition (single-element /
//      photo-less pages). This keeps the studio spacing sliders
//      literal — "0 from the top" means the top.
//
// Reading the component SOURCE keeps the test dependency-free (no DOM,
// no next/font, no image imports) while still guarding the contract.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CANONICAL_STYLE_DEFAULTS as D } from '../src/lib/bookDesignSchema'

const src = readFileSync(
    resolve(__dirname, '../src/components/BookPageTemplate/BookPageTemplate.jsx'),
    'utf8'
)

// Extract `styleSettings.<key> ?? <number>` fallbacks from the source.
function fallbackOf(key) {
    const m = src.match(new RegExp(`styleSettings\\.${key}\\s*\\?\\?\\s*([\\d.]+)`))
    return m ? Number(m[1]) : undefined
}

describe('spacing contract: template fallbacks === canonical defaults', () => {
    const KEYS = [
        'pagePadding',
        'nameMarginTop',
        'nameMarginBottom',
        'nameMaxWidth',
        'imageMarginTop',
        'imageMarginBottom',
        'textMarginTop',
        'textMaxWidth',
        'fontSizePercent',
    ]

    for (const key of KEYS) {
        it(`${key}: template fallback matches canonical (${D[key]})`, () => {
            expect(fallbackOf(key)).toBe(D[key])
        })
    }

    it('imageStyle.width: template fallback matches canonical', () => {
        const m = src.match(/styleSettings\.imageStyle\?\.width\s*\?\?\s*([\d.]+)/)
        expect(m && Number(m[1])).toBe(D.imageStyle.width)
    })
})

describe('spacing contract: top anchoring', () => {
    it('justify-center appears ONLY behind the centerBlock condition (+ the divider leaf)', () => {
        // Allowed uses: the _divider ornament page (always centered by
        // design) and the centerBlock conditional. Anything beyond these
        // two means someone re-centered the classic page — which breaks
        // the "sliders are literal distances from the top" promise.
        expect(src).toMatch(/centerBlock \? 'justify-center'/)
        const occurrences = src.match(/justify-center/g) || []
        expect(occurrences.length).toBe(2)
    })

    it('margins are literal (no auto vertical margins on the content)', () => {
        expect(src).not.toMatch(/marginTop:\s*'auto'/)
        expect(src).not.toMatch(/marginBottom:\s*'auto'/)
    })
})
