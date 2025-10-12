export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server'
import { db, auth } from '@/lib/firebaseAdmin'

export async function GET(req) {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.split('Bearer ')[1]
    let decoded
    try {
        decoded = await auth.verifyIdToken(token)
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const weddingId = searchParams.get('weddingId')
    if (!weddingId) {
        return NextResponse.json({ error: 'Missing weddingId' }, { status: 400 })
    }

    const snapshot = await db.collection('weddings').doc(weddingId).collection('entries').get()

    const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    return NextResponse.json(entries)
}

export async function POST(req) {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.split('Bearer ')[1]
    let decoded
    try {
        decoded = await auth.verifyIdToken(token)
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const weddingId = searchParams.get('weddingId')
    if (!weddingId) {
        return NextResponse.json({ error: 'Missing weddingId' }, { status: 400 })
    }

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

    await db.collection('weddings').doc(weddingId).collection('entries').add({
        type,
        content,
        user: decoded.uid,
        timestamp: new Date(),
    })

    return NextResponse.json({ success: true })
}
