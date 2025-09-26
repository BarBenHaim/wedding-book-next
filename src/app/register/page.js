'use client'

import { useState } from 'react'
import { createUserWithEmailAndPassword, getIdToken } from 'firebase/auth'
import { auth, db } from '../../lib/firebaseClient'
import { useRouter } from 'next/navigation'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'

export default function RegisterPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const router = useRouter()

    async function handleRegister(e) {
        e.preventDefault()
        setError('')
        try {
            if (password.length < 6) {
                setError('הסיסמה חייבת להיות לפחות 6 תווים')
                return
            }

            // יצירת משתמש ב־Firebase
            const userCredential = await createUserWithEmailAndPassword(auth, email, password)
            const user = userCredential.user
            const weddingId = user.uid

            // יצירת מסמך לחתונה ב־Firestore
            await setDoc(doc(db, 'weddings', weddingId), {
                ownerEmail: email,
                createdAt: serverTimestamp(),
            })

            // השגת ID Token מה־user
            const token = await getIdToken(user, true)

            // שמירת token ב־cookie דרך API
            await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
            })

            // אפשר גם להשאיר weddingId ב־localStorage אם צריך בקליינט
            localStorage.setItem('weddingId', weddingId)

            router.push(`/wedding/${weddingId}/admin`)
        } catch (err) {
            setError('שגיאה בהרשמה: ' + err.message)
        }
    }

    return (
        <div className='relative flex h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-br from-purple-50 via-white to-purple-100 px-4 font-sans'>
            {/* Glow רקע */}
            <div className='absolute -top-24 left-10 h-72 w-72 rounded-full bg-purple-300/40 blur-3xl'></div>
            <div className='absolute bottom-10 right-10 h-80 w-80 rounded-full bg-pink-300/40 blur-3xl'></div>

            <div className='relative z-10 w-full max-w-md rounded-2xl bg-white/90 backdrop-blur-md p-8 shadow-xl'>
                <h1 className='mb-6 text-center text-3xl font-bold text-gray-800'>הרשמה לחתן ולכלה</h1>

                <form onSubmit={handleRegister} className='space-y-5'>
                    <div className='text-right'>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>אימייל</label>
                        <input
                            type='email'
                            placeholder='name@example.com'
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className='w-full rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-gray-700 focus:border-purple-400 focus:ring-2 focus:ring-purple-200'
                        />
                    </div>

                    <div className='text-right'>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>סיסמה</label>
                        <input
                            type='password'
                            placeholder='••••••••'
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className='w-full rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-gray-700 focus:border-purple-400 focus:ring-2 focus:ring-purple-200'
                        />
                    </div>

                    <button
                        type='submit'
                        className='w-full rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-3 text-lg font-semibold text-white shadow-lg hover:scale-105 transition'
                    >
                        הרשם
                    </button>
                </form>

                {error && <p className='mt-6 text-center text-sm text-red-600 bg-red-50 rounded-xl py-2'>{error}</p>}
            </div>
        </div>
    )
}
