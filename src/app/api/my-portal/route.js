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
        const matches = []
        const push = (d, w) => matches.push({ id: d.id, title: titleOf(w), eventType: w.eventType || 'wedding' })

        // Fast path: events saved since the phoneNormalized twin exists
        // resolve with ONE indexed query.
        const q = await adminDb.collection('weddings').where('phoneNormalized', '==', phone).get()
        q.forEach(d => push(d, d.data()))

        // Legacy fallback: older events stored only the raw typed phone —
        // scan + normalize server-side (small collections; disappears as
        // events get re-saved with the twin field).
        if (!matches.length) {
            const snap = await adminDb.collection('weddings').get()
            snap.forEach(d => {
                const w = d.data()
                const owner = normalizePhone(w.ownerPhone || w.phone || '')
                if (owner && owner === phone) push(d, w)
            })
        }

        if (!matches.length) {
            return NextResponse.json({ ok: false, error: 'not-found' }, { status: 404 })
        }
        return NextResponse.json({ ok: true, events: matches })
    } catch (err) {
        console.error('[my-portal] lookup failed', err)
        return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
    }
}
