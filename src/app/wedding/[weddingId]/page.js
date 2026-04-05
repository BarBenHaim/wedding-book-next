'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebaseClient'

// Floating gold particles
function GoldParticles() {
    return (
        <>
            {[...Array(10)].map((_, i) => (
                <div
                    key={i}
                    className='absolute rounded-full animate-float'
                    style={{
                        width: `${1.5 + Math.random() * 2}px`,
                        height: `${1.5 + Math.random() * 2}px`,
                        background: `rgba(201,164,78,${0.12 + Math.random() * 0.2})`,
                        top: `${10 + Math.random() * 80}%`,
                        left: `${5 + Math.random() * 90}%`,
                        animationDelay: `${i * 0.7}s`,
                        animationDuration: `${4 + Math.random() * 3}s`,
                    }}
                />
            ))}
        </>
    )
}

export default function WeddingHome({ params }) {
    const { weddingId } = use(params)

    const [exists, setExists] = useState(null)
    const [names, setNames] = useState(null)
    const [weddingDate, setWeddingDate] = useState(null)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        async function checkWedding() {
            if (!weddingId) return
            try {
                const ref = doc(db, 'weddings', weddingId)
                const snap = await getDoc(ref)
                if (snap.exists()) {
                    setExists(true)
                    const data = snap.data()
                    if (data.brideName || data.groomName) {
                        setNames({ bride: data.brideName || '', groom: data.groomName || '' })
                    }
                    if (data.weddingDate) setWeddingDate(data.weddingDate)
                } else {
                    setExists(false)
                }
            } catch (err) {
                console.error('Error fetching wedding data:', err)
                setExists(false)
            }
        }
        checkWedding()
    }, [weddingId])

    if (exists === false) {
        return (
            <div className='flex h-screen items-center justify-center text-gray-700 text-lg'>
                לא נמצאה החתונה הזו
            </div>
        )
    }

    // Get initials for monogram
    const initials = names
        ? `${names.bride?.charAt(0) || ''} ♦ ${names.groom?.charAt(0) || ''}`
        : ''

    return (
        <div
            className='relative min-h-[calc(100vh-4rem)] font-sans flex flex-col items-center justify-center px-4 sm:px-6 py-10 overflow-hidden'
            style={{ background: 'linear-gradient(170deg, #faf6ef 0%, #f5efe4 40%, #ece4d5 100%)' }}
        >
            {/* Floating particles */}
            {mounted && <GoldParticles />}

            {/* Content — clean vertical flow */}
            <div className='relative z-10 flex flex-col items-center text-center animate-scaleIn max-w-[440px] w-full'>

                {/* Top ornamental line */}
                <div
                    className='w-24 h-[1.5px] mb-4'
                    style={{ background: 'linear-gradient(90deg, transparent, #c9a44e, transparent)' }}
                />

                {/* Monogram initials */}
                {names && (
                    <p
                        className='text-xl tracking-[6px] mb-2 font-light'
                        style={{ color: '#c9a44e', opacity: 0.7 }}
                    >
                        {initials}
                    </p>
                )}

                {/* "ספר הברכות של" label */}
                <p
                    className='text-sm sm:text-[15px] tracking-[3px] mb-5 font-normal'
                    style={{ color: '#AA8840' }}
                >
                    ספר הברכות של
                </p>

                {/* Couple names — large gold gradient */}
                {names ? (
                    <h1
                        className='text-[2.8rem] sm:text-[3.2rem] font-extrabold leading-[1.1] mb-2'
                        style={{
                            background: 'linear-gradient(135deg, #AA8840 0%, #d4b867 40%, #c9a44e 60%, #AA8840 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            filter: 'drop-shadow(0 1px 2px rgba(170,136,64,0.12))',
                        }}
                    >
                        {names.bride}
                        <span
                            className='inline-block mx-2'
                            style={{
                                fontFamily: "'Great Vibes', cursive",
                                fontSize: '2.4rem',
                                WebkitTextFillColor: '#c9a44e',
                                verticalAlign: 'middle',
                            }}
                        >
                            &
                        </span>
                        {names.groom}
                    </h1>
                ) : (
                    <div className='h-14 mb-2' />
                )}

                {/* Date with flanking lines */}
                {weddingDate && (
                    <div className='flex items-center gap-4 mt-4 mb-6'>
                        <div
                            className='w-14 h-[0.5px]'
                            style={{ background: 'linear-gradient(90deg, transparent, rgba(201,164,78,0.5))' }}
                        />
                        <span className='text-sm font-semibold tracking-wide' style={{ color: '#AA8840' }}>
                            {new Date(weddingDate).toLocaleDateString('he-IL', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                            })}
                        </span>
                        <div
                            className='w-14 h-[0.5px]'
                            style={{ background: 'linear-gradient(90deg, rgba(201,164,78,0.5), transparent)' }}
                        />
                    </div>
                )}

                {/* Description text */}
                <p
                    className='text-[15px] sm:text-base leading-[1.8] mb-8 max-w-[300px]'
                    style={{ color: '#8a7a65' }}
                >
                    השאירו ברכה מהלב והעלו תמונות
                    <br />
                    שישמרו לנצח בספר החתונה שלנו
                </p>

                {/* CTA Button — pill shape, gold gradient */}
                <Link
                    href={`/wedding/${weddingId}/photo`}
                    className='group relative flex items-center justify-center gap-2.5 px-16 py-[16px] rounded-full gold-shimmer text-white font-bold text-lg shadow-[0_8px_28px_rgba(170,136,64,0.25)] hover:shadow-[0_12px_36px_rgba(170,136,64,0.35)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 overflow-hidden'
                >
                    {/* Shine sweep */}
                    <div className='absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-white/[0.12] to-transparent group-hover:left-full transition-all duration-700 ease-in-out' />
                    <svg className='w-5 h-5 relative z-10' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2.5}>
                        <path strokeLinecap='round' strokeLinejoin='round' d='M12 4.5v15m7.5-7.5h-15' />
                    </svg>
                    <span className='relative z-10'>יצירת ברכה</span>
                </Link>

                {/* Bottom ornamental line */}
                <div
                    className='w-16 h-[1px] mt-7 mb-3'
                    style={{ background: 'linear-gradient(90deg, transparent, rgba(201,164,78,0.35), transparent)' }}
                />

                {/* Footer branding */}
                <p className='text-[11px] tracking-[3px] uppercase' style={{ color: 'rgba(170,136,64,0.22)' }}>
                    Wedding Tales
                </p>
            </div>
        </div>
    )
}
