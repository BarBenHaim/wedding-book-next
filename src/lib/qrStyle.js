// src/lib/qrStyle.js
//
// How a printed QR looks: two colours, a quiet-zone width, a density
// and a module shape. Deliberately nothing else — no logo in the
// middle, no gradient — because a phone pointed at a sticker in a dim
// hall needs dark modules on a light field with the three finder
// squares intact, and every "creative" QR that breaks that is a
// support call on the night of the event.
//
// Colour: any pair, as long as the contrast stays high and the dark
// one is darker (`qrStyleProblem`). Density: the error-correction
// level — L is the sparsest matrix (fewest modules, cleanest look),
// H the densest and the one that survives a scratched sticker. Shape:
// square, rounded or dots; the finder patterns are always drawn
// square-ish so detection never depends on the shape.
//
// Pure, no Firebase, no React: used by the admin panel (preview +
// download link), the PNG route (parse + validate query params +
// SVG) and the tests.

export const QR_PRESETS = [
    { id: 'classic', label: 'קלאסי', dark: '#000000', light: '#ffffff' },
    { id: 'gold', label: 'זהב', dark: '#8a6a24', light: '#fbf6ea' },
    { id: 'navy', label: 'נייבי', dark: '#0d1f4d', light: '#ffffff' },
    { id: 'wine', label: 'יין', dark: '#5c1a2a', light: '#fdf4f1' },
    { id: 'forest', label: 'יער', dark: '#1f4d3a', light: '#f3f8f1' },
    { id: 'ink', label: 'דיו על קרם', dark: '#1a1410', light: '#f4ecd9' },
]

// Density = error-correction level. Three, on purpose.
export const DENSITY_OPTIONS = [
    { id: 'L', label: 'דליל', hint: 'הכי פחות ריבועים — מראה נקי' },
    { id: 'M', label: 'רגיל', hint: 'האיזון הרגיל' },
    { id: 'H', label: 'צפוף ועמיד', hint: 'שורד מדבקה שרוטה או מקופלת' },
]

export const SHAPE_OPTIONS = [
    { id: 'square', label: 'ריבועים' },
    { id: 'rounded', label: 'מעוגל' },
    { id: 'dots', label: 'נקודות' },
]

export const DEFAULT_QR_STYLE = { dark: '#000000', light: '#ffffff', margin: 2, ec: 'M', shape: 'square' }

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
    const ecRaw = typeof src.ec === 'string' ? src.ec.toUpperCase() : ''
    const ec = DENSITY_OPTIONS.some(o => o.id === ecRaw) ? ecRaw : DEFAULT_QR_STYLE.ec
    const shapeRaw = typeof src.shape === 'string' ? src.shape.toLowerCase() : ''
    const shape = SHAPE_OPTIONS.some(o => o.id === shapeRaw) ? shapeRaw : DEFAULT_QR_STYLE.shape
    return { dark, light, margin, ec, shape }
}

export function styleFromSearchParams(searchParams) {
    const get = k => (searchParams && typeof searchParams.get === 'function' ? searchParams.get(k) : null)
    return normalizeQrStyle({ dark: get('dark'), light: get('light'), margin: get('margin'), ec: get('ec'), shape: get('shape') })
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
        ec: s.ec,
        shape: s.shape,
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

// ── Drawing ──────────────────────────────────────────────────────────
// `modules` is what the `qrcode` package's create() returns under
// .modules: { size, data } with data[row * size + col] truthy for a
// dark module. The SVG is sized `px` square including the quiet zone,
// so the PNG route rasterises it 1:1 and the panel shows the same
// picture it will download.

function isFinder(row, col, size) {
    const inTL = row < 7 && col < 7
    const inTR = row < 7 && col >= size - 7
    const inBL = row >= size - 7 && col < 7
    return inTL || inTR || inBL
}

export function qrSvg(modules, style, px = 1200) {
    const s = normalizeQrStyle(style)
    const size = modules && Number.isInteger(modules.size) ? modules.size : 0
    const data = modules && modules.data ? modules.data : []
    const total = size + s.margin * 2
    const unit = total > 0 ? px / total : 0
    // Module edges snap to whole pixels (like the qrcode package's own
    // renderer) so squares rasterise with no anti-aliased seams —
    // decoders read a 1200px square code with fractional module edges
    // worse than a 300px one. Round shapes are drawn inside the same
    // snapped cell.
    const edge = i => Math.round((i + s.margin) * unit)
    const crisp = s.shape === 'square' ? 'crispEdges' : 'geometricPrecision'
    const parts = []
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}" shape-rendering="${crisp}">`)
    parts.push(`<rect width="${px}" height="${px}" fill="${s.light}"/>`)
    const f = n => Number(n.toFixed(2))
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            if (!data[row * size + col]) continue
            const x = edge(col), y = edge(row)
            const w = edge(col + 1) - x, h = edge(row + 1) - y
            const finder = isFinder(row, col, size)
            if (s.shape === 'dots' && !finder) {
                parts.push(`<circle cx="${f(x + w / 2)}" cy="${f(y + h / 2)}" r="${f(Math.min(w, h) * 0.42)}" fill="${s.dark}"/>`)
            } else if (s.shape === 'rounded' || (s.shape === 'dots' && finder)) {
                // Finder modules in dots mode get the rounded square so the
                // three corners stay the solid blocks the detector expects.
                parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${f(Math.min(w, h) * 0.3)}" fill="${s.dark}"/>`)
            } else {
                parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${s.dark}"/>`)
            }
        }
    }
    parts.push('</svg>')
    return parts.join('')
}

export function presetFor(style) {
    const s = normalizeQrStyle(style)
    const hit = QR_PRESETS.find(p => p.dark === s.dark && p.light === s.light)
    return hit ? hit.id : 'custom'
}
