'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function Home() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')

    const handleSignup = () => router.push('/register')
    const handleLogin = () => router.push('/login')

    return (
        <div className='relative min-h-[calc(100vh-4rem)] w-full bg-gradient-to-br from-purple-50 via-white to-pink-50 overflow-hidden font-heebo flex flex-col'>
            {/* רקעים */}
            <div className='absolute -top-32 -left-32 h-[20rem] w-[20rem] md:h-[28rem] md:w-[28rem] rounded-full bg-purple-300/30 blur-3xl'></div>
            <div className='absolute bottom-0 right-0 h-[20rem] w-[20rem] md:h-[28rem] md:w-[28rem] rounded-full bg-pink-300/30 blur-3xl'></div>

            {/* תוכן ראשי */}
            <div className='relative z-10 flex flex-1 flex-col justify-center items-center text-center px-4 sm:px-6 py-12 gap-16 sm:gap-24 md:gap-32 lg:gap-40'>
                {/* Hero */}
                <section className='max-w-3xl'>
                    <h1 className='text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-extrabold text-gray-900 leading-tight mb-4'>
                        כל הזיכרונות שלכם,
                        <br />
                        <span className='text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-500'>
                            בספר חתונה יוקרתי
                        </span>
                    </h1>

                    <p className='text-sm sm:text-base md:text-lg lg:text-xl text-gray-600 max-w-xl mb-6 mx-auto'>
                        Wedding Book מרכז ברכות ותמונות מהאורחים ומעצב אותן לספר מרגש שנשאר לנצח.
                    </p>

                    <div className='flex flex-col sm:flex-row gap-3 sm:gap-4 flex-wrap justify-center'>
                        <button
                            onClick={handleSignup}
                            className='rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 px-6 sm:px-8 py-3 text-base sm:text-lg font-bold text-white shadow-lg cursor-pointer'
                        >
                            התחילו עכשיו ✨
                        </button>
                        <button
                            onClick={handleLogin}
                            className='rounded-2xl border-2 border-purple-500 px-6 sm:px-8 py-3 text-base sm:text-lg font-bold text-purple-700 bg-white hover:bg-purple-50 shadow-md transition cursor-pointer'
                        >
                            התחברו
                        </button>
                    </div>
                </section>

                {/* יתרונות */}
                <section className='w-full max-w-6xl'>
                    <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6'>
                        {[
                            { icon: '📸', title: 'כל התמונות במקום אחד', desc: 'בלי וואטסאפ, בלי בלגן.' },
                            { icon: '💌', title: 'ברכות מהלב', desc: 'האורחים כותבים ונשמר בספר.' },
                            { icon: '📖', title: 'ספר יוקרתי', desc: 'מקבלים ספר מודפס יפהפה.' },
                        ].map((card, i) => (
                            <div
                                key={i}
                                className='rounded-2xl bg-white/95 p-5 sm:p-6 text-center shadow-md hover:shadow-xl transition'
                            >
                                <div className='mb-2 text-4xl sm:text-5xl'>{card.icon}</div>
                                <h3 className='text-lg sm:text-xl font-semibold text-purple-700 mb-1'>{card.title}</h3>
                                <p className='text-gray-600 text-sm sm:text-base'>{card.desc}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    )
}
