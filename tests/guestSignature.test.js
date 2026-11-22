import { describe, it, expect } from 'vitest'
import { readFileSync, statSync, existsSync } from 'fs'
import { SIGNATURE, signatureDesign, signatureKeyFor } from '@/lib/guestSignature'

describe('the Signature guest designs', () => {
    it('a wedding gets the paper, everything else the night', () => {
        expect(signatureKeyFor('wedding')).toBe('paper')
        for (const t of ['bar_mitzvah', 'bat_mitzvah', 'birthday', 'twins_bar_mitzvah', 'poker', undefined]) {
            expect(signatureKeyFor(t)).toBe('night')
        }
    })

    it('hands out a copy, never the shared object', () => {
        const a = signatureDesign('wedding')
        a.pageBg = 'changed'
        expect(signatureDesign('wedding').pageBg).toBe('#F3F0EA')
        expect(Object.isFrozen(SIGNATURE.night)).toBe(true)
    })

    it('covers every key the page needs to look finished, and no old garden colours', () => {
        for (const d of Object.values(SIGNATURE)) {
            for (const k of ['pageBg', 'pageBgImage', 'titleColor', 'subtitleColor', 'cardBg', 'inputBorder', 'inputFocusBorder', 'pillText', 'wellBg', 'buttonGradient', 'buttonTextColor']) {
                expect(d[k], k).toBeTruthy()
            }
            expect(JSON.stringify(d)).not.toMatch(/c9a44e|AA8840/i) // the gold of the old look
        }
    })

    it('uses small local images that exist', () => {
        for (const d of Object.values(SIGNATURE)) {
            const file = d.pageBgImage.match(/url\((\/backgrounds\/[^)]+)\)/)[1]
            const p = `public${file}`
            expect(existsSync(p), p).toBe(true)
            expect(statSync(p).size).toBeLessThan(60 * 1024)
        }
    })
})

describe('where it is used', () => {
    it('a paid order gets it when its event is opened', () => {
        const src = readFileSync('src/app/api/createWedding/route.js', 'utf8')
        expect(src).toContain('signatureDesign(details.fields.eventType)')
        // the event's own fields still win over it
        expect(src.indexOf('signatureDesign(')).toBeLessThan(src.indexOf('...details.fields,'))
    })

    it('the page honours the optional flat-button keys only when a design sets them', () => {
        const page = readFileSync('src/app/wedding/[weddingId]/photo/page.js', 'utf8')
        expect(page).toContain('md.buttonRadius != null')
        expect(page).toContain("md.buttonTextShadow ?? '0 1px 3px rgba(0,0,0,0.45)'")
    })

    it('the live book-page preview is wired into the counter row and loads lazily', () => {
        const page = readFileSync('src/app/wedding/[weddingId]/photo/page.js', 'utf8')
        expect(page).toContain('<LivePagePreviewButton')
        const btn = readFileSync('src/components/LivePagePreview/LivePagePreviewButton.jsx', 'utf8')
        expect(btn).toContain("dynamic(() => import('./PreviewSheet')")
        // the form's first paint must not pull in the book renderer
        expect(btn).not.toContain('BookPageTemplate')
    })
})

describe('the thanks page', () => {
    it('carries the Signature look over from the blessing page, and only that look', () => {
        const src = readFileSync('src/app/wedding/[weddingId]/thanks/page.js', 'utf8')
        expect(src).toContain("includes('/backgrounds/signature-')")
        expect(src).toContain('signature.pageBgImage')
    })
})
