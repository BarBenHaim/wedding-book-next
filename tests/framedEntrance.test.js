import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// A guard for a bug that no unit test could have caught by running the
// code: the framed guest form positions itself with an inline
// `transform: translate(-50%,-50%) scale(fit)`, and it also carried a
// CSS class whose keyframes animate `transform`. A CSS animation beats
// an inline style, and `forwards` keeps beating it after the animation
// ends — so the form sat with its corner on the panel's centre, at
// scale 1, hanging off the screen. It looked like a broken preview. It
// was the cascade.
//
// These assertions are about source text rather than behaviour, which is
// unusual, but the invariant is a source-level one: an element whose
// position is an inline transform may not wear a transform animation.

const root = path.resolve(__dirname, '..')
const css = fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8')
const page = fs.readFileSync(
    path.join(root, 'src/app/wedding/[weddingId]/photo/page.js'),
    'utf8',
)

function keyframeBody(name) {
    const i = css.indexOf(`@keyframes ${name} {`)
    expect(i, `@keyframes ${name} is missing`).toBeGreaterThan(-1)
    return css.slice(i, css.indexOf('}', css.indexOf('to', i)))
}

describe('the framed entrance never animates transform', () => {
    it('framedIn touches opacity and nothing else', () => {
        expect(keyframeBody('framedIn')).not.toMatch(/transform/)
    })

    it('scaleIn does animate transform — which is why it cannot be used here', () => {
        expect(keyframeBody('scaleIn')).toMatch(/transform/)
    })

    it('reduced motion does not reset transform on animate-framedIn', () => {
        // The reduced-motion block resets `transform: none !important`
        // for the decorative classes. Including this one there would
        // drop the form into the corner for anyone who asked for less
        // motion — the same bug, reached from the other side.
        const i = css.indexOf('.animate-framedIn {', css.indexOf('prefers-reduced-motion'))
        expect(i, 'animate-framedIn has no reduced-motion rule').toBeGreaterThan(-1)
        expect(css.slice(i, css.indexOf('}', i))).not.toMatch(/transform/)
    })

    it('the framed form uses animate-framedIn, not animate-scaleIn', () => {
        const m = page.match(/className=\{`relative z-10 w-full max-w-\[26rem\][^`]*`\}/)
        expect(m, 'the form column className changed shape — re-check this guard').toBeTruthy()
        expect(m[0]).toMatch(/framed \? 'animate-framedIn/)
        expect(m[0]).not.toMatch(/max-w-\[26rem\] animate-scaleIn/)
    })
})
