import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const photo = readFileSync('src/app/wedding/[weddingId]/photo/page.js', 'utf8')
const thanks = readFileSync('src/app/wedding/[weddingId]/thanks/page.js', 'utf8')

describe('what the guest sees after writing', () => {
    it('the form footer no longer sells the free product, it opens the sales page with a reference', () => {
        expect(photo).not.toContain("'/start?utm_source=guest_page'")
        expect(photo).toContain('https://weddingtales.co.il/?utm_source=guest_page')
        expect(photo).toContain('ref=${encodeURIComponent(weddingId)}')
    })

    it('the thanks page can pass the link on and write another blessing', () => {
        expect(thanks).toContain("t('shareCta')")
        expect(thanks).toContain('https://wa.me/?text=')
        expect(thanks).toContain("t('writeAnother')")
        expect(thanks).toContain('/wedding/${weddingId}/photo')
    })

    it('the sales hook on the thanks page opens the sales page, not a chat', () => {
        expect(thanks).not.toContain('wa.link/z4a85t')
        expect(thanks).toContain('https://weddingtales.co.il/?utm_source=guest_thanks')
    })
})

describe('the blessing form keeps a draft', () => {
    it('saves name and text per event for the tab, and drops them on send', () => {
        expect(photo).toContain('wt_draft_${weddingId}')
        expect(photo).toContain('window.sessionStorage.setItem(draftKey')
        expect(photo).toContain('window.sessionStorage.removeItem(draftKey)')
    })

    it('declares the event id before it builds the draft key', () => {
        // a render-time ReferenceError here blanks the whole guest form
        const decl = photo.indexOf('const { weddingId } = useParams()', photo.indexOf('function PhotoApp'))
        expect(decl).toBeGreaterThan(-1)
        expect(photo.indexOf('const draftKey')).toBeGreaterThan(decl)
    })
})
