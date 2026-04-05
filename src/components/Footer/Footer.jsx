'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

export default function Footer() {
    const pathname = usePathname()

    // Only show footer on login and register pages
    const showOn = ['/login', '/register']
    if (!showOn.some(p => pathname?.startsWith(p))) return null

    return (
        <footer className='relative z-10 bg-[#18140F] text-[#F5F5F5] overflow-hidden'>
            {/* Ambient glow */}
            <div className='absolute -top-20 right-1/4 w-60 h-60 rounded-full bg-[#AA8840]/5 blur-3xl pointer-events-none'></div>

            <div className='max-w-4xl mx-auto text-center px-6 py-12 sm:py-16'>
                <img src='/logo-wt.png' alt='Wedding Tales' className='h-12 w-auto mx-auto mb-5 opacity-80' />

                <h3 className='text-xl sm:text-2xl font-[800] mb-3 bg-gradient-to-r from-[#AA8840] to-[#c9a44e] bg-clip-text text-transparent'>
                    מוכנים להתחיל את ספר החתונה שלכם?
                </h3>
                <p className='text-[#F5F5F5]/50 text-sm mb-6 max-w-md mx-auto'>
                    צרו ספר חתונה יוקרתי שישמור את כל הרגעים היפים לנצח.
                </p>

                <Link href='/register' className='inline-block rounded-2xl gold-shimmer px-8 py-3.5 text-base font-bold shadow-lg hover:shadow-xl hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 cursor-pointer text-white'>
                    התחילו עכשיו
                </Link>

                {/* Divider */}
                <div className='w-full h-px bg-gradient-to-r from-transparent via-[#AA8840]/15 to-transparent mt-10 mb-6'></div>

                {/* Bottom */}
                <div className='flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#F5F5F5]/30'>
                    <span>© {new Date().getFullYear()} Wedding Tales. כל הזכויות שמורות.</span>
                    <span>weddingtales.co.il</span>
                </div>
            </div>
        </footer>
    )
}
