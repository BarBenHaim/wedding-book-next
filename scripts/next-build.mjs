// scripts/next-build.mjs
//
// `npm run build` — runs `next build`, and runs it again when the only thing
// that went wrong was Google Fonts.
//
// Why: next/font/google downloads the font CSS from Google on every build.
// On 11.11.2026 Google started answering, some of the time, with font URLs
// of the form fonts.gstatic.com/l/font?kit=… (no .woff2 at the end), and
// Next's loader dies on those with
//     An error occurred in `next/font`.
//     TypeError: Cannot read properties of null (reading '1')
// Two builds out of three failed that night, on files nobody had touched.
// The next request to Google usually gets the normal answer, so the cure is
// simply to build again. Anything else that fails the build fails it at
// once, exactly as before.
//
// The lasting fix is to keep the font files in the repo (next/font/local),
// which removes Google from the build altogether.

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { isFontFlake, MAX_ATTEMPTS, RETRY_DELAY_MS } from './lib/font-flake.mjs'

const require = createRequire(import.meta.url)
const nextBin = require.resolve('next/dist/bin/next')
const args = ['build', ...process.argv.slice(2)]

function buildOnce() {
    return new Promise(resolve => {
        const child = spawn(process.execPath, [nextBin, ...args], { stdio: ['inherit', 'pipe', 'pipe'] })
        let tail = ''
        const keep = chunk => {
            tail = (tail + chunk).slice(-200_000)
        }
        child.stdout.on('data', d => {
            process.stdout.write(d)
            keep(d)
        })
        child.stderr.on('data', d => {
            process.stderr.write(d)
            keep(d)
        })
        child.on('error', err => resolve({ code: 1, output: String(err) }))
        child.on('close', code => resolve({ code: code ?? 1, output: tail }))
    })
}

for (let attempt = 1; ; attempt++) {
    const { code, output } = await buildOnce()
    if (code === 0) process.exit(0)
    if (attempt >= MAX_ATTEMPTS || !isFontFlake(output)) process.exit(code)
    console.log(
        `\n[build] Google Fonts gave next/font an answer it could not use (attempt ${attempt} of ${MAX_ATTEMPTS}). ` +
            `Building again in ${RETRY_DELAY_MS / 1000}s.\n`,
    )
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
}
