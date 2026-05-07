// src/lib/logEvent.js
//
// Tiny client-side helper that posts an analytics event to /api/log-event.
//
// Hard rules:
//   1. NEVER throw. Logging failures must be invisible to the user — a
//      blessing flow can't be allowed to break because a tracking call
//      timed out.
//   2. NEVER await. The caller doesn't care if the event was recorded;
//      the only thing that matters is that the user-facing flow keeps
//      moving. We use `fetch(..., { keepalive: true })` so the request
//      survives even if the user navigates away immediately after.
//
// Usage:
//   import { logEvent } from '@/lib/logEvent'
//   useEffect(() => { logEvent(weddingId, 'scan') }, [weddingId])

export function logEvent(weddingId, event) {
    if (!weddingId || !event) return
    if (typeof window === 'undefined') return // SSR safety

    try {
        fetch('/api/log-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ weddingId, event }),
            keepalive: true,
        }).catch(() => {
            /* silent — analytics must never break the real flow */
        })
    } catch {
        /* same — defensive double-catch in case fetch itself throws */
    }
}
