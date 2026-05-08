'use client'

// The thanks page is where the real upload happens. By the time the guest
// lands here, the blessing is already persisted in IndexedDB (see
// photo/page.js → onSubmit). This page's job is:
//   1. Flush the queue (try to ship everything to Firebase).
//   2. Re-try on connectivity changes (online / pageshow / visibilitychange).
//   3. Show a friendly offline modal if we can't reach the network.
//   4. Keep the existing celebratory UI once everything is sent.
//
// We deliberately don't auto-redirect while uploads are pending — the guest
// might close the tab and we want the online listener to keep trying.

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../../lib/firebaseClient'
import { listUnsent } from '../../../../lib/offlineQueue'
import { flushQueue } from '../../../../lib/uploadEntry'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import { getMessages } from '@/i18n/getMessages'
import { normalizeLocale } from '@/i18n/locales'

// Outer wrapper: load the wedding doc's locale, wrap in i18n provider so
// every string in the inner component (status badges, offline modal,
// device hints) speaks the language the super-admin configured.
export default function ThanksPage() {
    const { weddingId } = useParams()
    const [locale, setLocale] = useState('he')

    useEffect(() => {
        if (!weddingId) return
        let cancelled = false
        ;(async () => {
            try {
                const snap = await getDoc(doc(db, 'weddings', weddingId))
                if (cancelled) return
                if (snap.exists()) {
                    setLocale(normalizeLocale(snap.data().locale))
                }
            } catch {
                /* keep Hebrew default */
            }
        })()
        return () => {
            cancelled = true
        }
    }, [weddingId])

    return (
        <NextIntlClientProvider locale={locale} messages={getMessages(locale)}>
            <ThanksApp />
        </NextIntlClientProvider>
    )
}

function ThanksApp() {
    const router = useRouter()
    const { weddingId } = useParams()
    const t = useTranslations('thanks')
    const searchParams = useSearchParams()
    // Entry id passed from /photo as ?eid=... — lets us VERIFY the
    // blessing actually exists in Firestore (not just "the local
    // queue thinks we shipped it"). Optional: legacy bookmarks of
    // the thanks URL won't have it, and the page still works.
    const entryId = searchParams?.get('eid') || ''

    // UI status machine:
    //   'working' — trying to upload
    //   'done'    — queue is empty, everything shipped
    //   'offline' — navigator.onLine is false
    //   'error'   — last flush attempt failed and we're online
    const [status, setStatus] = useState('working')
    const [pendingCount, setPendingCount] = useState(0)
    // Independent confirmation: did we actually SEE the entry doc in
    // Firestore? This is the strongest signal we can give the guest
    // ("verified") because it confirms the write reached the server,
    // not just that our local queue thinks it shipped.
    const [verified, setVerified] = useState(false)

    // ─── Flush helper ────────────────────────────────────────────────────────
    async function tryFlush() {
        if (!weddingId) return

        // Offline? Don't even attempt — saves Firebase retries and gives
        // the modal a chance to show the helpful message.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            const unsent = await listUnsent(weddingId)
            setPendingCount(unsent.length)
            setStatus(unsent.length > 0 ? 'offline' : 'done')
            return
        }

        setStatus('working')
        try {
            const result = await flushQueue(weddingId)
            const unsent = await listUnsent(weddingId)
            setPendingCount(unsent.length)
            if (unsent.length === 0) {
                setStatus('done')
            } else if (navigator.onLine === false) {
                setStatus('offline')
            } else {
                // We're online but some sends failed — probably flaky net.
                // Keep "working" to avoid scaring the guest; a retry loop
                // below will kick in shortly.
                setStatus(result.sent > 0 ? 'working' : 'error')
            }
        } catch {
            setStatus('error')
        }
    }

    // ─── Initial mount: flush + set up listeners ─────────────────────────────
    useEffect(() => {
        tryFlush()

        const onOnline = () => tryFlush()
        const onVisible = () => {
            if (document.visibilityState === 'visible') tryFlush()
        }
        // pageshow fires on bfcache restore (tap back from another app) —
        // a real gotcha on iOS where `online` sometimes doesn't fire.
        const onPageShow = () => tryFlush()
        const onOffline = async () => {
            const unsent = await listUnsent(weddingId)
            setPendingCount(unsent.length)
            setStatus(unsent.length > 0 ? 'offline' : 'done')
        }

        window.addEventListener('online', onOnline)
        window.addEventListener('offline', onOffline)
        window.addEventListener('pageshow', onPageShow)
        document.addEventListener('visibilitychange', onVisible)

        return () => {
            window.removeEventListener('online', onOnline)
            window.removeEventListener('offline', onOffline)
            window.removeEventListener('pageshow', onPageShow)
            document.removeEventListener('visibilitychange', onVisible)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weddingId])

    // ─── Firestore verification poll ─────────────────────────────────────────
    // Independent of the IDB queue. Reads the entry doc directly; if
    // we can see it on the server, we KNOW the write reached Firestore
    // (not just that our local queue marked it done). Polls every 4s
    // until we either confirm or the user navigates away.
    useEffect(() => {
        if (!weddingId || !entryId || verified) return
        let cancelled = false

        async function check() {
            if (cancelled) return
            try {
                const snap = await getDoc(doc(db, 'weddings', weddingId, 'entries', entryId))
                if (cancelled) return
                if (snap.exists()) {
                    setVerified(true)
                    return
                }
            } catch {
                // Network error or perms — silently retry. The guest's
                // own queue still drives the upload retries; this poll
                // is purely a confirmation read.
            }
            if (!cancelled) setTimeout(check, 4000)
        }
        check()

        return () => {
            cancelled = true
        }
    }, [weddingId, entryId, verified])

    // ─── Retry ticker ────────────────────────────────────────────────────────
    // Only while we have pending entries + think we're online. Backs off
    // gently — starts at 5s, doubles up to 30s. Stops the moment we're done.
    useEffect(() => {
        if (status === 'done' || status === 'offline') return
        if (pendingCount === 0) return

        let delay = 5000
        let cancelled = false

        function tick() {
            if (cancelled) return
            tryFlush().finally(() => {
                if (cancelled) return
                delay = Math.min(delay * 1.6, 30000)
                setTimeout(tick, delay)
            })
        }
        const firstId = setTimeout(tick, delay)
        return () => {
            cancelled = true
            clearTimeout(firstId)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, pendingCount])

    // The thanks page used to auto-redirect to /wedding/[id] four seconds
    // after the upload finished, which sent the guest right back to the
    // "write a blessing" CTA — confusing UX. We now stay on this page so
    // the celebration + soft pitch + WhatsApp CTA can do its job. The
    // guest leaves on their own terms (close the tab or tap the button).

    const offlineOpen = status === 'offline'

    return (
        <div
            className='min-h-[calc(100vh-4rem)] flex items-start justify-center px-4 py-8 font-sans relative overflow-hidden'
            style={{
                // Premium ivory wash — matches the photo / blessing pages.
                backgroundColor: '#f8f4ec',
                backgroundImage: [
                    'radial-gradient(ellipse 900px 480px at 50% -10%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 55%)',
                    'radial-gradient(ellipse 520px 520px at 92% 105%, rgba(201,164,78,0.07) 0%, rgba(201,164,78,0) 60%)',
                    'radial-gradient(ellipse 440px 440px at 8% 105%, rgba(186,156,108,0.05) 0%, rgba(186,156,108,0) 60%)',
                ].join(', '),
            }}
        >
            <div className='relative z-10 w-full max-w-[26rem] animate-scaleIn'>
                {/* ── Status pill — small chip at the very top showing
                    upload progress. Three visibility tiers:
                      • verified ✓        — Firestore confirmed the write
                                            (strongest signal)
                      • status !== done    — still working / offline / error
                      • status === done    — IDB queue empty but no
                                            Firestore confirmation
                                            (legacy entries without
                                            ?eid in URL fall here)
                    Always visible if we have any signal to give the
                    guest, so they leave with confidence (or know to
                    keep the page open). */}
                {(verified || status !== 'done') && (
                    <div className='flex justify-center mb-6'>
                        <StatusBadge
                            status={status}
                            pendingCount={pendingCount}
                            verified={verified}
                            t={t}
                        />
                    </div>
                )}

                {/* Manual "check" button — when we're in working/error
                    mode and have an entryId, give the guest a way to
                    actively re-poll Firestore. Cheap reassurance. */}
                {entryId && !verified && status !== 'offline' && (
                    <div className='flex justify-center mb-6'>
                        <button
                            onClick={async () => {
                                try {
                                    const snap = await getDoc(doc(db, 'weddings', weddingId, 'entries', entryId))
                                    if (snap.exists()) setVerified(true)
                                    else await tryFlush()
                                } catch {
                                    await tryFlush()
                                }
                            }}
                            className='text-[12px] underline'
                            style={{ color: '#9a8a72' }}
                        >
                            {t('checkAgain')}
                        </button>
                    </div>
                )}

                {/* ── Celebration block ── */}
                <div className='text-center mb-7'>
                    <svg viewBox='0 0 24 24' className='w-[22px] h-[22px] mx-auto mb-3.5' fill='#c9a44e'>
                        <path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' />
                    </svg>
                    <h1
                        className='font-bold mb-2 leading-[1.15]'
                        style={{ color: '#1a1410', fontSize: '28px', letterSpacing: '-0.01em' }}
                    >
                        {t('savedHeading')}
                    </h1>
                    <p className='leading-relaxed' style={{ color: '#7a6a52', fontSize: '14px', maxWidth: 340, margin: '0 auto' }}>
                        {t('savedBody')}
                    </p>
                </div>

                {/* ── Pitch card — soft sales hook for the guest who just
                    enjoyed the experience and might want it for their own
                    event. Pure white card, same shadow + border treatment
                    as the form cards on the create-blessing flow. */}
                <div
                    className='bg-white rounded-[22px] p-6 mb-5 text-center'
                    style={{
                        boxShadow:
                            '0 24px 50px -28px rgba(170,136,64,0.28), 0 4px 12px -4px rgba(170,136,64,0.10)',
                        border: '1px solid rgba(212,184,103,0.22)',
                    }}
                >
                    <h2
                        className='font-bold mb-3'
                        style={{ color: '#1a1410', fontSize: '17px', letterSpacing: '-0.005em' }}
                    >
                        {t('pitchHeading')}
                    </h2>
                    <p
                        className='leading-relaxed mb-5'
                        style={{ color: '#7a6a52', fontSize: '13.5px' }}
                    >
                        {t('pitchBody')}
                    </p>

                    {/* tiny gold heart divider — same ornament as the
                        create-blessing card, ties the pages together. */}
                    <div className='flex items-center justify-center gap-2.5 mb-5'>
                        <span
                            className='block h-px flex-1'
                            style={{ background: 'linear-gradient(to left, transparent, #e1d4b4, transparent)' }}
                        />
                        <svg viewBox='0 0 24 24' className='w-[11px] h-[11px] shrink-0' fill='#c9a44e'>
                            <path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' />
                        </svg>
                        <span
                            className='block h-px flex-1'
                            style={{ background: 'linear-gradient(to right, transparent, #e1d4b4, transparent)' }}
                        />
                    </div>

                    <p
                        className='font-bold mb-4'
                        style={{ color: '#1a1410', fontSize: '14.5px' }}
                    >
                        {t('pitchQuestion')}
                    </p>

                    {/* WhatsApp CTA — opens the brand's wa.link short URL
                        which already targets the right number with a
                        pre-filled "show me a sample" message. Uses the
                        official WhatsApp green so the button is instantly
                        recognisable as a chat-to-us action. */}
                    <a
                        href='https://wa.link/z4a85t'
                        target='_blank'
                        rel='noopener noreferrer'
                        className='w-full rounded-2xl text-white font-bold transition-all duration-300 flex items-center justify-center gap-2.5 active:scale-[0.99]'
                        style={{
                            background: 'linear-gradient(180deg, #25D366 0%, #128C7E 100%)',
                            boxShadow:
                                '0 14px 32px -10px rgba(18,140,126,0.45), 0 4px 10px -4px rgba(18,140,126,0.25), inset 0 1px 0 rgba(255,255,255,0.20)',
                            padding: '14px 18px',
                            fontSize: '14.5px',
                            letterSpacing: '0.01em',
                        }}
                    >
                        {/* WhatsApp glyph */}
                        <svg viewBox='0 0 24 24' className='w-[18px] h-[18px] shrink-0' fill='currentColor'>
                            <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z' />
                        </svg>
                        <span>{t('whatsappCta')}</span>
                    </a>
                </div>

                {/* Wedding Tales mark at the very bottom — small, gentle
                    reminder of the brand without competing with the CTA. */}
                <div className='flex justify-center mt-2'>
                    <img src='/logo-wt.png' alt='Wedding Tales' className='h-7 w-auto opacity-50' />
                </div>
            </div>

            {/* ── Offline modal ──────────────────────────────────────────────── */}
            {offlineOpen && (
                <OfflineModal
                    pendingCount={pendingCount}
                    onCheck={tryFlush}
                    t={t}
                />
            )}

            {/* אנימציות מותאמות */}
            <style jsx>{`
                @keyframes float {
                    0% {
                        transform: translateY(0) rotate(0deg);
                        opacity: 1;
                    }
                    50% {
                        transform: translateY(-60px) rotate(20deg);
                        opacity: 0.8;
                    }
                    100% {
                        transform: translateY(0) rotate(-20deg);
                        opacity: 1;
                    }
                }
                .animate-float {
                    animation: float 6s infinite ease-in-out;
                }
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }
                .animate-fadeIn {
                    animation: fadeIn 1s ease-out;
                }
            `}</style>
        </div>
    )
}

function StatusBadge({ status, pendingCount, verified, t }) {
    // Strongest signal — we read the entry doc back from Firestore
    // ourselves, so we KNOW it landed. Use a richer "verified ✓" copy
    // and a check icon (instead of a generic dot) so the guest sees a
    // tangible confirmation.
    if (verified) {
        return (
            <div className='inline-flex items-center gap-2 rounded-full bg-green-50 border border-green-200 px-4 py-1.5 text-green-700 text-sm font-semibold'>
                <svg viewBox='0 0 20 20' className='w-[14px] h-[14px]' fill='currentColor' aria-hidden='true'>
                    <path fillRule='evenodd' clipRule='evenodd' d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z' />
                </svg>
                {t('statusVerified')}
            </div>
        )
    }
    if (status === 'done') {
        return (
            <div className='inline-flex items-center gap-2 rounded-full bg-green-50 border border-green-200 px-4 py-1.5 text-green-700 text-sm font-semibold'>
                <span className='w-2 h-2 rounded-full bg-green-500'></span>
                {t('statusSent')}
            </div>
        )
    }
    if (status === 'offline') {
        return (
            <div className='inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-4 py-1.5 text-amber-700 text-sm font-semibold'>
                <span className='w-2 h-2 rounded-full bg-amber-500'></span>
                {t('statusOffline')}
            </div>
        )
    }
    if (status === 'error') {
        return (
            <div className='inline-flex items-center gap-2 rounded-full bg-red-50 border border-red-200 px-4 py-1.5 text-red-700 text-sm font-semibold'>
                <span className='w-2 h-2 rounded-full bg-red-500'></span>
                {t('statusError')}
            </div>
        )
    }
    // working
    return (
        <div className='inline-flex items-center gap-2 rounded-full bg-[#AA8840]/10 border border-[#AA8840]/25 px-4 py-1.5 text-[#AA8840] text-sm font-semibold'>
            <span className='w-2 h-2 rounded-full bg-[#AA8840] animate-pulse'></span>
            {t('statusWorking')}
            {pendingCount > 1 && <span className='ms-1 opacity-70'>({pendingCount})</span>}
        </div>
    )
}

function OfflineModal({ pendingCount, onCheck, t }) {
    const [checking, setChecking] = useState(false)
    async function handleCheck() {
        setChecking(true)
        try {
            await onCheck()
        } finally {
            setChecking(false)
        }
    }
    return (
        <div
            className='fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6 animate-fadeIn'
            role='dialog'
            aria-modal='true'
        >
            <div className='w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden border border-white/60'>
                {/* Gold accent header */}
                <div className='h-1.5 bg-gradient-to-r from-[#AA8840]/70 via-[#D3B665] to-[#AA8840]/70'></div>

                <div className='p-6 md:p-8 text-center'>
                    {/* Wifi-off icon */}
                    <div className='mx-auto w-16 h-16 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center mb-4'>
                        <svg
                            xmlns='http://www.w3.org/2000/svg'
                            fill='none'
                            viewBox='0 0 24 24'
                            strokeWidth='1.6'
                            stroke='currentColor'
                            className='w-8 h-8 text-amber-500'
                        >
                            <path
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                d='M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z'
                            />
                            <path strokeLinecap='round' strokeWidth='1.6' d='M3 3l18 18' />
                        </svg>
                    </div>

                    <h3 className='text-xl font-bold text-gray-800 mb-2'>{t('offlineTitle')}</h3>
                    <p className='text-sm text-gray-600 leading-relaxed mb-1'>
                        {pendingCount > 1
                            ? t('offlineSavedPlural', { count: pendingCount })
                            : t('offlineSavedSingular')}
                    </p>
                    <p className='text-sm text-gray-600 leading-relaxed mb-6'>
                        {t('offlineHintLine1Prefix')}{' '}
                        <span className='font-bold text-[#AA8840]'>{t('offlineHintLine1Mid')}</span>{' '}
                        {t('offlineHintLine1Suffix')}{' '}
                        <span className='font-bold text-[#AA8840]'>{t('offlineHintLine1Suffix2')}</span>
                        <br />
                        {t('offlineHintLine2')}
                    </p>

                    {/* Tiny OS hints */}
                    <div className='bg-gray-50 rounded-xl p-3 text-xs text-gray-500 mb-6 leading-relaxed'>
                        <span className='block mb-1'>
                            <span className='font-semibold text-gray-600'>{t('iosHintLabel')}</span>{' '}
                            {t('iosHintText')}
                        </span>
                        <span className='block'>
                            <span className='font-semibold text-gray-600'>{t('androidHintLabel')}</span>{' '}
                            {t('androidHintText')}
                        </span>
                    </div>

                    <button
                        onClick={handleCheck}
                        disabled={checking}
                        className='w-full py-3.5 rounded-xl bg-[#AA8840] text-white font-bold shadow-lg hover:shadow-xl hover:bg-[#AA8840]/90 active:scale-[0.98] transition-all duration-300 disabled:opacity-50'
                    >
                        {checking ? t('checking') : t('checkAgain')}
                    </button>
                    <p className='text-[11px] text-gray-400 mt-3'>
                        {t('tabClosable')}
                    </p>
                </div>
            </div>
        </div>
    )
}
