// POST /api/my-portal — the customer's "one link for everyone" login.
//
// The couple gets a single, constant URL (app.weddingtales.co.il/my),
// enters the mobile phone number the studio put on their event, and is
// routed to their portal (the management home for their book). Simple
// on purpose (owner decision): possession of the event's phone number
// is the credential, like a restaurant reservation lookup.
//
// The admin SDK does the lookup (client Firestore can't query by phone
// without opening reads), and we normalize aggressively so 054-123-4567,
// +972541234567 and 0541234567 all match.
import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normalizePhone(raw) {
    let p = (raw || '').toString().replace(/[^\d+]/g, '')
    if (!p) return ''
    if (p.startsWith('+')) p = p.slice(1)
    if (p.startsWith('00')) p = p.slice(2)
    if (p.startsWith('0')) p = '972' + p.slice(1)
    return p
}

function titleOf(w) {
    if (w.celebrantName) return w.celebrantName
    if (w.brideName || w.groomName) return [w.brideName, w.groomName].filter(Boolean).join(' & ')
    return 'האירוע שלכם'
}

export async function POST(req) {
    let body
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ ok: false, error: 'bad-json' }, { status: 400 })
    }

    const phone = normalizePhone(body?.phone)
    if (!phone || phone.length < 11) {
        return NextResponse.json({ ok: false, error: 'bad-phone' }, { status: 400 })
    }

    try {
        // Phones are stored as typed (usually 05x…) — scan and normalize
        // server-side. Event counts are small (hundreds), so a full scan
        // is fine and keeps us format-agnostic.
        const snap = await adminDb.collection('weddings').get()
        const matches = []
        snap.forEach(d => {
            const w = d.data()
            const owner = normalizePhone(w.ownerPhone || w.phone || '')
            if (owner && owner === phone) {
                matches.push({ id: d.id, title: titleOf(w), eventType: w.eventType || 'wedding' })
            }
        })

        if (!matches.length) {
            return NextResponse.json({ ok: false, error: 'not-found' }, { status: 404 })
        }
        return NextResponse.json({ ok: true, events: matches })
    } catch (err) {
        console.error('[my-portal] lookup failed', err)
        return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
    }
}
