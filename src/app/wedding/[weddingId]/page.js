'use client'

import { useEffect, useState, use, useCallback } from 'react'
import Link from 'next/link'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebaseClient'
import { getEventConfig, getPalette, buildTitle, buildSubtitle, buildDescription } from '../../../lib/eventTypes'
import { NextIntlClientProvider, useTranslations, useLocale } from 'next-intl'
import { getMessages } from '@/i18n/getMessages'
import { normalizeLocale, dirFor } from '@/i18n/locales'

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
            {/* ── Content ── */}
            <div className='relative z-10 flex flex-col items-center text-center animate-scaleIn max-w-[400px] w-full'>
                {/* Label */}
                <p className='text-[15px] font-semibold tracking-[1px] mb-2' style={{ color: palette.label }}>
                    {subtitle}
                </p>

                {/* Title — shape depends on event type */}
                {title.kind === 'names' ? (
                    <h1
                        className='text-[2.85rem] sm:text-[3.1rem] font-extrabold leading-[1.15] mb-1.5'
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
                        className='text-[2.4rem] sm:text-[2.7rem] font-extrabold leading-[1.15] mb-1.5'
                        style={{ color: palette.name }}
                    >
                        {title.text}
                    </h1>
                ) : (
                    <div className='h-14 mb-2' />
                )}

                {/* Description */}
                <p className='text-[15px] leading-[1.8] mt-5 mb-8 max-w-[300px] whitespace-pre-line' style={{ color: palette.description }}>
                    {description}
                </p>

                {/* CTA Button with marble texture */}
                <Link
                    href={`/wedding/${weddingId}/photo`}
                    className='group relative overflow-hidden rounded-full transition-all duration-300 hover:-translate-y-[2px]'
                    style={{
                        boxShadow: '0 8px 30px rgba(100,80,50,0.15), 0 2px 6px rgba(0,0,0,0.05)',
                        textDecoration: 'none',
                    }}
                >
                    {/* Marble texture background */}
                    <div
                        className='absolute inset-0'
                        style={{
                            backgroundImage: 'url(/backgrounds/buttonbg.png)',
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
                        className='relative z-10 block px-12 py-4 text-[17px] font-bold'
                        style={{ color: palette.name }}
                    >
                        {cfg.ctaLabel}
                    </span>
                </Link>

                {/* Footer */}
                <p className='mt-10 text-[10px] tracking-[2px] uppercase' style={{ color: palette.footer }}>
                    {cfg.footer}
                </p>
            </div>
        </div>
    )
}
