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
        localStorage.removeItem('weddingId') // נקה גם את ה־ID
        router.push('/')
    }

    return (
        <header style={{ padding: '16px', borderBottom: '1px solid #ddd', marginBottom: '20px' }}>
            <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Link
                    href={weddingId ? `/wedding/${weddingId}` : '/'}
                    className='logo'
                    style={{ fontWeight: 'bold', fontSize: '1.2rem' }}
                >
                    💍 Wedding Book
                </Link>

                <div style={{ display: 'flex', gap: '12px' }}>
                    {!user ? (
                        <>
                            <Link href='/login' className='btn btn-primary'>
                                התחברות
                            </Link>
                            <Link href='/register' className='btn btn-gold'>
                                הרשמה
                            </Link>
                        </>
                    ) : (
                        <>
                            <span style={{ fontSize: '0.9rem', color: '#555' }}>מחובר כ: {user.email}</span>
                            <button onClick={handleLogout} className='btn'>
                                התנתקות
                            </button>
                        </>
                    )}
                </div>
            </nav>
        </header>
    )
}
