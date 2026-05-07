'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '../../../lib/firebaseClient'
import { getMessages } from '@/i18n/getMessages'
import { dirFor } from '@/i18n/locales'

// The not-found state on /w/[slug] doesn't have a wedding doc to read
// locale from (the slug failed to resolve). We default to Hebrew rather
// than sniffing the browser — same logic as home/login: this is a
// Hebrew-first SaaS and a Hebrew not-found screen is the safer fallback.

export default function SlugRedirect() {
    const { slug } = useParams()
    const router = useRouter()
    const [notFound, setNotFound] = useState(false)

    // The not-found copy uses messages directly (no NextIntlClientProvider
    // here) — single-key lookup is lighter than spinning up the provider.
    const locale = 'he'
    const messages = useMemo(() => getMessages(locale).guestPage, [])

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
                // Don't log a scan event here — the /wedding/{id} page
                // we're about to redirect to logs one itself. Logging
                // both would double-count every short-link visit.
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
            <div
                className='flex min-h-screen items-center justify-center bg-gradient-to-br from-[#F5F5F5] via-[#f0ebe3] to-[#ebe5da] px-4 font-sans'
                dir={dirFor(locale)}
            >
                <div className='text-center'>
                    <img src='/logo-wt.png' alt='Wedding Tales' className='h-10 w-auto mx-auto mb-6 opacity-60' />
                    <h1 className='text-2xl font-bold text-gray-800 mb-2'>{messages.linkNotFound}</h1>
                    <p className='text-gray-500 text-sm'>{messages.linkExpired}</p>
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
