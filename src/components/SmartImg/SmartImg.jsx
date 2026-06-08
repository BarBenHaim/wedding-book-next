'use client'

import { useState, useEffect, useRef } from 'react'

// Self-healing <img>. A transient load failure — flaky network, a
// momentary Firebase Storage 5xx, a proxy hiccup, or react-pageflip
// remounting a page mid-flip — would normally leave a PERMANENT broken-
// image icon (the user's report). Instead we silently retry with
// exponential backoff and a cache-busting query param so the browser
// re-requests rather than reusing the failed cache entry. After
// `maxRetries` we render `fallback` (default: nothing) so a layout never
// shows the browser's broken-image glyph at any stage.
export default function SmartImg({ src, alt = '', maxRetries = 5, fallback = null, ...rest }) {
    const [attempt, setAttempt] = useState(0)
    const [failed, setFailed] = useState(false)
    const timer = useRef(null)

    useEffect(() => {
        setAttempt(0)
        setFailed(false)
        return () => {
            if (timer.current) clearTimeout(timer.current)
        }
    }, [src])

    if (!src || failed) return fallback

    const finalSrc = attempt === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}_retry=${attempt}`

    return (
        <img
            src={finalSrc}
            alt={alt}
            onError={() => {
                if (attempt < maxRetries) {
                    const delay = Math.min(500 * 2 ** attempt, 5000)
                    if (timer.current) clearTimeout(timer.current)
                    timer.current = setTimeout(() => setAttempt(a => a + 1), delay)
                } else {
                    setFailed(true)
                }
            }}
            {...rest}
        />
    )
}
