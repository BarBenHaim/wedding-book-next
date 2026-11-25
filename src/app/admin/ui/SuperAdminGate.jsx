'use client'
// AdminPageWrapper only asks for a sign-in; this asks for the super admin.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'
import { isSuperAdmin } from '@/lib/superAdmin'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'

function Gate({ children }) {
    const router = useRouter()
    const [state, setState] = useState('checking')
    useEffect(() => onAuthStateChanged(auth, user => {
        if (!user) {
            router.replace('/login')
            return
        }
        setState(isSuperAdmin(user.email) ? 'allowed' : 'denied')
    }), [router])

    if (state === 'allowed') return children
    return (
        <div dir='rtl' className='min-h-screen flex items-center justify-center text-sm text-[#7a6a52]'>
            {state === 'denied' ? 'אין לחשבון הזה גישה לעמוד.' : 'בודק הרשאה…'}
        </div>
    )
}

export default function SuperAdminOnly({ children }) {
    return (
        <AdminPageWrapper>
            <Gate>{children}</Gate>
        </AdminPageWrapper>
    )
}
