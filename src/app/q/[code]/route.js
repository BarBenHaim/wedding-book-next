// GET /q/[code]
//
// The redirector that makes QR codes "dynamic". When you generate a
// QR for a wedding, the QR encodes a short URL like
//   https://app.weddingtales.co.il/q/abc123
//
// This handler looks up the `abc123` doc in `qrcodes/`, reads the
// current `targetUrl`, and 302-redirects there. To change where a
// printed QR points: update the doc — the QR sticker on the wall
// keeps working, just lands on a new place.
//
// We also bump a tiny `scans` counter + `lastScannedAt` so the
// admin panel can show how many people scanned each code. No PII
// captured here beyond what /api/log-event already records.
//
// Why a server route handler (not a page): we want a real 302
// HTTP redirect so the browser's history doesn't pile up an
// intermediate page, and so QR scanners that open the URL and
// immediately follow redirects (most do) don't render a flash of
// our domain.

import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Hard-coded fallback for when the code doesn't exist or is disabled.
// Better to land the visitor on the marketing page than throw a 404
// in their face from a printed QR sticker.
const FALLBACK_URL = '/'

export async function GET(req, { params }) {
    const { code } = await params
    if (!code || typeof code !== 'string') {
        return NextResponse.redirect(new URL(FALLBACK_URL, req.url), 302)
    }

    try {
        const ref = adminDb.collection('qrcodes').doc(code.trim())
        const snap = await ref.get()
        if (!snap.exists) {
            return NextResponse.redirect(new URL(FALLBACK_URL, req.url), 302)
        }
        const data = snap.data() || {}
        if (data.active === false) {
            return NextResponse.redirect(new URL(FALLBACK_URL, req.url), 302)
        }
        const target = (data.targetUrl || '').trim()
        if (!target) {
            return NextResponse.redirect(new URL(FALLBACK_URL, req.url), 302)
        }

        // Best-effort scan counter — fire-and-forget so a slow write
        // doesn't delay the redirect. The increment is atomic on the
        // server so concurrent scans don't lose updates.
        ref.update({
            scans: FieldValue.increment(1),
            lastScannedAt: FieldValue.serverTimestamp(),
        }).catch(err => console.warn('[qr] counter update failed:', err?.message || err))

        // Build the absolute redirect URL. Target can be absolute
        // (https://...) or a path on this domain (/wedding/...).
        const isAbsolute = /^https?:/i.test(target)
        const dest = isAbsolute ? target : new URL(target, req.url).toString()

        return NextResponse.redirect(dest, 302)
    } catch (err) {
        console.error('[qr] resolve failed:', err)
        return NextResponse.redirect(new URL(FALLBACK_URL, req.url), 302)
    }
}
