// Local rendering smoke-test. Bypasses Next so we can validate the
// opentype.js + sharp pipeline without booting the framework.
// src/lib/ogImage.js is ESM-syntax inside a no-"type":"module"
// package — Next compiles it, but plain Node treats .js as CJS. So
// we duplicate the small public API here. Keep in sync with the helper.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import opentype from 'opentype.js'
import sharp from 'sharp'

const fontBuf = readFileSync(path.join(process.cwd(), 'public', 'fonts', 'NotoSansHebrew-Regular.ttf'))
const font = opentype.parse(fontBuf.buffer.slice(fontBuf.byteOffset, fontBuf.byteOffset + fontBuf.byteLength))

function pathData(commands) {
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

function hebrewPath({ text, cx, baselineY, size, fill }) {
    const v = Array.from(text).reverse().join('')
    const w = font.getAdvanceWidth(v, size)
    const x = cx - w / 2
    const p = font.getPath(v, x, baselineY, size)
    return `<path d="${pathData(p.commands)}" fill="${fill}"/>`
}

function latinPath({ text, cx, baselineY, size, fill, letterSpacing = 0 }) {
    const chars = Array.from(text)
    const advances = chars.map((ch) => font.getAdvanceWidth(ch, size))
    const total = advances.reduce((a, b) => a + b, 0) + letterSpacing * (chars.length - 1)
    let x = cx - total / 2
    const parts = []
    for (let i = 0; i < chars.length; i++) {
        const p = font.getPath(chars[i], x, baselineY, size)
        parts.push(`<path d="${pathData(p.commands)}" fill="${fill}"/>`)
        x += advances[i] + letterSpacing
    }
    return parts.join('')
}

function pickTitleSize({ text, maxWidth, max = 96, min = 52 }) {
    const v = Array.from(text).reverse().join('')
    let s = max
    while (s > min) {
        if (font.getAdvanceWidth(v, s) <= maxWidth) return s
        s -= 4
    }
    return min
}

async function render({ title, subtitle = 'הברכות והתמונות שלכם, נשמרות לתמיד' }) {
    const W = 1200
    const H = 630
    const titleSize = pickTitleSize({ text: title, maxWidth: 1000 })

    const titlePath = hebrewPath({ text: title, cx: W / 2, baselineY: 330, size: titleSize, fill: '#fdf6e3' })
    const subPath = hebrewPath({ text: subtitle, cx: W / 2, baselineY: 440, size: 28, fill: '#f0dcb0' })
    const wordmark = latinPath({ text: 'WEDDING TALES', cx: W / 2, baselineY: 580, size: 26, fill: '#d8b876', letterSpacing: 10 })

    const sparkle = (x, y, r, op = 0.7) =>
        `<g transform="translate(${x} ${y}) rotate(45)">
            <rect x="-${r}" y="-${r / 4}" width="${r * 2}" height="${r / 2}" fill="#e8c66a" opacity="${op}" rx="${r / 4}"/>
            <rect x="-${r / 4}" y="-${r}" width="${r / 2}" height="${r * 2}" fill="#e8c66a" opacity="${op}" rx="${r / 4}"/>
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
        <rect x="28" y="28" width="${W - 56}" height="${H - 56}" fill="none" stroke="#d8b876" stroke-opacity="0.65" stroke-width="2" rx="22"/>
        <rect x="38" y="38" width="${W - 76}" height="${H - 76}" fill="none" stroke="#d8b876" stroke-opacity="0.18" stroke-width="1" rx="18"/>
        ${sparkles}
        ${titlePath}
        <line x1="${W / 2 - 70}" y1="380" x2="${W / 2 + 70}" y2="380" stroke="#d8b876" stroke-width="2" stroke-opacity="0.85"/>
        ${subPath}
        ${wordmark}
    </svg>`

    return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
}

const cases = [
    { tag: 'short', title: 'ספר הברכות' },
    { tag: 'owner', title: 'ספר הברכות של נועם' },
    { tag: 'couple', title: 'ספר הברכות של שירה ונועם' },
    { tag: 'bday', title: 'ספר הברכות ליום ההולדת של תקווה' },
]
for (const c of cases) {
    const buf = await render({ title: c.title })
    writeFileSync(`./og-test-${c.tag}.png`, buf)
    console.log(c.tag.padEnd(8), c.title.length.toString().padStart(2), 'chars', buf.length, 'bytes')
}
