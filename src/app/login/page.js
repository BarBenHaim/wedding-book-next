'use client'

import { useState, useMemo } from 'react'
import { signInWithEmailAndPassword, getIdToken } from 'firebase/auth'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { auth, db } from '../../lib/firebaseClient'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getMessages } from '@/i18n/getMessages'

// Login is anonymous chrome — no wedding context to read locale from.
// We default to Hebrew (the SaaS's primary language) instead of sniffing
// the browser, which historically caused users with English-set browsers
// to see an English login screen even though they were Hebrew customers.

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const t = useMemo(() => getMessages('he').login, [])

    async function handleLogin(e) {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password)
            const user = userCredential.user

            // שולפים ID token מה־Firebase Auth
            const token = await getIdToken(user, true)
            await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
            })

            // חיפוש החתונה של המשתמש ב-Firestore לפי ownerId
            let weddingId = user.uid // fallback לתאימות אחורה
            const q = query(
                collection(db, 'weddings'),
                where('ownerId', '==', user.uid),
                limit(1)
            )
            const snap = await getDocs(q)
            if (!snap.empty) {
                weddingId = snap.docs[0].id
            }
            localStorage.setItem('weddingId', weddingId)

            router.push(`/wedding/${weddingId}/portal`)
        } catch (err) {
            setError(t.errorPrefix + err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className='relative flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-br from-[#F5F5F5] via-[#f0ebe3] to-[#ebe5da] px-4 sm:px-6 py-8 font-sans'>
            {/* Glow רקע */}
            <div className='absolute -top-24 left-10 h-72 w-72 rounded-full bg-[#AA8840]/10 blur-3xl'></div>
            <div className='absolute bottom-10 right-10 h-80 w-80 rounded-full bg-[#AA8840]/8 blur-3xl'></div>

            {/* כרטיס התחברות */}
            <div className='relative z-10 w-full max-w-md rounded-2xl bg-white/90 backdrop-blur-md p-6 sm:p-8 shadow-xl animate-scaleIn'>
                <img src='/logo-wt.png' alt='Wedding Tales' className='h-12 w-auto mx-auto mb-5 drop-shadow-[0_2px_8px_rgba(170,136,64,0.25)]' />

                {/* Decorative icon */}
                <div className='flex justify-center mb-3'>
                    <div className='w-12 h-12 rounded-full bg-[#AA8840]/10 flex items-center justify-center'>
                        <svg className='w-6 h-6 text-[#AA8840]' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={1.8}>
                            <path strokeLinecap='round' strokeLinejoin='round' d='M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z' />
                        </svg>
                    </div>
                </div>

                <h1 className='mb-1.5 text-center text-2xl font-bold text-[#18140F]'>{t.title}</h1>
                <p className='text-center text-sm text-[#5a5040] mb-6'>{t.subtitle}</p>

                {/* טופס */}
                <form onSubmit={handleLogin} className='space-y-4'>
                    <div className='text-start'>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>{t.emailLabel}</label>
                        <input
                            type='email'
                            placeholder='name@example.com'
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className='w-full rounded-xl border border-[#AA8840]/20 bg-[#AA8840]/5 px-4 py-3 text-gray-700 focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/20 outline-none transition-all'
                            dir='ltr'
                        />
                    </div>

                    <div className='text-start'>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>{t.passwordLabel}</label>
                        <div className='relative'>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder='••••••••'
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className='w-full rounded-xl border border-[#AA8840]/20 bg-[#AA8840]/5 px-4 py-3 pl-12 text-gray-700 focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/20 outline-none transition-all'
                                dir='ltr'
                            />
                            <button
                                type='button'
                                onClick={() => setShowPassword(!showPassword)}
                                className='absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#AA8840] transition-colors'
                                tabIndex={-1}
                            >
                                {showPassword ? (
                                    <svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={1.5}><path strokeLinecap='round' strokeLinejoin='round' d='M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88' /></svg>
                                ) : (
                                    <svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={1.5}><path strokeLinecap='round' strokeLinejoin='round' d='M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z' /><path strokeLinecap='round' strokeLinejoin='round' d='M15 12a3 3 0 11-6 0 3 3 0 016 0z' /></svg>
                                )}
                            </button>
                        </div>
                    </div>

                    <button
                        type='submit'
                        disabled={loading}
                        className='w-full rounded-xl gold-shimmer px-6 py-3.5 text-lg font-semibold text-white shadow-lg hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100'
                    >
                        {loading ? (
                            <span className='flex items-center justify-center gap-2'>
                                <svg className='w-5 h-5 animate-spin' fill='none' viewBox='0 0 24 24'>
                                    <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4'/>
                                    <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8v8z'/>
                                </svg>
                                {t.submitting}
                            </span>
                        ) : t.submit}
                    </button>
                </form>

                {error && <p className='mt-4 text-center text-sm text-red-600 bg-red-50 rounded-xl py-2.5 px-3'>{error}</p>}

                {/* Help text */}
                <div className='mt-6 pt-5 border-t border-gray-100 text-center'>
                    <p className='text-sm text-gray-400'>
                        {t.helpText}
                    </p>
                </div>
            </div>
        </div>
    )
}
