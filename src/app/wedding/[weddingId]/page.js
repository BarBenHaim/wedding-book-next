import Link from 'next/link'
import { notFound } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebaseClient'

export default async function WeddingHome({ params }) {
    const { weddingId } = params

    // בודק במסד הנתונים אם החתונה קיימת
    const ref = doc(db, 'weddings', weddingId)
    const snap = await getDoc(ref)

    if (!snap.exists()) {
        notFound() // שולח ל-app/not-found.js
    }

    return (
        <div className='container mx-auto px-4 py-12'>
            <div className='rounded-xl bg-white p-8 text-center shadow-lg'>
                <h1 className='mb-4 text-3xl font-serif text-gray-800'>📖 ספר ברכות החתונה</h1>
                <p className='text-gray-600'>
                    ברוכים הבאים לחתונה: <strong>{weddingId}</strong>
                </p>

                <div className='mt-8 flex flex-wrap items-center justify-center gap-4'>
                    <Link
                        href={`/wedding/${weddingId}/text`}
                        className='rounded-lg bg-pink-500 px-6 py-3 text-white shadow hover:bg-pink-600 transition'
                    >
                        ✍️ כתיבת ברכה
                    </Link>
                    <Link
                        href={`/wedding/${weddingId}/photo`}
                        className='rounded-lg bg-yellow-400 px-6 py-3 text-gray-800 shadow hover:bg-yellow-500 transition'
                    >
                        📷 צילום ברכה
                    </Link>
                </div>
            </div>
        </div>
    )
}
