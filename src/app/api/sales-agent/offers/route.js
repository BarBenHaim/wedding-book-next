import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { MAX_OFFER_PUBLISH_BYTES, publishOfferCatalog, readOfferCatalogForApproval } from '@/lib/salesAgent/offerApprovalStore'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'

const json = (value, status = 200) => NextResponse.json(value, {
    status, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Authorization' },
})

async function identity(req) {
    const header = req.headers.get('authorization') || ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (!token || token.length > 16_384) return { error: 'AUTH_REQUIRED', status: 401 }
    let decoded
    try { decoded = await adminAuth.verifyIdToken(token, true) }
    catch { return { error: 'AUTH_REQUIRED', status: 401 } }
    if (!decoded?.uid || typeof decoded.uid !== 'string' || decoded.uid.length > 128) return { error: 'AUTH_REQUIRED', status: 401 }
    if (decoded.email_verified !== true || typeof decoded.email !== 'string' || !isSuperAdmin(decoded.email)) return { error: 'SUPER_ADMIN_REQUIRED', status: 403 }
    return { uid: decoded.uid }
}

const publicErrors = new Set(['INVALID_PUBLISH_REQUEST', 'EXPLICIT_PUBLISH_REQUIRED', 'INVALID_EXPECTED_VERSION', 'APPROVAL_EVIDENCE_REQUIRED', 'APPROVAL_IDENTITY_REQUIRED', 'INVALID_OFFER_CATALOG', 'REQUEST_TOO_LARGE', 'CURRENT_CATALOG_INVALID', 'STALE_CATALOG_VERSION', 'CATALOG_IDENTITY_MISMATCH', 'CATALOG_VERSION_EXISTS'])
function failure(error) {
    if (publicErrors.has(error?.code)) return json({ error: error.code, ...(error.details ? { validation: error.details } : {}) }, error.status)
    return json({ error: 'OFFERS_UNAVAILABLE' }, 503)
}

export async function GET(req) {
    const actor = await identity(req)
    if (actor.error) return json({ error: actor.error }, actor.status)
    try { return json(await readOfferCatalogForApproval({ db: adminDb })) }
    catch (error) { return failure(error) }
}

async function readJson(req) {
    // Bound bytes while reading rather than buffering an unbounded req.text().
    const declared = req.headers.get('content-length')
    if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_OFFER_PUBLISH_BYTES) throw Object.assign(new Error(), { code: 'REQUEST_TOO_LARGE', status: 413 })
    if (!req.body) return null
    const reader = req.body.getReader(), chunks = []
    let length = 0
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            length += value.byteLength
            if (length > MAX_OFFER_PUBLISH_BYTES) {
                await reader.cancel()
                throw Object.assign(new Error(), { code: 'REQUEST_TOO_LARGE', status: 413 })
            }
            chunks.push(Buffer.from(value))
        }
    } finally { reader.releaseLock() }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export async function POST(req) {
    const actor = await identity(req)
    if (actor.error) return json({ error: actor.error }, actor.status)
    let input
    try { input = await readJson(req) }
    catch (error) {
        if (error?.code === 'REQUEST_TOO_LARGE') return failure(error)
        return json({ error: 'BAD_JSON' }, 400)
    }
    try { return json(await publishOfferCatalog(input, { db: adminDb, approvedBy: actor.uid }), 201) }
    catch (error) { return failure(error) }
}
