// GET /api/admin/analytics?weddingId=...&days=30
//
// Super-admin-only analytics endpoint. Reads the wedding's
// `scans` subcollection over a rolling window (default 30 days)
// and returns a fully-aggregated payload the dashboard can render
// without further computation:
//
//   {
//     funnel: { scan, uniqueScan, start_blessing, form_submit,
//               photo_upload, blessing_sent_success, blessing_sent_error },
//     daily:    [{ date: '2026-05-10', scan: 12, ..., uniqueIPs: 8 }, ...],
//     hourly:   [{ hour: 0..23, total: 4, blessings: 1 }, ...],
//     locations:[{ country, city, count }, ...] (top 20),
//     devices:  { mobile, desktop, tablet, unknown },
//     recent:   [{ id, event, ip, country, city, ts }, ...] (last 50),
//     windowDays, totalEvents
//   }
//
// All aggregation runs server-side so the dashboard payload stays
// small (1-2 KB instead of 50-200 KB of raw events).

import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function authenticate(req) {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Unauthorized' }
    try {
        const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1])
        if (!isSuperAdmin(decoded.email)) {
            return { ok: false, status: 403, error: 'Forbidden' }
        }
        return { ok: true, email: decoded.email }
    } catch {
        return { ok: false, status: 401, error: 'Invalid token' }
    }
}

// User-agent → device class. Crude but enough for "mobile vs desktop"
// breakdown in a wedding-funnel context. Avoids pulling in a 50KB
// user-agent parser library.
function classifyDevice(ua = '') {
    const u = ua.toLowerCase()
    if (/iphone|ipod/.test(u)) return 'mobile'
    if (/ipad/.test(u)) return 'tablet'
    if (/android/.test(u)) {
        if (/mobile/.test(u)) return 'mobile'
        return 'tablet'
    }
    if (/windows phone|blackberry|opera mini/.test(u)) return 'mobile'
    if (!u) return 'unknown'
    return 'desktop'
}

function dayKey(d) {
    // YYYY-MM-DD in UTC. The dashboard renders in the user's local
    // timezone so day boundaries can look off by a few hours at the
    // edges, but that's acceptable for a 30-day rolling view.
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

export async function GET(req) {
    const auth = await authenticate(req)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { searchParams } = new URL(req.url)
    const weddingId = searchParams.get('weddingId')
    const days = Math.min(90, Math.max(1, parseInt(searchParams.get('days') || '30', 10)))

    if (!weddingId) {
        return NextResponse.json({ error: 'Missing weddingId' }, { status: 400 })
    }

    // ── Pull the window of events ──────────────────────────────────
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    let docs = []
    try {
        const snap = await adminDb
            .collection('weddings')
            .doc(weddingId)
            .collection('scans')
            .where('createdAt', '>=', since)
            .orderBy('createdAt', 'desc')
            .get()
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (err) {
        console.error('[analytics] query failed:', err?.message || err)
        return NextResponse.json({ error: 'Query failed' }, { status: 500 })
    }

    // ── Funnel + uniques ──────────────────────────────────────────
    const funnel = {
        scan: 0,
        uniqueScan: 0,
        start_blessing: 0,
        form_submit: 0,
        photo_upload: 0,
        blessing_sent_success: 0,
        blessing_sent_error: 0,
    }
    const uniqueScanIPs = new Set()
    for (const d of docs) {
        if (typeof funnel[d.event] === 'number') funnel[d.event]++
        if (d.event === 'scan' && d.ip) uniqueScanIPs.add(d.ip)
    }
    funnel.uniqueScan = uniqueScanIPs.size

    // ── Daily breakdown ───────────────────────────────────────────
    const dailyMap = new Map()
    for (const d of docs) {
        const ts = d.createdAt?.toDate?.() || new Date()
        const key = dayKey(ts)
        if (!dailyMap.has(key)) {
            dailyMap.set(key, {
                date: key,
                scan: 0,
                start_blessing: 0,
                form_submit: 0,
                photo_upload: 0,
                blessing_sent_success: 0,
                blessing_sent_error: 0,
                uniqueIPs: new Set(),
            })
        }
        const bucket = dailyMap.get(key)
        if (typeof bucket[d.event] === 'number') bucket[d.event]++
        if (d.ip) bucket.uniqueIPs.add(d.ip)
    }
    const daily = Array.from(dailyMap.values())
        .map(b => ({ ...b, uniqueIPs: b.uniqueIPs.size }))
        .sort((a, b) => a.date.localeCompare(b.date))

    // ── Hourly breakdown (0-23) across the whole window ───────────
    const hourly = Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        total: 0,
        scan: 0,
        blessings: 0,
    }))
    for (const d of docs) {
        const ts = d.createdAt?.toDate?.() || new Date()
        const h = ts.getUTCHours()
        hourly[h].total++
        if (d.event === 'scan') hourly[h].scan++
        if (d.event === 'blessing_sent_success') hourly[h].blessings++
    }

    // ── Location breakdown ────────────────────────────────────────
    const locMap = new Map()
    for (const d of docs) {
        if (!d.country && !d.city) continue
        const key = `${d.country || '—'}/${d.city || '—'}`
        const entry = locMap.get(key) || { country: d.country || '', city: d.city || '', count: 0 }
        entry.count++
        locMap.set(key, entry)
    }
    const locations = Array.from(locMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)

    // ── Device breakdown ──────────────────────────────────────────
    const devices = { mobile: 0, desktop: 0, tablet: 0, unknown: 0 }
    for (const d of docs) {
        devices[classifyDevice(d.userAgent)]++
    }

    // ── Recent events (last 50, already sorted desc by createdAt) ─
    const recent = docs.slice(0, 50).map(d => ({
        id: d.id,
        event: d.event,
        ip: d.ip || '',
        country: d.country || '',
        city: d.city || '',
        ts: d.createdAt?.toDate?.()?.toISOString() || null,
        userAgent: (d.userAgent || '').slice(0, 100),
        meta: d.meta || '',
    }))

    return NextResponse.json({
        funnel,
        daily,
        hourly,
        locations,
        devices,
        recent,
        windowDays: days,
        totalEvents: docs.length,
    })
}
