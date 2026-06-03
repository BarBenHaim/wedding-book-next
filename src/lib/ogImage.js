// Server-only OG image generator. Builds a 1200×630 PNG for the
// per-wedding share preview that WhatsApp / Facebook / Slack / etc.
// scrape from the page's og:image meta tag.
//
// Approach: pre-extract glyph outlines via opentype.js, emit them as
// raw SVG <path> data, then rasterise with sharp. The rendering
// pipeline never touches a font system.
//
// Why not @font-face + <text>?
//   Two earlier approaches failed:
//   - satori (next/og): RTL+shaping bugs distorted Hebrew glyphs.
//   - sharp + librsvg + @font-face data URI: works locally on
//     Windows but renders tofu boxes on Vercel's Linux build —
//     that librsvg ignores data:font URLs and has no system Hebrew
//     font, so glyphs come out as empty rects.
//
//   Pre-baking glyphs as <path d="…"/> sidesteps the entire font
//   subsystem at raster time. librsvg sees only vector geometry.
//
// Path data quirks that matter:
//   - opentype.js's toPathData() omits Z (close-path) commands and
//     uses minus-as-separator (e.g. "M5.90-59.30"). librsvg in
//     sharp's libvips bundle on Linux fails to fill correctly when
//     either of those happen: the right half of the text vanishes.
//     We emit explicit Z after each subpath AND put a space between
//     every coordinate. With those two changes, identical SVGs
//     render correctly on both platforms.
//
// Visual design: matches public/og/wedding-tales-book.png (the
// static card customers liked) — warm gold gradient, thin gold
// border, subtle corner sparkles, bright cream serif title.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parse as parseFont } from 'opentype.js'
import sharp from 'sharp'

// Font is parsed once per process. opentype.parse wants a true
// ArrayBuffer, not a Node Buffer view. The file is resolved from
// process.cwd(); on Vercel's Node runtime next.config.js's
// outputFileTracingIncludes bundles it into the function package.
let cachedFont = null
function loadFont() {
    if (cachedFont) return cachedFont
    const fontPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSansHebrew-Regular.ttf')
    const buf = readFileSync(fontPath)
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    cachedFont = parseFont(ab)
    return cachedFont
}

// Build an SVG path d="…" string from an opentype.js Path object.
// Every numeric coordinate is space-separated (no minus-as-separator)
// and every subpath gets an explicit Z at the end. Both of those are
// load-bearing — see the file-level comment.
function pathDataFromCommands(commands) {
    const n2 = (v) => v.toFixed(2)
    let out = ''
    let inSubpath = false
    for (const c of commands) {
        if (c.type === 'M') {
            if (inSubpath) out += 'Z '
            out += `M ${n2(c.x)} ${n2(c.y)} `
            inSubpath = true
        } else if (c.type === 'L') {
            out += `L ${n2(c.x)} ${n2(c.y)} `
        } else if (c.type === 'Q') {
            out += `Q ${n2(c.x1)} ${n2(c.y1)} ${n2(c.x)} ${n2(c.y)} `
        } else if (c.type === 'C') {
            out += `C ${n2(c.x1)} ${n2(c.y1)} ${n2(c.x2)} ${n2(c.y2)} ${n2(c.x)} ${n2(c.y)} `
        } else if (c.type === 'Z') {
            out += 'Z '
        }
    }
    if (inSubpath) out += 'Z'
    return out.trim()
}

// Hebrew text → centred SVG <path>. NotoSansHebrew is monocase with
// no contextual shaping, so visually reversing the code points before
// laying out LTR is sufficient to get correct RTL output.
function hebrewTextPath({ font, text, cx, baselineY, size, fill }) {
    const visualOrder = Array.from(text).reverse().join('')
    const width = font.getAdvanceWidth(visualOrder, size)
    const x = cx - width / 2
    const p = font.getPath(visualOrder, x, baselineY, size)
    return `<path d="${pathDataFromCommands(p.commands)}" fill="${fill}"/>`
}

// Latin text with per-glyph letter-spacing (librsvg's letter-spacing
// CSS doesn't apply to text-via-path).
function latinTextPath({ font, text, cx, baselineY, size, fill, letterSpacing = 0 }) {
    const chars = Array.from(text)
    const advances = chars.map((ch) => font.getAdvanceWidth(ch, size))
    const total = advances.reduce((a, b) => a + b, 0) + letterSpacing * (chars.length - 1)
    let x = cx - total / 2
    const parts = []
    for (let i = 0; i < chars.length; i++) {
        const p = font.getPath(chars[i], x, baselineY, size)
        parts.push(`<path d="${pathDataFromCommands(p.commands)}" fill="${fill}"/>`)
        x += advances[i] + letterSpacing
    }
    return parts.join('')
}

// Step the title font size down until the rendered width fits within
// the safe area inside the gold border (~1040 px). max/min are tuned
// so the shortest titles ("ספר הברכות") feel large and confident
// while long compound titles ("ספר הברכות ליום ההולדת של תקווה") still
// fit on one line.
function pickTitleSize({ font, text, maxWidth, max = 96, min = 50 }) {
    const visualOrder = Array.from(text).reverse().join('')
    let size = max
    while (size > min) {
        if (font.getAdvanceWidth(visualOrder, size) <= maxWidth) return size
        size -= 4
    }
    return min
}

/**
 * Build the OG image SVG with glyph outlines pre-baked and rasterise
 * to a PNG buffer.
 *
 * @param {object} opts
 * @param {string} opts.title - The big Hebrew headline, e.g.
 *   "ספר הברכות של נועם" — comes from buildShareCopy(data).title.
 * @param {string} [opts.subtitle]
 * @returns {Promise<Buffer>} PNG buffer, 1200×630.
 */
export async function renderOgImage({ title, subtitle = 'הברכות והתמונות שלכם, נשמרות לתמיד' }) {
    const W = 1200
    const H = 630
    const font = loadFont()

    const titleSize = pickTitleSize({ font, text: title, maxWidth: 1000, max: 96, min: 52 })

    const titlePath = hebrewTextPath({
        font,
        text: title,
        cx: W / 2,
        // y is baseline in opentype coords. The font's bbox extends
        // above baseline by ~0.75 × size and below by ~0.25 × size, so
        // baseline at 330 puts the visual centre of the title around y=300.
        baselineY: 330,
        size: titleSize,
        fill: '#fdf6e3',
    })

    const subtitlePath = hebrewTextPath({
        font,
        text: subtitle,
        cx: W / 2,
        baselineY: 440,
        size: 28,
        fill: '#f0dcb0',
    })

    const wordmarkPath = latinTextPath({
        font,
        text: 'WEDDING TALES',
        cx: W / 2,
        baselineY: 580,
        size: 26,
        fill: '#d8b876',
        letterSpacing: 10,
    })

    // Sparkle ornaments scattered around the corners — small gold
    // diamonds composed of two thin crossed rects. Eyeballed against
    // the customer-loved static image at public/og/wedding-tales-book.png.
    const sparkle = (x, y, r, opacity = 0.7) =>
        `<g transform="translate(${x} ${y}) rotate(45)">
            <rect x="-${r}" y="-${r / 4}" width="${r * 2}" height="${r / 2}" fill="#e8c66a" opacity="${opacity}" rx="${r / 4}"/>
            <rect x="-${r / 4}" y="-${r}" width="${r / 2}" height="${r * 2}" fill="#e8c66a" opacity="${opacity}" rx="${r / 4}"/>
        </g>`

    const sparkles = [
        sparkle(170, 130, 14, 0.75),
        sparkle(1040, 110, 18, 0.85),
        sparkle(1080, 250, 8, 0.55),
        sparkle(140, 280, 10, 0.6),
        sparkle(160, 510, 12, 0.7),
        sparkle(1050, 500, 14, 0.7),
        sparkle(1090, 380, 6, 0.4),
        sparkle(110, 400, 7, 0.45),
        sparkle(230, 70, 5, 0.4),
        sparkle(970, 560, 5, 0.4),
    ].join('')

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
        <defs>
            <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#5b3f1c"/>
                <stop offset="45%" stop-color="#7a5727"/>
                <stop offset="100%" stop-color="#3e2913"/>
            </linearGradient>
            <radialGradient id="glow" cx="50%" cy="42%" r="55%">
                <stop offset="0%" stop-color="#a87b35" stop-opacity="0.55"/>
                <stop offset="100%" stop-color="#a87b35" stop-opacity="0"/>
            </radialGradient>
        </defs>
        <rect width="${W}" height="${H}" fill="url(#bg)"/>
        <rect width="${W}" height="${H}" fill="url(#glow)"/>
        <rect x="28" y="28" width="${W - 56}" height="${H - 56}"
              fill="none" stroke="#d8b876" stroke-opacity="0.65"
              stroke-width="2" rx="22"/>
        <rect x="38" y="38" width="${W - 76}" height="${H - 76}"
              fill="none" stroke="#d8b876" stroke-opacity="0.18"
              stroke-width="1" rx="18"/>
        ${sparkles}
        ${titlePath}
        <line x1="${W / 2 - 70}" y1="380" x2="${W / 2 + 70}" y2="380"
              stroke="#d8b876" stroke-width="2" stroke-opacity="0.85"/>
        ${subtitlePath}
        ${wordmarkPath}
    </svg>`

    return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
}
