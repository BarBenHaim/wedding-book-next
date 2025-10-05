import { adminDb } from '@/lib/firebaseAdmin'

export default async function WeddingLayout({ children, params }) {
    const { weddingId } = params

    const snap = await adminDb.collection('weddings').doc(weddingId).get()

    // אם אתה רוצה לבדוק שהמסמך קיים:
    if (!snap.exists) {
        console.warn(`Wedding ${weddingId} not found`)
    }

    return <div className='min-h-[calc(100vh-4rem)] bg-white'>{children}</div>
}
