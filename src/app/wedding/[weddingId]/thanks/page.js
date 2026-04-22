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

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { listUnsent } from '../../../../lib/offlineQueue'
import { flushQueue } from '../../../../lib/uploadEntry'

export default function ThanksPage() {
    const router = useRouter()
    const { weddingId } = useParams()

    // UI status machine:
    //   'working' — trying to upload
    //   'done'    — queue is empty, everything shipped
    //   'offline' — navigator.onLine is false
    //   'error'   — last flush attempt failed and we're online
    const [status, setStatus] = useState('working')
    const [pendingCount, setPendingCount] = useState(0)
    const redirectTimer = useRef(null)

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

    // ─── Auto-redirect only after we're fully done ───────────────────────────
    useEffect(() => {
        if (status !== 'done') return
        redirectTimer.current = setTimeout(() => {
            if (weddingId) router.push(`/wedding/${weddingId}`)
            else router.push('/')
        }, 4000)
        return () => clearTimeout(redirectTimer.current)
    }, [status, weddingId, router])

    const offlineOpen = status === 'offline'

    return (
        <div className='relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden bg-gradient-to-br from-[#F5F5F5] via-[#f0ebe3] to-[#ebe5da] px-6'>
            {/* Glow רקע */}
            <div className='absolute -top-32 left-10 h-96 w-96 rounded-full bg-[#AA8840]/8 blur-3xl animate-pulse'></div>
            <div className='absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-[#AA8840]/6 blur-3xl animate-pulse delay-200'></div>

            {/* לבבות/קונפטי */}
            <div className='absolute inset-0 overflow-hidden pointer-events-none'>
                {Array.from({ length: 12 }).map((_, i) => (
                    <span
                        key={i}
                        className='absolute text-[#AA8840]/50 animate-float'
                        style={{
                            left: `${Math.random() * 100}%`,
                            top: `${Math.random() * 100}%`,
                            fontSize: `${Math.random() * 24 + 16}px`,
                            animationDelay: `${i * 0.4}s`,
                        }}
                    >
                        ✦
                    </span>
                ))}
            </div>

            {/* כרטיס תודה */}
            <div className='relative z-10 w-full max-w-xl rounded-3xl bg-white/90 backdrop-blur-md p-8 md:p-10 shadow-2xl text-center animate-fadeIn border border-white/60'>
                <img src='/logo-wt.png' alt='Wedding Tales' className='h-10 w-auto mx-auto mb-4 opacity-70' />
                <h2 className='mb-3 text-3xl font-bold text-gray-800'>תודה על הברכה!</h2>
                <div className='w-16 h-0.5 bg-gradient-to-r from-transparent via-[#AA8840]/50 to-transparent mx-auto mb-3'></div>
                <p className='text-base text-gray-600 mb-4'>
                    ההודעה שלך נוספה בהצלחה לספר החתונה
                    <br />
                    הזוג המאושר יוכל לראות אותה מיד
                </p>

                {/* Status badge — small, non-scary */}
                <StatusBadge status={status} pendingCount={pendingCount} />

                {status === 'done' && (
                    <p className='text-sm text-gray-500 mt-3'>נחזיר אותך לעמוד הראשי בעוד רגע...</p>
                )}
            </div>

            {/* ── Offline modal ──────────────────────────────────────────────── */}
            {offlineOpen && (
                <OfflineModal
                    pendingCount={pendingCount}
                    onCheck={tryFlush}
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

function StatusBadge({ status, pendingCount }) {
    if (status === 'done') {
        return (
            <div className='inline-flex items-center gap-2 rounded-full bg-green-50 border border-green-200 px-4 py-1.5 text-green-700 text-sm font-semibold'>
                <span className='w-2 h-2 rounded-full bg-green-500'></span>
                נשלח ✓
            </div>
        )
    }
    if (status === 'offline') {
        return (
            <div className='inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-4 py-1.5 text-amber-700 text-sm font-semibold'>
                <span className='w-2 h-2 rounded-full bg-amber-500'></span>
                ממתין לחיבור לאינטרנט
            </div>
        )
    }
    if (status === 'error') {
        return (
            <div className='inline-flex items-center gap-2 rounded-full bg-red-50 border border-red-200 px-4 py-1.5 text-red-700 text-sm font-semibold'>
                <span className='w-2 h-2 rounded-full bg-red-500'></span>
                החיבור לא יציב, מנסה שוב…
            </div>
        )
    }
    // working
    return (
        <div className='inline-flex items-center gap-2 rounded-full bg-[#AA8840]/10 border border-[#AA8840]/25 px-4 py-1.5 text-[#AA8840] text-sm font-semibold'>
            <span className='w-2 h-2 rounded-full bg-[#AA8840] animate-pulse'></span>
            שולח את הברכה…
            {pendingCount > 1 && <span className='ms-1 opacity-70'>({pendingCount})</span>}
        </div>
    )
}

function OfflineModal({ pendingCount, onCheck }) {
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

                    <h3 className='text-xl font-bold text-gray-800 mb-2'>אין חיבור לאינטרנט</h3>
                    <p className='text-sm text-gray-600 leading-relaxed mb-1'>
                        {pendingCount > 1
                            ? `שמרנו ${pendingCount} ברכות על המכשיר שלך ✨`
                            : 'הברכה שלך נשמרה על המכשיר ✨'}
                    </p>
                    <p className='text-sm text-gray-600 leading-relaxed mb-6'>
                        הפעל/י <span className='font-bold text-[#AA8840]'>Wi-Fi</span> או
                        <span className='font-bold text-[#AA8840]'> חבילת גלישה</span>,
                        <br />
                        והכל יישלח אוטומטית ברגע שהחיבור יחזור.
                    </p>

                    {/* Tiny OS hints */}
                    <div className='bg-gray-50 rounded-xl p-3 text-xs text-gray-500 mb-6 leading-relaxed'>
                        <span className='block mb-1'>
                            <span className='font-semibold text-gray-600'>איפון:</span> החלקה מהפינה הימנית-עליונה →
                            לחיצה על Wi-Fi
                        </span>
                        <span className='block'>
                            <span className='font-semibold text-gray-600'>אנדרואיד:</span> החלקה מלמעלה →
                            לחיצה על Wi-Fi
                        </span>
                    </div>

                    <button
                        onClick={handleCheck}
                        disabled={checking}
                        className='w-full py-3.5 rounded-xl bg-[#AA8840] text-white font-bold shadow-lg hover:shadow-xl hover:bg-[#AA8840]/90 active:scale-[0.98] transition-all duration-300 disabled:opacity-50'
                    >
                        {checking ? 'בודק חיבור…' : 'ניסיתי, בדוק שוב'}
                    </button>
                    <p className='text-[11px] text-gray-400 mt-3'>
                        אפשר לסגור את הדף — הברכה תישלח כשתחזור לאפליקציה
                    </p>
                </div>
            </div>
        </div>
    )
}
