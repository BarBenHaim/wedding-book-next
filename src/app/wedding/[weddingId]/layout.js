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

// Static, hand-designed branded preview at 1200×630. Replaces the
// previous dynamic /api/og/[weddingId] generator, which used satori
// (next/og) with a fetched Noto Sans Hebrew TTF — Hebrew glyphs were
// rendering crooked in WhatsApp previews because of how satori handles
// RTL + glyph rotation when fonts subset-mismatch. Static image is
// the same for every wedding (less personalization, but always clean),
// and the route's title/description still carry the per-wedding copy
// so WhatsApp's preview card text stays personalised.
// The /api/og/[weddingId] route is left in place for now in case any
// external system still links to it (no consumers in src/ besides
// these two layouts, which both moved to the static asset).
const STATIC_OG_IMAGE = '/og/wedding-tales-book.png'

export async function generateMetadata({ params }) {
    try {
        const { weddingId } = await params
        const snap = await adminDb.collection('weddings').doc(weddingId).get()
        const data = snap.exists ? snap.data() || {} : {}
        const { title, description } = buildShareCopy(data)
        const origin = siteOrigin()
        const ogImage = `${origin}${STATIC_OG_IMAGE}`
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
