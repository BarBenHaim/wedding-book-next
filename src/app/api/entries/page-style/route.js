// PATCH /api/entries/page-style
//
// Writes one blessing's per-page design override.
//
// ── Why this is a server route ──────────────────────────────────────
//
// firestore.rules has `allow update, delete: if false` on
// weddings/{wid}/entries/{eid}. Client writes to an entry are denied
// outright — the delete path was already moved to a server route for
// exactly this reason. Adding another client updateDoc here would work
// on whatever rules happen to be deployed today and break the first time
// anyone runs `firebase deploy --only firestore:rules`.
//
// ── Why it stores a sparse object ───────────────────────────────────
//
// The override holds only what was deliberately pinned. Everything else
// keeps inheriting the book's design, so changing the preset still
// restyles this page in every respect the operator did not explicitly
// fix. Sending `{ imageMarginTop: null }` unpins that one key and hands
// it back to the book; `?reset=1` hands back all of them.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { sanitizePageStyle, overriddenKeys } from '@/lib/pageStyle'

async function authorized(req) {
    const header = req.headers.get('authorization') || ''
    if (!header.startsWith('Bearer ')) return false
    try {
        const decoded = await adminAuth.verifyIdToken(header.slice(7).trim())
        return isSuperAdmin(decoded.email)
    } catch {
        return false
    }
}

// A page can hold a background image and a frame overlay, both URLs. They
// are rendered inside the customer's book and printed, so they come from
// our own storage and nowhere else.
const OUR_ASSET = /^(?:\/|https:\/\/(?:firebasestorage\.googleapis\.com|storage\.googleapis\.com|app\.weddingtales\.co\.il)\/)/
const URL_KEYS = ['backgroundUrl', 'photoFrameUrl', 'frame', 'texture']

export async function PATCH(req) {
    if (!(await authorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'bad-json' }, { status: 400 })
    }

    const weddingId = String(body?.weddingId || '').trim()
    const entryId = String(body?.entryId || '').trim()
    if (!weddingId || !entryId) return NextResponse.json({ error: 'missing-ids' }, { status: 400 })

    const ref = adminDb.collection('weddings').doc(weddingId).collection('entries').doc(entryId)

    // Reset — back to inheriting the book's design entirely.
    if (body?.reset === true) {
        await ref.set({ pageStyle: null }, { merge: true })
        return NextResponse.json({ ok: true, pageStyle: {}, overridden: [] })
    }

    // The whitelist lives in the shared module, so the browser and this
    // route agree on what a page may override — and pagination keys are
    // refused in both places rather than only in the UI.
    const patch = sanitizePageStyle(body?.pageStyle)

    for (const key of URL_KEYS) {
        const v = patch[key]
        if (typeof v === 'string' && v && !OUR_ASSET.test(v)) {
            return NextResponse.json({ ok: false, error: `${key}: קישור חיצוני לא מורשה` }, { status: 400 })
        }
    }

    const snap = await ref.get()
    if (!snap.exists) return NextResponse.json({ error: 'not-found' }, { status: 404 })

    // `replace` — the caller is holding the entire override and sending
    // it whole. That is what the live editor does, and it is the only
    // way an unpin can be expressed: removing a key from an object the
    // server merges into is impossible to say.
    if (body?.replace === true) {
        await ref.set({ pageStyle: Object.keys(patch).length ? patch : null }, { merge: true })
        return NextResponse.json({ ok: true, pageStyle: patch, overridden: overriddenKeys(patch) })
    }

    // Merge over what is already pinned, and treat an explicit null as
    // "unpin this one key". Without the delete step a null would be
    // stored and then read back as a real value — `backgroundUrl: null`
    // meaning "no background" is indistinguishable from "inherit" once
    // it is in the document, so the removal has to happen here.
    const current = sanitizePageStyle(snap.data()?.pageStyle)
    const next = { ...current }
    for (const [key, value] of Object.entries(body?.pageStyle || {})) {
        if (value === null && body?.unpin?.includes?.(key)) delete next[key]
        else if (key in patch) next[key] = patch[key]
    }

    await ref.set({ pageStyle: Object.keys(next).length ? next : null }, { merge: true })
    return NextResponse.json({ ok: true, pageStyle: next, overridden: overriddenKeys(next) })
}

export async function POST(req) {
    return PATCH(req)
}
