import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { composeSign, qrIntact } from '../scripts/lib/sign-compose.mjs'

// On Windows a cached open file cannot be deleted afterwards.
sharp.cache(false)

let dir
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'sign-')) })
afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

const paper = { r: 250, g: 244, b: 232 }
// A drawing: colour on top; the lower part either plain paper or busy stripes.
async function drawing(name, { busy }) {
    const top = await sharp({ create: { width: 800, height: 660, channels: 3, background: { r: 30, g: 90, b: 160 } } }).png().toBuffer()
    const stripes = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="470">${
        Array.from({ length: 20 }, (_, i) => `<rect x="${i * 40}" y="0" width="20" height="470" fill="#102040"/>`).join('')}</svg>`)
    const layers = [{ input: top, top: 0, left: 0 }, ...(busy ? [{ input: stripes, top: 660, left: 0 }] : [])]
    const path = join(dir, name)
    await sharp({ create: { width: 800, height: 1130, channels: 3, background: paper } }).composite(layers).png().toFile(path)
    return path
}

describe('composeSign', () => {
    it('puts a whole QR on the empty paper', async () => {
        const out = join(dir, 'plain.jpg')

        const result = await composeSign(await drawing('plain.png', { busy: false }), out)

        expect(result).toMatchObject({ addedBand: false, width: 800, height: 1130 })
        expect(await qrIntact(out, result.qr)).toBe(true)
    })

    it('adds a paper band below a drawing that left no room, instead of covering it', async () => {
        const out = join(dir, 'busy.jpg')

        const result = await composeSign(await drawing('busy.png', { busy: true }), out)

        expect(result.addedBand).toBe(true)
        expect(result.height).toBeGreaterThan(1130)
        expect(result.qr.top).toBeGreaterThanOrEqual(1130)
        expect(await qrIntact(out, result.qr)).toBe(true)
    })

    // Art that stops at a given height, plain paper below it.
    async function artEndingAt(name, end) {
        const top = await sharp({ create: { width: 800, height: end, channels: 3, background: { r: 30, g: 90, b: 160 } } }).png().toBuffer()
        const path = join(dir, name)
        await sharp({ create: { width: 800, height: 1130, channels: 3, background: paper } }).composite([{ input: top, top: 0, left: 0 }]).png().toFile(path)
        return path
    }

    it('uses the room that is there when the art runs a little lower than asked', async () => {
        const out = join(dir, 'lower.jpg')

        const result = await composeSign(await artEndingAt('lower.png', 740), out)

        expect(result.addedBand).toBe(false)
        expect(result.qr.top).toBeGreaterThanOrEqual(740)
    })

    it('lengthens the page only as much as it must, right under the art', async () => {
        const out = join(dir, 'short.jpg')

        const result = await composeSign(await artEndingAt('short.png', 880), out)

        expect(result.addedBand).toBe(true)
        expect(result.qr.top).toBeGreaterThanOrEqual(880)
        expect(result.qr.top).toBeLessThan(960)
        expect(result.height).toBeLessThan(1130 + 200)
        expect(await qrIntact(out, result.qr)).toBe(true)
    })

    it('notices a damaged QR and one that points elsewhere', async () => {
        const out = join(dir, 'whole.jpg')
        const result = await composeSign(await drawing('whole.png', { busy: false }), out)
        const covered = join(dir, 'covered.jpg')
        const patch = await sharp({ create: { width: 60, height: 60, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer()
        await sharp(out).composite([{ input: patch, left: result.qr.left + 70, top: result.qr.top + 70 }]).toFile(covered)

        expect(await qrIntact(covered, result.qr)).toBe(false)
        expect(await qrIntact(out, result.qr, 'https://example.com/other')).toBe(false)
    })
})
