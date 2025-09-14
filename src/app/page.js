'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebaseClient'

export default function Home() {
    const [weddingId, setWeddingId] = useState('')
    const [error, setError] = useState('')
    const router = useRouter()

    const handleJoin = async () => {
        setError('')
        if (!weddingId.trim()) return

        try {
            const docRef = doc(db, 'weddings', weddingId.trim())
            const docSnap = await getDoc(docRef)

            if (docSnap.exists()) {
                router.push(`/wedding/${weddingId}`)
            } else {
                setError('מזהה חתונה לא נמצא. בדוק שוב או פנה לזוג.')
            }
        } catch (err) {
            console.error(err)
            setError('אירעה שגיאה, נסה שוב.')
        }
    }

    return (
        <div className='flex h-screen items-center justify-center bg-gradient-to-br from-pink-50 via-white to-pink-100 px-4'>
            <div className='w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl'>
                <h1 className='mb-4 text-3xl font-serif text-gray-800'>
                    📖 ברוכים הבאים ל־<span className='text-pink-600'>Wedding Book</span>
                </h1>
                <p className='mb-6 text-gray-600'>הכניסו מזהה חתונה או השתמשו בלינק שקיבלתם מהזוג:</p>

                <input
                    type='text'
                    placeholder='מזהה חתונה (w123)'
                    value={weddingId}
                    onChange={e => setWeddingId(e.target.value)}
                    className='w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-gray-700 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-200'
                />

                <button
                    onClick={handleJoin}
                    className='mt-6 w-full rounded-lg bg-pink-500 px-6 py-3 text-lg font-medium text-white shadow-md transition hover:bg-pink-600'
                >
                    עבור לחתונה
                </button>

                {error && <p className='mt-4 text-sm text-red-600'>{error}</p>}
            </div>
        </div>
    )
}
