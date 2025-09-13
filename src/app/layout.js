// src/app/layout.js
import { Geist, Geist_Mono } from 'next/font/google'
import { Noto_Serif_Hebrew } from 'next/font/google'
import './globals.css'

const geistSans = Geist({ subsets: ['latin'] })
const geistMono = Geist_Mono({ subsets: ['latin'] })
const notoHebrew = Noto_Serif_Hebrew({ subsets: ['hebrew'], weight: ['400', '700'] })

export const metadata = {
    title: 'Wedding Book',
    description: 'ספר ברכות דיגיטלי לחתונה',
}

export default function RootLayout({ children }) {
    return (
        <html lang='he'>
            <body className={`${geistSans.className} ${geistMono.className} ${notoHebrew.className} antialiased`}>
                {children}
            </body>
        </html>
    )
}
