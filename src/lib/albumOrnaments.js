// src/lib/albumOrnaments.js
//
// The decoration, drawn rather than uploaded.
//
// A design language needs tape, a stamp, a torn paper edge, a route
// across a map. The obvious way to get those is a folder of PNGs — and
// it is the wrong way, for three reasons that only show up later:
// a raster asset is fixed at one size and one colour, so a language
// cannot be recoloured or a page printed at a different trim; every new
// ornament is a file somebody has to make; and the print export has to
// fetch each one, which is another way for a PDF to come out different
// from the screen.
//
// So every ornament here is a pure function returning an SVG string.
// They take the language's own colours, they scale to any page, they
// weigh nothing, and there is no network in the print path.
//
// ── Determinism ──────────────────────────────────────────────────────
//
// Ornaments look hand-placed: tape at a slight angle, a stamp rotated a
// few degrees, a torn edge with an irregular profile. That irregularity
// must be REPRODUCIBLE, because the PDF is rendered in a separate pass
// from the screen and a book printed with different tape angles from
// the one the customer approved is a defect. So there is no Math.random
// anywhere in this file: every wobble comes from `rand(seed)`, a small
// deterministic generator, and the seed is derived from the page index
// and the ornament's position in it.

/** Mulberry-ish: a tiny deterministic PRNG. Same seed, same page. */
export function rand(seed) {
    let t = (Number(seed) || 1) >>> 0
    return () => {
        t += 0x6d2b79f5
        let x = Math.imul(t ^ (t >>> 15), 1 | t)
        x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296
    }
}

/** A number in [min,max] from a seeded generator. */
export const between = (r, min, max) => min + r() * (max - min)

const esc = s => String(s).replace(/"/g, "'")

/**
 * Washi tape. Two of these hold a photograph to the page, and they are
 * the single cheapest way to make a layout read as hand-made.
 */
export function tape({ w = 120, h = 34, color = '#e8dcc0', seed = 1 } = {}) {
    const r = rand(seed)
    // Torn short edges: a jagged profile down each end rather than a cut.
    const jag = (x, dir) => {
        const steps = 6
        let d = ''
        for (let i = 0; i <= steps; i++) {
            const y = (h / steps) * i
            const off = (i % 2 ? 1 : -1) * between(r, 1, 3.6) * dir
            d += `${i ? 'L' : 'M'}${(x + off).toFixed(2)},${y.toFixed(2)}`
        }
        return d
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<path d="${jag(3, 1)} L${w - 3},${h} ${jag(w - 3, -1).replace('M', 'L')} Z" fill="${esc(color)}" fill-opacity="0.62"/>
<path d="M0,${(h * 0.32).toFixed(1)} L${w},${(h * 0.28).toFixed(1)}" stroke="#ffffff" stroke-opacity="0.28" stroke-width="1.5"/>
</svg>`
}

/** A passport stamp: two rings, a rule, and a place name. */
export function stamp({ size = 120, color = '#8a5a3b', text = '', sub = '', seed = 2 } = {}) {
    const r = rand(seed)
    const c = size / 2
    const ring = c - 6
    // A stamp is never printed evenly — one arc always comes out light.
    const gap = between(r, 0.12, 0.3)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
<g fill="none" stroke="${esc(color)}" stroke-opacity="0.55" stroke-width="2">
<circle cx="${c}" cy="${c}" r="${ring}" stroke-dasharray="${(ring * 6).toFixed(0)} ${(ring * gap).toFixed(0)}"/>
<circle cx="${c}" cy="${c}" r="${ring - 7}" stroke-width="1"/>
</g>
<line x1="${c - ring + 14}" y1="${c}" x2="${c + ring - 14}" y2="${c}" stroke="${esc(color)}" stroke-opacity="0.4" stroke-width="1"/>
<text x="${c}" y="${c - 6}" text-anchor="middle" font-family="Georgia, serif" font-size="${(size * 0.13).toFixed(1)}" fill="${esc(color)}" fill-opacity="0.72" letter-spacing="2">${esc(text)}</text>
<text x="${c}" y="${c + 16}" text-anchor="middle" font-family="Georgia, serif" font-size="${(size * 0.085).toFixed(1)}" fill="${esc(color)}" fill-opacity="0.6" letter-spacing="1.5">${esc(sub)}</text>
</svg>`
}

/**
 * Map lines. Not a real map — a suggestion of one: a few contour
 * curves and a grid, which is all the eye needs to read "chart" behind
 * a photograph without competing with it.
 */
export function mapLines({ w = 400, h = 400, color = '#8a7a5c', seed = 3, density = 5 } = {}) {
    const r = rand(seed)
    let out = ''
    for (let i = 0; i < density; i++) {
        const y = between(r, 0.1, 0.9) * h
        const a = between(r, 12, 40)
        const k = between(r, 1.4, 3.2)
        let d = `M0,${y.toFixed(1)}`
        for (let x = 0; x <= w; x += w / 14) {
            d += ` L${x.toFixed(1)},${(y + Math.sin((x / w) * Math.PI * k) * a).toFixed(1)}`
        }
        out += `<path d="${d}" fill="none" stroke="${esc(color)}" stroke-opacity="${(0.10 + r() * 0.10).toFixed(2)}" stroke-width="1"/>`
    }
    for (let i = 1; i < 5; i++) {
        const x = (w / 5) * i
        out += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="${esc(color)}" stroke-opacity="0.055" stroke-width="1"/>`
        const y = (h / 5) * i
        out += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${esc(color)}" stroke-opacity="0.055" stroke-width="1"/>`
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${out}</svg>`
}

/** A dashed flight path with a pin at each end. */
export function route({ w = 280, h = 120, color = '#8a5a3b', seed = 4 } = {}) {
    const r = rand(seed)
    const lift = between(r, 0.45, 0.72)
    const d = `M14,${h - 16} Q${w / 2},${(h * (1 - lift)).toFixed(1)} ${w - 14},${h - 30}`
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<path d="${d}" fill="none" stroke="${esc(color)}" stroke-opacity="0.5" stroke-width="1.6" stroke-dasharray="6 5" stroke-linecap="round"/>
<circle cx="14" cy="${h - 16}" r="4" fill="${esc(color)}" fill-opacity="0.62"/>
<circle cx="${w - 14}" cy="${h - 30}" r="4" fill="${esc(color)}" fill-opacity="0.62"/>
</svg>`
}

/** A location pin, for a page that names a place. */
export function pin({ size = 34, color = '#8a5a3b' } = {}) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 34" width="${size}" height="${(size * 34) / 24}">
<path d="M12 1c-5 0-9 4-9 9 0 6.6 9 23 9 23s9-16.4 9-23c0-5-4-9-9-9z" fill="none" stroke="${esc(color)}" stroke-opacity="0.6" stroke-width="1.6"/>
<circle cx="12" cy="10" r="3.2" fill="${esc(color)}" fill-opacity="0.55"/>
</svg>`
}

/**
 * A torn paper strip, used as a band behind a title or along an edge.
 * The tear is on the long side only — a strip torn on all four sides
 * reads as a shape, not as paper.
 */
export function tornStrip({ w = 400, h = 90, color = '#f3ece0', seed = 6 } = {}) {
    const r = rand(seed)
    const steps = 18
    let top = `M0,${(h * 0.16).toFixed(1)}`
    for (let i = 1; i <= steps; i++) {
        const x = (w / steps) * i
        top += ` L${x.toFixed(1)},${(h * 0.16 + between(r, -4, 4)).toFixed(1)}`
    }
    let bot = ` L${w},${(h * 0.86).toFixed(1)}`
    for (let i = steps - 1; i >= 0; i--) {
        const x = (w / steps) * i
        bot += ` L${x.toFixed(1)},${(h * 0.86 + between(r, -4, 4)).toFixed(1)}`
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<path d="${top}${bot} Z" fill="${esc(color)}"/>
</svg>`
}

/** Two hairline rules meeting at a corner. The quietest ornament here. */
export function cornerRule({ size = 70, color = '#aa8840', weight = 1 } = {}) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
<path d="M0,${size} L0,0 L${size},0" fill="none" stroke="${esc(color)}" stroke-opacity="0.5" stroke-width="${weight}"/>
</svg>`
}

/**
 * Page frames — the border drawn on the PAGE rather than around a photo.
 *
 * Four of them, because a frame is a strong statement and one frame
 * repeated on forty pages is wallpaper. They are generated at the page's
 * own size so the inset stays proportional at any trim, and they take
 * the language's ink, so an editorial book gets a hairline where a
 * travel book gets a brown rule.
 */
export function frameRule({ w = 1000, h = 1000, inset = 0.045, color = '#000', weight = 1 } = {}) {
    const i = Math.min(w, h) * inset
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<rect x="${i.toFixed(1)}" y="${i.toFixed(1)}" width="${(w - i * 2).toFixed(1)}" height="${(h - i * 2).toFixed(1)}"
 fill="none" stroke="${esc(color)}" stroke-opacity="0.42" stroke-width="${weight}"/>
</svg>`
}

export function frameDouble({ w = 1000, h = 1000, inset = 0.04, gap = 0.014, color = '#000' } = {}) {
    const m = Math.min(w, h)
    const i = m * inset
    const j = i + m * gap
    const box = (k, op, sw) => `<rect x="${k.toFixed(1)}" y="${k.toFixed(1)}" width="${(w - k * 2).toFixed(1)}" height="${(h - k * 2).toFixed(1)}" fill="none" stroke="${esc(color)}" stroke-opacity="${op}" stroke-width="${sw}"/>`
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${box(i, 0.5, 1.6)}${box(j, 0.3, 0.8)}</svg>`
}

/** Four corner brackets. A frame that implies the rectangle without
 *  closing it — quieter than a rule and much harder to get wrong. */
export function frameBrackets({ w = 1000, h = 1000, inset = 0.05, arm = 0.1, color = '#000', weight = 1.2 } = {}) {
    const m = Math.min(w, h)
    const i = m * inset
    const a = m * arm
    const L = i, R = w - i, T = i, B = h - i
    const paths = [
        `M${L},${T + a} L${L},${T} L${L + a},${T}`,
        `M${R - a},${T} L${R},${T} L${R},${T + a}`,
        `M${R},${B - a} L${R},${B} L${R - a},${B}`,
        `M${L + a},${B} L${L},${B} L${L},${B - a}`,
    ]
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
${paths.map(d => `<path d="${d}" fill="none" stroke="${esc(color)}" stroke-opacity="0.5" stroke-width="${weight}"/>`).join('')}
</svg>`
}

/** Two vertical rules. Reads as a column measure rather than a border,
 *  which suits a page holding one tall photograph. */
export function frameSides({ w = 1000, h = 1000, inset = 0.055, color = '#000', weight = 1 } = {}) {
    const i = Math.min(w, h) * inset
    const y0 = h * 0.08, y1 = h * 0.92
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<line x1="${i.toFixed(1)}" y1="${y0}" x2="${i.toFixed(1)}" y2="${y1}" stroke="${esc(color)}" stroke-opacity="0.4" stroke-width="${weight}"/>
<line x1="${(w - i).toFixed(1)}" y1="${y0}" x2="${(w - i).toFixed(1)}" y2="${y1}" stroke="${esc(color)}" stroke-opacity="0.4" stroke-width="${weight}"/>
</svg>`
}

export const PAGE_FRAMES = { rule: frameRule, double: frameDouble, brackets: frameBrackets, sides: frameSides }

/** A page frame as a data: URI, sized to the page it will cover. */
export function pageFrameUrl(kind, opts = {}) {
    const fn = PAGE_FRAMES[kind]
    return fn ? 'data:image/svg+xml;utf8,' + encodeURIComponent(fn(opts)) : null
}

export const ORNAMENTS = { tape, stamp, mapLines, route, pin, tornStrip, cornerRule }

/** An ornament as a data: URI, ready for a CSS background or an <img>. */
export function ornamentUrl(name, opts = {}) {
    const fn = ORNAMENTS[name]
    if (!fn) return null
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(fn(opts))
}
