'use client'

import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

export default function ThanksPage() {
    const router = useRouter()
    const { weddingId } = useParams()

    useEffect(() => {
        const id = setTimeout(() => {
            if (weddingId) {
                router.push(`/wedding/${weddingId}`)
            } else {
                router.push('/')
            }
        }, 1000)
        return () => clearTimeout(id)
    }, [router, weddingId])

    return (
        <div className='container'>
            <div className='card' style={{ textAlign: 'center' }}>
                <h2 className='title'>תודה על הברכה! 💖</h2>
                <p>נחזיר אותך לעמוד הראשי של החתונה בעוד רגע...</p>
            </div>
        </div>
    )
}
