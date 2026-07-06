export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// POST /api/notify-blessing { weddingId, name }
//
// Fired (best-effort) by the guest page right after a blessing is
// saved. Sends a push notification to every Expo push token the
// owner's mobile app registered on the wedding doc (pushTokens[]).
//
// Guards: the wedding must exist, and sends are rate-limited to one
// per 20 seconds per wedding (lastNotifyAt) so a burst of uploads
// can't spam the owner or the Expo push API.

import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'

const MIN_GAP_MS = 20 * 1000

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}))
        const weddingId = typeof body.weddingId === 'string' ? body.weddingId.trim() : ''
        const guestName = (typeof body.name === 'string' ? body.name : '').slice(0, 40).trim()
        if (!weddingId) return NextResponse.json({ ok: false }, { status: 400 })

        const ref = adminDb.collection('weddings').doc(weddingId)
        const snap = await ref.get()
        if (!snap.exists) return NextResponse.json({ ok: false }, { status: 404 })
        const data = snap.data() || {}

        const tokens = (Array.isArray(data.pushTokens) ? data.pushTokens : [])
            .filter(t => typeof t === 'string' && t.startsWith('ExponentPushToken'))
        if (tokens.length === 0) return NextResponse.json({ ok: true, sent: 0 })

        const last = data.lastNotifyAt?.toMillis?.() || 0
        if (Date.now() - last < MIN_GAP_MS) return NextResponse.json({ ok: true, throttled: true })
        await ref.set({ lastNotifyAt: FieldValue.serverTimestamp() }, { merge: true })

        const messages = tokens.map(to => ({
            to,
            sound: 'default',
            title: 'ברכה חדשה בספר! 💛',
            body: guestName ? `${guestName} הרגע כתבו לכם ברכה` : 'מישהו הרגע כתב לכם ברכה',
            data: { type: 'new_blessing', weddingId },
        }))

        const res = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(messages),
        })
        const out = await res.json().catch(() => null)
        return NextResponse.json({ ok: true, sent: tokens.length, expo: out?.data ? 'ok' : 'unknown' })
    } catch (err) {
        console.warn('[notify-blessing] failed:', err?.message || err)
        return NextResponse.json({ ok: false }, { status: 500 })
    }
}
