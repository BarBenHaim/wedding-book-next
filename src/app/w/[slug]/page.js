'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '../../../lib/firebaseClient'

export default function SlugRedirect() {
    const { slug } = useParams()
    const router = useRouter()
    const [notFound, setNotFound] = useState(false)

    useEffect(() => {
        if (!slug) return
        async function resolve() {
            try {
                const q = query(
                    collection(db, 'weddings'),
                    where('slug', '==', slug),
                    limit(1)
                )
                const snap = await getDocs(q)
                if (snap.empty) {
                    setNotFound(true)
                    return
                }
                const weddingId = snap.docs[0].id
                router.replace(`/wedding/${weddingId}`)
            } catch (err) {
                console.error('Error resolving slug:', err)
                setNotFound(true)
            }
        }
        resolve()
    }, [slug, router])

    if (notFound) {
        return (
            <div className='flex min-h-screen items-center justify-center bg-gradient-to-br from-[#F5F5F5] via-[#f0ebe3] to-[#ebe5da] px-4 font-sans' dir='rtl'>
                <div className='text-center'>
                    <img src='/logo-wt.png' alt='Wedding Tales' className='h-10 w-auto mx-auto mb-6 opacity-60' />
                    <h1 className='text-2xl font-bold text-gray-800 mb-2'>הקישור לא נמצא</h1>
                    <p className='text-gray-500 text-sm'>ייתכן שהקישור שגוי או שפג תוקפו</p>
                </div>
            </div>
        )
    }

    return (
        <div className='flex min-h-screen items-center justify-center bg-gradient-to-br from-[#F5F5F5] via-[#f0ebe3] to-[#ebe5da]'>
            <div className='animate-spin rounded-full h-10 w-10 border-[3px] border-[#AA8840]/20 border-t-[#AA8840]'></div>
        </div>
    )
}
