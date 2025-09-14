'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebaseClient' // עדכן נתיב לפי מיקום הקובץ

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
        <div className='container'>
            <div className='card' style={{ textAlign: 'center' }}>
                <h1 className='title'>📖 ברוכים הבאים ל־Wedding Book</h1>
                <p>הכניסו מזהה חתונה או השתמשו בלינק שקיבלתם מהזוג:</p>

                <input
                    type='text'
                    placeholder='מזהה חתונה (w123)'
                    value={weddingId}
                    onChange={e => setWeddingId(e.target.value)}
                    style={{ padding: 12, marginTop: 12, borderRadius: 8, border: '1px solid #ccc' }}
                />

                <button onClick={handleJoin} className='btn btn-primary' style={{ marginTop: 16 }}>
                    עבור לחתונה
                </button>

                {error && <p style={{ color: 'red', marginTop: 12 }}>{error}</p>}
            </div>
        </div>
    )
}
