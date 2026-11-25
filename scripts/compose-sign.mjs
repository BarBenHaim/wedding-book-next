// Usage: node scripts/compose-sign.mjs <drawing.png> <sample.jpg>
// Adds the demo QR to a drawn sample and checks that it is whole.
import sharp from 'sharp'
import { composeSign } from './lib/sign-compose.mjs'

sharp.cache(false)
const [art, out] = process.argv.slice(2)
if (!art || !out) {
    console.error('usage: node scripts/compose-sign.mjs <drawing.png> <sample.jpg>')
    process.exit(1)
}
const result = await composeSign(art, out)
console.log(JSON.stringify({ out, width: result.width, height: result.height, addedBand: result.addedBand }))
