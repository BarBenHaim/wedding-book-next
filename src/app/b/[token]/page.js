// /b/[token] — short-link redirect to the full digital-book route.
//
// Server component: looks up which wedding owns this token via the
// Admin SDK (Firestore `array-contains` against wedding.digitalTokens)
// and 307-redirects to /wedding/{weddingId}/book/{token}. If no
// wedding owns the token (typo, revoked, fake), renders the same
// "הקישור לא תקף" screen the full route uses so a curious visitor
// gets the same dead end.
//
// Public route. No auth — middleware only gates /admin, /viewer,
// /portal. No email, no logging, no token-enumeration leak: the
// invalid screen looks identical for "token doesn't exist" and
// "couldn't reach Firestore".

import { redirect } from 'next/navigation'
import { adminDb } from '@/lib/firebaseAdmin'

// Don't pre-render or cache — every request needs to consult
// Firestore in case tokens have been generated / revoked since the
// last build.
export const dynamic = 'force-dynamic'

export default async function ShortLinkPage({ params }) {
    const { token } = await params

    if (!token || typeof token !== 'string') {
        return <InvalidScreen />
    }

    // ── Lookup ──
    // array-contains on `digitalTokens` is supported natively by
    // Firestore on a single field — no composite index required.
    // limit(1) because tokens are globally unique by construction
    // (UUID-like); a match anywhere is the answer.
    let weddingId = null
    try {
        const snap = await adminDb
            .collection('weddings')
            .where('digitalTokens', 'array-contains', token)
            .limit(1)
            .get()
        if (!snap.empty) {
            weddingId = snap.docs[0].id
        }
    } catch (err) {
        // Swallow + show invalid: same UX as a real bad token so an
        // attacker can't tell the difference between "Firestore down"
        // and "token doesn't exist". Worst case for legit users:
        // refresh restores. Log server-side for ops.
        console.error('[b/[token]] lookup failed', err)
    }

    if (!weddingId) {
        return <InvalidScreen />
    }

    // 307 (next/navigation default) — preserves the request method
    // (always GET here) and tells crawlers the canonical URL is the
    // full /wedding/.../book/... path.
    redirect(`/wedding/${weddingId}/book/${encodeURIComponent(token)}`)
}

// Mirror of the InvalidScreen inside the full book route — same dark
// gold-ember palette + Hebrew copy so a user landing here from a bad
// short link sees the identical message they'd get from a bad full
// link. Kept local to avoid pulling the 1.2k-line book page into the
// short-link route's bundle for what's essentially a redirect.
function InvalidScreen() {
    return (
        <div
            className='min-h-screen flex items-center justify-center px-6 text-center'
            style={{ background: 'radial-gradient(ellipse at 50% 30%, #2a1f17 0%, #14100c 100%)' }}
        >
            <div>
                <svg
                    viewBox='0 0 24 24'
                    className='w-12 h-12 mx-auto mb-4'
                    fill='none'
                    stroke='#c9a44e'
                    strokeWidth={1.4}
                >
                    <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        d='M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z'
                    />
                </svg>
                <h2 style={{ color: '#f5ead2', fontSize: '24px', fontWeight: 700, marginBottom: 8 }}>
                    הקישור לא תקף
                </h2>
                <p
                    style={{
                        color: '#9a8665',
                        fontSize: '14px',
                        maxWidth: 320,
                        margin: '0 auto',
                        lineHeight: 1.6,
                    }}
                >
                    הקישור שעקבת אחריו פג תוקף או שאינו שייך לספר זה. אם רכשת את הספר — בדוק את האימייל שקיבלת או פנה אלינו.
                </p>
            </div>
        </div>
    )
}
