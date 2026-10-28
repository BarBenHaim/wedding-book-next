// /api/manage/[token] — the no-login "manage the blessings" API.
//
//   GET   → { ok, wedding: { id, title, eventType }, entries: [...] }
//   POST  { action, ... } → { ok, ... }
//         edit          { entryId, name?, text? }
//         photo         { entryId, imageUrl, imgAspect? }  (URL from this event's storage folder)
//         restorePhoto  { entryId }
//         delete        { entryId }    → moved to entries_trash, then removed
//         undoDelete    { entryId }    → moved back from entries_trash
//         order         { order: [entryId, ...] }
//
// The token is the whole authorisation: an active `arrange_links/{token}`
// document with scope 'manage' (see src/lib/manageLinks.js). A revoked,
// unknown or arrange-only token is a 404 — the same answer for all three,
// so a probe learns nothing. Every write goes through the Admin SDK,
// because firestore.rules refuses client updates and deletes on entries.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebaseAdmin'
import { resolveEntryPhoto } from '@/lib/entryPhoto'
import {
    ARRANGE_LINKS_COLLECTION,
    isArrangeTokenShape,
    isArrangeLinkActive,
    sortForArrange,
    validateOrderRequest,
} from '@/lib/arrangeLinks'
import {
    canManage,
    isManageAction,
    actionAllowedOn,
    validateEdit,
    isOwnEventPhotoUrl,
    publicManageEntry,
    TRASH_SUBCOLLECTION,
} from '@/lib/manageLinks'
import { writeEntryOrder } from '@/lib/server/entryOrder'

const NOT_FOUND = () => NextResponse.json({ ok: false, error: 'Link not found' }, { status: 404 })
const bad = (status, error) => NextResponse.json({ ok: false, error }, { status })

async function loadLink(token) {
    if (!isArrangeTokenShape(token)) return null
    const ref = adminDb.collection(ARRANGE_LINKS_COLLECTION).doc(token)
    const snap = await ref.get()
    if (!snap.exists) return null
    const data = snap.data() || {}
    if (!isArrangeLinkActive(data) || !canManage(data)) return null
    return { ref, data }
}

function titleOf(w) {
    if (w.eventType === 'twins_bar_mitzvah') {
        const pair = [(w.celebrantName || '').trim(), (w.celebrantName2 || '').trim()].filter(Boolean)
        if (pair.length) return pair.join(' ו')
    }
    const celebrant = (w.celebrantNameHe || w.celebrantName || '').trim()
    if (celebrant) return celebrant
    const bride = (w.brideNameHe || w.brideName || '').trim()
    const groom = (w.groomNameHe || w.groomName || '').trim()
    if (bride && groom) return `${bride} ו${groom}`
    return bride || groom || ''
}

function toMs(ts) {
    if (ts?.toDate) return ts.toDate().getTime()
    return Number.isFinite(ts) ? ts : null
}

async function loadEntries(weddingId) {
    const qs = await adminDb.collection('weddings').doc(weddingId).collection('entries').get()
    const entries = qs.docs.map(d => {
        const data = d.data() || {}
        return resolveEntryPhoto({ id: d.id, ...data, timestamp: toMs(data.timestamp) })
    })
    return sortForArrange(entries)
}

function isSafeId(s) {
    return typeof s === 'string' && s.length > 0 && s.length < 200 && !/[/\\]/.test(s) && !s.includes('..')
}

function touch(link, field) {
    // Bookkeeping for the admin panel. Best-effort: a failure here must
    // not turn a saved change into an error on the owner's screen.
    link.ref.set({ lastUsedAt: FieldValue.serverTimestamp(), [field]: FieldValue.increment(1) }, { merge: true }).catch(() => {})
}

export async function GET(_req, { params }) {
    try {
        const { token } = await params
        const link = await loadLink(token)
        if (!link) return NOT_FOUND()
        const weddingId = link.data.weddingId
        const wSnap = await adminDb.collection('weddings').doc(weddingId).get()
        if (!wSnap.exists) return NOT_FOUND()
        const w = wSnap.data() || {}
        const entries = await loadEntries(weddingId)
        return NextResponse.json({
            ok: true,
            wedding: {
                id: weddingId,
                title: titleOf(w),
                eventType: w.eventType || null,
                // Twins: both names, so each card can say who it is for.
                celebrantName: w.eventType === 'twins_bar_mitzvah' ? w.celebrantName || '' : undefined,
                celebrantName2: w.eventType === 'twins_bar_mitzvah' ? w.celebrantName2 || '' : undefined,
            },
            entries: entries.map(publicManageEntry),
        })
    } catch (err) {
        console.error('[manage GET] failed:', err?.message || err)
        return bad(500, 'Internal error')
    }
}

export async function POST(req, { params }) {
    try {
        const { token } = await params
        const link = await loadLink(token)
        if (!link) return NOT_FOUND()
        const weddingId = link.data.weddingId

        const body = await req.json().catch(() => ({}))
        const action = body?.action
        if (!isManageAction(action)) return bad(400, 'unknown-action')

        const weddingRef = adminDb.collection('weddings').doc(weddingId)

        if (action === 'order') {
            const check = validateOrderRequest(body)
            if (!check.ok) return bad(400, check.error)
            const result = await writeEntryOrder(weddingId, check.order)
            touch(link, 'saves')
            return NextResponse.json({ ok: true, ...result })
        }

        const entryId = typeof body.entryId === 'string' ? body.entryId.trim() : ''
        if (!isSafeId(entryId)) return bad(400, 'bad-entry-id')
        const entryRef = weddingRef.collection('entries').doc(entryId)

        if (action === 'undoDelete') {
            const trashRef = weddingRef.collection(TRASH_SUBCOLLECTION).doc(entryId)
            const tSnap = await trashRef.get()
            if (!tSnap.exists) return bad(404, 'not-in-trash')
            const { deletedAt, deletedVia, deletedToken, ...original } = tSnap.data() || {}
            const batch = adminDb.batch()
            batch.set(entryRef, original)
            batch.delete(trashRef)
            await batch.commit()
            touch(link, 'edits')
            const restored = resolveEntryPhoto({ id: entryId, ...original, timestamp: toMs(original.timestamp) })
            return NextResponse.json({ ok: true, entry: publicManageEntry(restored) })
        }

        const snap = await entryRef.get()
        if (!snap.exists) return bad(404, 'entry-not-found')
        const entry = snap.data() || {}
        if (!actionAllowedOn(action, entry)) return bad(403, 'blank-page-locked')

        if (action === 'edit') {
            const check = validateEdit(body)
            if (!check.ok) return bad(400, check.error)
            await entryRef.set({ ...check.fields, editedAt: FieldValue.serverTimestamp(), editedVia: 'manage-link' }, { merge: true })
            touch(link, 'edits')
            return NextResponse.json({ ok: true, ...check.fields })
        }

        if (action === 'photo') {
            const url = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : ''
            if (!isOwnEventPhotoUrl(weddingId, url)) return bad(400, 'photo-url-not-allowed')
            const raw = Number(body.imgAspect)
            const imgAspectOverride = Number.isFinite(raw) && raw > 0.05 && raw < 20 ? raw : null
            await entryRef.set({ imageUrlOverride: url, imgAspectOverride, editedAt: FieldValue.serverTimestamp(), editedVia: 'manage-link' }, { merge: true })
            touch(link, 'edits')
            return NextResponse.json({ ok: true, imageUrl: url })
        }

        if (action === 'restorePhoto') {
            await entryRef.set({ imageUrlOverride: null, imgAspectOverride: null, editedAt: FieldValue.serverTimestamp(), editedVia: 'manage-link' }, { merge: true })
            touch(link, 'edits')
            return NextResponse.json({ ok: true, imageUrl: typeof entry.imageUrl === 'string' ? entry.imageUrl : null })
        }

        if (action === 'delete') {
            // Into the trash first, in the same batch as the delete, so a
            // blessing is never gone without a copy.
            const batch = adminDb.batch()
            batch.set(weddingRef.collection(TRASH_SUBCOLLECTION).doc(entryId), {
                ...entry,
                deletedAt: FieldValue.serverTimestamp(),
                deletedVia: 'manage-link',
                deletedToken: String(link.ref.id).slice(0, 8),
            })
            batch.delete(entryRef)
            await batch.commit()
            touch(link, 'edits')
            return NextResponse.json({ ok: true, deleted: entryId })
        }

        return bad(400, 'unknown-action')
    } catch (err) {
        console.error('[manage POST] failed:', err?.message || err)
        return bad(500, 'Internal error')
    }
}
