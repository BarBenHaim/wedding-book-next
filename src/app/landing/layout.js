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
    const title = 'את הספר הזה כותבים האורחים שלכם | Wedding Tales — ספרי ברכות'
    const description = 'QR על השולחן, תמונה וכמה מילים מהלב — ובבוקר שאחרי יש לכם ספר כריכה קשה וספר דיגיטלי לכל החיים. דפדפו בשלושה ספרים אמיתיים של לקוחות. 1,290 ₪ הכול כלול.'
    const ogImage = `${origin}/og/landing-portfolio.png`
    return {
        metadataBase: new URL(origin),
        title,
        description,
        alternates: { canonical: `${origin}/landing` },
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
