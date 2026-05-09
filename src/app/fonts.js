// src/app/fonts.js
import {
    Geist,
    Geist_Mono,
    Noto_Serif_Hebrew,
    Frank_Ruhl_Libre,
    Secular_One,
    David_Libre,
    Heebo,
    Assistant,
} from 'next/font/google'

import { Great_Vibes, Cinzel_Decorative, Parisienne, Cormorant_Garamond, Playfair_Display_SC } from 'next/font/google'

import localFont from 'next/font/local'

// פונטים כלליים
export const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
export const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })
export const notoHebrew = Noto_Serif_Hebrew({
    subsets: ['hebrew'],
    weight: ['400', '700'],
    variable: '--font-noto-hebrew',
})

// פונט ראשי לתבנית Royal Gold
export const assistant = Assistant({
    subsets: ['hebrew', 'latin'],
    weight: ['300', '400', '600', '700', '800'],
    variable: '--font-assistant',
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

// פונט מקומי — "גברת לוין" (כתב יד עברי דקורטיבי).
// next/font/local קוראת את הקובץ מ-public/fonts ומייצרת className אופטימלי.
// משמש בעיצוב פנים הספר ובכריכה דרך FONTS ב-DesignControls.
export const gveretLevin = localFont({
    src: '../../public/fonts/GveretLevin-AlefAlefAlef-Regular.ttf',
    variable: '--font-gveret-levin',
    weight: '400',
    style: 'normal',
    display: 'swap',
})

// פונט מקומי — "דנה יד" (כתב יד עברי, אחות לגברת לוין).
// משמש בעיצוב פנים הספר דרך FONTS ב-DesignControls.
export const danaYad = localFont({
    src: '../../public/fonts/DanaYadAlefAlefAlef-Normal.otf',
    variable: '--font-dana-yad',
    weight: '400',
    style: 'normal',
    display: 'swap',
})

// פונט מקומי — "Playpen Sans Hebrew" (כתב יד-קז'ואלי בעברית, מבית
// Google Fonts). שלושה משקלים מסונכרנים בקובץ אחד כך ש-CSS
// font-weight: 400/500/600 בוחר את הקובץ הנכון אוטומטית. ב-FONTS_REGISTRY
// של הסטודיו הוא חשוף כברירת מחדל במשקל Regular (400).
export const playpenSansHebrew = localFont({
    src: [
        { path: '../../public/fonts/PlaypenSansHebrew-Regular.ttf', weight: '400', style: 'normal' },
        { path: '../../public/fonts/PlaypenSansHebrew-Medium.ttf', weight: '500', style: 'normal' },
        { path: '../../public/fonts/PlaypenSansHebrew-SemiBold.ttf', weight: '600', style: 'normal' },
    ],
    variable: '--font-playpen-hebrew',
    display: 'swap',
})
