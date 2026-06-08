// GET /api/book-photo/[weddingId]/[entryId]?token=xxx
//
// Token-gated photo proxy for the digital edition viewer.
//
// Why this exists:
//   The digital edition is a paid product; the printed book is the
//   upsell. Letting the front-end render `<img src=https://firebase
//   storage.googleapis.com/...>` would expose the original full-res
//   photo URL in the page source — anyone with DevTools could right-
//   click → save and walk away with a print-quality image.
//
// What this does:
//   1. Validates the token belongs to this wedding's
//      `wedding.digitalTokens` array.
//   2. Validates the entry belongs to this wedding (entryId is in the
//      sub-collection).
//   3. Fetches the original image from the entry's stored URL using
//      the admin SDK (server-side — Firebase Storage URL never
//      reaches the browser).
//   4. Streams the bytes back with:
//      - Content-Disposition: inline; filename=<obfuscated>.jpg so
//        right-click → save gets a cryptic name (not "photo-xyz.jpg")
//      - Cache-Control: private — no shared caching
//      - X-Content-Type-Options: nosniff
//      - X-Robots-Tag: noindex, noarchive
//
// Resolution policy — IMPORTANT product decision:
//   We DO NOT downscale. The digital edition is a premium product
//   and the customer paid for quality — flipbook on a retina screen
//   needs the full-res photo to look right, especially when the
//   guest pinches to zoom or opens fullscreen. Downscaling would
//   visibly hurt the experience.
//
//   Security therefore relies on the layered deterrents (proxy +
//   right-click block + drag block + selection block + Ctrl+S/P/U
//   block) rather than degraded source. A determined user with
//   DevTools can still find the proxy URL and pull the bytes —
//   that's an accepted trade-off; we're protecting against casual
//   extraction, not state-level adversaries.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'

export async function GET(req, { params }) {
    const { weddingId, entryId } = await params
    const { searchParams } = new URL(req.url)
    const token = searchParams.get('token') || ''

    if (!weddingId || !entryId || !token) {
        return NextResponse.json({ error: 'Bad request' }, { status: 400 })
    }

    try {
        // ─── 1. Verify token ───────────────────────────────────────
        const wedRef = adminDb.collection('weddings').doc(weddingId)
        const wedSnap = await wedRef.get()
        if (!wedSnap.exists) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }
        const wed = wedSnap.data() || {}
        const tokens = Array.isArray(wed.digitalTokens) ? wed.digitalTokens : []
        if (!tokens.includes(token)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // ─── 2. Fetch the entry, extract photoUrl ──────────────────
        const entryRef = wedRef.collection('entries').doc(entryId)
        const entrySnap = await entryRef.get()
        if (!entrySnap.exists) {
            return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
        }
        const entry = entrySnap.data() || {}
        const photoUrl = entry.photoUrl || entry.imageUrl
        if (!photoUrl) {
            return NextResponse.json({ error: 'No photo' }, { status: 404 })
        }

        // ─── 3. Server-side fetch (the real URL never hits the wire
        //         to the client). We keep the upstream's content-type. ─
        // Retry the upstream fetch — Firebase Storage occasionally returns
        // a transient 5xx or resets the connection, which would otherwise
        // surface as a broken image in the book. 4xx are permanent, so we
        // stop retrying on those.
        let upstream = null
        let lastErr = null
        for (let i = 0; i < 3; i++) {
            try {
                upstream = await fetch(photoUrl, { redirect: 'follow' })
                if (upstream.ok) break
                lastErr = `Upstream ${upstream.status}`
                if (upstream.status < 500) break
            } catch (e) {
                lastErr = e?.message || 'fetch failed'
                upstream = null
            }
            await new Promise(r => setTimeout(r, 300 * (i + 1)))
        }
        if (!upstream || !upstream.ok) {
            return NextResponse.json({ error: lastErr || 'Upstream error' }, { status: 502 })
        }
        const contentType = upstream.headers.get('content-type') || 'image/jpeg'

        // ─── 4. Send back with hardening headers ──────────────────
        // Stream the bytes straight through (no full in-memory buffer) so
        // large full-res photos start arriving immediately and never hit a
        // memory/time ceiling on the serverless function — a frequent cause
        // of an intermittently "broken" image in the book.
        const obfuscated = `moment_${entryId.slice(0, 6)}.jpg`

        return new NextResponse(upstream.body, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `inline; filename="${obfuscated}"`,
                'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800',
                'X-Content-Type-Options': 'nosniff',
                'X-Robots-Tag': 'noindex, noarchive, noimageindex',
                // Discourage hot-linking from external sites.
                'Cross-Origin-Resource-Policy': 'same-origin',
            },
        })
    } catch (err) {
        console.error('[book-photo] proxy failed:', err)
        return NextResponse.json({ error: 'Internal' }, { status: 500 })
    }
}
