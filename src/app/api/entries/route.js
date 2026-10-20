export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server'
import { authorizeWeddingAccess } from '@/app/api/guests/_auth'
import { ownerEntryView } from '@/lib/server/ownerViews'

export async function GET(req) {
    const { searchParams } = new URL(req.url)
    const weddingId = searchParams.get('weddingId')
    if (!weddingId) {
        return NextResponse.json({ error: 'Missing weddingId' }, { status: 400 })
    }

    const auth = await authorizeWeddingAccess(req, weddingId)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const snapshot = await auth.weddingRef.collection('entries').get()
    const entries = snapshot.docs.map(doc => ownerEntryView(doc.id, doc.data()))
    return NextResponse.json(entries, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(req) {
    const { searchParams } = new URL(req.url)
    const weddingId = searchParams.get('weddingId')
    if (!weddingId) {
        return NextResponse.json({ error: 'Missing weddingId' }, { status: 400 })
    }

    const auth = await authorizeWeddingAccess(req, weddingId)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    let body
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { type, content } = body || {}
    if (!type || !content) {
        return NextResponse.json({ error: 'Missing type or content' }, { status: 400 })
    }

    await auth.weddingRef.collection('entries').add({
        type,
        content,
        user: auth.decoded.uid,
        timestamp: new Date(),
    })

    return NextResponse.json({ success: true })
}
