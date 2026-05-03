'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { getMessages } from '@/i18n/getMessages'

// Marketing landing page is anonymous chrome — no wedding doc to drive
// locale from. We deliberately serve Hebrew here regardless of browser
// language: this is a Hebrew-first SaaS, the bulk of organic traffic is
// Hebrew speakers, and showing English to a Hebrew user just because
// their browser is set to English looked broken. International couples
// land here too, but they buy via WooCommerce in their language anyway
// and only hit the localized portal/guest pages once provisioned.

export default function Home() {
    const router = useRouter()
    const t = useMemo(() => getMessages('he').home, [])

    // Step + feature decks built from messages so adding a new step is
    // a single JSON edit per language, not a JSX change.
    const steps = [
        { step: '01', title: t.step1Title, desc: t.step1Desc, iconPath: 'M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z' },
        { step: '02', title: t.step2Title, desc: t.step2Desc, iconPath: 'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z' },
        { step: '03', title: t.step3Title, desc: t.step3Desc, iconPath: 'M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25' },
    ]

    const features = [
        { title: t.feat1Title, desc: t.feat1Desc, iconPath: 'M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3' },
        { title: t.feat2Title, desc: t.feat2Desc, iconPath: 'M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42' },
        { title: t.feat3Title, desc: t.feat3Desc, iconPath: 'M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z' },
        { title: t.feat4Title, desc: t.feat4Desc, iconPath: 'M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75' },
    ]

    const stats = [
        { stat: '2,500+', label: t.stat1Label, desc: t.stat1Desc },
        { stat: '98%', label: t.stat2Label, desc: t.stat2Desc },
        { stat: '500k+', label: t.stat3Label, desc: t.stat3Desc },
    ]

    return (
        <div className='relative min-h-[calc(100vh-4rem)] w-full bg-gradient-to-br from-[#F5F5F5] via-[#f0ebe3] to-[#ebe5da] overflow-hidden font-sans flex flex-col'>
            {/* Gold ambient glow */}
            <div className='absolute -top-32 -left-32 h-[28rem] w-[28rem] rounded-full bg-[rgba(170,136,64,0.07)] blur-3xl pointer-events-none'></div>
            <div className='absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-[rgba(170,136,64,0.07)] blur-3xl pointer-events-none'></div>
            <div className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[40rem] w-[40rem] rounded-full bg-[rgba(170,136,64,0.03)] blur-3xl pointer-events-none'></div>

            {/* Main content */}
            <div className='relative z-10 flex flex-1 flex-col items-center text-center px-4 sm:px-6'>

                {/* ═══ Hero Section ═══ */}
                <section className='max-w-3xl pt-12 sm:pt-16 md:pt-20 pb-12 sm:pb-16'>
                    <img src='/logo-wt.png' alt='Wedding Tales' className='h-16 sm:h-20 w-auto mx-auto mb-6 drop-shadow-[0_4px_16px_rgba(170,136,64,0.25)] animate-fadeIn' />

                    <h1 className='text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-[800] text-[#18140F] leading-tight mb-5 animate-slideUp'>
                        {t.heroLine1}
                        <br />
                        <span className='text-transparent bg-clip-text bg-gradient-to-r from-[#AA8840] to-[#c9a44e]'>
                            {t.heroLine2}
                        </span>
                    </h1>

                    <p className='text-base sm:text-lg md:text-xl text-[#5a5040] max-w-xl mb-8 mx-auto leading-relaxed animate-slideUp' style={{ animationDelay: '0.1s' }}>
                        {t.heroDescription}
                    </p>

                    <div className='flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center animate-slideUp' style={{ animationDelay: '0.2s' }}>
                        <button
                            onClick={() => router.push('/register')}
                            className='rounded-2xl gold-shimmer px-8 py-3.5 text-base sm:text-lg font-[800] text-white shadow-lg cursor-pointer hover:shadow-xl hover:scale-[1.03] active:scale-[0.98] transition-all duration-300'
                        >
                            {t.ctaPrimary}
                        </button>
                        <button
                            onClick={() => router.push('/login')}
                            className='rounded-2xl border-2 border-[#AA8840]/30 px-8 py-3.5 text-base sm:text-lg font-[700] text-[#AA8840] bg-white/80 backdrop-blur-sm hover:bg-white hover:border-[#AA8840]/50 shadow-sm transition-all duration-300 cursor-pointer'
                        >
                            {t.ctaSecondary}
                        </button>
                    </div>
                </section>

                {/* Gold divider ornament */}
                <div className='flex items-center gap-4 mb-12 sm:mb-16'>
                    <div className='w-12 sm:w-20 h-px bg-gradient-to-r from-transparent to-[#AA8840]/30'></div>
                    <div className='text-[#AA8840]/40 text-xl' style={{ fontFamily: "'Great Vibes', cursive" }}>✦</div>
                    <div className='w-12 sm:w-20 h-px bg-gradient-to-l from-transparent to-[#AA8840]/30'></div>
                </div>

                {/* ═══ How It Works ═══ */}
                <section className='w-full max-w-4xl mb-12 sm:mb-20'>
                    <h2 className='text-2xl sm:text-3xl font-[800] text-[#18140F] mb-2'>{t.howTitle}</h2>
                    <p className='text-[#5a5040] mb-8 text-sm sm:text-base'>{t.howSubtitle}</p>

                    <div className='relative grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 stagger-children'>
                        {/* Connecting line on desktop */}
                        <div className='hidden md:block absolute top-14 left-[20%] right-[20%] h-px bg-gradient-to-r from-[#AA8840]/10 via-[#AA8840]/25 to-[#AA8840]/10 z-0'></div>

                        {steps.map((item, i) => (
                            <div key={i} className='relative z-10 rounded-2xl bg-white/80 backdrop-blur-sm p-6 sm:p-8 text-center border border-[rgba(170,136,64,0.08)] card-hover group'>
                                {/* Step number badge — pinned to the start edge of the card.
                                    Was hardcoded `right-4`; logical CSS makes it work in
                                    either direction. */}
                                <div className='absolute -top-3 end-4 bg-gradient-to-r from-[#AA8840] to-[#c9a44e] text-white text-xs font-bold px-3 py-1 rounded-full shadow-md'>
                                    {item.step}
                                </div>
                                <div className='w-16 h-16 mx-auto mb-5 rounded-2xl bg-[#AA8840]/8 flex items-center justify-center group-hover:bg-[#AA8840]/15 group-hover:scale-110 transition-all duration-300 ring-4 ring-white shadow-sm'>
                                    <svg className='w-8 h-8' fill='none' stroke='#AA8840' strokeWidth={1.5} viewBox='0 0 24 24'>
                                        <path strokeLinecap='round' strokeLinejoin='round' d={item.iconPath} />
                                    </svg>
                                </div>
                                <h3 className='text-lg font-[700] text-[#18140F] mb-2'>{item.title}</h3>
                                <p className='text-[#5a5040] text-sm leading-relaxed'>{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ═══ Features Grid ═══ */}
                <section className='w-full max-w-5xl mb-12 sm:mb-20'>
                    <h2 className='text-2xl sm:text-3xl font-[800] text-[#18140F] mb-2'>{t.whyTitle}</h2>
                    <p className='text-[#5a5040] mb-8 text-sm sm:text-base'>{t.whySubtitle}</p>

                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 stagger-children'>
                        {features.map((feat, i) => (
                            // text-start instead of hardcoded text-right so this aligns
                            // to the reading direction in any locale.
                            <div key={i} className='flex items-start gap-4 rounded-xl bg-white/60 backdrop-blur-sm p-5 border border-[rgba(170,136,64,0.06)] card-hover text-start'>
                                <div className='shrink-0 w-11 h-11 rounded-xl bg-[#AA8840]/8 text-[#AA8840] flex items-center justify-center'>
                                    <svg className='w-6 h-6' fill='none' stroke='currentColor' strokeWidth={1.5} viewBox='0 0 24 24'>
                                        <path strokeLinecap='round' strokeLinejoin='round' d={feat.iconPath} />
                                    </svg>
                                </div>
                                <div>
                                    <h4 className='font-[700] text-[#18140F] mb-1'>{feat.title}</h4>
                                    <p className='text-sm text-[#5a5040] leading-relaxed'>{feat.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ═══ Social Proof ═══ */}
                <section className='w-full max-w-4xl mb-12 sm:mb-20'>
                    <div className='rounded-2xl bg-white/50 backdrop-blur-sm p-6 sm:p-8 border border-[rgba(170,136,64,0.08)]'>
                        <h2 className='text-2xl font-[800] text-[#18140F] mb-6 text-center'>{t.trustTitle}</h2>
                        <div className='grid grid-cols-1 sm:grid-cols-3 gap-8'>
                            {stats.map((item, i) => (
                                <div key={i} className='text-center'>
                                    <div className='text-3xl sm:text-4xl font-[800] text-[#AA8840] mb-2'>{item.stat}</div>
                                    <div className='font-[700] text-[#18140F] mb-1'>{item.label}</div>
                                    <div className='text-sm text-[#5a5040]'>{item.desc}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ═══ Bottom CTA ═══ */}
                <section className='w-full max-w-2xl pb-16 sm:pb-20'>
                    <div className='rounded-3xl bg-[#18140F] p-6 sm:p-10 text-center shadow-2xl relative overflow-hidden'>
                        <div className='absolute -top-20 -right-20 w-40 h-40 rounded-full bg-[#AA8840]/10 blur-3xl pointer-events-none'></div>
                        <div className='absolute -bottom-20 -left-20 w-40 h-40 rounded-full bg-[#AA8840]/10 blur-3xl pointer-events-none'></div>

                        <img src='/logo-wt.png' alt='Wedding Tales' className='h-12 w-auto mx-auto mb-5 opacity-80' />
                        <h2 className='text-2xl sm:text-3xl font-[800] text-white mb-3'>
                            {t.bottomCtaTitle}
                        </h2>
                        <p className='text-[#d4b867]/80 mb-6 text-sm sm:text-base'>{t.bottomCtaSubtitle}</p>
                        <button
                            onClick={() => router.push('/register')}
                            className='rounded-2xl gold-shimmer px-8 py-3.5 text-base font-[800] text-white shadow-lg hover:shadow-xl hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 cursor-pointer'
                        >
                            {t.bottomCtaBtn}
                        </button>
                    </div>
                </section>
            </div>
        </div>
    )
}
