'use client'

// Dresses the screens listed in lib/hallRoutes in the house design, from the
// root layout, so a screen does not have to know about it.

import { usePathname } from 'next/navigation'
import { Noto_Serif_Hebrew } from 'next/font/google'
import { hallFor } from '@/lib/hallRoutes'
import './hall.css'

// Not preloaded: guest screens pass through here and never use it.
const serif = Noto_Serif_Hebrew({ subsets: ['hebrew', 'latin'], weight: ['500', '700', '800', '900'], display: 'swap', preload: false })

export default function Hall({ children }) {
    const hall = hallFor(usePathname())
    // Always the same element, so moving between screens does not rebuild them.
    return (
        <div className={hall?.page ? 'wt-hall' : 'contents'} style={hall ? { '--serif': serif.style.fontFamily } : undefined}>
            {hall?.band && <div className='wt-hall-band' aria-hidden='true' />}
            {children}
        </div>
    )
}
