import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { recordVerifiedOrderEvidence, buildSalesCohortReport, ORDER_EVIDENCE_COLLECTION } from '@/lib/salesAgent/salesEvidence'
import { suppressBoundCheckoutLead } from '@/lib/salesAgent/leads'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const json = (body, status = 200) => NextResponse.json(body, { status,
    headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization' },
})

async function authorize(request) {
    const bearer = request.headers.get('authorization') || ''
    if (!bearer.startsWith('Bearer ') || bearer.length > 16400) return json({ error: 'unauthorized' }, 401)
    try {
        const user = await adminAuth.verifyIdToken(bearer.slice(7), true)
        if (!user.uid || user.email_verified !== true || !isSuperAdmin(user.email)) return json({ error: 'forbidden' }, 403)
    } catch { return json({ error: 'unauthorized' }, 401) }
    return null
}
const validOrderId = value => typeof value === 'string' && /^[1-9][0-9]{0,14}$/.test(value)

// A single-order audit lets the owner inspect which observed ad/source was
// bound. The projection excludes phone, message/click IDs and payment URL keys.
export async function GET(request) {
    const denied = await authorize(request)
    if (denied) return denied
    const orderId = new URL(request.url).searchParams.get('orderId')
    if (!validOrderId(orderId)) return json({ error: 'invalid_request' }, 400)
    try {
        const id = crypto.createHash('sha256').update(orderId).digest('hex')
        const stored = await adminDb.collection(ORDER_EVIDENCE_COLLECTION).doc(id).get()
        if (!stored.exists) return json({ error: 'order_evidence_missing' }, 404)
        const row = { ...stored.data(), id }
        const nowMs = Date.now()
        const paidAtMs = Number.isFinite(row.paidAtMs) ? row.paidAtMs : row.verifiedAtMs
        // This is an exact-order audit, not a date-filtered dashboard. Include
        // accepted provider clock skew instead of hiding a known paid record.
        const toMs = Number.isFinite(paidAtMs) ? Math.max(nowMs + 1, paidAtMs + 1) : nowMs + 1
        const report = buildSalesCohortReport({ orders: [row], fromMs: 0, toMs, asOfMs: nowMs })
        return json({ ok: true, orderId, purchaseAttribution: report.purchaseAttribution })
    } catch { return json({ error: 'order_evidence_unavailable' }, 503) }
}

// Manual evidence/reminder-stop recovery only. This does not replay fulfillment,
// create a checkout, contact a customer or send an advertising conversion.
export async function POST(request) {
    const denied = await authorize(request)
    if (denied) return denied
    let body
    try {
        const raw = await request.text()
        if (raw.length > 1024) return json({ error: 'request_too_large' }, 413)
        body = JSON.parse(raw)
    } catch { return json({ error: 'invalid_request' }, 400) }
    if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).some(key => !['action', 'orderId'].includes(key))
        || body.action !== 'reconcile' || !validOrderId(body.orderId)) return json({ error: 'invalid_request' }, 400)
    try {
        const saved = await adminDb.collection('ordersRaw').doc(body.orderId).get()
        const raw = saved.exists ? saved.data() : null
        if (raw?.signatureVerified !== true || String(raw.body?.id) !== body.orderId) {
            return json({ error: 'verified_order_snapshot_required' }, 409)
        }
        const result = await recordVerifiedOrderEvidence({ order: raw.body, db: adminDb, trustedSource: true })
        const stopped = await suppressBoundCheckoutLead({ order: raw.body, db: adminDb, trustedSource: true })
        return json({ recorded: result.recorded === true, duplicate: result.duplicate === true,
            deferred: result.deferred === true, reason: result.reason || null, salesSuppressed: stopped.suppressed === true })
    } catch { return json({ error: 'order_evidence_unavailable' }, 503) }
}
