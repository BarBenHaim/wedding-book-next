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
import { isTwinsEvent, twinNames, hasBothTwinNames, blessForHref } from '@/lib/twins'

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

    // Resolve copy + palette (color) independently.
    // - copy comes from the event type (cfg) IN THE CHOSEN LOCALE
    // - palette comes from themeColor override, falling back to the type's default
    // Safe when data is null — helpers return sensible defaults and {kind:'empty'}.
    const cfg = getEventConfig(data?.eventType, locale)
    const palette = getPalette(data || {})
    const title = buildTitle(data || {}, locale)
    const subtitle = buildSubtitle(data || {}, locale)
    const description = buildDescription(data || {}, locale)
    // [a, b] on a twins event with both names filled; null otherwise
    // (a twins event mid-setup keeps the single button until it has
    // two names to put on two buttons).
    const twins = data && isTwinsEvent(data.eventType) && hasBothTwinNames(data) ? twinNames(data) : null

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

                {twins ? (
                    // Twins bar mitzvah: the guest picks who the blessing
                    // is for. Two equal buttons, one per boy, then a
                    // quieter one for both — the choice rides along to
                    // the form as ?for=a|b|both (src/lib/twins.js).
                    <div className='w-full flex flex-col items-center'>
                        <p className='text-[14px] font-semibold mb-3.5' style={{ color: palette.label }}>
                            {t('twinsChoose')}
                        </p>
                        <div className='w-full grid grid-cols-2 gap-3'>
                            {['a', 'b'].map((who, i) => (
                                <MarbleButton
                                    key={who}
                                    href={blessForHref(weddingId, who)}
                                    palette={palette}
                                    className='w-full'
                                    labelClassName='px-3 py-4 text-[16px] leading-snug'
                                >
                                    {t('twinsBless', { name: twins[i] })}
                                </MarbleButton>
                            ))}
                        </div>
                        <Link
                            href={blessForHref(weddingId, 'both')}
                            className='mt-3 w-full rounded-full py-3 text-[15px] font-bold transition-all duration-300 hover:-translate-y-[1px]'
                            style={{
                                color: palette.name,
                                background: 'rgba(255,255,255,0.65)',
                                border: `1px solid ${palette.accent}80`,
                                textDecoration: 'none',
                            }}
                        >
                            {t('twinsBoth')}
                        </Link>
                    </div>
                ) : (
                    <MarbleButton href={`/wedding/${weddingId}/photo`} palette={palette}>
                        {cfg.ctaLabel}
                    </MarbleButton>
                )}

                {/* Edit-your-own panel — only shows if THIS device already sent
                    a blessing. Sits below the "add a blessing" CTA so it's an
                    add-on, never a replacement. */}
                <div className='w-full mt-8'>
                    <MySubmissions weddingId={weddingId} locale={locale} />
                </div>

                {/* Footer */}
                <p className='mt-10 text-[10px] tracking-[2px] uppercase' style={{ color: palette.footer }}>
                    {cfg.footer}
                </p>
            </div>
        </div>
    )
}

// The marble-textured call to action, tinted per event palette. One
// component so the twins buttons look exactly like the single CTA.
function MarbleButton({ href, palette, children, className = '', labelClassName = 'px-12 py-4 text-[17px]' }) {
    return (
        <Link
            href={href}
            className={`group relative block overflow-hidden rounded-full transition-all duration-300 hover:-translate-y-[2px] ${className}`}
            style={{
                boxShadow: '0 8px 30px rgba(100,80,50,0.15), 0 2px 6px rgba(0,0,0,0.05)',
                textDecoration: 'none',
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
            <div className='absolute inset-0' style={{ background: palette.button }} />
            {/* Shimmer on hover */}
            <div
                className='absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500'
                style={{
                    background:
                        'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%, rgba(255,255,255,0.15) 100%)',
                }}
            />
            {/* Accent border */}
            <div className='absolute inset-0 rounded-full' style={{ border: `1px solid ${palette.accent}4D` }} />

            <span className={`relative z-10 block font-bold ${labelClassName}`} style={{ color: palette.name }}>
                {children}
            </span>
        </Link>
    )
}
