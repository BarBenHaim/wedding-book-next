'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'

export default function AdminPageWrapper({ children }) {
    const router = useRouter()
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, user => {
            if (!user) {
                router.replace('/login')
            } else {
                setLoading(false)
            }
        })
        return () => unsub()
    }, [router])

    if (loading) {
        return <div className='flex h-screen items-center justify-center'>טוען...</div>
    }

    return children
}
