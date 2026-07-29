'use client'

// /g/<slug>?g=<guestId> — short link the owner sends in WhatsApp.
//
// Server-resolves the slug (owner's short wedding code) to the actual
// weddingId, then redirects the guest to /wedding/<id>/photo?g=<guestId>
// so the photo page can prefill their name.
//
// If the slug can't be resolved we render a soft "link not found" state
// with the brand logo — same look/feel as /w/<slug>.

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '../../../lib/firebaseClient'
import { getMessages } from '@/i18n/getMessages'
import { dirFor } from '@/i18n/locales'
import BookLoader from '@/components/BookLoader/BookLoader'

export default function GuestSlugRedirect() {
    const { slug } = useParams()
    const router = useRouter()
    const searchParams = useSearchParams()
    // The guest ID query — preserved through the redirect so the /photo
    // page can prefill the guest's name.
    const guestId = searchParams?.get('g') || ''
    const [notFound, setNotFound] = useState(false)

    const locale = 'he'
    const messages = useMemo(() => getMessages(locale).guestPage, [])

    useEffect(() => {
        if (!slug) return
        async function resolve() {
            try {
                const q = query(collection(db, 'weddings'), where('slug', '==', slug), limit(1))
                const snap = await getDocs(q)
                if (snap.empty) {
                    setNotFound(true)
                    return
                }
                const weddingId = snap.docs[0].id
                const qs = guestId ? `?g=${encodeURIComponent(guestId)}` : ''
                router.replace(`/wedding/${weddingId}/photo${qs}`)
            } catch (err) {
                console.error('[g/slug] resolve failed:', err)
                setNotFound(true)
            }
        }
        resolve()
    }, [slug, guestId, router])

    if (notFound) {
        return (
            <div
                className='flex min-h-screen items-center justify-center bg-gradient-to-br from-[#F5F5F5] via-[#f0ebe3] to-[#ebe5da] px-4 font-sans'
                dir={dirFor(locale)}
            >
                <div className='text-center'>
                    <img src='/logo-wt.png' alt='Wedding Tales' className='h-10 w-auto mx-auto mb-6 opacity-60' />
                    <h1 className='text-2xl font-bold text-gray-800 mb-2'>{messages?.linkNotFound || 'הקישור לא נמצא'}</h1>
                    <p className='text-gray-500 text-sm'>{messages?.linkExpired || 'ייתכן שהקישור פג — בקשו קישור חדש מהזוג'}</p>
                </div>
            </div>
        )
    }

    return <BookLoader />
}
