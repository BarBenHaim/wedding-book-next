// POST /api/studio
//
// Consolidated server endpoint for the design studio's mutating
// operations. Routes the action through the Firebase Admin SDK so the
// caller doesn't need any Firestore security rules to be deployed —
// the admin SDK bypasses them entirely.
//
// Why this exists:
//   The studio collections (`studio_presets`, `studio_backgrounds`,
//   `studio_config`) are written from the client lib. If client-side
//   writes are gated by Firestore rules, every change to the studio
//   feature requires a `firebase deploy --only firestore:rules` —
//   which fails the moment the user's CLI auth lapses (as it did this
//   week with the 401 on serviceusage.googleapis.com).
//
//   By moving the writes here we make the studio "just work" after a
//   normal Next.js deploy (Vercel). No rules deploy required for any
//   of: edit preset, delete preset (incl. system), hide a static
//   background, hide a system preset, restore-all visibility, delete
//   an uploaded background.
//
// Auth:
//   Caller sends `Authorization: Bearer <Firebase ID token>`. We
//   verify with adminAuth.verifyIdToken and only proceed if the token
//   resolves to a signed-in user. The studio is a global asset
//   library for all couples — per the spring 2026 product decision,
//   any signed-in user has full edit/delete rights. To restrict to
//   super-admins, swap the signed-in check below for `isSuperAdmin`.

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, adminDb, adminStorage } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PRESETS = 'studio_presets'
const BACKGROUNDS = 'studio_backgrounds'
const VISIBILITY_DOC = ['studio_config', 'visibility']

async function authenticate(req) {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Unauthorized' }
    try {
        const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1])
        return { ok: true, uid: decoded.uid, email: decoded.email }
    } catch {
        return { ok: false, status: 401, error: 'Invalid token' }
    }
}

export async function POST(req) {
    const auth = await authenticate(req)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    let body
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { op } = body || {}
    if (!op) return NextResponse.json({ error: 'Missing op' }, { status: 400 })

    try {
        switch (op) {
            // ─── Presets ─────────────────────────────────────────────
            case 'savePreset':
                return NextResponse.json(await savePreset(body, auth))
            case 'deletePreset':
                return NextResponse.json(await deletePreset(body))

            // ─── Visibility (soft-hide) ──────────────────────────────
            case 'hideBackground':
                return NextResponse.json(await hideVisibility('hiddenBackgroundIds', body.id))
            case 'hidePreset':
                return NextResponse.json(await hideVisibility('hiddenPresetIds', body.id))
            case 'clearVisibility':
                return NextResponse.json(
                    await setVisibility({ hiddenBackgroundIds: [], hiddenPresetIds: [] })
                )

            // ─── Uploaded backgrounds (Firestore + Storage) ──────────
            case 'deleteUploadedBackground':
                return NextResponse.json(await deleteUploadedBackground(body))

            default:
                return NextResponse.json({ error: `Unknown op: ${op}` }, { status: 400 })
        }
    } catch (err) {
        console.error(`[studio API] op=${op} failed:`, err)
        return NextResponse.json(
            { error: err?.message || 'Internal error' },
            { status: 500 }
        )
    }
}

// ─── Op handlers ────────────────────────────────────────────────────

async function savePreset({ preset, asNew = false }, auth) {
    if (!preset) throw new Error('savePreset: missing preset')
    const now = new Date()
    const id = asNew || !preset.id ? newPresetId() : preset.id
    // Preserve ownerType on in-place edits so a system preset stays
    // flagged 'system' (and thus survives the seed-skip check).
    const ownerType = asNew ? 'studio' : preset.ownerType || 'studio'
    const merged = {
        ...preset,
        id,
        ownerType,
        createdBy: preset.createdBy || auth.uid || 'unknown',
        createdAt: asNew || !preset.createdAt ? now : preset.createdAt,
        updatedAt: now,
    }
    await adminDb.collection(PRESETS).doc(id).set(merged, { merge: false })
    return { ok: true, preset: merged }
}

async function deletePreset({ id, alsoHide }) {
    if (!id) throw new Error('deletePreset: missing id')
    await adminDb.collection(PRESETS).doc(id).delete()
    if (alsoHide) {
        await hideVisibility('hiddenPresetIds', id)
    }
    return { ok: true, id }
}

async function readVisibility() {
    const [coll, docId] = VISIBILITY_DOC
    const snap = await adminDb.collection(coll).doc(docId).get()
    if (!snap.exists) return { hiddenBackgroundIds: [], hiddenPresetIds: [] }
    const v = snap.data() || {}
    return {
        hiddenBackgroundIds: Array.isArray(v.hiddenBackgroundIds) ? v.hiddenBackgroundIds : [],
        hiddenPresetIds: Array.isArray(v.hiddenPresetIds) ? v.hiddenPresetIds : [],
    }
}

async function setVisibility(patch) {
    const [coll, docId] = VISIBILITY_DOC
    const current = await readVisibility()
    const next = { ...current, ...patch }
    await adminDb.collection(coll).doc(docId).set(next, { merge: true })
    return { ok: true, ...next }
}

async function hideVisibility(field, id) {
    if (!id) throw new Error(`hideVisibility: missing id for ${field}`)
    const [coll, docId] = VISIBILITY_DOC
    await adminDb
        .collection(coll)
        .doc(docId)
        .set({ [field]: FieldValue.arrayUnion(id) }, { merge: true })
    return { ok: true, field, id }
}

async function deleteUploadedBackground({ id, storagePath }) {
    if (!id) throw new Error('deleteUploadedBackground: missing id')
    await adminDb.collection(BACKGROUNDS).doc(id).delete()
    if (storagePath) {
        try {
            const bucket = adminStorage.bucket()
            await bucket.file(storagePath).delete({ ignoreNotFound: true })
        } catch (err) {
            // Best-effort — the doc is already gone, file lingering is
            // harmless since the doc was the discoverability layer.
            console.warn('[studio API] storage delete failed:', err?.message || err)
        }
    }
    return { ok: true, id }
}

function newPresetId() {
    return 'studio_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
