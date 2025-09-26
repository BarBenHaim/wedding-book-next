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
        <div className='relative h-[calc(100vh-4rem)] w-full bg-gradient-to-br from-purple-50 via-white to-pink-50 overflow-hidden font-heebo flex flex-col'>
            {/* רקעים */}
            <div className='absolute -top-32 -left-32 h-[28rem] w-[28rem] rounded-full bg-purple-300/30 blur-3xl'></div>
            <div className='absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-pink-300/30 blur-3xl'></div>

            {/* תוכן ראשי */}
            <div className='relative z-10 flex flex-1 flex-col justify-between items-center text-center px-6 py-10'>
                {/* Hero */}
                <section>
                    <h1 className='text-4xl md:text-6xl font-extrabold text-gray-900 leading-snug mb-4'>
                        כל הזיכרונות שלכם,
                        <br />
                        <span className='text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-500'>
                            בספר חתונה יוקרתי
                        </span>
                    </h1>
                    <p className='text-base md:text-xl text-gray-600 max-w-2xl mb-6 mx-auto'>
                        Wedding Book מרכז ברכות ותמונות מהאורחים ומעצב אותן לספר מרגש שנשאר לנצח.
                    </p>

                    <div className='flex gap-4 flex-wrap justify-center'>
                        <button
                            onClick={handleSignup}
                            className='rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 px-8 py-3 text-lg font-bold text-white shadow-lg hover:scale-105 transition'
                        >
                            ✨ התחילו עכשיו
                        </button>
                        <button
                            onClick={handleLogin}
                            className='rounded-2xl border-2 border-purple-500 px-8 py-3 text-lg font-bold text-purple-700 bg-white hover:bg-purple-50 shadow-md transition'
                        >
                            התחברו
                        </button>
                    </div>
                </section>

                {/* יתרונות */}
                <section className='w-full max-w-5xl'>
                    <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                        {[
                            { icon: '📸', title: 'כל התמונות במקום אחד', desc: 'בלי וואטסאפ, בלי בלגן.' },
                            { icon: '💌', title: 'ברכות מהלב', desc: 'האורחים כותבים ונשמר בספר.' },
                            { icon: '📖', title: 'ספר יוקרתי', desc: 'מקבלים ספר מודפס יפהפה.' },
                        ].map((card, i) => (
                            <div
                                key={i}
                                className='rounded-2xl bg-white/95 p-6 text-center shadow-md hover:shadow-xl transition'
                            >
                                <div className='mb-2 text-5xl'>{card.icon}</div>
                                <h3 className='text-xl font-semibold text-purple-700 mb-1'>{card.title}</h3>
                                <p className='text-gray-600 text-sm'>{card.desc}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    )
}
