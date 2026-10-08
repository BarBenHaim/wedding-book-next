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
} from '@/lib/qrStyle'

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

    it('keeps a good pair and clamps the margin', () => {
        expect(normalizeQrStyle({ dark: '#0D1F4D', light: '#fff', margin: '40' })).toEqual({ dark: '#0d1f4d', light: '#ffffff', margin: 8 })
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
        const parsed = styleFromSearchParams(new URLSearchParams({ dark: colorParam(sp.get('dark')), light: colorParam(sp.get('light')), margin: sp.get('margin') }))
        expect(parsed).toEqual({ dark: '#8a6a24', light: '#fbf6ea', margin: 1 })
    })

    it('names the preset a style came from, or custom', () => {
        expect(presetFor({ dark: '#0d1f4d', light: '#ffffff' })).toBe('navy')
        expect(presetFor({ dark: '#123456', light: '#ffffff' })).toBe('custom')
    })
})
