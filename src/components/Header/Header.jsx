'use client'

import { useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../../lib/firebaseClient'
import { useRouter, usePathname } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../lib/firebaseClient'

const SUPER_ADMIN_EMAIL = 'barbenbh@gmail.com'

export default function Header() {
    const [user, setUser] = useState(null)
    const [menuOpen, setMenuOpen] = useState(false)
    const router = useRouter()
    const pathname = usePathname()

    // Extract weddingId directly from the current URL path — highest priority
    const weddingIdFromUrl = pathname.startsWith('/wedding/') ? pathname.split('/')[2] : null

    // personalWeddingId: the logged-in user's own wedding (from localStorage / Firestore)
    const [personalWeddingId, setPersonalWeddingId] = useState(null)

    // Resolve auth state once and cache the personal wedding id
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async currentUser => {
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
                setPersonalWeddingId(id || null)
            } else {
                setPersonalWeddingId(null)
            }
        })
        return () => unsub()
    }, []) // run once on mount

    // URL wins over personal id — recalculates on every pathname change
    const activeId = weddingIdFromUrl ?? personalWeddingId

    const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL

    async function handleLogout() {
        await signOut(auth)
        localStorage.removeItem('weddingId')
        await fetch('/api/logout', { method: 'POST' })
        router.push('/')
    }

    function handleLogoClick() {
        // If currently inside any wedding URL, go to that wedding's root
        if (weddingIdFromUrl) {
            router.push(`/wedding/${weddingIdFromUrl}`)
        } else {
            // Fall back to personal wedding or home
            router.push(personalWeddingId ? `/wedding/${personalWeddingId}` : '/')
        }
    }

    return (
        <>
            <header className='sticky top-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-md shadow-sm'>
                <nav className='mx-auto flex max-w-7xl items-center justify-between px-6 py-3'>
                    {/* ✔ אייקון המבורגר — רק למשתמש מחובר + activeId */}
                    {user && activeId && (
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

                        {user && activeId && (
                            <>
                                <button
                                    onClick={() => router.push(`/wedding/${activeId}/viewer`)}
                                    className='rounded-full bg-purple-100 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-200 transition cursor-pointer'
                                >
                                    עיצוב הספר
                                </button>

                                <button
                                    onClick={() => router.push(`/wedding/${activeId}/admin`)}
                                    className='rounded-full bg-pink-100 px-4 py-2 text-sm font-medium text-pink-700 hover:bg-pink-200 transition cursor-pointer'
                                >
                                    ניהול הברכות
                                </button>

                                <button
                                    onClick={() => router.push(`/wedding/${activeId}/portal`)}
                                    className='rounded-full bg-gradient-to-r from-purple-600 to-pink-500 px-4 py-2 text-sm font-medium text-white shadow-md hover:opacity-90 transition cursor-pointer'
                                >
                                    QR ושיתוף
                                </button>
                            </>
                        )}

                        {/* Super Admin Dashboard — always visible for super admin */}
                        {isSuperAdmin && (
                            <button
                                onClick={() => router.push('/admin')}
                                className='rounded-full bg-indigo-100 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-200 transition cursor-pointer'
                            >
                                Super Admin
                            </button>
                        )}

                        {user && (
                            <button
                                onClick={handleLogout}
                                className='rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition cursor-pointer'
                            >
                                התנתקות
                            </button>
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
                    {user && activeId && (
                        <>
                            <button
                                onClick={() => {
                                    router.push(`/wedding/${activeId}/viewer`)
                                    setMenuOpen(false)
                                }}
                                className='text-gray-700 text-lg self-start'
                            >
                                עיצוב הספר
                            </button>

                            <button
                                onClick={() => {
                                    router.push(`/wedding/${activeId}/admin`)
                                    setMenuOpen(false)
                                }}
                                className='text-gray-700 text-lg self-start'
                            >
                                ניהול הברכות
                            </button>

                            <button
                                onClick={() => {
                                    router.push(`/wedding/${activeId}/portal`)
                                    setMenuOpen(false)
                                }}
                                className='text-gray-700 text-lg self-start'
                            >
                                QR ושיתוף
                            </button>
                        </>
                    )}

                    {/* Super Admin Dashboard — always visible in drawer for super admin */}
                    {isSuperAdmin && (
                        <button
                            onClick={() => {
                                router.push('/admin')
                                setMenuOpen(false)
                            }}
                            className='text-indigo-600 text-lg self-start font-medium'
                        >
                            Super Admin
                        </button>
                    )}

                    {user && (
                        <button
                            onClick={() => {
                                handleLogout()
                                setMenuOpen(false)
                            }}
                            className='text-gray-700 text-lg self-start'
                        >
                            התנתקות
                        </button>
                    )}
                </div>
            </div>
        </>
    )
}
