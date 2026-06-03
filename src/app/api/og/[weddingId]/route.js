// Dynamic Open Graph card for a wedding/event, served at
// /api/og/<weddingId>. Referenced explicitly from the guest layouts'
// generateMetadata (openGraph.images) — deliberately NOT the
// opengraph-image.js file convention, which would cascade onto the
// nested /book route and clobber its couple-cover preview.
//
// The image text is personalized per wedding: the headline matches
// the og:title from buildShareCopy(data).title, so the WhatsApp link
// card shows e.g. "ספר הברכות של נועם" both as title AND inside the
// image — single source of truth.
//
// Runtime is 'nodejs' (not edge): sharp is a native module and the
// SVG-to-PNG path uses librsvg + HarfBuzz, neither of which exist on
// the edge runtime. dynamic = 'force-dynamic' bypasses the Next data
// cache so a wedding's title update on the doc reflects the next
// time scrapers re-fetch.
import { adminDb } from '@/lib/firebaseAdmin'
import { buildShareCopy } from '@/lib/shareCopy'
import { renderOgImage } from '@/lib/ogImage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Cached at the CDN for a day, with stale-while-revalidate for
// another day. WhatsApp/Facebook scrape the URL aggressively when a
// new link is first shared, so cheap CDN hits are the common case.
// max-age=3600 on the client side keeps repeat scrapes from the same
// IP cheap without pinning a stale image forever.
const CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'

// Path served by Next from /public — used as the error fallback so a
// broken Firestore read or rendering error still gives WhatsApp
// SOMETHING to show instead of a 500.
const FALLBACK_PATH = '/og/wedding-tales-book.png'

function originFromReq(req) {
    if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
    if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`
    try { return new URL(req.url).origin } catch { return '' }
}

export async function GET(req, { params }) {
    const { weddingId } = await params

    try {
        let data = {}
        try {
            const snap = await adminDb.collection('weddings').doc(weddingId).get()
            if (snap.exists) data = snap.data() || {}
        } catch {
            // Firestore read failure: render the generic title rather
            // than aborting. The image is decorative; we shouldn't
            // break the WhatsApp preview because Firestore had a
            // transient blip.
            data = {}
        }

        const { title } = buildShareCopy(data)
        const png = await renderOgImage({ title })
        return new Response(png, {
            status: 200,
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': CACHE_CONTROL,
            },
        })
    } catch {
        // Last-resort fallback: redirect to the static branded card so
        // scrapers still get a valid image-shaped response.
        const base = originFromReq(req)
        return Response.redirect(`${base}${FALLBACK_PATH}`, 302)
    }
}
