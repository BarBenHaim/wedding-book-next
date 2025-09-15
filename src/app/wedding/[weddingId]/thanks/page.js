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
        <div className='relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden bg-gradient-to-br from-pink-50 via-white to-purple-50 px-6'>
            {/* Glow רקע */}
            <div className='absolute -top-32 left-10 h-96 w-96 rounded-full bg-pink-300/30 blur-3xl animate-pulse'></div>
            <div className='absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-purple-300/30 blur-3xl animate-pulse delay-200'></div>

            {/* לבבות/קונפטי */}
            <div className='absolute inset-0 overflow-hidden pointer-events-none'>
                {Array.from({ length: 12 }).map((_, i) => (
                    <span
                        key={i}
                        className='absolute text-pink-400/70 animate-float'
                        style={{
                            left: `${Math.random() * 100}%`,
                            top: `${Math.random() * 100}%`,
                            fontSize: `${Math.random() * 24 + 16}px`,
                            animationDelay: `${i * 0.4}s`,
                        }}
                    >
                        💖 ✨
                    </span>
                ))}
            </div>

            {/* כרטיס תודה */}
            <div className='relative z-10 w-full max-w-xl rounded-3xl bg-white/90 backdrop-blur-md p-12 shadow-2xl text-center animate-fadeIn'>
                <h2 className='mb-4 text-4xl font-bold text-gray-800'>תודה על הברכה! 💍</h2>
                <p className='text-lg text-gray-600 mb-6'>
                    ההודעה שלך נוספה בהצלחה לספר החתונה ✨
                    <br />
                    הזוג המאושר יוכל לראות אותה מיד 💜
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
