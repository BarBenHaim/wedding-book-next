// src/app/api/admin/wedding-stats/route.js
//
// Super-admin only. Returns the funnel + recent activity for a wedding:
//
//   {
//     scans: number,            // total 'scan' events ever logged
//     uniqueScans: number,      // distinct IPs across scan events
//     startedBlessing: number,  // 'start_blessing' events
//     submitted: number,        // count of entries subcollection
//     recentScans: [            // last 50, newest first
//       { event, ip, userAgent, referer, createdAt }
//     ],
//     hourly: [                 // last 24 hours, bucket by hour
//       { hour: '2026-05-04T18:00:00Z', count }
//     ],
//   }
//
// Read-only. The funnel is derived inside this handler so the admin UI
// doesn't have to duplicate the de-duplication logic.

import { NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function verifySuperAdmin(req) {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null
    try {
        const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1])
        if (!isSuperAdmin(decoded.email)) return null
        return decoded
    } catch {
        return null
    }
}

export async function GET(req) {
    const admin = await verifySuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const weddingId = (searchParams.get('weddingId') || '').trim()
    if (!weddingId) {
        return NextResponse.json({ error: 'Missing weddingId' }, { status: 400 })
    }

    try {
        // Pull every scan doc for this wedding. For a typical wedding
        // (≤500 events) this is fine; if a wedding ever blows past
        // 5,000 we'd switch to aggregated counter docs, but no need
        // for that complexity yet.
        const scansSnap = await adminDb
            .collection('weddings')
            .doc(weddingId)
            .collection('scans')
            .orderBy('createdAt', 'desc')
            .limit(2000)
            .get()

        let scans = 0
        let startedBlessing = 0
        const ipsScan = new Set()
        const recentScans = []
        const hourBuckets = new Map() // ISO hour → count

        for (const doc of scansSnap.docs) {
            const d = doc.data()
            const ts = d.createdAt?.toDate?.() || null
            if (d.event === 'scan') {
                scans++
                if (d.ip) ipsScan.add(d.ip)
                if (ts) {
                    const hour = new Date(ts)
                    hour.setMinutes(0, 0, 0)
                    const key = hour.toISOString()
                    hourBuckets.set(key, (hourBuckets.get(key) || 0) + 1)
                }
            } else if (d.event === 'start_blessing') {
                startedBlessing++
            }
            if (recentScans.length < 50) {
                recentScans.push({
                    event: d.event,
                    ip: d.ip || '',
                    userAgent: d.userAgent || '',
                    referer: d.referer || '',
                    createdAt: ts ? ts.toISOString() : null,
                })
            }
        }

        // Submitted count comes from the entries subcollection — each
        // blessing IS a successful submission. We use the lighter `count`
        // aggregation rather than reading every doc.
        let submitted = 0
        try {
            const entriesAgg = await adminDb
                .collection('weddings')
                .doc(weddingId)
                .collection('entries')
                .count()
                .get()
            submitted = entriesAgg.data().count || 0
        } catch {
            /* old projects without count() — fall back to length */
            const entriesSnap = await adminDb
                .collection('weddings')
                .doc(weddingId)
                .collection('entries')
                .get()
            submitted = entriesSnap.size
        }

        // Sort hourly buckets oldest → newest, keep last 24.
        const hourly = Array.from(hourBuckets.entries())
            .sort((a, b) => (a[0] < b[0] ? -1 : 1))
            .slice(-24)
            .map(([hour, count]) => ({ hour, count }))

        return NextResponse.json({
            scans,
            uniqueScans: ipsScan.size,
            startedBlessing,
            submitted,
            recentScans,
            hourly,
        })
    } catch (err) {
        console.error('[wedding-stats] failed:', err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
