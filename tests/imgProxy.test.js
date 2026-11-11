import { describe, expect, it } from 'vitest'
import { parseImgRequest, snapWidth, clampQuality, cacheControlFor, outputFormat, WIDTHS, DEFAULT_QUALITY } from '@/lib/imgProxy'

const SITE = 'https://app.weddingtales.co.il'
const FB = 'https://firebasestorage.googleapis.com/v0/b/some-bucket.firebasestorage.app/o/weddings%2Fabc%2Fphoto.jpg?alt=media&token=t-1'
const ask = (url, w = 128, q) => parseImgRequest(new URLSearchParams({ url, w: String(w), ...(q ? { q: String(q) } : {}) }), SITE)

describe('image resizer: reading the request', () => {
    it('accepts a guest upload on Firebase Storage, exactly as the portal and the mobile app send it', () => {
        const r = ask(FB, 128, 72)
        expect(r.ok).toBe(true)
        expect(r.src).toBe(FB)
        expect(r.width).toBe(128)
        expect(r.quality).toBe(72)
        expect(r.ownApi).toBe(false)
    })

    it('accepts a path on our own site and makes it absolute', () => {
        const r = ask('/logo-wt.png', 640)
        expect(r.ok).toBe(true)
        expect(r.src).toBe(`${SITE}/logo-wt.png`)
        expect(r.ownApi).toBe(false)
    })

    it('knows a token-gated book photo is private', () => {
        const r = ask(`${SITE}/api/book-photo/w1/e1?token=abc`, 828)
        expect(r.ok).toBe(true)
        expect(r.ownApi).toBe(true)
        expect(cacheControlFor(r)).toMatch(/^private/)
        expect(cacheControlFor(ask(FB))).toMatch(/^public/)
    })

    it('refuses anything that is not one of our sources', () => {
        for (const url of [
            'https://evil.example/x.jpg',
            '//evil.example/x.jpg',
            '/\\evil.example/x.jpg',
            'http://firebasestorage.googleapis.com/v0/b/x/o/y.jpg',
            'https://firebasestorage.googleapis.com.evil.example/x.jpg',
            'https://user:pw@firebasestorage.googleapis.com/x.jpg',
            'https://firebasestorage.googleapis.com:8443/x.jpg',
            'http://169.254.169.254/latest/meta-data',
            'http://localhost:3000/secret',
            'file:///etc/passwd',
            'data:image/png;base64,AAAA',
            'javascript:alert(1)',
        ]) {
            expect(ask(url).ok, url).toBe(false)
        }
    })

    it('never resizes its own output', () => {
        expect(ask('/api/img?url=%2Flogo-wt.png&w=64').ok).toBe(false)
        expect(ask(`${SITE}/_next/image?url=%2Flogo-wt.png&w=64`).ok).toBe(false)
        expect(ask('/api/imgs/real-file.png').ok).toBe(true)
    })

    it('needs a url and a width', () => {
        expect(parseImgRequest(new URLSearchParams({ w: '64' }), SITE).ok).toBe(false)
        expect(parseImgRequest(new URLSearchParams({ url: FB }), SITE).ok).toBe(false)
        expect(ask(FB, 'abc').ok).toBe(false)
        expect(ask(FB, -5).ok).toBe(false)
        expect(ask('x'.repeat(3001)).ok).toBe(false)
    })
})

describe('image resizer: sizes, quality, format', () => {
    it('rounds a width up to the next one we keep, and caps it', () => {
        expect(snapWidth(1)).toBe(WIDTHS[0])
        expect(snapWidth(100)).toBe(128)
        expect(snapWidth(640)).toBe(640)
        expect(snapWidth(641)).toBe(750)
        expect(snapWidth(99999)).toBe(WIDTHS[WIDTHS.length - 1])
        // Every size the portal asks for is one we produce as asked.
        for (const w of [64, 96, 128, 256, 384, 640, 750, 828, 1080]) expect(snapWidth(w)).toBe(w)
    })

    it('keeps quality inside sane bounds', () => {
        expect(clampQuality(72)).toBe(72)
        expect(clampQuality(75)).toBe(75)
        expect(clampQuality(undefined)).toBe(DEFAULT_QUALITY)
        expect(clampQuality('x')).toBe(DEFAULT_QUALITY)
        expect(clampQuality(1)).toBe(40)
        expect(clampQuality(100)).toBe(90)
    })

    it('sends webp to whoever accepts it, otherwise jpeg, or png when there is transparency', () => {
        expect(outputFormat('image/avif,image/webp,image/*', false)).toBe('webp')
        expect(outputFormat('image/webp', true)).toBe('webp')
        expect(outputFormat('image/*', false)).toBe('jpeg')
        expect(outputFormat('', true)).toBe('png')
        expect(outputFormat(null, false)).toBe('jpeg')
    })
})
