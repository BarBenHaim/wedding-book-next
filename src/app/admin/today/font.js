// The face of the approved Jerusalem reference: a heavy Hebrew serif, one
// family from the heading down to the table rows.
import { Noto_Serif_Hebrew } from 'next/font/google'

export const jerusalemSerif = Noto_Serif_Hebrew({
    subsets: ['hebrew', 'latin'],
    weight: ['500', '600', '700', '800', '900'],
    display: 'swap',
})
