import { NextResponse } from 'next/server'
import { getFirestore } from 'firebase-admin/firestore'
import { initializeApp, getApps, cert } from 'firebase-admin/app'

// נאתחל Firebase Admin פעם אחת בלבד
if (!getApps().length) {
    initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    })
}

const db = getFirestore()

// קריאה של כל הברכות עבור חתונה מסוימת
export async function GET(req) {
    const { searchParams } = new URL(req.url)
    const weddingId = searchParams.get('weddingId')

    if (!weddingId) {
        return NextResponse.json({ error: 'Missing weddingId' }, { status: 400 })
    }

    const snapshot = await db.collection('weddings').doc(weddingId).collection('entries').get()
    const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    return NextResponse.json(entries)
}

// הוספת ברכה חדשה לחתונה מסוימת
export async function POST(req) {
    const { searchParams } = new URL(req.url)
    const weddingId = searchParams.get('weddingId')

    if (!weddingId) {
        return NextResponse.json({ error: 'Missing weddingId' }, { status: 400 })
    }

    const { type, content, user } = await req.json()
    await db.collection('weddings').doc(weddingId).collection('entries').add({
        type,
        content,
        user,
        timestamp: new Date(),
    })

    return NextResponse.json({ success: true })
}
