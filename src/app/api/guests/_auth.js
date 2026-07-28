// src/app/api/guests/_auth.js
//
// Shared auth guard for the /api/guests/* routes. A caller is allowed
// through if EITHER:
//   • the ID token they presented resolves to a super-admin email, OR
//   • the token's uid matches the wedding doc's ownerId.
//
// Returns:
//   { ok: true, wedding, weddingRef, decoded }  on success
//   { ok: false, status, error }                on failure — the caller
//     just returns NextResponse.json({ error }, { status }).

import { adminDb, adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'

export async function authorizeWeddingAccess(req, weddingId) {
    if (!weddingId || typeof weddingId !== 'string') {
        return { ok: false, status: 400, error: 'Missing weddingId' }
    }

    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
        return { ok: false, status: 401, error: 'Unauthorized' }
    }

    const token = authHeader.slice(7).trim()
    let decoded
    try {
        decoded = await adminAuth.verifyIdToken(token)
    } catch {
        return { ok: false, status: 401, error: 'Unauthorized' }
    }

    const weddingRef = adminDb.collection('weddings').doc(weddingId)
    const snap = await weddingRef.get()
    if (!snap.exists) {
        return { ok: false, status: 404, error: 'Wedding not found' }
    }
    const wedding = snap.data()

    const emailLower = (decoded.email || '').toLowerCase()
    const isOwner = wedding.ownerId && wedding.ownerId === decoded.uid
    if (!isOwner && !isSuperAdmin(emailLower)) {
        return { ok: false, status: 403, error: 'Forbidden' }
    }

    return { ok: true, wedding, weddingRef, decoded }
}
