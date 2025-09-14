'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../../../lib/firebaseClient'
import { useParams } from 'next/navigation'

export default function WeddingHome() {
    const [user, setUser] = useState(null)
    const { weddingId } = useParams()

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, setUser)
        return () => unsub()
    }, [])

    return (
        <div className='container'>
            <div className='card' style={{ textAlign: 'center' }}>
                <h1 className='title'>📖 ספר ברכות החתונה</h1>
                <p>
                    ברוכים הבאים לחתונה: <strong>{weddingId}</strong>
                </p>

                <div style={{ display: 'flex', gap: 16, marginTop: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {/* אורחים */}
                    <Link href={`/wedding/${weddingId}/text`} className='btn btn-primary'>
                        ✍️ כתיבת ברכה
                    </Link>
                    <Link href={`/wedding/${weddingId}/photo`} className='btn btn-gold'>
                        📷 צילום ברכה
                    </Link>

                    {/* חתן/כלה */}
                    {user ? (
                        <>
                            <Link href={`/wedding/${weddingId}/viewer`} className='btn'>
                                📖 צפייה בספר
                            </Link>
                            <Link href={`/wedding/${weddingId}/admin`} className='btn'>
                                👑 לוח בקרה
                            </Link>
                            <Link href='/logout' className='btn'>
                                🚪 התנתקות
                            </Link>
                        </>
                    ) : (
                        <>
                            <Link href='/login' className='btn btn-primary'>
                                🔑 התחברות
                            </Link>
                            <Link href='/register' className='btn btn-gold'>
                                📝 הרשמה
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
