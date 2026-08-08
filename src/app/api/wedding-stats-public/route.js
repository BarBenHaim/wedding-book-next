// GET /api/wedding-stats-public?weddingId=...&token=...
//
// Public, token-gated stats endpoint. Lets the couple view their
// wedding's stats page (/wedding/[id]/stats/[token]) without needing
// to log in as admin. The token must appear in `wedding.statsTokens`
// (minted via /api/admin/stats-tokens).
//
// Returns a curated subset of analytics — the things the couple
// actually wants to see during/after their wedding:
//
//   {
//     ok: true,
//     wedding: { brideName, groomName, eventType, locale },
//     totals: {
//       scans, uniqueScans, startedBlessing,
//       photoUploads, blessings, errors
//     },
//     daily:  [{ date, scan, blessings }, ...] (last 30 days),
//     recentBlessings: [{ from, ts }, ...] (last 10 successes — names only),
//     digitalEditionLink: '/wedding/.../book/<digitalToken>' | null,
//     entriesCount: number  // how many blessings ended up in the book
//   }
//
// Why a dedicated endpoint (vs sharing an admin analytics endpoint):
// the admin endpoint requires a super-admin Bearer ID token, which
// the couple doesn't have. Putting token-gated logic on a separate
// route keeps the admin one strictly admin-only.

import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function dayKey(d) {
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

export async function GET(req) {
    const { searchParams } = new URL(req.url)
    const weddingId = (searchParams.get('weddingId') || '').trim()
    const token = (searchParams.get('token') || '').trim()
    if (!weddingId || !token) {
        return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    try {
        // 1) Token check — same pattern as digital-edition. The token
        //    is the entire authentication; if it's not on the doc, 401.
        const wSnap = await adminDb.collection('weddings').doc(weddingId).get()
        if (!wSnap.exists) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }
        const w = wSnap.data() || {}
        const tokens = Array.isArray(w.statsTokens) ? w.statsTokens : []
        if (!tokens.includes(token)) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
        }

        // 2) Pull scans (capped at 2000 — plenty for any single wedding).
        const scansSnap = await adminDb
            .collection('weddings')
            .doc(weddingId)
            .collection('scans')
            .orderBy('createdAt', 'desc')
            .limit(2000)
            .get()

        const totals = {
            scans: 0,
            uniqueScans: 0,
            startedBlessing: 0,
            photoUploads: 0,
            blessings: 0,
            errors: 0,
        }
        const uniqueIPs = new Set()
        const dailyMap = new Map()

        const now = Date.now()
        const cutoff = now - 30 * 24 * 60 * 60 * 1000

        for (const d of scansSnap.docs) {
            const data = d.data() || {}
            const ts = data.createdAt?.toDate?.() || null
            const evt = data.event

            if (evt === 'scan') {
                totals.scans++
                if (data.ip) uniqueIPs.add(data.ip)
            }
            if (evt === 'start_blessing') totals.startedBlessing++
            if (evt === 'photo_upload') totals.photoUploads++
            if (evt === 'blessing_sent_success') totals.blessings++
            if (evt === 'blessing_sent_error') totals.errors++

            // Daily bucket — only events within the last 30 days
            if (ts && ts.getTime() >= cutoff) {
                const key = dayKey(ts)
                if (!dailyMap.has(key)) dailyMap.set(key, { date: key, scan: 0, blessings: 0 })
                const b = dailyMap.get(key)
                if (evt === 'scan') b.scan++
                if (evt === 'blessing_sent_success') b.blessings++
            }
        }
        totals.uniqueScans = uniqueIPs.size

        const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))

        // 3) Entries count + recent blessing names. We pull only the
        //    fields we need to keep payload tiny.
        let entriesCount = 0
        const recentBlessings = []
        try {
            const entriesSnap = await adminDb
                .collection('weddings')
                .doc(weddingId)
                .collection('entries')
                .orderBy('createdAt', 'desc')
                .limit(2000)
                .get()
            entriesCount = entriesSnap.size
            for (const doc of entriesSnap.docs.slice(0, 10)) {
                const e = doc.data() || {}
                const from = e.guestName || e.name || e.guest || ''
                const ts = e.createdAt?.toDate?.()?.toISOString() || null
                recentBlessings.push({ from, ts })
            }
        } catch (err) {
            console.warn('[stats-public] entries query failed:', err?.message || err)
        }

        // 4) Pick the first digital edition token (if any) so the page
        //    can offer a "view the book" link.
        const digitalTokens = Array.isArray(w.digitalTokens) ? w.digitalTokens : []
        const digitalEditionLink = digitalTokens.length > 0
            ? `/wedding/${weddingId}/book/${digitalTokens[0]}`
            : null

        return NextResponse.json({
            ok: true,
            wedding: {
                brideName: w.brideNameHe || w.brideName || '',
                groomName: w.groomNameHe || w.groomName || '',
                celebrantName: w.celebrantNameHe || w.celebrantName || '',
                eventType: w.eventType || 'wedding',
                locale: w.locale || 'he',
            },
            totals,
            daily,
            recentBlessings,
            digitalEditionLink,
            entriesCount,
        })
    } catch (err) {
        console.error('[stats-public GET] failed:', err?.message || err)
        return NextResponse.json({ error: 'Query failed' }, { status: 500 })
    }
}
