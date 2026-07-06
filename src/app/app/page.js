// /app — acquisition landing for the mobile app: download (store
// badges flip live via STORE_LINKS in AppLanding) or open a free book
// right now. Server shell for SEO + OG.
import AppLanding from './AppLanding'

export const metadata = {
    title: 'Wedding Tales — ספר הברכות של האירוע שלכם, בכיס | האפליקציה',
    description:
        'האורחים כותבים ברכות ומעלים תמונות — ואתם רואים את הספר מתמלא בזמן אמת. פתחו ספר ברכות דיגיטלי לאירוע שלכם בחינם, בלי כרטיס אשראי.',
    openGraph: {
        title: 'כל הברכות מהאירוע שלכם. בספר אחד. בכיס. 🎁',
        description: 'מבצע השקה: האירוע הראשון חינם. האורחים מברכים — אתם מתרגשים.',
        images: [{ url: '/og/landing-portfolio.png', width: 1200, height: 630 }],
        locale: 'he_IL',
        type: 'website',
    },
    twitter: { card: 'summary_large_image' },
}

export default function AppPage() {
    return <AppLanding />
}
