// /b/[token] — short share link for the digital book.
//
// This is the URL couples copy + paste into WhatsApp / Telegram / iMessage,
// so it MUST serve a rich link preview (cover image + "צפו בספר הברכות של…").
//
// It used to 307-redirect straight to /wedding/{id}/book/{token}. That broke
// the preview: a messaging-app crawler fetches THIS url, gets a 3xx redirect
// (which carries no <head>), and never reads any OG <meta> tags — so the
// share card is blank and the link looks bare/ugly.
//
// Fix: serve the OG metadata on /b/{token} itself (generateMetadata below,
// mirroring the full book route), then bounce real browsers onward to the
// canonical book route with a client redirect + a <meta refresh> fallback.
// Crawlers read the <head> and stop; humans land on the book.
//
// Public route. No auth — middleware only gates /admin, /viewer, /portal.
// The invalid screen looks identical for "token doesn't exist" and
// "couldn't reach Firestore" so tokens can't be enumerated.

import { cache } from 'react'
import { adminDb } from '@/lib/firebaseAdmin'
import { buildShareCopy } from '@/lib/shareCopy'

// Every request must consult Firestore (tokens can be generated/revoked
// after the last build), and never cache the redirect target.
export const dynamic = 'force-dynamic'

const FALLBACK_OG_IMAGE = '/og/wedding-tales-book.png'

// Site origin — crawlers require ABSOLUTE og:image / og:url. Resolution:
// NEXT_PUBLIC_SITE_URL (canonical) → VERCEL_URL (auto) → '' (dev/relative).
function siteOrigin() {
    if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`
    return ''
}
function abs(pathOrUrl) {
    if (!pathOrUrl) return null
    if (/^(https?:|data:)/i.test(pathOrUrl)) return pathOrUrl
    const origin = siteOrigin()
    if (!origin) return pathOrUrl
    return origin + (pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`)
}

// Dedupe the token → wedding lookup across generateMetadata + the page
// render (both run once per request). React cache() memoizes for the
// duration of a single request, so we hit Firestore only once.
const lookupWedding = cache(async token => {
    if (!token || typeof token !== 'string') return null
    try {
        // array-contains on `digitalTokens` is a single-field query (no
        // composite index). limit(1): tokens are globally unique (UUID-like).
        const snap = await adminDb
            .collection('weddings')
            .where('digitalTokens', 'array-contains', token)
            .limit(1)
            .get()
        if (!snap.empty) return { id: snap.docs[0].id, data: snap.docs[0].data() || {} }
    } catch (err) {
        console.error('[b/[token]] lookup failed', err)
    }
    return null
})

// Generic, identity-free fallback card (bad/unknown token, or Firestore down).
function fallbackMeta() {
    const ogImage = abs(FALLBACK_OG_IMAGE)
    const origin = siteOrigin()
    const title = 'ספר הברכות — Wedding Tales'
    const description = 'ברכות ותמונות מהאורחים, נשמרות לכם לתמיד'
    return {
        metadataBase: origin ? new URL(origin) : undefined,
        title,
        description,
        openGraph: {
            title,
            description,
            type: 'website',
            locale: 'he_IL',
            siteName: 'Wedding Tales',
            images: [{ url: ogImage, secureUrl: ogImage, width: 1200, height: 630, type: 'image/png' }],
        },
        twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
        other: { image: ogImage },
    }
}

export async function generateMetadata({ params }) {
    const { token } = await params
    const found = await lookupWedding(token)
    if (!found) return fallbackMeta()

    const data = found.data
    const { title: shareTitle, description } = buildShareCopy(data)
    // "צפו ב…" + the event-aware title (single source of truth). Bar mitzvah →
    // "צפו בספר הברכות לבר המצווה של נועם"; wedding → "צפו בספר הברכות של דור ושקד".
    const title = shareTitle ? `צפו ב${shareTitle}` : 'צפו בספר הברכות'
    const desc = description || 'הברכות והתמונות מהאורחים — שמורות לכם לתמיד'

    // Image priority: the couple's uploaded cover photo, else the per-event
    // dynamic card at /api/og/<id> (personalised + themed by event type), so
    // EVERY short link shows a real cover-style preview, never a bare link.
    const coverImage = data.coverDesign?.coverImage || null
    const ogImage = abs(coverImage) || abs(`/api/og/${found.id}`)

    // og:url points at THIS short link so the crawler canonicalises the
    // preview against the URL the user actually pasted.
    const shareUrl = abs(`/b/${encodeURIComponent(token)}`)
    const origin = siteOrigin()

    return {
        metadataBase: origin ? new URL(origin) : undefined,
        title,
        description: desc,
        openGraph: {
            title,
            description: desc,
            type: 'website',
            locale: 'he_IL',
            siteName: 'Wedding Tales',
            url: shareUrl || undefined,
            images: [
                { url: ogImage, secureUrl: ogImage, width: 1200, height: 630, alt: title, type: 'image/png' },
            ],
        },
        twitter: { card: 'summary_large_image', title, description: desc, images: [ogImage] },
        // Legacy <link rel="image_src"> hint — some older WhatsApp/Telegram
        // clients pick this up faster than og:image.
        other: { image: ogImage },
    }
}

export default async function ShortLinkPage({ params }) {
    const { token } = await params
    const found = await lookupWedding(token)
    if (!found) return <InvalidScreen />

    const target = `/wedding/${found.id}/book/${encodeURIComponent(token)}`
    // Deliberately NOT a server redirect() — a 3xx carries no <head>, so the
    // OG tags from generateMetadata above would never reach the crawler.
    // Instead, carry the preview metadata here and bounce real browsers on.
    return <RedirectScreen target={target} />
}

// Tiny "opening the book…" screen that redirects humans to the canonical
// book route. The OG card lives in <head> (generateMetadata), so crawlers
// that fetch /b/{token} get the rich preview and ignore this body.
function RedirectScreen({ target }) {
    return (
        <div
            className='min-h-screen flex items-center justify-center px-6 text-center'
            style={{ background: 'radial-gradient(ellipse at 50% 30%, #2a1f17 0%, #14100c 100%)' }}
        >
            {/* No-JS / crawler-follow fallback. */}
            <meta httpEquiv='refresh' content={`0; url=${target}`} />
            {/* Fast path for real browsers — replace() so Back doesn't loop here. */}
            <script
                dangerouslySetInnerHTML={{
                    __html: `window.location.replace(${JSON.stringify(target)});`,
                }}
            />
            <div>
                <p style={{ color: '#f5ead2', fontSize: 18, marginBottom: 12 }}>פותח את ספר הברכות…</p>
                <a
                    href={target}
                    style={{ color: '#c9a44e', fontSize: 14, textDecoration: 'underline' }}
                >
                    אם הדף לא נפתח אוטומטית — לחצו כאן
                </a>
            </div>
        </div>
    )
}

// Mirror of the InvalidScreen inside the full book route — same dark
// gold-ember palette + Hebrew copy.
function InvalidScreen() {
    return (
        <div
            className='min-h-screen flex items-center justify-center px-6 text-center'
            style={{ background: 'radial-gradient(ellipse at 50% 30%, #2a1f17 0%, #14100c 100%)' }}
        >
            <div>
                <svg viewBox='0 0 24 24' className='w-12 h-12 mx-auto mb-4' fill='none' stroke='#c9a44e' strokeWidth={1.4}>
                    <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        d='M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z'
                    />
                </svg>
                <h2 style={{ color: '#f5ead2', fontSize: '24px', fontWeight: 700, marginBottom: 8 }}>הקישור לא תקף</h2>
                <p style={{ color: '#9a8665', fontSize: '14px', maxWidth: 320, margin: '0 auto', lineHeight: 1.6 }}>
                    הקישור שעקבת אחריו פג תוקף או שאינו שייך לספר זה. אם רכשת את הספר — בדוק את האימייל שקיבלת או פנה אלינו.
                </p>
            </div>
        </div>
    )
}
