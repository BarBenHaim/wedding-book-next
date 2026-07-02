// Server layout for the public /landing marketing page — hosts generateMetadata
// so the link shows a rich preview when shared (WhatsApp / Facebook / Telegram).
// The page itself (page.js) is an interactive client component.

function siteOrigin() {
    if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`
    return 'https://app.weddingtales.co.il'
}

export async function generateMetadata() {
    const origin = siteOrigin()
    const title = 'כל האורחים מברכים. אתם מקבלים ספר | Wedding Tales'
    const description = 'האורחים סורקים QR, כותבים ברכה ומעלים תמונה בזמן האירוע — ואתם מקבלים ספר מודפס ודיגיטלי לכל החיים. דפדפו בספרים אמיתיים של לקוחות ונסו להוסיף ברכה בעצמכם.'
    const ogImage = `${origin}/og/landing-portfolio.png`
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
            url: `${origin}/landing`,
            images: [{ url: ogImage, secureUrl: ogImage, width: 1200, height: 630, alt: title, type: 'image/png' }],
        },
        twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
        other: { image: ogImage },
    }
}

export default function LandingLayout({ children }) {
    return children
}
