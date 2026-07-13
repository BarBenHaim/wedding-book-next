export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'
import { adoptSurfaceKeepCover } from '@/lib/presetFilters'
import { applyPresetClean } from '@/lib/bookDesignSchema'

// POST /api/digital-edition/set-design
//
// Lets the couple choose their book design from the no-login digital
// link. The link is gated by a token in wedding.digitalTokens; that
// same token is re-validated here before any write, because Firestore
// rules (correctly) block anonymous client writes to the wedding doc.
//
// Body: { weddingId, token, design }
//   - design: the resolved style object the client computed from a
//     preset ({ ...defaultStyle, ...resolvePreset(preset).values }).
//     We trust the CLIENT to resolve (it owns the preset registry +
//     next/font classNames); the server's job is auth + a sanity cap.
//
// Writes wedding.bookDesign (interior) + wedding.coverDesign (surface
// look only — every cover-specific field the owner designed, from the
// cover photo and its scale to the title placement, is preserved) and
// records source + timestamp so the admin can see that the couple set
// it themselves.

const MAX_DESIGN_BYTES = 8000

function isPlainObject(v) {
    return v != null && typeof v === 'object' && !Array.isArray(v)
}

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}))
        const weddingId = typeof body.weddingId === 'string' ? body.weddingId.trim() : ''
        const token = typeof body.token === 'string' ? body.token.trim() : ''
        const design = body.design

        if (!weddingId || !token) {
            return NextResponse.json({ error: 'Missing weddingId or token' }, { status: 400 })
        }
        if (!isPlainObject(design)) {
            return NextResponse.json({ error: 'Invalid design' }, { status: 400 })
        }
        // Size guard — a design object is a small bag of style props.
        // Anything large is either a bug or abuse; reject it.
        if (JSON.stringify(design).length > MAX_DESIGN_BYTES) {
            return NextResponse.json({ error: 'Design too large' }, { status: 413 })
        }

        const ref = adminDb.collection('weddings').doc(weddingId)
        const snap = await ref.get()
        if (!snap.exists) {
            return NextResponse.json({ error: 'Wedding not found' }, { status: 404 })
        }
        const data = snap.data() || {}
        const tokens = Array.isArray(data.digitalTokens) ? data.digitalTokens : []
        if (!tokens.includes(token)) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 403 })
        }

        // Server-side canonicalization — the persisted design ALWAYS
        // carries every canonical key (see bookDesignSchema.js), no
        // matter which client version or code path sent it. This is
        // the guarantee that the same preset renders the same for
        // every user on every device.
        const cleanDesign = applyPresetClean(design)

        // Cover adopts the preset's surface look; every cover* field
        // the owner designed survives. Replacing them wholesale was the
        // "cover photo shrinks / cover breaks after switching designs"
        // bug — it wiped coverImageScale, coverTitle & friends on every
        // preset pick. Same helper as the client's live preview.
        const existingCover = isPlainObject(data.coverDesign) ? data.coverDesign : {}
        const coverDesign = adoptSurfaceKeepCover(existingCover, cleanDesign)

        await ref.set(
            {
                bookDesign: cleanDesign,
                coverDesign,
                bookDesignSource: 'digital-link',
                bookDesignUpdatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
        )

        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[digital-edition/set-design] failed:', err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
