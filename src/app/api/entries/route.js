export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebaseAdmin'

// פונקציית עזר לבדוק טוקן
async function verifyUser(req) {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null

    const token = authHeader.split('Bearer ')[1]
    try {
        const decoded = await adminAuth.verifyIdToken(token)
        return decoded
    } catch {
        return null
    }
}

// GET - קריאה של כל הברכות
export async function GET(req) {
    const user = await verifyUser(req)
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const weddingId = searchParams.get('weddingId')

    if (!weddingId) {
        return NextResponse.json({ error: 'Missing weddingId' }, { status: 400 })
    }

    const snapshot = await adminDb.collection('weddings').doc(weddingId).collection('entries').get()

    const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    return NextResponse.json(entries)
}

export async function POST(req) {
    const user = await verifyUser(req)
    if (!user) {
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
        return NextResponse.json({ error: 'Invalid or empty JSON body' }, { status: 400 })
    }

    const { type, content } = body || {}
    if (!type || !content) {
        return NextResponse.json({ error: 'Missing type or content' }, { status: 400 })
    }

    await adminDb.collection('weddings').doc(weddingId).collection('entries').add({
        type,
        content,
        user: user.uid,
        timestamp: new Date(),
    })

    return NextResponse.json({ success: true })
}
