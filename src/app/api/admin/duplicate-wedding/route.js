export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
// Copying photos is server-to-Storage (GCS object copy — no download),
// so it's fast per file, but a large event can have hundreds of photos.
// Give the function generous headroom.
export const maxDuration = 300

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { adminDb, adminAuth, adminStorage } from '@/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'
import { isSuperAdmin } from '@/lib/superAdmin'
import { generateSlug } from '@/lib/generateSlug'

// ─── Auth ────────────────────────────────────────────────────────────────────
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

// ─── Storage helpers ──────────────────────────────────────────────────────────
// Pull { bucket, path } out of a Firebase/GCS URL (same logic as the
// book-photo proxy) so we can copy the object with the Admin SDK.
function parseStorageLocation(url) {
    if (!url || typeof url !== 'string') return null
    try {
        if (url.startsWith('gs://')) {
            const rest = url.slice(5)
            const i = rest.indexOf('/')
            if (i < 0) return null
            return { bucket: rest.slice(0, i), path: rest.slice(i + 1) }
        }
        const u = new URL(url)
        if (u.hostname === 'firebasestorage.googleapis.com' || u.hostname.endsWith('.firebasestorage.app')) {
            const m = u.pathname.match(/\/v0\/b\/([^/]+)\/o\/(.+)$/)
            if (m) return { bucket: m[1], path: decodeURIComponent(m[2]) }
        }
        if (u.hostname === 'storage.googleapis.com') {
            const parts = u.pathname.replace(/^\/+/, '').split('/')
            if (parts.length >= 2) return { bucket: parts[0], path: decodeURIComponent(parts.slice(1).join('/')) }
        }
    } catch {
        /* not a parseable storage URL */
    }
    return null
}

function extOf(p) {
    const m = (p || '').match(/\.[a-z0-9]+$/i)
    return m ? m[0] : '.jpg'
}

// Copy a single Storage object into the new event's folder and return a
// fresh, permanent Firebase download URL (token-based, same shape the
// client SDK produces). Returns the ORIGINAL url unchanged if it isn't a
// copyable object in our bucket, or if the source is missing — so a
// duplicate never ends up with a dead image reference.
async function copyStorageImage(url, newWeddingId) {
    const loc = parseStorageLocation(url)
    if (!loc) return url
    try {
        const bucket = adminStorage.bucket(loc.bucket)
        const srcFile = bucket.file(loc.path)
        const [exists] = await srcFile.exists()
        if (!exists) return url

        const destPath = `weddings/${newWeddingId}/copy-${crypto.randomUUID()}${extOf(loc.path)}`
        const destFile = bucket.file(destPath)
        await srcFile.copy(destFile)

        // Give the copy its own download token so the URL is independent of
        // the source's token and keeps working even if the source is deleted.
        const downloadToken = crypto.randomUUID()
        await destFile.setMetadata({ metadata: { firebaseStorageDownloadTokens: downloadToken } })

        return `https://firebasestorage.googleapis.com/v0/b/${loc.bucket}/o/${encodeURIComponent(destPath)}?alt=media&token=${downloadToken}`
    } catch (err) {
        console.warn('[duplicate-wedding] image copy failed, keeping original ref:', err?.message || err)
        return url
    }
}

// Recursively walk a Firestore value and copy every Storage image URL it
// contains (entry photos AND nested design assets like coverDesign.coverImage,
// guestDesign images, bookDesign.backgroundUrl …). Non-plain objects
// (Firestore Timestamps, etc.) are returned untouched so their type is
// preserved.
function isPlainObject(v) {
    if (!v || typeof v !== 'object') return false
    const proto = Object.getPrototypeOf(v)
    return proto === Object.prototype || proto === null
}
function looksLikeStorageUrl(s) {
    return typeof s === 'string' && /(^gs:\/\/|firebasestorage\.googleapis\.com|\.firebasestorage\.app|storage\.googleapis\.com)/.test(s)
}
async function deepCopyImages(value, newWeddingId) {
    if (typeof value === 'string') {
        return looksLikeStorageUrl(value) ? await copyStorageImage(value, newWeddingId) : value
    }
    if (Array.isArray(value)) {
        const out = []
        for (const item of value) out.push(await deepCopyImages(item, newWeddingId))
        return out
    }
    if (isPlainObject(value)) {
        const out = {}
        for (const [k, v] of Object.entries(value)) out[k] = await deepCopyImages(v, newWeddingId)
        return out
    }
    return value
}

// Run async fn over items with a bounded concurrency so we don't open
// hundreds of Storage copies at once.
async function mapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length)
    let i = 0
    async function worker() {
        while (i < items.length) {
            const idx = i++
            results[idx] = await fn(items[idx], idx)
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
    return results
}

// ─── POST: duplicate an event ──────────────────────────────────────────────────
export async function POST(req) {
    const admin = await verifySuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let body = {}
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Bad request' }, { status: 400 })
    }
    const sourceId = (body?.sourceWeddingId || '').toString().trim()
    if (!sourceId) return NextResponse.json({ error: 'Missing sourceWeddingId' }, { status: 400 })
    // When true, the copy keeps all CONTENT (blessings + photos) and the
    // visual identity (background, colours, fonts, photo size) but RESETS
    // the stuck typography overrides that made the source look different
    // from every other event (a leftover bold fontWeight + an oversized
    // name margin). Use this to get a clean copy of a misconfigured event.
    const cleanDesign = body?.cleanDesign === true

    try {
        const srcRef = adminDb.collection('weddings').doc(sourceId)
        const srcSnap = await srcRef.get()
        if (!srcSnap.exists) return NextResponse.json({ error: 'Source not found' }, { status: 404 })
        const src = srcSnap.data() || {}

        // New event id — auto-generated (the original uses the WooCommerce
        // orderId; a clone has no order, so we let Firestore mint an id).
        const newRef = adminDb.collection('weddings').doc()
        const newWeddingId = newRef.id

        // Unique slug + fresh viewer token (the clone gets its own link/QR).
        let slug = generateSlug()
        const slugCheck = await adminDb.collection('weddings').where('slug', '==', slug).limit(1).get()
        if (!slugCheck.empty) slug = generateSlug()
        const viewerToken = crypto.randomUUID()

        // Deep-copy the doc, duplicating every Storage image it references
        // (cover image, guest-design background/button, etc.).
        const clonedDoc = await deepCopyImages(src, newWeddingId)

        // Override the fields that must NOT carry over from the source.
        const newData = {
            ...clonedDoc,
            slug,
            orderId: null,
            duplicatedFrom: sourceId,
            createdAt: FieldValue.serverTimestamp(),
            // Fresh, single viewer token — the source's tokens/links stay
            // bound to the source only.
            digitalTokens: [viewerToken],
            digitalTokensIssuedAt: [
                { token: viewerToken, issuedAt: new Date().toISOString(), issuedBy: 'duplicate' },
            ],
            // A clone isn't a paid order.
            amountPaid: null,
        }
        // Mark the name so it's easy to spot in the admin list (best-effort —
        // only if there's an ownerName to suffix).
        if (typeof src.ownerName === 'string' && src.ownerName.trim()) {
            newData.ownerName = `${src.ownerName.trim()} (עותק)`
        }

        // Clean-design copy: strip the stuck overrides (bold weight + the
        // oversized name margin) from the interior + cover design so the new
        // event renders like every standard event, while keeping the
        // background / colours / fonts / photo sizing intact.
        if (cleanDesign) {
            const STRIP = ['fontWeight', 'nameFontWeight', 'nameMarginBottom']
            for (const field of ['bookDesign', 'coverDesign']) {
                if (newData[field] && typeof newData[field] === 'object' && !Array.isArray(newData[field])) {
                    const d = { ...newData[field] }
                    for (const k of STRIP) delete d[k]
                    newData[field] = d
                }
            }
        }

        await newRef.set(newData)

        // Copy every entry (blessing + photo). Each entry's image is copied
        // to the new event's Storage folder; all other fields (name, text,
        // orderIndex, timestamp, photoPosition, …) carry over verbatim.
        const entriesSnap = await srcRef.collection('entries').get()
        const entryDocs = entriesSnap.docs

        const clonedEntries = await mapWithConcurrency(entryDocs, 6, async d => ({
            id: d.id,
            data: await deepCopyImages(d.data() || {}, newWeddingId),
        }))

        // Write the entries in chunks (Firestore batch limit = 500).
        const CHUNK = 400
        for (let i = 0; i < clonedEntries.length; i += CHUNK) {
            const batch = adminDb.batch()
            for (const e of clonedEntries.slice(i, i + CHUNK)) {
                batch.set(newRef.collection('entries').doc(e.id), e.data)
            }
            await batch.commit()
        }

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.weddingtales.co.il'
        return NextResponse.json({
            ok: true,
            newWeddingId,
            slug,
            entriesCopied: clonedEntries.length,
            viewerUrl: `${baseUrl}/wedding/${newWeddingId}/book/${viewerToken}`,
            guestUrl: `${baseUrl}/w/${slug}`,
        })
    } catch (err) {
        console.error('[duplicate-wedding] failed:', err)
        return NextResponse.json({ error: 'Duplication failed: ' + (err?.message || 'unknown') }, { status: 500 })
    }
}
