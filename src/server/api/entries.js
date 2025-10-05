import { NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebaseAdmin'

export default async function handler(req) {
    if (process.env.NEXT_PHASE === 'phase-production-build') return NextResponse.json({ ok: true })

    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const token = authHeader.split('Bearer ')[1]
    let decoded
    try {
        decoded = await adminAuth.verifyIdToken(token)
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const weddingId = searchParams.get('weddingId')
    if (!weddingId) return NextResponse.json({ error: 'Missing weddingId' }, { status: 400 })

    if (req.method === 'GET') {
        const snapshot = await adminDb.collection('weddings').doc(weddingId).collection('entries').get()
        const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        return NextResponse.json(entries)
    }

    if (req.method === 'POST') {
        let body
        try {
            body = await req.json()
        } catch {
            return NextResponse.json({ error: 'Invalid or empty JSON body' }, { status: 400 })
        }

        const { type, content } = body || {}
        if (!type || !content) return NextResponse.json({ error: 'Missing type or content' }, { status: 400 })

        await adminDb.collection('weddings').doc(weddingId).collection('entries').add({
            type,
            content,
            user: decoded.uid,
            timestamp: new Date(),
        })
        return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
