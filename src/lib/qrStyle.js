// src/lib/qrStyle.js
//
// How a printed QR looks: two colours and a quiet-zone width. That is
// the whole "design" surface on purpose — a QR with gradients, logos
// or rounded modules scans worse on a phone pointed at a sticker in
// a dim hall, and every one of those is a support call on the night
// of the event. Colour is the lever that is safe: a dark-on-light
// code in the event's palette reads exactly as well as black on white
// as long as the contrast stays high, which `normalizeQrStyle`
// enforces by refusing pairs that are too close in luminance.
//
// Pure, no Firebase, no React: used by the admin panel (preview +
// download link), the PNG route (parse + validate query params) and
// the tests.

export const QR_PRESETS = [
    { id: 'classic', label: 'קלאסי', dark: '#000000', light: '#ffffff' },
    { id: 'gold', label: 'זהב', dark: '#8a6a24', light: '#fbf6ea' },
    { id: 'navy', label: 'נייבי', dark: '#0d1f4d', light: '#ffffff' },
    { id: 'wine', label: 'יין', dark: '#5c1a2a', light: '#fdf4f1' },
    { id: 'forest', label: 'יער', dark: '#1f4d3a', light: '#f3f8f1' },
    { id: 'ink', label: 'דיו על קרם', dark: '#1a1410', light: '#f4ecd9' },
]

export const DEFAULT_QR_STYLE = { dark: '#000000', light: '#ffffff', margin: 2 }

const HEX = /^#([0-9a-f]{6})$/i

export function isHexColor(value) {
    return typeof value === 'string' && HEX.test(value.trim())
}

// Short #abc → #aabbcc, lower-case, trimmed. Anything else → null.
export function normalizeHex(value) {
    if (typeof value !== 'string') return null
    const v = value.trim().toLowerCase()
    if (/^#[0-9a-f]{3}$/.test(v)) return '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]
    return HEX.test(v) ? v : null
}

// Relative luminance per WCAG, 0 (black) … 1 (white).
export function luminance(hex) {
    const h = normalizeHex(hex)
    if (!h) return 0
    const ch = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c =>
        c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
    )
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

export function contrastRatio(a, b) {
    const la = luminance(a)
    const lb = luminance(b)
    const [hi, lo] = la > lb ? [la, lb] : [lb, la]
    return (hi + 0.05) / (lo + 0.05)
}

// Scanners want roughly 3:1 or better between modules and background,
// and the DARK colour has to actually be the darker one — most phone
// decoders assume dark modules on a light field and simply fail on
// an inverted code.
export const MIN_QR_CONTRAST = 3

export function qrStyleProblem(style) {
    const dark = normalizeHex(style && style.dark)
    const light = normalizeHex(style && style.light)
    if (!dark || !light) return 'צבע לא תקין'
    if (luminance(dark) >= luminance(light)) return 'הצבע הכהה חייב להיות כהה יותר מהרקע'
    if (contrastRatio(dark, light) < MIN_QR_CONTRAST) return 'הניגודיות נמוכה מדי — הברקוד לא ייסרק'
    return null
}

// Clamp + default. Invalid colours fall back to the defaults rather
// than throwing, so a hand-edited query string still yields a code.
export function normalizeQrStyle(input) {
    const src = input && typeof input === 'object' ? input : {}
    let dark = normalizeHex(src.dark) || DEFAULT_QR_STYLE.dark
    let light = normalizeHex(src.light) || DEFAULT_QR_STYLE.light
    if (qrStyleProblem({ dark, light })) {
        dark = DEFAULT_QR_STYLE.dark
        light = DEFAULT_QR_STYLE.light
    }
    const m = Number.parseInt(src.margin, 10)
    const margin = Number.isFinite(m) ? Math.min(8, Math.max(0, m)) : DEFAULT_QR_STYLE.margin
    return { dark, light, margin }
}

export function styleFromSearchParams(searchParams) {
    const get = k => (searchParams && typeof searchParams.get === 'function' ? searchParams.get(k) : null)
    return normalizeQrStyle({ dark: get('dark'), light: get('light'), margin: get('margin') })
}

// The URL the admin panel downloads; colours travel without the '#'
// so the link is copy-pasteable without encoding.
export function qrPngPath(code, style, size = 1200) {
    const s = normalizeQrStyle(style)
    const q = new URLSearchParams({
        code: String(code || ''),
        size: String(size),
        dark: s.dark.slice(1),
        light: s.light.slice(1),
        margin: String(s.margin),
    })
    return `/api/admin/qrcodes/png?${q.toString()}`
}

// The PNG route receives colours without '#'; accept both.
export function colorParam(value) {
    if (typeof value !== 'string') return null
    const v = value.trim()
    if (!v) return null
    return v.startsWith('#') ? v : '#' + v
}

export function presetFor(style) {
    const s = normalizeQrStyle(style)
    const hit = QR_PRESETS.find(p => p.dark === s.dark && p.light === s.light)
    return hit ? hit.id : 'custom'
}
