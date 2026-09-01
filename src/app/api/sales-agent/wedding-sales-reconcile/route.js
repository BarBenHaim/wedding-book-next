export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const maxDuration = 30

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { closeLeadOnPurchase } from '@/lib/salesAgent/leads'
import { classifyWeddingSale, reconcileWeddingSale } from '@/lib/salesAgent/weddingSalesReconciliation'

const MAX_WEDDINGS = 1000

async function authorized(req) {
    const shared = process.env.SALES_AGENT_SECRET
    if (shared && req.headers.get('x-wt-secret') === shared) return true
    const header = req.headers.get('authorization') || ''
    if (!header.startsWith('Bearer ')) return false
    const bearer = header.slice(7).trim()
    if (shared && bearer === shared) return true
    try {
        const decoded = await adminAuth.verifyIdToken(bearer)
        return isSuperAdmin(decoded.email)
    } catch {
        return false
    }
}

function emptySummary() {
    return {
        scanned: 0,
        eligible: 0,
        closed: 0,
        unmatchedPhone: 0,
        linkedWoo: 0,
        notPaid: 0,
        unsupportedCurrency: 0,
        failed: 0,
    }
}

export async function POST(req) {
    if (!(await authorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const mode = new URL(req.url).searchParams.get('mode') || 'dry'
    if (!['dry', 'apply'].includes(mode)) return NextResponse.json({ error: 'INVALID_MODE' }, { status: 400 })

    try {
        const snapshot = await adminDb.collection('weddings').limit(MAX_WEDDINGS).get()
        const summary = emptySummary()
        for (const document of snapshot.docs) {
            summary.scanned += 1
            const wedding = document.data() || {}
            const sale = classifyWeddingSale(document.id, wedding)
            if (sale.kind === 'linked_woocommerce') {
                summary.linkedWoo += 1
                continue
            }
            if (sale.kind === 'not_paid') {
                summary.notPaid += 1
                continue
            }
            if (sale.kind === 'unsupported_currency') {
                summary.unsupportedCurrency += 1
                continue
            }

            summary.eligible += 1
            if (!sale.phone) {
                summary.unmatchedPhone += 1
                continue
            }
            if (mode === 'dry') continue
            try {
                const result = await reconcileWeddingSale(document.id, wedding, { closeLeadOnPurchase })
                if (result.action === 'closed') summary.closed += 1
                else if (result.action === 'unmatched_phone') summary.unmatchedPhone += 1
            } catch {
                summary.failed += 1
                const rowHash = crypto.createHash('sha256').update(String(document.id)).digest('hex').slice(0, 12)
                console.warn('[wedding-sales-reconcile] ROW_FAILED', rowHash)
            }
        }
        return NextResponse.json(summary)
    } catch {
        return NextResponse.json({ error: 'RECONCILIATION_READ_FAILED' }, { status: 503 })
    }
}
