'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'
import { enforceSessionExpiry } from '@/lib/sessionExpiry'

export default function AdminPageWrapper({ children }) {
    const router = useRouter()
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async user => {
            // 7-day "Remember me" check. Runs ONLY when an expiry
            // timestamp is present in localStorage (set by the login
            // page when the user ticks the box). If the window has
            // lapsed, enforceSessionExpiry signs the user out — that
            // triggers another auth-state callback with user === null
            // which falls into the redirect branch below.
            // Existing users without the key (logged in pre-feature)
            // pass through unchanged.
            if (user) {
                const expired = await enforceSessionExpiry(user)
                if (expired) return // wait for the post-signOut callback
            }

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
