// src/app/layout.js
import { Geist, Geist_Mono, Noto_Serif_Hebrew } from 'next/font/google'
import './globals.css'
import Header from '@/components/Header/Header'
import Footer from '@/components/Footer/Footer'

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })
const notoHebrew = Noto_Serif_Hebrew({ subsets: ['hebrew'], weight: ['400', '700'], variable: '--font-noto-hebrew' })

const metadata = {
    title: 'Wedding Book',
    description: 'ספר ברכות דיגיטלי לחתונה',
}

export default function RootLayout({ children }) {
    return (
        <html lang='he' className={`${geistSans.variable} ${geistMono.variable} ${notoHebrew.variable}`}>
            {/* זה מבטל mismatch שנגרם על ידי תוספים או הבדלי server/client */}
            <body suppressHydrationWarning className='antialiased'>
                <Header />

                {children}
            </body>
        </html>
    )
}
