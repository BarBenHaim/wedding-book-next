import { notFound } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebaseClient' // אם יש לך admin עדיף adminDb

export default async function WeddingLayout({ children, params }) {
    const { weddingId } = params

    // בדיקה במסד
    const ref = doc(db, 'weddings', weddingId)
    const snap = await getDoc(ref)

    if (!snap.exists()) {
        notFound()
    }

    return <div className='min-h-[calc(100vh-4rem)] bg-white'>{children}</div>
}
