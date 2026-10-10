import { describe, expect, it } from 'vitest'
import {
    QR_PRESETS,
    DEFAULT_QR_STYLE,
    normalizeHex,
    contrastRatio,
    qrStyleProblem,
    normalizeQrStyle,
    styleFromSearchParams,
    qrPngPath,
    colorParam,
    presetFor,
    qrSvg,
    DENSITY_OPTIONS,
    SHAPE_OPTIONS,
} from '@/lib/qrStyle'
import QRCode from 'qrcode'

describe('colours', () => {
    it('normalises short and upper-case hex, rejects everything else', () => {
        expect(normalizeHex('#ABC')).toBe('#aabbcc')
        expect(normalizeHex(' #0D1F4D ')).toBe('#0d1f4d')
        expect(normalizeHex('0d1f4d')).toBe(null)
        expect(normalizeHex('red')).toBe(null)
        expect(normalizeHex(null)).toBe(null)
    })

    it('black on white is 21:1', () => {
        expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    })

    it('the route accepts colours with or without the hash', () => {
        expect(colorParam('0d1f4d')).toBe('#0d1f4d')
        expect(colorParam('#0d1f4d')).toBe('#0d1f4d')
        expect(colorParam('')).toBe(null)
    })
})

describe('what may be printed', () => {
    it('every preset scans', () => {
        for (const p of QR_PRESETS) expect(qrStyleProblem(p)).toBe(null)
    })

    it('refuses an inverted code (light modules on a dark field)', () => {
        expect(qrStyleProblem({ dark: '#ffffff', light: '#0d1f4d' })).toMatch(/כהה יותר/)
    })

    it('refuses a pair too close to tell apart', () => {
        expect(qrStyleProblem({ dark: '#777777', light: '#999999' })).toMatch(/ניגודיות/)
    })

    it('refuses a junk colour', () => {
        expect(qrStyleProblem({ dark: 'gold', light: '#ffffff' })).toMatch(/לא תקין/)
    })
})

describe('normalizeQrStyle', () => {
    it('falls back to black on white when the pair would not scan', () => {
        expect(normalizeQrStyle({ dark: '#eeeeee', light: '#ffffff', margin: 3 })).toEqual({ ...DEFAULT_QR_STYLE, margin: 3 })
    })

    it('density and shape are one of the offered options, else the default', () => {
        expect(normalizeQrStyle({ ec: 'h', shape: 'DOTS' })).toMatchObject({ ec: 'H', shape: 'dots' })
        expect(normalizeQrStyle({ ec: 'Q', shape: 'hexagon' })).toMatchObject({ ec: 'M', shape: 'square' })
        expect(DENSITY_OPTIONS.map(o => o.id)).toEqual(['L', 'M', 'H'])
        expect(SHAPE_OPTIONS.map(o => o.id)).toEqual(['square', 'rounded', 'dots'])
    })

    it('keeps a good pair and clamps the margin', () => {
        expect(normalizeQrStyle({ dark: '#0D1F4D', light: '#fff', margin: '40' })).toEqual({ dark: '#0d1f4d', light: '#ffffff', margin: 8, ec: 'M', shape: 'square' })
        expect(normalizeQrStyle({ dark: '#0d1f4d', light: '#ffffff', margin: -2 })).toMatchObject({ margin: 0 })
        expect(normalizeQrStyle({ dark: '#0d1f4d', light: '#ffffff', margin: 'x' })).toMatchObject({ margin: 2 })
    })

    it('reads a query string the way the download link writes it', () => {
        const path = qrPngPath('abcd1234', { dark: '#8a6a24', light: '#fbf6ea', margin: 1 }, 1200)
        expect(path.startsWith('/api/admin/qrcodes/png?')).toBe(true)
        const sp = new URL('https://x' + path).searchParams
        expect(sp.get('code')).toBe('abcd1234')
        expect(sp.get('size')).toBe('1200')
        expect(sp.get('dark')).toBe('8a6a24')
        const parsed = styleFromSearchParams(new URLSearchParams({ dark: colorParam(sp.get('dark')), light: colorParam(sp.get('light')), margin: sp.get('margin'), ec: sp.get('ec'), shape: sp.get('shape') }))
        expect(parsed).toEqual({ dark: '#8a6a24', light: '#fbf6ea', margin: 1, ec: 'M', shape: 'square' })
    })

    it('names the preset a style came from, or custom', () => {
        expect(presetFor({ dark: '#0d1f4d', light: '#ffffff' })).toBe('navy')
        expect(presetFor({ dark: '#123456', light: '#ffffff' })).toBe('custom')
    })
})

describe('qrSvg', () => {
    const url = 'https://app.weddingtales.co.il/q/abcd1234'
    const count = (svg, tag) => (svg.match(new RegExp(`<${tag} `, 'g')) || []).length

    it('draws one dark element per dark module plus the background', () => {
        const qr = QRCode.create(url, { errorCorrectionLevel: 'M' })
        const dark = Array.from(qr.modules.data).filter(Boolean).length
        const svg = qrSvg(qr.modules, { dark: '#000000', light: '#ffffff', margin: 2, ec: 'M', shape: 'square' }, 330)
        expect(count(svg, 'rect')).toBe(dark + 1)
        expect(svg).toContain('width="330" height="330"')
        expect(svg).toContain('fill="#ffffff"')
    })

    it('a lower density is a smaller matrix', () => {
        const l = QRCode.create(url, { errorCorrectionLevel: 'L' }).modules.size
        const h = QRCode.create(url, { errorCorrectionLevel: 'H' }).modules.size
        expect(l).toBeLessThan(h)
    })

    it('dots keep the three finder patterns as squares', () => {
        const qr = QRCode.create(url, { errorCorrectionLevel: 'M' })
        const svg = qrSvg(qr.modules, { dark: '#0d1f4d', light: '#ffffff', margin: 2, ec: 'M', shape: 'dots' }, 600)
        // 3 finders × 33 dark modules each (7×7 ring + 3×3 core), + background
        expect(count(svg, 'rect')).toBe(3 * 33 + 1)
        expect(count(svg, 'circle')).toBeGreaterThan(100)
    })

    it('square modules land on whole pixels so nothing anti-aliases', () => {
        const qr = QRCode.create(url, { errorCorrectionLevel: 'L' })
        const svg = qrSvg(qr.modules, { dark: '#000000', light: '#ffffff', margin: 2, ec: 'L', shape: 'square' }, 1200)
        const coords = [...svg.matchAll(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)].flatMap(m => m.slice(1, 5))
        expect(coords.length).toBeGreaterThan(0)
        expect(coords.every(c => /^\d+$/.test(c))).toBe(true)
    })

    it('a bad colour pair is drawn black on white, not inverted', () => {
        const qr = QRCode.create(url, { errorCorrectionLevel: 'L' })
        const svg = qrSvg(qr.modules, { dark: '#ffffff', light: '#000000' }, 300)
        expect(svg).toContain('fill="#ffffff"/>')
        expect(svg).toContain('fill="#000000"')
        expect(svg.indexOf('fill="#ffffff"')).toBeLessThan(svg.indexOf('fill="#000000"'))
    })
})
