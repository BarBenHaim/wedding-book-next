// src/app/fonts.js
import {
    Geist,
    Geist_Mono,
    Noto_Serif_Hebrew,
    Frank_Ruhl_Libre,
    Secular_One,
    David_Libre,
    Heebo,
} from 'next/font/google'

import { Great_Vibes, Cinzel_Decorative, Parisienne, Cormorant_Garamond, Playfair_Display_SC } from 'next/font/google'

// פונטים כלליים
export const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
export const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })
export const notoHebrew = Noto_Serif_Hebrew({
    subsets: ['hebrew'],
    weight: ['400', '700'],
    variable: '--font-noto-hebrew',
})

// פונטים עבריים יוקרתיים
export const frankRuhl = Frank_Ruhl_Libre({ subsets: ['hebrew'], weight: ['400', '700'] })
export const secular = Secular_One({ subsets: ['hebrew'], weight: '400' })
export const davidLibre = David_Libre({ subsets: ['hebrew'], weight: ['400', '700'] })
export const heebo = Heebo({ subsets: ['hebrew'], weight: ['400', '700'] })

// פונטים דקורטיביים (לאנגלית בלבד, לשימוש בכותרות/preview)
export const greatVibes = Great_Vibes({ subsets: ['latin'], weight: '400' })
export const cinzel = Cinzel_Decorative({ subsets: ['latin'], weight: '400' })
export const parisienne = Parisienne({ subsets: ['latin'], weight: '400' })
export const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: '400' })
export const playfairSC = Playfair_Display_SC({ subsets: ['latin'], weight: '400' })
