'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '../../../lib/firebaseClient'
import { getMessages } from '@/i18n/getMessages'
import { normalizeLocale, dirFor } from '@/i18n/locales'

// Best-effort locale detection for the not-found state. We don't have a
// wedding doc here (the slug didn't resolve), so we can't read locale
// from Firestore. Fall back to the browser's preferred language — if the
// user's browser advertises 'es-ES', they probably want Spanish here too.
//
// During SSR, navigator is undefined → returns Hebrew (default).
function detectBrowserLocale() {
    if (typeof navigator === 'undefined') return 'he'
    const raw = (navigator.language || '').toLowerCase()
    if (raw.startsWith('he')) return 'he'
    if (raw.startsWith('en')) return 'en'
    if (raw.startsWith('es')) return 'es'
    if (raw.startsWith('it')) return 'it'
    return 'he'
}

export default function SlugRedirect() {
    const { slug } = useParams()
    const router = useRouter()
    const [notFound, setNotFound] = useState(false)

    // The not-found copy uses messages directly (no NextIntlClientProvider
    // here) — since we don't render any other interactive content, a
    // single key lookup is lighter than spinning up the whole provider.
    //
    // SSR-safe init: render Hebrew on first paint to match server output,
    // then swap to the real browser language after mount.
    const [locale, setLocale] = useState('he')
    useEffect(() => {
        setLocale(normalizeLocale(detectBrowserLocale()))
    }, [])
    const messages = useMemo(() => getMessages(locale).guestPage, [locale])

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
