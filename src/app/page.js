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
        <div className='relative min-h-[calc(100vh-4rem)] w-full bg-gradient-to-br from-purple-50 via-white to-purple-100 overflow-hidden font-sans'>
            {/* Glow רקע */}
            <div className='absolute -top-20 -left-20 h-96 w-96 rounded-full bg-purple-300/40 blur-3xl'></div>
            <div className='absolute bottom-0 right-0 h-96 w-96 rounded-full bg-pink-300/40 blur-3xl'></div>

            {/* Hero */}
            <section className='relative z-10 flex flex-col items-center text-center px-6 pt-20 pb-28'>
                <h2 className='text-5xl font-extrabold text-gray-900 mb-4 leading-tight'>
                    ספר הזיכרונות של <br />
                    <span className='text-purple-600'>Wedding Book</span>
                </h2>
                <p className='text-lg text-gray-600 mb-10 max-w-2xl'>
                    מקום אחד שבו כל הברכות, התמונות והרגעים שלכם נשמרים לנצח.
                </p>

                {/* טופס */}
                <div className='w-full max-w-md bg-white/90 backdrop-blur-md rounded-2xl shadow-xl p-6 space-y-4'>
                    <input
                        type='text'
                        placeholder='הכניסו מזהה חתונה (w123)'
                        value={weddingId}
                        onChange={e => setWeddingId(e.target.value)}
                        className='w-full rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-center text-gray-700 focus:border-purple-400 focus:ring-2 focus:ring-purple-200'
                    />
                    <button
                        onClick={handleJoin}
                        className='w-full rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-3 text-lg font-semibold text-white shadow-lg hover:scale-105 transition'
                    >
                        ✨ עבור לחתונה
                    </button>
                    {error && <p className='text-sm text-red-600'>{error}</p>}
                </div>
            </section>

            {/* כרטיסי יתרונות */}
            <section className='relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto px-6 pb-20'>
                {[
                    { icon: '📸', title: 'שומרים את הרגעים', desc: 'כל התמונות נשארות במקום אחד' },
                    { icon: '💌', title: 'ברכות מהלב', desc: 'האורחים מוסיפים ברכות אישיות בקלות' },
                    { icon: '📖', title: 'ספר יוקרתי', desc: 'הופכים את החתונה שלכם לספר מעוצב' },
                ].map((card, i) => (
                    <div key={i} className='rounded-2xl bg-white p-8 text-center shadow-lg hover:shadow-2xl transition'>
                        <div className='mb-4 text-5xl'>{card.icon}</div>
                        <h3 className='text-xl font-semibold text-purple-700 mb-2'>{card.title}</h3>
                        <p className='text-gray-600'>{card.desc}</p>
                    </div>
                ))}
            </section>
        </div>
    )
}
