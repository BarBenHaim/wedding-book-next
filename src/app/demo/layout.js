// Server layout for the public /demo experience page — exists only to host
// generateMetadata so the link shows a rich preview when shared on WhatsApp /
// Telegram / Facebook. The page itself (page.js) is an interactive client
// component (flipbook + a live "write a blessing" demo).

import { buildShareCopy } from '@/lib/shareCopy'

function siteOrigin() {
    if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`
    return 'https://app.weddingtales.co.il'
}

export async function generateMetadata() {
    const origin = siteOrigin()
    const title = 'ספר הברכות — ככה זה עובד 💛'
    const description = 'האורחים סורקים, כותבים ברכה ומעלים תמונה — והכל הופך לספר מודפס ודיגיטלי שנשאר לכם לתמיד. הדגמה: דפדפו בספר וגם נסו להוסיף ברכה.'
    const ogImage = `${origin}/og/wedding-tales-book.png`
    return {
        metadataBase: new URL(origin),
        title,
        description,
        openGraph: {
            title,
            description,
            type: 'website',
            locale: 'he_IL',
            siteName: 'Wedding Tales',
            url: `${origin}/demo`,
            images: [{ url: ogImage, secureUrl: ogImage, width: 1200, height: 630, alt: title, type: 'image/png' }],
        },
        twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
        other: { image: ogImage },
    }
}

export default function DemoLayout({ children }) {
    // buildShareCopy import kept for parity with other share routes / future
    // per-event demo variants; no-op here.
    void buildShareCopy
    return children
}
