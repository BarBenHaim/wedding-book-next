'use client'

import { useEffect, useState, use, useCallback } from 'react'
import Link from 'next/link'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebaseClient'
import { getEventConfig, getPalette, buildTitle, buildSubtitle, buildDescription } from '../../../lib/eventTypes'
import { NextIntlClientProvider, useTranslations, useLocale } from 'next-intl'
import { getMessages } from '@/i18n/getMessages'
import { normalizeLocale, dirFor } from '@/i18n/locales'
import { logEvent } from '@/lib/logEvent'
import MySubmissions from '@/components/MySubmissions/MySubmissions'

// ── Outer: owns the runtime locale and wires the i18n provider so the
// guest sees the page in the language the super-admin configured for the
// event. Initial render is Hebrew (legacy default); the inner component
// bubbles the doc's locale up via onLocaleDiscovered() once Firestore
// answers, and the provider re-renders with the right messages.
export default function WeddingHome({ params }) {
    const { weddingId } = use(params)
    const [locale, setLocale] = useState('he')
    const onLocaleDiscovered = useCallback(
        next => setLocale(prev => (prev === next ? prev : next)),
        []
    )
    return (
        <NextIntlClientProvider locale={locale} messages={getMessages(locale)}>
            <GuestLanding weddingId={weddingId} onLocaleDiscovered={onLocaleDiscovered} />
        </NextIntlClientProvider>
    )
}

function GuestLanding({ weddingId, onLocaleDiscovered }) {
    const t = useTranslations('guestPage')
    const locale = useLocale()

    const [exists, setExists] = useState(null)
    const [data, setData] = useState(null) // the raw wedding doc (or null while loading)

    // Fire-and-forget scan analytics — guest just landed on the
    // wedding's public page, which counts as "the QR was scanned"
    // for funnel purposes. Wrapped helper swallows any error so a
    // failing tracking call can never delay or break the page.
    useEffect(() => {
        logEvent(weddingId, 'scan')
    }, [weddingId])

    useEffect(() => {
        async function checkWedding() {
            if (!weddingId) return
            try {
                const ref = doc(db, 'weddings', weddingId)
                const snap = await getDoc(ref)
                if (snap.exists()) {
                    const d = snap.data()
                    onLocaleDiscovered(normalizeLocale(d.locale))
                    setExists(true)
                    setData(d)
                } else {
                    setExists(false)
                }
            } catch (err) {
                console.error('Error fetching wedding data:', err)
                setExists(false)
            }
        }
        checkWedding()
    }, [weddingId, onLocaleDiscovered])

    if (exists === false) {
        return (
            <div
                className='flex h-screen items-center justify-center text-gray-700 text-lg'
                dir={dirFor(locale)}
            >
                {t('notFound')}
            </div>
        )
    }

    // ── Elegant resolve state ──
    // While Firestore answers we show a single breathing heart on the
    // soft ivory wash instead of flashing an empty layout with default
    // copy. Typical fetch is <1s, so this reads as a deliberate
    // "curtain" moment rather than a spinner.
    if (exists === null) {
        return (
            <div
                className='min-h-[calc(100vh-4rem)] flex items-center justify-center'
                style={{ background: 'linear-gradient(180deg, #ffffff 0%, #faf6ee 60%, #f4ecdc 100%)' }}
                dir={dirFor(locale)}
            >
                <svg
                    viewBox='0 0 24 24'
                    className='w-6 h-6'
                    fill='#c9a44e'
                    style={{ animation: 'heartBeat 1.4s ease-in-out infinite' }}
                    aria-hidden='true'
                >
                    <path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' />
                </svg>
            </div>
        )
    }

    // Resolve copy + palette (color) independently.
    // - copy comes from the event type (cfg) IN THE CHOSEN LOCALE
    // - palette comes from themeColor override, falling back to the type's default
    // Safe when data is null — helpers return sensible defaults and {kind:'empty'}.
    const cfg = getEventConfig(data?.eventType, locale)
    const palette = getPalette(data || {})
    const title = buildTitle(data || {}, locale)
    const subtitle = buildSubtitle(data || {}, locale)
    const description = buildDescription(data || {}, locale)

    return (
        <div
            className='relative min-h-[calc(100vh-4rem)] font-sans flex flex-col items-center justify-center px-5 py-10 overflow-hidden'
            style={{ background: palette.bgGradient }}
            dir={dirFor(locale)}
        >
            {/* ── Floating gold dust — four barely-there particles that
                give the hero air a sense of depth. Deterministic
                positions (no hydration drift), aria-hidden, and frozen
                by the global prefers-reduced-motion rules. ── */}
            <div className='absolute inset-0 pointer-events-none' aria-hidden='true'>
                {[
                    { left: '14%', top: '22%', size: 5, delay: '0s', dur: '7s' },
                    { left: '82%', top: '30%', size: 4, delay: '1.6s', dur: '8.5s' },
                    { left: '24%', top: '72%', size: 3, delay: '3s', dur: '7.5s' },
                    { left: '74%', top: '78%', size: 5, delay: '0.8s', dur: '9s' },
                ].map((p, i) => (
                    <span
                        key={i}
                        className='absolute rounded-full'
                        style={{
                            left: p.left,
                            top: p.top,
                            width: p.size,
                            height: p.size,
                            background: palette.accent,
                            opacity: 0.35,
                            filter: 'blur(0.5px)',
                            animation: `dustFloat ${p.dur} ease-in-out ${p.delay} infinite`,
                        }}
                    />
                ))}
            </div>

            {/* ── Content ── */}
            <div className='relative z-10 flex flex-col items-center text-center max-w-[400px] w-full'>
                {/* Label */}
                <p
                    className='text-[15px] font-semibold tracking-[1px] mb-2 animate-riseIn'
                    style={{ color: palette.label }}
                >
                    {subtitle}
                </p>

                {/* Title — shape depends on event type */}
                {title.kind === 'names' ? (
                    <h1
                        className='text-[2.85rem] sm:text-[3.1rem] font-extrabold leading-[1.15] mb-1.5 animate-riseIn delay-1'
                        style={{ color: palette.name }}
                    >
                        {title.left}
                        <span
                            className='inline-block mx-1'
                            style={{
                                fontFamily: "'Great Vibes', cursive",
                                fontSize: '2.3rem',
                                color: palette.accent,
                                verticalAlign: 'middle',
                                fontWeight: 400,
                            }}
                        >
                            &nbsp; &&nbsp;
                        </span>
                        {title.right}
                    </h1>
                ) : title.kind === 'single' ? (
                    <h1
                        className='text-[2.4rem] sm:text-[2.7rem] font-extrabold leading-[1.15] mb-1.5 animate-riseIn delay-1'
                        style={{ color: palette.name }}
                    >
                        {title.text}
                    </h1>
                ) : (
                    <div className='h-14 mb-2' />
                )}

                {/* Ornamental flourish — hairline + diamond, the same
                    stationery language the blessing form speaks. Ties
                    the two pages into one continuous experience. */}
                <div className='flex items-center justify-center gap-2 mt-4 animate-bloomIn delay-2' aria-hidden='true'>
                    <span
                        className='block h-px w-14'
                        style={{ background: `linear-gradient(to left, transparent, ${palette.accent}, transparent)` }}
                    />
                    <span className='inline-block w-1.5 h-1.5 rotate-45' style={{ background: palette.accent }} />
                    <span
                        className='block h-px w-14'
                        style={{ background: `linear-gradient(to right, transparent, ${palette.accent}, transparent)` }}
                    />
                </div>

                {/* Description */}
                <p
                    className='text-[15px] leading-[1.8] mt-5 mb-8 max-w-[300px] whitespace-pre-line animate-riseIn delay-3'
                    style={{ color: palette.description }}
                >
                    {description}
                </p>

                {/* CTA Button with marble texture — breathing halo keeps
                    it alive, shimmer sweeps on hover, chevron leans
                    forward. The one action on the page, treated like it. */}
                <Link
                    href={`/wedding/${weddingId}/photo`}
                    className='group relative overflow-hidden rounded-full transition-transform duration-300 hover:-translate-y-[2px] active:scale-[0.98] animate-riseIn delay-4'
                    style={{
                        boxShadow: '0 8px 30px rgba(100,80,50,0.15), 0 2px 6px rgba(0,0,0,0.05)',
                        textDecoration: 'none',
                        animation: 'riseIn 0.7s var(--ease-out-soft) 0.44s forwards, haloBreath 3.6s ease-in-out 1.4s infinite',
                    }}
                >
                    {/* Marble texture background */}
                    <div
                        className='absolute inset-0'
                        style={{
                            backgroundImage: 'url(/backgrounds/buttonbg.webp)',
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                        }}
                    />
                    {/* Soft overlay for readability — tinted per event type */}
                    <div
                        className='absolute inset-0'
                        style={{ background: palette.button }}
                    />
                    {/* Shimmer on hover */}
                    <div
                        className='absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500'
                        style={{
                            background:
                                'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%, rgba(255,255,255,0.15) 100%)',
                        }}
                    />
                    {/* Accent border */}
                    <div
                        className='absolute inset-0 rounded-full'
                        style={{ border: `1px solid ${palette.accent}4D` }}
                    />

                    <span
                        className='relative z-10 flex items-center justify-center gap-2 px-12 py-4 text-[17px] font-bold'
                        style={{ color: palette.name }}
                    >
                        {cfg.ctaLabel}
                        {/* Forward chevron — flips in RTL, leans into the
                            reading direction on hover. */}
                        <svg
                            viewBox='0 0 24 24'
                            className='w-[15px] h-[15px] rtl:rotate-180 transition-transform duration-300 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth={2.6}
                            aria-hidden='true'
                        >
                            <path strokeLinecap='round' strokeLinejoin='round' d='M9 5l7 7-7 7' />
                        </svg>
                    </span>
                </Link>

                {/* Edit-your-own panel — only shows if THIS device already sent
                    a blessing. Sits below the "add a blessing" CTA so it's an
                    add-on, never a replacement. */}
                <div className='w-full mt-8 animate-riseIn delay-5'>
                    <MySubmissions weddingId={weddingId} locale={locale} />
                </div>

                {/* Footer */}
                <p
                    className='mt-10 text-[10px] tracking-[2px] uppercase animate-riseIn delay-6'
                    style={{ color: palette.footer }}
                >
                    {cfg.footer}
                </p>
            </div>
        </div>
    )
}
