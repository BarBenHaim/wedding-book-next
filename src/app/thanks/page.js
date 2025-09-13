'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ThanksPage() {
    const router = useRouter()
    useEffect(() => {
        const id = setTimeout(() => router.push('/'), 1000)
        return () => clearTimeout(id)
    }, [router])

    return (
        <div className='container'>
            <div className='card' style={{ textAlign: 'center' }}>
                <h2 className='title'>תודה על הברכה! 💖</h2>
                <p>נחזור לעמוד הראשי בעוד רגע...</p>
            </div>
        </div>
    )
}

