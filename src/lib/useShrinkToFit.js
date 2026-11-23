'use client'

// A font factor (1 → min) that shrinks a text block until it fits a box, for layouts that place text
// at a fixed spot and used to let a long blessing run off the page. Measured after layout, so web fonts and
// line breaks are taken into account; a block that already fits keeps factor 1 and is not touched.
//
//   const [ref, factor] = useShrinkToFit({ maxHeight: px, sig: 'text length|size|…' })
//   <div ref={ref}><p style={{ fontSize: base * factor }}>…</p></div>
//
// `sig` is anything that, when it changes, means the content or the box changed: the factor starts over.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const STEP_FLOOR = 0.97 // each step aims a little below the exact fit, so the loop settles in a few passes

export default function useShrinkToFit({ maxHeight, sig, min = 0.6 }) {
    const ref = useRef(null)
    const [factor, setFactor] = useState(1)
    const [fontsTick, setFontsTick] = useState(0)
    const lastSig = useRef(sig)
    const fullSig = `${sig}|${fontsTick}`
    const lastFull = useRef(fullSig)

    useEffect(() => {
        let alive = true
        if (typeof document !== 'undefined' && document.fonts?.ready) document.fonts.ready.then(() => alive && setFontsTick(1))
        return () => {
            alive = false
        }
    }, [])

    useLayoutEffect(() => {
        lastSig.current = sig
        if (lastFull.current !== fullSig) {
            lastFull.current = fullSig
            if (factor !== 1) {
                setFactor(1)
                return
            }
        }
        const el = ref.current
        if (!el || !(maxHeight > 20) || factor <= min) return
        const height = el.getBoundingClientRect().height
        if (height > maxHeight + 1) {
            const next = Math.max(min, factor * Math.max(0.5, Math.sqrt(maxHeight / height)) * STEP_FLOOR)
            if (next < factor) setFactor(next)
        }
    })

    return [ref, factor]
}

export { STEP_FLOOR }
