'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '../../../lib/firebaseClient'
import { getMessages } from '@/i18n/getMessages'
import { dirFor } from '@/i18n/locales'
import BookLoader from '@/components/BookLoader/BookLoader'
import { logEvent } from '@/lib/logEvent'
import { getSubmissions } from '@/lib/mySubmissions'
import { isTwinsEvent } from '@/lib/twins'

// The not-found state on /w/[slug] doesn't have a wedding doc to read
// locale from (the slug failed to resolve). We default to Hebrew rather
// than sniffing the browser — same logic as home/login: this is a
// Hebrew-first SaaS and a Hebrew not-found screen is the safer fallback.

export default function SlugRedirect() {
    const { slug } = useParams()
    const router = useRouter()
    const searchParams = useSearchParams()
    // ?go=photo — set by the QR code so a scanned phone lands directly
    // on the blessing form. Other entry points (WhatsApp share, manual
    // typing) omit this param and get the standard /wedding/[id]
    // welcome page.
    const goTarget = searchParams?.get('go') || ''
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
                const data = snap.docs[0].data() || {}
                // Where the guest lands. The shortest road is the best one: a
                // link opened from WhatsApp now goes straight to the form, as
                // the QR always did. The welcome page stays for the two cases
                // that need it: twins (the guest picks who the blessing is
                // for) and a phone that already sent a blessing (it shows the
                // "edit yours" shortcuts). ?go=photo (the QR) always goes
                // straight to the form.
                const direct =
                    goTarget === 'photo' ||
                    (!isTwinsEvent(data.eventType) && getSubmissions(weddingId).length === 0)
                // The welcome page logs the scan itself; going past it, we do.
                if (direct) logEvent(weddingId, 'scan')
                const dest = direct ? `/wedding/${weddingId}/photo` : `/wedding/${weddingId}`
                router.replace(dest)
            } catch (err) {
                console.error('Error resolving slug:', err)
                setNotFound(true)
            }
        }
        resolve()
    }, [slug, router, goTarget])

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

    return <BookLoader />
}
