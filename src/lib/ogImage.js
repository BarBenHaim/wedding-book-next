// Server-only OG image generator. Builds a 1200×630 PNG for the
// per-wedding share preview that WhatsApp / Facebook / Slack / etc.
// scrape from the page's og:image meta tag.
//
// Why not @vercel/og / satori?
//   We tried. Satori's RTL + Hebrew glyph handling produced visibly
//   crooked text in production. Even with the NotoSansHebrew TTF
//   passed via the fonts option, the rendered Hebrew came out
//   distorted. Switching to sharp + librsvg gives us proper Hebrew
//   shaping (HarfBuzz under the hood) at the cost of a slightly
//   heavier render — fine for an asset that's cached aggressively
//   downstream.
//
// Font handling:
//   We embed NotoSansHebrew-Regular.ttf as a base64 data: URL inside
//   an @font-face declaration in the SVG. librsvg loads the font
//   from the data URL without needing any system fontconfig setup,
//   which keeps the render deterministic on Vercel's read-only fs.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

// Font is read once per process and cached. process.cwd() resolves
// to the project root on both `next dev` and Vercel's serverless
// runtime, so public/fonts/... is always reachable.
let cachedFontB64 = null
function loadFont() {
    if (cachedFontB64) return cachedFontB64
    const fontPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSansHebrew-Regular.ttf')
    cachedFontB64 = readFileSync(fontPath).toString('base64')
    return cachedFontB64
}

// XML-escape only the characters that break SVG: <, >, &, ". Hebrew
// glyphs pass through unchanged. Defensive — even though titles come
// from a controlled buildShareCopy() helper, a malformed name in
// Firestore shouldn't be able to inject SVG.
function escapeForSvg(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

// Auto-shrink the title font so even a long compound title (e.g.
// "ספר הברכות ליום ההולדת של תקווה") still fits horizontally without
// touching the border frame. The brackets here are a rough
// approximation — Hebrew serif glyphs run ~0.55 px wide per font-size
// unit in this font, so a 30-char title at 68 px ≈ 1120 px wide,
// which is the limit of our 1000-ish-px safe area.
function titleFontSize(text) {
    const n = text.length
    if (n <= 12) return 108
    if (n <= 18) return 90
    if (n <= 24) return 72
    if (n <= 30) return 62
    return 54
}

/**
 * Build the SVG markup and rasterise to a PNG buffer.
 *
 * @param {object} opts
 * @param {string} opts.title - The big Hebrew headline. From
 *   `buildShareCopy(weddingData).title`, e.g. "ספר הברכות של נועם".
 * @param {string} [opts.subtitle] - Small line under the title.
 *   Defaults to the brand tagline.
 * @returns {Promise<Buffer>} - PNG buffer, 1200×630.
 */
export async function renderOgImage({ title, subtitle = 'הברכות והתמונות שלכם, נשמרות לתמיד' }) {
    const W = 1200
    const H = 630
    const titleSize = titleFontSize(title)
    const fontB64 = loadFont()

    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'>
        <defs>
            <style type='text/css'><![CDATA[
                @font-face {
                    font-family: 'NotoHe';
                    src: url('data:font/ttf;base64,${fontB64}') format('truetype');
                }
                .title { font-family: 'NotoHe', serif; fill: #fdf6e3; }
                .small { font-family: 'NotoHe', serif; fill: #d8b876; letter-spacing: 8px; }
                .latin { font-family: serif; fill: #c9a44e; letter-spacing: 10px; }
            ]]></style>
            <linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'>
                <stop offset='0%' stop-color='#2b2117'/>
                <stop offset='55%' stop-color='#3d2e1a'/>
                <stop offset='100%' stop-color='#241b12'/>
            </linearGradient>
        </defs>
        <rect width='${W}' height='${H}' fill='url(#bg)'/>
        <rect x='28' y='28' width='${W - 56}' height='${H - 56}'
              fill='none' stroke='#c9a44e' stroke-opacity='0.55'
              stroke-width='2' rx='24'/>
        <text x='${W / 2}' y='280' class='title'
              font-size='${titleSize}' text-anchor='middle'
              direction='rtl'>${escapeForSvg(title)}</text>
        <line x1='${W / 2 - 90}' y1='335' x2='${W / 2 + 90}' y2='335'
              stroke='#c9a44e' stroke-width='3'/>
        <text x='${W / 2}' y='400' class='small'
              font-size='30' text-anchor='middle'
              direction='rtl'>${escapeForSvg(subtitle)}</text>
        <text x='${W / 2}' y='560' class='latin'
              font-size='28' text-anchor='middle'>WEDDING TALES</text>
    </svg>`

    return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
}
