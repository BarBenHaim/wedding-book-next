// Server-side layout for the digital book route — exists ONLY to host
// generateMetadata. The page itself (page.js) is a client component
// (uses Firebase, react-pageflip, lots of state) and can't export
// metadata directly. Putting it here keeps the boundary clean.
//
// Why this exists: when a couple shares the digital-book link to
// WhatsApp / Facebook / Telegram / etc, the messaging app's crawler
// hits this route and reads the <meta> tags to build the preview
// card. Without this, the preview is blank or shows generic Next.js
// boilerplate. With this, it shows:
//   • A clean Hebrew title built from the wedding's eventType +
//     names — "תראו את ספר הברכות של דור ושקד"
//   • A short description
//   • The book's cover image if the couple uploaded one, else a
//     generic Wedding Tales logo
//
// Token validation: the metadata also CHECKS the token against
// wedding.digitalTokens. If the token is invalid we return generic
// fallback metadata — no leak of the wedding's identity to anyone
// who tries random tokens.

import { adminDb } from '@/lib/firebaseAdmin'
import { buildTitle, normalizeEventType } from '@/lib/eventTypes'

// metadataBase tells Next.js what to prefix relative og:image / og:url
// with when emitting the <meta> tags. Without this, relative paths
// would render as plain "/og/wedding-tales-book.png" — Facebook /
// WhatsApp crawlers can't resolve those, so the preview falls back
// to a small text-only card. The metadataBase + every per-wedding
// override is now set inside generateMetadata() below — Next 15
// rejects having BOTH `export const metadata` and
// `export async function generateMetadata` on the same file, so
// the empty static placeholder that used to live here was removed.

// Brand fallback when the couple hasn't uploaded a cover image.
// Lives in /public/og/ — designed at the canonical 1200×630 OG card
// size with the gold-on-espresso brand palette + Hebrew title +
// "WEDDING TALES" tagline. WhatsApp/Facebook/Telegram render this as
// the rich preview when no per-couple cover image is set.
const FALLBACK_OG_IMAGE = '/og/wedding-tales-book.png'

// Site origin — used to make every OG image URL absolute, which is
// what crawlers require. Resolution order:
//   1. NEXT_PUBLIC_SITE_URL (e.g. https://weddingtales.co.il) —
//      preferred, set this in .env.production for the canonical URL.
//   2. VERCEL_URL — auto-set by Vercel (no protocol, so we prefix).
//   3. Empty string — relative URLs (works in dev, may fail on
//      crawlers in prod if neither var is set).
function siteOrigin() {
    if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`
    return ''
}

function abs(pathOrUrl) {
    if (!pathOrUrl) return null
    // Already absolute (Firebase Storage URLs, full https:// links, data: URIs)
    if (/^(https?:|data:)/i.test(pathOrUrl)) return pathOrUrl
    const origin = siteOrigin()
    if (!origin) return pathOrUrl
    return origin + (pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`)
}

// Build the share title from the wedding doc. Uses the same buildTitle
// helper as the public guest page so the wording is consistent across
// every surface ("ספר הברכות של דור ושקד" appears identically on the
// landing, the cover, and the share card).
function buildShareTitle(data) {
    const type = normalizeEventType(data?.eventType) || 'wedding'
    const title = buildTitle(data || {}, 'he')
    if (!title || title.kind === 'empty') return 'הספר הדיגיטלי שלכם'

    const names =
        title.kind === 'names'
            ? [title.left, title.right].filter(Boolean).join(' ו')
            : title.text

    let prefix
    switch (type) {
        case 'wedding':
            prefix = 'תראו את ספר הברכות של'
            break
        case 'birthday':
            prefix = 'ספר הברכות של'
            break
        case 'bar_mitzvah':
        case 'bat_mitzvah':
            prefix = 'ספר הברכות של'
            break
        case 'poker':
            prefix = 'אלבום המשחק של'
            break
        case 'travel':
            prefix = 'ספר המסע של'
            break
        default:
            prefix = 'ספר הברכות של'
    }
    return `${prefix} ${names}`
}

const FALLBACK_META_BUILDER = () => {
    const origin = siteOrigin()
    const ogImage = abs(FALLBACK_OG_IMAGE)
    return {
        metadataBase: origin ? new URL(origin) : undefined,
        title: 'הספר הדיגיטלי — Wedding Tales',
        description: 'ברכות ותמונות מהאורחים, נשמרות לכם לתמיד',
        openGraph: {
            title: 'הספר הדיגיטלי — Wedding Tales',
            description: 'ברכות ותמונות מהאורחים, נשמרות לכם לתמיד',
            type: 'website',
            locale: 'he_IL',
            siteName: 'Wedding Tales',
            images: [
                {
                    url: ogImage,
                    secureUrl: ogImage,
                    width: 1200,
                    height: 630,
                    type: 'image/png',
                },
            ],
        },
        twitter: {
            card: 'summary_large_image',
            title: 'הספר הדיגיטלי — Wedding Tales',
            description: 'ברכות ותמונות מהאורחים, נשמרות לכם לתמיד',
            images: [ogImage],
        },
        other: { 'image': ogImage },
    }
}
const FALLBACK_META = FALLBACK_META_BUILDER

export async function generateMetadata({ params }) {
    const { weddingId, token } = await params
    if (!weddingId || !token) return FALLBACK_META()

    try {
        const snap = await adminDb.collection('weddings').doc(weddingId).get()
        if (!snap.exists) return FALLBACK_META()
        const data = snap.data() || {}

        // Token validation — same check the page does at runtime.
        // Without this, anyone trying random tokens could enumerate
        // wedding identities through the metadata.
        const tokens = Array.isArray(data.digitalTokens) ? data.digitalTokens : []
        if (!tokens.includes(token)) return FALLBACK_META()

        const title = buildShareTitle(data)
        const description = 'הברכות והתמונות שלכם, נשמרות לתמיד בספר דיגיטלי יוקרתי'

        // Image priority: couple's uploaded cover (already an absolute
        // Firebase Storage URL) → static brand fallback in /public.
        const coverImage = data.coverDesign?.coverImage || null
        const ogImage = abs(coverImage) || abs(FALLBACK_OG_IMAGE)

        // The full share URL — used as og:url so the crawler
        // canonicalizes the preview against this exact page.
        const shareUrl = abs(`/wedding/${weddingId}/book/${token}`)

        return {
            metadataBase: siteOrigin() ? new URL(siteOrigin()) : undefined,
            title,
            description,
            openGraph: {
                title,
                description,
                type: 'website',
                locale: 'he_IL',
                siteName: 'Wedding Tales',
                url: shareUrl || undefined,
                images: [
                    {
                        url: ogImage,
                        secureUrl: ogImage,
                        width: 1200,
                        height: 630,
                        alt: title,
                        type: 'image/png',
                    },
                ],
            },
            twitter: {
                card: 'summary_large_image',
                title,
                description,
                images: [ogImage],
            },
            // Direct <link rel="image_src"> hint — some legacy
            // crawlers (older WhatsApp on iOS, some Telegram clients)
            // pick up this tag faster than og:image.
            other: {
                'image': ogImage,
            },
        }
        } catch (err) {
        console.warn('[digital-book] metadata generation failed:', err?.message || err)
        return FALLBACK_META()
    }
}

export default function BookLayout({ children }) {
    return children
}
