// Shared layout for every /wedding/[weddingId]/* guest + owner route.
// generateMetadata gives the GUEST link (base page + /photo) an
// event-aware title/description + a generated preview card so
// messaging-app crawlers build a rich preview. The digital-book route
// (/book/[token]) has its OWN deeper layout whose generateMetadata
// overrides this for that path (keeps its couple-cover preview).
import { adminDb } from '@/lib/firebaseAdmin'
import { buildShareCopy } from '@/lib/shareCopy'

function siteOrigin() {
    if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
    if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`
    return ''
}

// Per-wedding preview card, rendered on demand at 1200×630 by
// /api/og/[weddingId] (sharp + librsvg, base64-embedded Hebrew TTF).
// The image text mirrors the og:title below — so the WhatsApp link
// card shows the same personalized headline both above and inside
// the preview. The /api route falls back to /og/wedding-tales-book.png
// on errors, so a transient render failure won't break the preview.
export async function generateMetadata({ params }) {
    try {
        const { weddingId } = await params
        const snap = await adminDb.collection('weddings').doc(weddingId).get()
        const data = snap.exists ? snap.data() || {} : {}
        const { title, description } = buildShareCopy(data)
        const origin = siteOrigin()
        const ogImage = `${origin}/api/og/${weddingId}`
        const images = [{ url: ogImage, secureUrl: ogImage, width: 1200, height: 630, type: 'image/png', alt: title }]
        return {
            metadataBase: origin ? new URL(origin) : undefined,
            title,
            description,
            openGraph: { title, description, type: 'website', locale: 'he_IL', siteName: 'Wedding Tales', images },
            twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
        }
    } catch {
        return { title: 'ספר הברכות — Wedding Tales' }
    }
}

export default function WeddingLayout({ children }) {
    return <div className='min-h-[calc(100vh-4rem)] bg-white'>{children}</div>
}
