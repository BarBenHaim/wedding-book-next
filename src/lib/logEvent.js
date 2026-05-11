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
// Supported events:
//   scan, start_blessing, form_submit, photo_upload,
//   blessing_sent_success, blessing_sent_error
//
// Usage:
//   import { logEvent } from '@/lib/logEvent'
//   useEffect(() => { logEvent(weddingId, 'scan') }, [weddingId])
//   logEvent(weddingId, 'blessing_sent_error', err?.message)

export function logEvent(weddingId, event, meta = '') {
    if (!weddingId || !event) return
    if (typeof window === 'undefined') return // SSR safety

    try {
        fetch('/api/log-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ weddingId, event, meta }),
            keepalive: true,
        }).catch(() => {
            /* silent — analytics must never break the real flow */
        })
    } catch {
        /* same — defensive double-catch in case fetch itself throws */
    }
}
