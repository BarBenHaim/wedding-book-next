// src/app/layout.tsx
import './globals.css'
import Header from '@/components/Header/Header'
import {
    geistSans,
    geistMono,
    notoHebrew,
    frankRuhl,
    secular,
    davidLibre,
    heebo,
    assistant,
    greatVibes,
    cinzel,
    parisienne,
    cormorant,
    playfairSC,
} from './fonts'
import Footer from '@/components/Footer/Footer'

// Next.js 15 viewport export — viewport-fit=cover lets the page
// extend under the iOS notch / home indicator, which is REQUIRED
// for env(safe-area-inset-top) / env(safe-area-inset-bottom) to
// return real values. Without this, those env() calls return 0
// even on notched devices and content gets clipped.
export const viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: '#1a1410',
}

export default function RootLayout({ children }) {
    return (
        <html lang='he' dir='rtl'>
            <body
                suppressHydrationWarning
                className={`
          antialiased
          ${geistSans.variable} ${geistMono.variable}
          ${notoHebrew.variable} ${frankRuhl.variable}
          ${secular.variable} ${davidLibre.variable} ${heebo.variable}
          ${assistant.variable}
          ${greatVibes.variable} ${cinzel.variable} ${parisienne.variable}
          ${cormorant.variable} ${playfairSC.variable}
          `}
            >
                <Header />
                {children}
                <Footer />
            </body>
        </html>
    )
}
