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
    greatVibes,
    cinzel,
    parisienne,
    cormorant,
    playfairSC,
} from './fonts'

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
          ${greatVibes.variable} ${cinzel.variable} ${parisienne.variable}
          ${cormorant.variable} ${playfairSC.variable}
          `}
            >
                <Header />
                {children}
            </body>
        </html>
    )
}
