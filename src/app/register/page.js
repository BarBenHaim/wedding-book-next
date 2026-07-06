'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// ההרשמה עברה לאשף פתיחת האירוע — /start (self-serve, חינם).
export default function RegisterPage() {
    const router = useRouter()

    useEffect(() => {
        router.replace('/start')
    }, [router])

    return (
        <div className='flex min-h-screen items-center justify-center bg-gradient-to-br from-[#F5F5F5] via-[#f0ebe3] to-[#ebe5da]'>
            <div className='animate-spin rounded-full h-10 w-10 border-[3px] border-[#AA8840]/20 border-t-[#AA8840]'></div>
        </div>
    )
}
