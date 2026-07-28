// GET /api/guests?weddingId=... — owner/super-admin: list all guests
// for the wedding, sorted by name (Hebrew locale collation done client-
// side; server just returns them in stored order + sort by lowercased
// name here for cheap consistency).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server'
import { authorizeWeddingAccess } from './_auth'

function tsToIso(v) {
    if (!v) return null
    if (typeof v?.toDate === 'function') return v.toDate().toISOString()
    if (typeof v === 'string') return v
    return null
}

export async function GET(req) {
    const { searchParams } = new URL(req.url)
    const weddingId = searchParams.get('weddingId') || ''

    const auth = await authorizeWeddingAccess(req, weddingId)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    try {
        const snap = await auth.weddingRef.collection('guests').get()
        const guests = snap.docs.map(d => {
            const data = d.data() || {}
            return {
                id: d.id,
                name: data.name || '',
                phone: data.phone || '',
                group: data.group || '',
                invitedAt: tsToIso(data.invitedAt),
                wroteAt: tsToIso(data.wroteAt),
                entryId: data.entryId || null,
            }
        })
        // Sort by name (client will do a proper Hebrew Intl.Collator; this
        // is a stable "good enough" default).
        guests.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'))
        return NextResponse.json(guests)
    } catch (err) {
        console.error('[api/guests] GET error', err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
