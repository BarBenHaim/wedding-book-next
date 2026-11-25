// Finishes a drawn "ברכו את" sample: a real QR and the words under it. The QR is
// never drawn by an image model, and the finished file is checked square by
// square against it. Every drawing is different, so the room for the QR is
// checked, not assumed.

import sharp from 'sharp'
import QRCode from 'qrcode'

export const DEMO_LINK = 'https://app.weddingtales.co.il/wedding/0oeixSvNuY9uKEmZ0GVg/photo'
// A plain strip has little variation in brightness, and is light enough for
// the navy words.
const PLAIN_STDEV = 10
const PLAIN_LIGHT = 170
const PLAIN_DRIFT = 14
const PAPER = { r: 250, g: 244, b: 232 }
const MARGIN = 2
const LEVEL = 'M'

// The empty paper at the foot of a drawing: from which row it starts, and its
// colour. The very bottom and the sides are left out, where a border may run.
async function emptyPaper(path) {
    const { data, info } = await sharp(path).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true })
    const { width, height, channels } = info
    const from = Math.round(width * 0.12)
    const to = Math.round(width * 0.88)
    const step = Math.max(4, Math.round(height * 0.01))
    const bottom = Math.round(height * 0.96)
    let top = bottom
    let first = null
    for (let y = bottom - step; y >= height * 0.4; y -= step) {
        let sum = 0
        let squares = 0
        let count = 0
        const rgb = [0, 0, 0]
        for (let row = y; row < y + step; row += 1) {
            for (let x = from; x < to; x += 1) {
                const at = (row * width + x) * channels
                const light = 0.299 * data[at] + 0.587 * data[at + 1] + 0.114 * data[at + 2]
                sum += light
                squares += light * light
                count += 1
                for (let c = 0; c < 3; c += 1) rgb[c] += data[at + c]
            }
        }
        const mean = sum / count
        const stdev = Math.sqrt(Math.max(0, squares / count - mean * mean))
        if (stdev > PLAIN_STDEV || mean < PLAIN_LIGHT || (first && Math.abs(mean - first.mean) > PLAIN_DRIFT)) break
        first = first || { mean, colour: { r: Math.round(rgb[0] / count), g: Math.round(rgb[1] / count), b: Math.round(rgb[2] / count) } }
        top = y
    }
    // A strip or two is not room, it is a gap in the art.
    return bottom - top >= step * 3 ? { top, bottom, colour: first.colour } : null
}

// True when every square of the QR for `link` is where it belongs in the file.
export async function qrIntact(path, { left, top, size }, link = DEMO_LINK) {
    const { modules } = QRCode.create(link, { errorCorrectionLevel: LEVEL })
    const { data, info } = await sharp(path).greyscale().raw().toBuffer({ resolveWithObject: true })
    const cell = size / (modules.size + MARGIN * 2)
    for (let row = 0; row < modules.size; row += 1) {
        for (let column = 0; column < modules.size; column += 1) {
            const x = Math.floor(left + (column + MARGIN + 0.5) * cell)
            const y = Math.floor(top + (row + MARGIN + 0.5) * cell)
            const dark = data[(y * info.width + x) * info.channels] < 128
            if (dark !== Boolean(modules.data[row * modules.size + column])) return false
        }
    }
    return true
}

export async function composeSign(artPath, outPath, { link = DEMO_LINK } = {}) {
    const { width, height: artHeight } = await sharp(artPath).metadata()
    const paper = await emptyPaper(artPath)
    const size = Math.round(width * 0.27)
    const needed = size + Math.round(width * 0.13)
    const pad = Math.round(width * 0.03)
    let top
    let band = 0
    if (paper && paper.bottom - paper.top >= needed) {
        top = paper.top + Math.floor((paper.bottom - paper.top - needed) / 2)
    } else {
        // Not enough room: the page grows, only by what is missing.
        top = (paper ? paper.top : artHeight) + pad
        band = Math.max(0, top + needed + pad - artHeight)
    }
    const height = artHeight + band
    const left = Math.round((width - size) / 2)
    const qr = await QRCode.toBuffer(link, { width: size, margin: MARGIN, errorCorrectionLevel: LEVEL, color: { dark: '#14213d', light: '#ffffff' } })
    const line = (y, px, weight, color, words) =>
        `<text x="${width / 2}" y="${y}" font-family="Arial" font-size="${px}" font-weight="${weight}" fill="${color}" text-anchor="middle" direction="rtl">${words}</text>`
    const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        ${line(top + size + Math.round(width * 0.058), Math.round(width * 0.038), 700, '#14213d', 'סורקים, כותבים ברכה ומעלים תמונה')}
        ${line(top + size + Math.round(width * 0.1), Math.round(width * 0.028), 400, '#6b5a36', 'דוגמה להמחשה, Wedding Tales')}
    </svg>`)
    const base = await sharp(artPath).removeAlpha().extend({ bottom: band, background: paper?.colour || PAPER }).png().toBuffer()
    await sharp(base)
        .composite([{ input: overlay, left: 0, top: 0 }, { input: qr, left, top }])
        .jpeg({ quality: 92 })
        .toFile(outPath)
    // The library rounds the QR to whole pixels per square: check its real size.
    const drawn = (await sharp(qr).metadata()).width
    const place = { left, top, size: drawn }
    if (!await qrIntact(outPath, place, link)) throw new Error('the QR on the finished sample is damaged')
    return { width, height, addedBand: band > 0, qr: place }
}
