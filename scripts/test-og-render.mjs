// Local rendering smoke-test for the OG helper. Bypasses Next so we
// can validate sharp+SVG produces a clean PNG without booting the
// whole framework. The helper at src/lib/ogImage.js uses ESM syntax
// but lives in a no-"type":"module" package — Next compiles it for
// us, but plain Node would treat it as CJS. So we inline a slim
// copy of the renderer here for the smoke test. Keep this script
// in sync with src/lib/ogImage.js (or eventually drop it once we
// trust the in-route render).
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const fontB64 = readFileSync(
    path.join(process.cwd(), 'public', 'fonts', 'NotoSansHebrew-Regular.ttf'),
).toString('base64')

function titleFontSize(text) {
    const n = text.length
    if (n <= 12) return 108
    if (n <= 18) return 90
    if (n <= 24) return 72
    if (n <= 30) return 62
    return 54
}

function escapeForSvg(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function renderOgImage({ title, subtitle = 'הברכות והתמונות שלכם, נשמרות לתמיד' }) {
    const W = 1200
    const H = 630
    const titleSize = titleFontSize(title)
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'>
        <defs>
            <style type='text/css'><![CDATA[
                @font-face { font-family: 'NotoHe'; src: url('data:font/ttf;base64,${fontB64}') format('truetype'); }
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
        <rect x='28' y='28' width='${W - 56}' height='${H - 56}' fill='none' stroke='#c9a44e' stroke-opacity='0.55' stroke-width='2' rx='24'/>
        <text x='${W / 2}' y='280' class='title' font-size='${titleSize}' text-anchor='middle' direction='rtl'>${escapeForSvg(title)}</text>
        <line x1='${W / 2 - 90}' y1='335' x2='${W / 2 + 90}' y2='335' stroke='#c9a44e' stroke-width='3'/>
        <text x='${W / 2}' y='400' class='small' font-size='30' text-anchor='middle' direction='rtl'>${escapeForSvg(subtitle)}</text>
        <text x='${W / 2}' y='560' class='latin' font-size='28' text-anchor='middle'>WEDDING TALES</text>
    </svg>`
    return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
}

const cases = [
    { tag: 'short', title: 'ספר הברכות' },
    { tag: 'owner', title: 'ספר הברכות של נועם' },
    { tag: 'couple', title: 'ספר הברכות של שירה ונועם' },
    { tag: 'bday', title: 'ספר הברכות ליום ההולדת של תקווה' },
    { tag: 'bar', title: 'ספר הברכות לבר המצווה של גל' },
]

for (const c of cases) {
    const buf = await renderOgImage({ title: c.title })
    writeFileSync(`/tmp/og-${c.tag}.png`, buf)
    console.log(c.tag.padEnd(8), c.title.length.toString().padStart(2), 'chars', buf.length, 'bytes')
}
