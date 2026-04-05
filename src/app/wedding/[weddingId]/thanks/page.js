'use client'

import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

export default function ThanksPage() {
    const router = useRouter()
    const { weddingId } = useParams()

    useEffect(() => {
        const id = setTimeout(() => {
            if (weddingId) {
                router.push(`/wedding/${weddingId}`)
            } else {
                router.push('/')
            }
        }, 3000)
        return () => clearTimeout(id)
    }, [router, weddingId])

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
                <p className='text-sm text-gray-500'>נחזיר אותך לעמוד הראשי בעוד רגע...</p>
            </div>

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
