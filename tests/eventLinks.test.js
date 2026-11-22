import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { eventSignUrl } from '@/lib/eventLinks'

describe('eventSignUrl', () => {
    it('points at the printable sign in the personal area', () => {
        expect(eventSignUrl('https://app.weddingtales.co.il', '6301'))
            .toBe('https://app.weddingtales.co.il/wedding/6301/portal?view=poster')
    })

    it('does not double the slash when the base ends with one', () => {
        expect(eventSignUrl('https://app.weddingtales.co.il/', 'abc'))
            .toBe('https://app.weddingtales.co.il/wedding/abc/portal?view=poster')
    })

    it('encodes the event id', () => {
        expect(eventSignUrl('https://x.test', 'a b')).toBe('https://x.test/wedding/a%20b/portal?view=poster')
    })
})

describe('first e-mail after an order', () => {
    const src = readFileSync('src/app/api/createWedding/route.js', 'utf8')

    it('links to the event sign, not the old generic QR sheet', () => {
        expect(src).toContain('eventSignUrl(baseUrl, weddingId)')
        expect(src).not.toContain('/api/generate-qr-pdf')
    })
})
