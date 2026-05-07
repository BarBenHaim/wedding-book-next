// src/app/api/log-event/route.js
//
// Lightweight tracking endpoint. Guest pages POST one of these events:
//
//   • 'scan'           — landed on the wedding's guest page (someone scanned
//                        the QR or clicked the shared link)
//   • 'start_blessing' — opened the photo/blessing form (real intent to write)
//
// 'submitted' isn't tracked here — it's already implicit from the entries
// subcollection (each blessing IS a submission, with its own createdAt).
//
// We deliberately do NOT auth this endpoint: guests are anonymous, and
// requiring auth would either prevent logging or force us to expose a
// public token. Instead we whitelist event names + cap field sizes to
// prevent abuse from inflating Firestore costs.
//
// Each call writes one doc to weddings/{id}/scans/{auto}, capturing
// timestamp + user agent + IP + referrer. Failures are swallowed —
// returning a 5xx to a fire-and-forget tracker would do nothing useful.

import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_EVENTS = new Set(['scan', 'start_blessing'])

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}))
        const weddingId = typeof body.weddingId === 'string' ? body.weddingId.trim() : ''
        const event = typeof body.event === 'string' ? body.event : ''

        if (!weddingId || !ALLOWED_EVENTS.has(event)) {
            return NextResponse.json({ ok: false }, { status: 400 })
        }

        const userAgent = (req.headers.get('user-agent') || '').slice(0, 200)
        const ipHeader = req.headers.get('x-forwarded-for') || ''
        const ip = ipHeader.split(',')[0].trim().slice(0, 64)
        const referer = (req.headers.get('referer') || '').slice(0, 200)

        await adminDb
            .collection('weddings')
            .doc(weddingId)
            .collection('scans')
            .add({
                event,
                createdAt: FieldValue.serverTimestamp(),
                userAgent,
                ip,
                referer,
            })

        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[log-event] failed:', err)
        return NextResponse.json({ ok: false }, { status: 500 })
    }
}
