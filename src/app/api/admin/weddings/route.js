export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebaseAdmin'
import { normalizeEventType, normalizeThemeColor } from '@/lib/eventTypes'
import { normalizeLocale } from '@/i18n/locales'
import { isSuperAdmin } from '@/lib/superAdmin'

// ─── Auth helper ─────────────────────────────────────────────────────────────
async function verifySuperAdmin(req) {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null

    const token = authHeader.split('Bearer ')[1]
    try {
        const decoded = await adminAuth.verifyIdToken(token)
        if (!isSuperAdmin(decoded.email)) return null
        return decoded
    } catch {
        return null
    }
}

// ─── GET: Fetch all weddings ─────────────────────────────────────────────────
export async function GET(req) {
    const admin = await verifySuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    try {
        const snapshot = await adminDb.collection('weddings').get()

        const weddings = await Promise.all(
            snapshot.docs.map(async doc => {
                const data = doc.data()

                let greetingsCount = 0
                try {
                    const entriesSnap = await adminDb
                        .collection('weddings')
                        .doc(doc.id)
                        .collection('entries')
                        .count()
                        .get()
                    greetingsCount = entriesSnap.data().count
                } catch {
                    greetingsCount = 0
                }

                let weddingDate = null
                if (data.weddingDate) {
                    if (typeof data.weddingDate.toDate === 'function') {
                        weddingDate = data.weddingDate.toDate().toISOString()
                    } else {
                        weddingDate = data.weddingDate
                    }
                }

                let createdAt = null
                if (data.createdAt) {
                    if (typeof data.createdAt.toDate === 'function') {
                        createdAt = data.createdAt.toDate().toISOString()
                    }
                }

                // Amount paid — captured on new orders; for older ones fall back
                // to the raw WooCommerce webhook payload we stored in ordersRaw.
                let amountPaid = data.amountPaid ?? null
                let currency = data.currency ?? null
                if (amountPaid == null && data.orderId) {
                    try {
                        const raw = await adminDb.collection('ordersRaw').doc(String(data.orderId)).get()
                        if (raw.exists) {
                            const b = raw.data()?.body || {}
                            amountPaid = b.total ?? null
                            currency = b.currency ?? null
                        }
                    } catch {
                        /* ignore — amount stays null */
                    }
                }

                return {
                    id: doc.id,
                    brideName: data.brideName ?? null,
                    groomName: data.groomName ?? null,
                    weddingDate,
                    ownerEmail: data.ownerEmail ?? data.email ?? null,
                    ownerName: data.ownerName ?? null,
                    blessingMaxChars: data.blessingMaxChars ?? null,
                    ownerId: data.ownerId ?? null,
                    orderId: data.orderId ?? null,
                    slug: data.slug ?? null,
                    greetingsCount,
                    createdAt,
                    printOrder: data.printOrder ?? null,
                    productionStatus: data.productionStatus ?? 'new',
                    ownerPhone: data.ownerPhone ?? null,
                    amountPaid,
                    currency,
                    // Event-type + theme fields (may be absent on legacy docs → normalized on read)
                    eventType: normalizeEventType(data.eventType),
                    themeColor: normalizeThemeColor(data.themeColor), // null = use event-type default
                    celebrantName: data.celebrantName ?? null,
                    age: data.age ?? null,
                    customTitle: data.customTitle ?? null,
                    customSubtitle: data.customSubtitle ?? null,
                    customDescription: data.customDescription ?? null,
                }
            })
        )

        return NextResponse.json(weddings)
    } catch (err) {
        console.error('[admin/weddings] Error fetching weddings:', err)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

// ─── PATCH: Update editable fields on a wedding ──────────────────────────────
//
// Body: { weddingId, patch: { eventType?, celebrantName?, age?, customTitle?,
//                             customSubtitle?, customDescription?, brideName?, groomName? } }
//
// Whitelist enforced server-side — any other keys in `patch` are dropped.
// Strings are trimmed; empty strings become null (cleared). `age` is coerced
// to a number; bad values become null. `eventType` is normalized.
export async function PATCH(req) {
    const admin = await verifySuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    try {
        const body = await req.json()
        const { weddingId, patch } = body || {}
        if (!weddingId) return NextResponse.json({ error: 'Missing weddingId' }, { status: 400 })
        if (!patch || typeof patch !== 'object') {
            return NextResponse.json({ error: 'Missing patch' }, { status: 400 })
        }

        const ALLOWED = [
            'eventType', 'designVariant', 'locale', 'themeColor',
            'celebrantName', 'celebrantNameHe', 'age',
            'customTitle', 'customSubtitle', 'customDescription',
            'customNameLabel', 'customNamePlaceholder',
            'customBlessingLabel', 'customBlessingPlaceholder',
            // Per-wedding overrides for the moment-layout guest page copy.
            // Each replaces the corresponding i18n default; '' clears to default.
            'customMomentSubtitle', 'customMomentPill',
            'customMomentPhotoTitle', 'customMomentPhotoCta', 'customMomentPhotoCtaSub',
            'customMomentTakeNow', 'customMomentChooseGallery',
            'customMomentSubmit', 'customMomentSecurityNote',
            // Super-admin private notes per wedding — never shown to guests.
            'adminNotes',
            // Amount paid is auto-captured from the order, but editable here.
            'amountPaid', 'currency',
            // Per-event max blessing length (210 default, capped 50–1200).
            'blessingMaxChars',
            // Production pipeline stage (managed from /admin/pipeline).
            'productionStatus',
            // Guest /photo page design preset (managed from /admin/guest-design).
            'guestDesign',
            // Book interior design. Written via set(merge:true) so a PARTIAL
            // object deep-merges into the existing bookDesign — lets us
            // surgically reset stray fields (e.g. a stuck fontWeight:700)
            // without replacing the whole design.
            'bookDesign',
            'brideName', 'brideNameHe', 'groomName', 'groomNameHe',
            // Customer contact — the super-admin can set/fix the owner's
            // mobile (also the /portal phone-login credential) and email.
            'ownerPhone', 'ownerEmail',
        ]
        const clean = {}

        for (const key of ALLOWED) {
            if (!Object.prototype.hasOwnProperty.call(patch, key)) continue
            let v = patch[key]

            if (key === 'eventType') {
                clean[key] = normalizeEventType(v)
                continue
            }

            if (key === 'ownerEmail') {
                const t = typeof v === 'string' ? v.trim().toLowerCase() : ''
                clean[key] = t || null
                continue
            }

            if (key === 'ownerPhone') {
                const t = typeof v === 'string' ? v.trim() : ''
                clean[key] = t || null
                // Indexed twin for the /portal phone-login lookup — lets the
                // route use a real Firestore query instead of a full scan.
                let n = t.replace(/[^\d+]/g, '')
                if (n.startsWith('+')) n = n.slice(1)
                if (n.startsWith('00')) n = n.slice(2)
                if (n.startsWith('0')) n = '972' + n.slice(1)
                clean.phoneNormalized = n || null
                continue
            }

            if (key === 'locale') {
                // Coerce to a known locale; unknown/empty falls back to 'he'.
                clean[key] = normalizeLocale(v)
                continue
            }

            if (key === 'themeColor') {
                // normalizeThemeColor returns null for unknown → persist null
                // to mean "inherit event-type default"
                clean[key] = normalizeThemeColor(v)
                continue
            }

            if (key === 'age') {
                if (v === null || v === '' || v === undefined) {
                    clean[key] = null
                } else {
                    const n = Number(v)
                    clean[key] = Number.isFinite(n) ? n : null
                }
                continue
            }

            if (key === 'amountPaid') {
                if (v === null || v === '' || v === undefined) {
                    clean[key] = null
                } else {
                    const n = Number(v)
                    clean[key] = Number.isFinite(n) && n >= 0 ? n : null
                }
                continue
            }

            if (key === 'blessingMaxChars') {
                const n = Number(v)
                clean[key] = Number.isFinite(n) ? Math.max(50, Math.min(1200, Math.round(n))) : 210
                continue
            }

            if (key === 'productionStatus') {
                const ALLOWED_STATUS = ['new', 'setup', 'pre_event', 'collecting', 'to_print', 'shipped', 'delivered']
                clean[key] = ALLOWED_STATUS.includes(v) ? v : 'new'
                continue
            }

            if (key === 'guestDesign') {
                // A plain object of theme overrides; null clears it. Capped so a
                // bad payload can't bloat the doc.
                clean[key] =
                    v && typeof v === 'object' && !Array.isArray(v) && JSON.stringify(v).length < 6000 ? v : null
                continue
            }

            if (key === 'bookDesign') {
                // Object of interior-design overrides. Deep-merged via
                // set(merge:true), so sending a PARTIAL object updates only
                // those sub-fields (e.g. { fontWeight: null }) and leaves the
                // rest of bookDesign intact. Ignored if not a sane object.
                if (v && typeof v === 'object' && !Array.isArray(v) && JSON.stringify(v).length < 12000) {
                    clean[key] = v
                }
                continue
            }

            // string fields: trim; '' → null
            if (typeof v === 'string') v = v.trim()
            clean[key] = v === '' || v == null ? null : v
        }

        if (Object.keys(clean).length === 0) {
            return NextResponse.json({ error: 'No valid fields in patch' }, { status: 400 })
        }

        const ref = adminDb.collection('weddings').doc(weddingId)
        const snap = await ref.get()
        if (!snap.exists) {
            return NextResponse.json({ error: 'Wedding not found' }, { status: 404 })
        }

        await ref.set(clean, { merge: true })

        console.log(`✏️  Wedding ${weddingId} updated by super admin:`, Object.keys(clean).join(', '))
        return NextResponse.json({ success: true, updated: clean })
    } catch (err) {
        console.error('[admin/weddings] PATCH error:', err)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

// ─── DELETE: Delete a wedding (and all its entries) ──────────────────────────
export async function DELETE(req) {
    const admin = await verifySuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    try {
        const { weddingId } = await req.json()
        if (!weddingId) return NextResponse.json({ error: 'Missing weddingId' }, { status: 400 })

        // Delete all entries in sub-collection
        const entriesSnap = await adminDb
            .collection('weddings')
            .doc(weddingId)
            .collection('entries')
            .get()

        const batch = adminDb.batch()
        entriesSnap.docs.forEach(doc => batch.delete(doc.ref))

        // Delete the wedding document itself
        batch.delete(adminDb.collection('weddings').doc(weddingId))

        // Clean up related locks/raw data
        const lockRef = adminDb.collection('ordersLocks').doc(weddingId)
        const lockSnap = await lockRef.get()
        if (lockSnap.exists) batch.delete(lockRef)

        const rawRef = adminDb.collection('ordersRaw').doc(weddingId)
        const rawSnap = await rawRef.get()
        if (rawSnap.exists) batch.delete(rawRef)

        await batch.commit()

        console.log(`🗑️ Wedding ${weddingId} deleted by super admin (${entriesSnap.size} entries removed)`)
        return NextResponse.json({ success: true, entriesDeleted: entriesSnap.size })
    } catch (err) {
        console.error('[admin/weddings] Error deleting wedding:', err)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
