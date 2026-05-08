export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'

const LULU_API_KEY = process.env.LULU_API_KEY
const LULU_API_SECRET = process.env.LULU_API_SECRET
const LULU_API_BASE = process.env.LULU_API_BASE || 'https://api.lulu.com'
const LULU_AUTH_URL = process.env.LULU_AUTH_URL || 'https://api.lulu.com/auth/realms/glasstree/protocol/openid-connect/token'

async function getLuluToken() {
    const res = await fetch(LULU_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: LULU_API_KEY,
            client_secret: LULU_API_SECRET,
        }),
    })
    if (!res.ok) throw new Error(`Lulu auth failed: ${res.status}`)
    const data = await res.json()
    return data.access_token
}

// ─── GET: Check status of a specific print job ─────────────────────────────
// Usage: GET /api/lulu/status?printJobId=123456
// Or:    GET /api/lulu/status?all=true   (list recent print jobs)
export async function GET(req) {
    // Auth: super admin only
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    try {
        const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1])
        if (!isSuperAdmin(decoded.email)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
    } catch {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const printJobId = searchParams.get('printJobId')
    const listAll = searchParams.get('all')

    try {
        const token = await getLuluToken()

        if (printJobId) {
            // Fetch a specific print job
            const res = await fetch(`${LULU_API_BASE}/print-jobs/${printJobId}/`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            if (!res.ok) {
                const text = await res.text()
                return NextResponse.json({ error: `Lulu API error (${res.status}): ${text}` }, { status: res.status })
            }
            const job = await res.json()

            // Also update the status in Firestore if we can find the wedding
            if (job.external_id?.startsWith('wt-')) {
                const weddingId = job.external_id.split('-').slice(1, -1).join('-')
                if (weddingId) {
                    try {
                        await adminDb.collection('weddings').doc(weddingId).set(
                            { 'printOrder.luluStatus': job.status?.name || 'UNKNOWN' },
                            { merge: true }
                        )
                    } catch (e) {
                        console.error('Failed to update Firestore status:', e)
                    }
                }
            }

            return NextResponse.json({
                id: job.id,
                status: job.status?.name,
                statusMessages: job.status?.messages || [],
                createdAt: job.date_created,
                modifiedAt: job.date_modified,
                shippingAddress: job.shipping_address,
                lineItems: job.line_items?.map(li => ({
                    title: li.title,
                    quantity: li.quantity,
                    podPackageId: li.pod_package_id,
                    status: li.status?.name,
                })),
                costs: job.costs,
                trackingUrls: job.shipping_option?.tracking_urls || [],
            })
        }

        if (listAll) {
            // List recent print jobs
            const res = await fetch(`${LULU_API_BASE}/print-jobs/?page=1&page_size=20`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            if (!res.ok) {
                const text = await res.text()
                return NextResponse.json({ error: `Lulu API error (${res.status}): ${text}` }, { status: res.status })
            }
            const data = await res.json()
            const jobs = (data.results || []).map(job => ({
                id: job.id,
                externalId: job.external_id,
                status: job.status?.name,
                createdAt: job.date_created,
                title: job.line_items?.[0]?.title || '—',
                quantity: job.line_items?.[0]?.quantity || 0,
            }))

            return NextResponse.json({ count: data.count, jobs })
        }

        return NextResponse.json({ error: 'Provide ?printJobId=<id> or ?all=true' }, { status: 400 })
    } catch (err) {
        console.error('Lulu status check error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
