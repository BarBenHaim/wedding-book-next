'use client'

import { useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../../lib/firebaseClient'
import { useRouter, usePathname } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../lib/firebaseClient'

export default function Header() {
    const [user, setUser] = useState(null)
    const [menuOpen, setMenuOpen] = useState(false)
    const router = useRouter()
    const pathname = usePathname()

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
        if (weddingIdFromUrl) router.push(`/wedding/${weddingIdFromUrl}`)
        else {
            const id = localStorage.getItem('weddingId')
            router.push(id ? `/wedding/${id}` : '/')
        }
    }

    return (
        <>
            <header className='sticky top-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-md shadow-sm'>
                <nav className='mx-auto flex max-w-7xl items-center justify-between px-6 py-3'>
                    {/* ✔ אייקון המבורגר — רק למשתמש מחובר + weddingId */}
                    {user && weddingId && (
                        <div className='md:hidden'>
                            <button
                                onClick={() => setMenuOpen(prev => !prev)}
                                className='relative w-8 h-4 flex flex-col justify-center items-center space-y-1.5'
                            >
                                <span className='block h-0.5 w-full bg-gray-700 rounded' />
                                <span className='block h-0.5 w-full bg-gray-700 rounded' />
                                <span className='block h-0.5 w-full bg-gray-700 rounded' />
                            </button>
                        </div>
                    )}

                    {/* כפתורים בדסקטופ */}
                    <div className='hidden md:flex items-center gap-3'>
                        {!user && !weddingIdFromUrl && (
                            <button
                                onClick={() => router.push('/login')}
                                className='rounded-full bg-gradient-to-r from-purple-600 to-pink-500 px-5 py-2 text-sm font-medium text-white shadow-md cursor-pointer'
                            >
                                התחברות
                            </button>
                        )}

                        {user && weddingId && (
                            <>
                                <button
                                    onClick={() => router.push(`/wedding/${weddingId}/viewer`)}
                                    className='rounded-full bg-purple-100 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-200 transition cursor-pointer'
                                >
                                    עיצוב הספר
                                </button>

                                <button
                                    onClick={() => router.push(`/wedding/${weddingId}/admin`)}
                                    className='rounded-full bg-pink-100 px-4 py-2 text-sm font-medium text-pink-700 hover:bg-pink-200 transition cursor-pointer'
                                >
                                    ניהול הברכות
                                </button>

                                <button
                                    onClick={() => router.push(`/wedding/${weddingId}/portal`)}
                                    className='rounded-full bg-gradient-to-r from-purple-600 to-pink-500 px-4 py-2 text-sm font-medium text-white shadow-md hover:opacity-90 transition cursor-pointer'
                                >
                                    QR ושיתוף
                                </button>

                                <button
                                    onClick={handleLogout}
                                    className='rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition cursor-pointer'
                                >
                                    התנתקות
                                </button>
                            </>
                        )}
                    </div>

                    {/* לוגו */}
                    <button
                        className='cursor-pointer'
                        onClick={handleLogoClick}
                        style={{
                            fontFamily: "'Great Vibes', cursive",
                            fontSize: '26px',
                            backgroundImage: 'linear-gradient(to right, #ec4899, #9333ea)',
                            WebkitBackgroundClip: 'text',
                            color: 'transparent',
                            fontWeight: '100',
                            transition: 'opacity 0.3s',
                        }}
                    >
                        Wedding Tales
                    </button>
                </nav>
            </header>

            {/* ✔ שכבת רקע — לחיצה חוץ → סגירה */}
            {menuOpen && (
                <div className='fixed inset-0 bg-black/40 z-40 md:hidden' onClick={() => setMenuOpen(false)} />
            )}

            {/* ✔ Drawer צד — מיושר לימין */}
            <div
                className={`fixed top-0 right-0 h-full w-64 bg-white shadow-lg z-50 transform transition-transform duration-300 ${
                    menuOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                <div className='flex flex-col items-end text-right p-6 space-y-4'>
                    {/* מצב לא מחובר */}
                    {!user && !weddingIdFromUrl && (
                        <button
                            onClick={() => {
                                router.push('/login')
                                setMenuOpen(false)
                            }}
                            className='text-gray-700 text-lg self-start'
                        >
                            התחברות
                        </button>
                    )}

                    {/* כפתורי משתמש מחובר */}
                    {user && weddingId && (
                        <>
                            <button
                                onClick={() => {
                                    router.push(`/wedding/${weddingId}/viewer`)
                                    setMenuOpen(false)
                                }}
                                className='text-gray-700 text-lg self-start'
                            >
                                עיצוב הספר
                            </button>

                            <button
                                onClick={() => {
                                    router.push(`/wedding/${weddingId}/admin`)
                                    setMenuOpen(false)
                                }}
                                className='text-gray-700 text-lg self-start'
                            >
                                ניהול הברכות
                            </button>

                            <button
                                onClick={() => {
                                    router.push(`/wedding/${weddingId}/portal`)
                                    setMenuOpen(false)
                                }}
                                className='text-gray-700 text-lg self-start'
                            >
                                QR ושיתוף
                            </button>

                            <button
                                onClick={() => {
                                    handleLogout()
                                    setMenuOpen(false)
                                }}
                                className='text-gray-700 text-lg self-start'
                            >
                                התנתקות
                            </button>
                        </>
                    )}
                </div>
            </div>
        </>
    )
}
