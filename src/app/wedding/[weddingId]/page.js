'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebaseClient'

export default function WeddingHome({ params }) {
    const { weddingId } = use(params)

    const [exists, setExists] = useState(null)
    const [names, setNames] = useState(null)
    const [weddingDate, setWeddingDate] = useState(null)
    useEffect(() => {
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
            <div className='flex h-screen items-center justify-center text-gray-700 text-lg'>לא נמצאה החתונה הזו</div>
        )
    }

    return (
        <div
            className='relative min-h-[calc(100vh-4rem)] font-sans flex flex-col items-center justify-center px-5 py-10 overflow-hidden'
            style={{
                background: 'linear-gradient(180deg, #ffffff 0%, #fdfcf9 30%, #f9f3e8 60%, #f2e8d3 100%)',
            }}
        >
            {/* ── Content ── */}
            <div className='relative z-10 flex flex-col items-center text-center animate-scaleIn max-w-[400px] w-full'>
                {/* Label */}
                <p className='text-[15px] font-semibold tracking-[1px] mb-2' style={{ color: '#96884e' }}>
                    ספר הברכות של
                </p>

                {/* Couple names */}
                {names ? (
                    <h1
                        className='text-[2.85rem] sm:text-[3.1rem] font-extrabold leading-[1.15] mb-1.5'
                        style={{ color: '#3d2e1a' }}
                    >
                        {names.bride}
                        <span
                            className='inline-block mx-1'
                            style={{
                                fontFamily: "'Great Vibes', cursive",
                                fontSize: '2.3rem',
                                color: '#D3B665',
                                verticalAlign: 'middle',
                                fontWeight: 400,
                            }}
                        >
                            &nbsp; &&nbsp;
                        </span>
                        {names.groom}
                    </h1>
                ) : (
                    <div className='h-14 mb-2' />
                )}

                {/* Description */}
                <p className='text-[15px] leading-[1.8] mt-5 mb-8 max-w-[300px]' style={{ color: '#7a6548' }}>
                    זהו המקום לשתף את הרגעים שלכם, לכתוב ברכות מרגשות ולהוסיף תמונות שישמרו לנצח.
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
                    {/* Soft overlay for readability */}
                    <div
                        className='absolute inset-0'
                        style={{
                            background: 'rgba(255, 213, 116, 0.6)',
                        }}
                    />
                    {/* Shimmer on hover */}
                    <div
                        className='absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500'
                        style={{
                            background:
                                'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%, rgba(255,255,255,0.15) 100%)',
                        }}
                    />
                    {/* Gold border */}
                    <div
                        className='absolute inset-0 rounded-full'
                        style={{ border: '1px solid rgba(211,182,101,0.3)' }}
                    />

                    <span className='relative z-10 block px-12 py-4 text-[17px] font-bold' style={{ color: '#3d2e1a' }}>
                        יצירת ברכה
                    </span>
                </Link>

                {/* Footer */}
                <p className='mt-10 text-[10px] tracking-[2px] uppercase' style={{ color: 'rgba(138,109,64,0.2)' }}>
                    Wedding Tales
                </p>
            </div>
        </div>
    )
}
