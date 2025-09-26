'use client'

import { useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../../lib/firebaseClient'
import { useRouter, usePathname } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../lib/firebaseClient'

export default function Header() {
    const [user, setUser] = useState(null)
    const router = useRouter()
    const pathname = usePathname()

    // חילוץ weddingId מה־URL אם קיים
    const weddingIdFromUrl = pathname.startsWith('/wedding/') ? pathname.split('/')[2] : null

    const [weddingId, setWeddingId] = useState(null)

    useEffect(() => {
        onAuthStateChanged(auth, async currentUser => {
            setUser(currentUser)

            if (currentUser) {
                let id = localStorage.getItem('weddingId')
                if (!id) {
                    const userDoc = await getDoc(doc(db, 'users', currentUser.uid))
                    if (userDoc.exists() && userDoc.data().weddingId) {
                        id = userDoc.data().weddingId
                        localStorage.setItem('weddingId', id)
                    }
                }
                setWeddingId(id || weddingIdFromUrl)
            } else {
                setWeddingId(weddingIdFromUrl)
            }
        })
    }, [weddingIdFromUrl])

    async function handleLogout() {
        await signOut(auth)
        localStorage.removeItem('weddingId')

        await fetch('/api/logout', { method: 'POST' })

        router.push('/')
    }

    function handleLogoClick() {
        if (weddingIdFromUrl) {
            router.push(`/wedding/${weddingIdFromUrl}`)
        } else {
            const id = localStorage.getItem('weddingId')
            router.push(id ? `/wedding/${id}` : '/')
        }
    }

    return (
        <header className='sticky top-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-md shadow-sm'>
            <nav className='mx-auto flex max-w-7xl items-center justify-between px-6 py-3'>
                {/* פעולות */}
                <div className='flex items-center gap-3'>
                    {/* אם אין משתמש וגם אין weddingId ב־URL → מציג התחברות/הרשמה */}
                    {!user && !weddingIdFromUrl ? (
                        <>
                            <button
                                onClick={() => router.push('/login')}
                                className='rounded-full bg-gradient-to-r from-purple-600 to-pink-500 px-5 py-2 text-sm font-medium text-white shadow-md hover:scale-105 transition'
                            >
                                התחברות
                            </button>
                            <button
                                onClick={() => router.push('/register')}
                                className='rounded-full border border-purple-400 px-5 py-2 text-sm font-medium text-purple-700 hover:bg-purple-50 transition'
                            >
                                הרשמה
                            </button>
                        </>
                    ) : null}

                    {/* אם יש משתמש → מוסיפים גישה ל־viewer ו־admin */}
                    {user && weddingId && (
                        <>
                            <button
                                onClick={() => router.push(`/wedding/${weddingId}/viewer`)}
                                className='rounded-full bg-purple-100 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-200 transition'
                            >
                                צפייה בספר
                            </button>
                            <button
                                onClick={() => router.push(`/wedding/${weddingId}/admin`)}
                                className='rounded-full bg-pink-100 px-4 py-2 text-sm font-medium text-pink-700 hover:bg-pink-200 transition'
                            >
                                ניהול
                            </button>
                            <button
                                onClick={handleLogout}
                                className='rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition'
                            >
                                התנתקות
                            </button>
                        </>
                    )}
                </div>

                {/* Great Vibes */}
                <button
                    onClick={handleLogoClick}
                    style={{
                        fontFamily: "'Great Vibes', cursive",
                        fontSize: '26px',
                        backgroundImage: 'linear-gradient(to right, #ec4899, #9333ea)',
                        WebkitBackgroundClip: 'text',
                        color: 'transparent',
                        fontWeight: '100',
                        transition: 'opacity 0.3s',
                        textAlign: 'left',
                    }}
                    onMouseOver={e => (e.currentTarget.style.opacity = '0.8')}
                    onMouseOut={e => (e.currentTarget.style.opacity = '1')}
                >
                    Wedding Tales
                </button>
            </nav>
        </header>
    )
}
