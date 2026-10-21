// /api/admin/arrange-links — mint, list and revoke the no-login links
// for one event. Super-admin only. Two kinds share the collection:
//   scope 'arrange' (default) → /arrange/[token], put the blessings in order
//   scope 'manage'            → /manage/[token], edit / photo / delete / order
//                               (see src/lib/manageLinks.js)
//
//   POST   { weddingId, scope? }  → { ok, token, link, message, scope }
//   GET    ?weddingId=&scope=     → { ok, links: [{ token, link, scope, createdAt, createdBy, ... }] }
//   DELETE { token }              → { ok }
//
// The link opens /arrange/[token]: a no-login page where the book
// owner drags the blessings into the order the printed book should
// have. See src/lib/arrangeLinks.js for why the token lives in its own
// closed collection and not on the wedding doc.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { eventTypeLabel } from '@/lib/adminEventsView'
import {
    ARRANGE_LINKS_COLLECTION,
    newArrangeToken,
    isArrangeTokenShape,
    arrangeLinkUrl,
    arrangeLinkMessage,
    isArrangeLinkActive,
} from '@/lib/arrangeLinks'
import { MANAGE_SCOPE, ARRANGE_SCOPE, linkScope, manageLinkUrl, manageLinkMessage } from '@/lib/manageLinks'

function urlFor(origin, token, scope) {
    return scope === MANAGE_SCOPE ? manageLinkUrl(origin, token) : arrangeLinkUrl(origin, token)
}

async function authenticate(req) {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Unauthorized' }
    try {
        const decoded = await adminAuth.verifyIdToken(authHeader.slice(7).trim())
        if (!isSuperAdmin(decoded.email)) return { ok: false, status: 403, error: 'Forbidden' }
        return { ok: true, email: decoded.email || '' }
    } catch {
        return { ok: false, status: 401, error: 'Invalid token' }
    }
}

function originOf(req) {
    return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || new URL(req.url).origin
}

// The event in the owner's words for the WhatsApp text: the celebrant
// at a bar/bat mitzvah or birthday, the couple at a wedding, and the
// event type when no name is on file.
function eventLabelOf(w) {
    const celebrant = (w.celebrantNameHe || w.celebrantName || '').trim()
    const type = eventTypeLabel(w)
    if (celebrant) return `${type === 'לא הוגדר' ? 'האירוע' : type} של ${celebrant}`
    const bride = (w.brideNameHe || w.brideName || '').trim()
    const groom = (w.groomNameHe || w.groomName || '').trim()
    if (bride && groom) return `${bride} ו${groom}`
    return type === 'לא הוגדר' ? '' : type
}

export async function POST(req) {
    const auth = await authenticate(req)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = await req.json().catch(() => ({}))
    const weddingId = typeof body.weddingId === 'string' ? body.weddingId.trim() : ''
    if (!weddingId) return NextResponse.json({ error: 'Missing weddingId' }, { status: 400 })
    const scope = body.scope === MANAGE_SCOPE ? MANAGE_SCOPE : ARRANGE_SCOPE

    try {
        const snap = await adminDb.collection('weddings').doc(weddingId).get()
        if (!snap.exists) return NextResponse.json({ error: 'Wedding not found' }, { status: 404 })
        const wedding = snap.data() || {}

        const token = newArrangeToken()
        await adminDb.collection(ARRANGE_LINKS_COLLECTION).doc(token).set({
            weddingId,
            scope,
            createdAt: FieldValue.serverTimestamp(),
            createdBy: auth.email,
            revokedAt: null,
            lastUsedAt: null,
            saves: 0,
        })

        const link = urlFor(originOf(req), token, scope)
        const messageOf = scope === MANAGE_SCOPE ? manageLinkMessage : arrangeLinkMessage
        return NextResponse.json({
            ok: true,
            token,
            scope,
            link,
            message: messageOf({ ownerName: wedding.ownerName, eventLabel: eventLabelOf(wedding), link }),
        })
    } catch (err) {
        console.error('[arrange-links POST] failed:', err?.message || err)
        return NextResponse.json({ error: 'Mint failed' }, { status: 500 })
    }
}

export async function GET(req) {
    const auth = await authenticate(req)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const sp = new URL(req.url).searchParams
    const weddingId = (sp.get('weddingId') || '').trim()
    if (!weddingId) return NextResponse.json({ error: 'Missing weddingId' }, { status: 400 })
    const wantScope = sp.get('scope') === MANAGE_SCOPE ? MANAGE_SCOPE : sp.get('scope') === ARRANGE_SCOPE ? ARRANGE_SCOPE : null

    try {
        const qs = await adminDb.collection(ARRANGE_LINKS_COLLECTION).where('weddingId', '==', weddingId).get()
        const origin = originOf(req)
        const links = qs.docs
            .map(d => ({ token: d.id, ...(d.data() || {}) }))
            .filter(isArrangeLinkActive)
            .filter(d => !wantScope || linkScope(d) === wantScope)
            .map(d => ({
                token: d.token,
                scope: linkScope(d),
                link: urlFor(origin, d.token, linkScope(d)),
                edits: Number.isInteger(d.edits) ? d.edits : 0,
                createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : null,
                createdBy: d.createdBy || null,
                lastUsedAt: d.lastUsedAt?.toDate ? d.lastUsedAt.toDate().toISOString() : null,
                saves: Number.isInteger(d.saves) ? d.saves : 0,
            }))
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        return NextResponse.json({ ok: true, links })
    } catch (err) {
        console.error('[arrange-links GET] failed:', err?.message || err)
        return NextResponse.json({ error: 'List failed' }, { status: 500 })
    }
}

export async function DELETE(req) {
    const auth = await authenticate(req)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = await req.json().catch(() => ({}))
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    if (!isArrangeTokenShape(token)) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

    try {
        const ref = adminDb.collection(ARRANGE_LINKS_COLLECTION).doc(token)
        const snap = await ref.get()
        if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        await ref.set({ revokedAt: FieldValue.serverTimestamp(), revokedBy: auth.email }, { merge: true })
        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[arrange-links DELETE] failed:', err?.message || err)
        return NextResponse.json({ error: 'Revoke failed' }, { status: 500 })
    }
}
