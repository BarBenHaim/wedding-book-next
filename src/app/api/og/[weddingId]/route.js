// Dynamic Open Graph card for a wedding/event, served at
// /api/og/<weddingId>. Referenced explicitly from the guest layouts'
// generateMetadata (openGraph.images) — deliberately NOT the
// opengraph-image.js file convention, which would cascade onto the
// nested /book route and clobber its couple-cover preview.
import { adminDb } from '@/lib/firebaseAdmin'
import { eventOgImage } from '@/lib/ogCard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function origin(req) {
    if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
    if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`
    try { return new URL(req.url).origin } catch { return '' }
}

export async function GET(req, { params }) {
    const { weddingId } = await params
    let data = {}
    try {
        const snap = await adminDb.collection('weddings').doc(weddingId).get()
        if (snap.exists) data = snap.data() || {}
    } catch {
        data = {}
    }
    return eventOgImage(data, origin(req))
}
