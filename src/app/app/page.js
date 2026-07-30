// /app — acquisition landing for the mobile app. One goal: App Store
// downloads. Server shell for SEO + a rich OG card (public/og/app-download.png
// is composed from the same five screenshots that are on the store listing).
import AppLanding from './AppLanding'

function siteOrigin() {
    if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`
    return 'https://app.weddingtales.co.il'
}

export function generateMetadata() {
    const origin = siteOrigin()
    const title = 'Wedding Tales — ספר הברכות שכולם ידברו עליו'
    const description =
        'אירוע ראשון בחינם. האורחים כותבים ברכות ומעלים תמונות — ואתם מקבלים ספר מעוצב. הורידו את האפליקציה עכשיו.'
    const ogImage = `${origin}/og/app-download.png`

    return {
        metadataBase: new URL(origin),
        title,
        description,
        alternates: { canonical: `${origin}/app` },
        openGraph: {
            title,
            description,
            type: 'website',
            locale: 'he_IL',
            siteName: 'Wedding Tales',
            url: `${origin}/app`,
            images: [{ url: ogImage, secureUrl: ogImage, width: 1200, height: 630, alt: title, type: 'image/png' }],
        },
        twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
        other: { image: ogImage },
    }
}

export default function AppPage() {
    return <AppLanding />
}
