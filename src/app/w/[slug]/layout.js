// Server layout for the short guest link /w/[slug]. Hosts
// generateMetadata so the shared link shows an event-aware preview
// (title/description + generated card image).
import { adminDb } from '@/lib/firebaseAdmin'
import { buildShareCopy } from '@/lib/shareCopy'

function siteOrigin() {
    if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
    if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`
    return ''
}

export async function generateMetadata({ params }) {
    try {
        const { slug } = await params
        const q = await adminDb.collection('weddings').where('slug', '==', slug).limit(1).get()
        if (q.empty) return { title: 'ספר הברכות — Wedding Tales' }
        const doc = q.docs[0]
        const data = doc.data() || {}
        const { title, description } = buildShareCopy(data)
        const origin = siteOrigin()
        const ogImage = `${origin}/api/og/${doc.id}`
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

export default function SlugLayout({ children }) {
    return children
}
