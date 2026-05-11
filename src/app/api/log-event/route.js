// src/app/api/log-event/route.js
//
// Lightweight tracking endpoint. Guest pages POST one of these events:
//
//   • 'scan'                    — landed on the wedding's guest page
//   • 'start_blessing'          — opened the photo/blessing form
//   • 'form_submit'             — pressed "send" on the blessing form
//   • 'photo_upload'            — picked / uploaded a photo
//   • 'blessing_sent_success'   — final write to Firestore succeeded
//   • 'blessing_sent_error'     — final write failed (network / validation)
//
// Each call writes one doc to weddings/{id}/scans/{auto}, capturing
// timestamp, user agent, IP, referrer, and a best-effort GeoIP lookup
// (country + city + region). Failures are swallowed — returning a 5xx
// to a fire-and-forget tracker would do nothing useful.
//
// We deliberately do NOT auth this endpoint: guests are anonymous, and
// requiring auth would either prevent logging or force us to expose a
// public token. Instead we whitelist event names + cap field sizes to
// prevent abuse from inflating Firestore costs.

import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_EVENTS = new Set([
    'scan',
    'start_blessing',
    'form_submit',
    'photo_upload',
    'blessing_sent_success',
    'blessing_sent_error',
])

// Best-effort GeoIP lookup. ipapi.co's free tier allows 1000 lookups/
// day per source IP without an API key — comfortable for a wedding's
// few hundred guests. The endpoint returns JSON like:
//   { country_name: "Israel", city: "Tel Aviv", region: "Tel Aviv", ... }
// On any failure (timeout / quota / private IP) we return an empty
// object so the rest of the event still saves cleanly.
//
// The lookup runs server-side so the guest's browser never makes the
// call (no extra network cost on the guest's connection). 1.2-second
// timeout via AbortController so a slow geo-API doesn't slow event
// persistence.
async function geoLookup(ip) {
    if (!ip) return {}
    // Skip private / local addresses — they always 404 / give nothing
    // useful and just burn the rate limit.
    if (
        ip.startsWith('10.') ||
        ip.startsWith('192.168.') ||
        ip.startsWith('172.') ||
        ip === '127.0.0.1' ||
        ip === '::1'
    ) {
        return {}
    }
    try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 1200)
        const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
            signal: ctrl.signal,
            headers: { 'User-Agent': 'wedding-tales/1.0 (analytics)' },
        })
        clearTimeout(t)
        if (!res.ok) return {}
        const j = await res.json()
        if (j.error) return {}
        return {
            country: (j.country_name || '').slice(0, 64),
            countryCode: (j.country_code || '').slice(0, 4),
            city: (j.city || '').slice(0, 64),
            region: (j.region || '').slice(0, 64),
            // Coordinates rounded to ~city precision — exact location
            // would be invasive and isn't useful for funnel analysis.
            lat: typeof j.latitude === 'number' ? Math.round(j.latitude * 100) / 100 : null,
            lng: typeof j.longitude === 'number' ? Math.round(j.longitude * 100) / 100 : null,
            timezone: (j.timezone || '').slice(0, 48),
        }
    } catch {
        return {}
    }
}

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}))
        const weddingId = typeof body.weddingId === 'string' ? body.weddingId.trim() : ''
        const event = typeof body.event === 'string' ? body.event : ''
        // Optional payload — lets the client attach a small bit of
        // context per event (e.g. error message on blessing_sent_error,
        // file size on photo_upload). Capped to 200 chars.
        const meta = typeof body.meta === 'string' ? body.meta.slice(0, 200) : ''

        if (!weddingId || !ALLOWED_EVENTS.has(event)) {
            return NextResponse.json({ ok: false }, { status: 400 })
        }

        const userAgent = (req.headers.get('user-agent') || '').slice(0, 200)
        const ipHeader = req.headers.get('x-forwarded-for') || ''
        const ip = ipHeader.split(',')[0].trim().slice(0, 64)
        const referer = (req.headers.get('referer') || '').slice(0, 200)

        const geo = await geoLookup(ip)

        await adminDb
            .collection('weddings')
            .doc(weddingId)
            .collection('scans')
            .add({
                event,
                meta: meta || null,
                createdAt: FieldValue.serverTimestamp(),
                userAgent,
                ip,
                referer,
                ...geo,
            })

        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[log-event] failed:', err)
        return NextResponse.json({ ok: false }, { status: 500 })
    }
}
