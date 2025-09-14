'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../../lib/firebaseClient'
import { useRouter } from 'next/navigation'

export default function Header() {
    const [user, setUser] = useState(null)
    const [weddingId, setWeddingId] = useState(null)
    const router = useRouter()

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, currentUser => {
            setUser(currentUser)
        })

        const idFromStorage = localStorage.getItem('weddingId')
        if (idFromStorage) {
            setWeddingId(idFromStorage)
        }

        return () => unsubscribe()
    }, [])

    async function handleLogout() {
        await signOut(auth)
        localStorage.removeItem('weddingId')
        router.push('/')
    }

    return (
        <header className='sticky top-0 left-0 right-0 h-16 z-50 border-b border-pink-100 bg-white/80 backdrop-blur-md shadow-sm'>
            <nav className='mx-auto flex max-w-6xl items-center justify-between px-6 py-4'>
                {/* לוגו */}
                <Link
                    href={weddingId ? `/wedding/${weddingId}` : '/'}
                    className='text-xl font-serif font-bold text-pink-600 hover:text-pink-700 transition'
                >
                    💍 Wedding Book
                </Link>

                {/* פעולות */}
                <div className='flex items-center gap-4'>
                    {!user ? (
                        <>
                            <Link
                                href='/login'
                                className='rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white shadow hover:bg-pink-600 transition'
                            >
                                התחברות
                            </Link>
                            <Link
                                href='/register'
                                className='rounded-lg border border-pink-400 px-4 py-2 text-sm font-medium text-pink-600 hover:bg-pink-50 transition'
                            >
                                הרשמה
                            </Link>
                        </>
                    ) : (
                        <>
                            <span className='text-sm text-gray-600 hidden sm:inline'>
                                מחובר כ־ <span className='font-medium'>{user.email}</span>
                            </span>
                            <button
                                onClick={handleLogout}
                                className='rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition'
                            >
                                התנתקות
                            </button>
                        </>
                    )}
                </div>
            </nav>
        </header>
    )
}
