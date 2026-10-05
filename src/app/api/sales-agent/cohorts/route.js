export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { buildSalesCohortReport, EVIDENCE_COLLECTION, ORDER_EVIDENCE_COLLECTION } from '@/lib/salesAgent/salesEvidence'

export async function GET(request) {
    const bearer = request.headers.get('authorization') || ''
    try {
        if (!bearer.startsWith('Bearer ')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
        const user = await adminAuth.verifyIdToken(bearer.slice(7), true)
        if (!user.email_verified || !isSuperAdmin(user.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    } catch { return NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
    const params = new URL(request.url).searchParams
    const fromMs = Date.parse(params.get('from') || '')
    const toMs = Date.parse(params.get('to') || '')
    const maturityHours = Number(params.get('maturityHours') || 168)
    const asOfMs = Date.now()
    if (![fromMs, toMs, maturityHours].every(Number.isFinite) || fromMs >= toMs || toMs > asOfMs
        || toMs - fromMs > 90 * 86400000 || maturityHours < 24 || maturityHours > 90 * 24) {
        return NextResponse.json({ error: 'invalid_window' }, { status: 400 })
    }
    try {
        const limit = 5000
        const [events, orders, costs] = await Promise.all([
            adminDb.collection(EVIDENCE_COLLECTION).orderBy('inboundAtMs').limit(limit + 1).get(),
            adminDb.collection(ORDER_EVIDENCE_COLLECTION).orderBy('verifiedAtMs').limit(limit + 1).get(),
            adminDb.collection('sales_cohort_costs').limit(limit + 1).get(),
        ])
        const partial = [events, orders, costs].some(s => s.docs.length > limit)
        const rows = snap => snap.docs.slice(0, limit).map(d => ({ ...d.data(), id: d.id }))
        // Do not display misleading rates from a truncated analytical population.
        if (partial) return NextResponse.json({ ok: false, partial: true, reason: 'population_exceeds_bounded_report', cohorts: [] })
        return NextResponse.json({ ok: true, partial: false, ...buildSalesCohortReport({ conversations: rows(events), orders: rows(orders), costs: rows(costs), fromMs, toMs, asOfMs, maturityHours }) })
    } catch { return NextResponse.json({ error: 'cohort_source_unavailable' }, { status: 503 }) }
}
