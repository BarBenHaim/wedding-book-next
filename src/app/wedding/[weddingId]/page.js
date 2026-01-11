'use client'

// 1. הוספנו את 'use' לרשימת הייבוא
import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebaseClient'

export default function WeddingHome({ params }) {
    // 2. פתיחת ה-Promise באמצעות use()
    const { weddingId } = use(params)

    const [exists, setExists] = useState(null)
    const [names, setNames] = useState(null) // State לשמות הזוג

    useEffect(() => {
        async function checkWedding() {
            if (!weddingId) return

            try {
                const ref = doc(db, 'weddings', weddingId)
                const snap = await getDoc(ref)

                if (snap.exists()) {
                    setExists(true)
                    const data = snap.data()
                    // שמירת השמות אם קיימים
                    if (data.brideName || data.groomName) {
                        setNames({
                            bride: data.brideName || '',
                            groom: data.groomName || '',
                        })
                    }
                } else {
                    setExists(false)
                }
            } catch (err) {
                console.error('Error fetching wedding data:', err)
                setExists(false)
            }
        }
        checkWedding()
    }, [weddingId])

    if (exists === false) {
        return (
            <div className='flex h-screen items-center justify-center text-gray-700 text-lg'>
                לא נמצאה החתונה הזו 💔
            </div>
        )
    }

    return (
        <div className='relative h-[calc(100vh-4rem)] bg-gradient-to-br from-purple-50 via-white to-purple-100 font-sans flex flex-col items-center justify-center px-6'>
            {/* Glow רקע */}
            <div className='absolute -top-32 left-0 h-96 w-96 rounded-full bg-purple-300/30 blur-3xl'></div>
            <div className='absolute bottom-0 right-0 h-96 w-96 rounded-full bg-pink-300/40 blur-3xl'></div>

            {/* Hero */}
            <div className='relative z-10 text-center max-w-3xl mb-12'>
                <h1 className='text-4xl md:text-5xl font-extrabold text-gray-900 mb-6 leading-tight'>
                    <br />
                    ספר הברכות של {/* הצגת השמות רק אם נטענו */}
                    <br />
                    {names && (
                        <>
                            <span className='bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent'>
                                {names.bride} & {names.groom}
                            </span>
                        </>
                    )}
                </h1>
                <p className='text-lg text-gray-600'>
                    זהו המקום לשתף את הרגעים שלכם, לכתוב ברכות מרגשות ולהוסיף תמונות שישמרו לנצח.
                </p>
            </div>

            {/* כפתור יחיד – יצירת ברכה */}
            <div className='relative z-10 max-w-md w-full'>
                <Link
                    href={`/wedding/${weddingId}/photo`}
                    className='group rounded-2xl bg-white/90 backdrop-blur-md p-8 shadow-lg hover:shadow-2xl transition transform hover:-translate-y-1 text-center block'
                >
                    <div className='text-5xl mb-4 group-hover:scale-110 transition'>💜</div>
                    <h2 className='text-2xl font-bold text-gray-800 mb-2'>יצירת ברכה</h2>
                    <p className='text-gray-600 text-sm'>ברכה + תמונה – הכול במסך אחד פשוט.</p>
                </Link>
            </div>
        </div>
    )
}
