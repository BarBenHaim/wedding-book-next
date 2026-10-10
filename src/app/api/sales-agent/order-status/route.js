import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import { getOrderStatus } from '@/lib/salesAgent/orderStatus'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const json = (value, status = 200) => NextResponse.json(value, {
    status, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Authorization' },
})

export async function GET(req) {
    const auth = req.headers.get('authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    if (!token || token.length > 16_384) return json({ error: 'auth_required' }, 401)
    let decoded
    try { decoded = await adminAuth.verifyIdToken(token, true) }
    catch { return json({ error: 'auth_required' }, 401) }
    if (!decoded?.uid) return json({ error: 'auth_required' }, 401)
    try {
        const result = await getOrderStatus({ db: adminDb, verifiedCustomerId: decoded.uid, orderId: new URL(req.url).searchParams.get('orderId') })
        if (!result.ok) return json({ error: result.error }, result.status)
        return json(result)
    } catch {
        return json({ error: 'order_status_unavailable' }, 503)
    }
}
