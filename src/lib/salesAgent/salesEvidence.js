import crypto from 'node:crypto'
import { normalizePhone } from './agent'

export const EVIDENCE_COLLECTION = 'sales_conversation_evidence'
export const ORDER_EVIDENCE_COLLECTION = 'sales_order_evidence'
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex')
const timestamp = value => typeof value?.toMillis === 'function' ? value.toMillis()
    : Number.isFinite(value) ? value : typeof value === 'string' ? Date.parse(value) : null
const sourceOf = source => ({ source: typeof source?.source === 'string' ? source.source.slice(0, 60) : 'unknown', campaignId: typeof source?.campaignId === 'string' ? source.campaignId.slice(0, 160) : null, adId: typeof source?.adId === 'string' ? source.adId.slice(0, 160) : null })
export function decimalMinor(value) {
    const string = String(value ?? '')
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(string)) return null
    const [whole, fraction = ''] = string.split('.')
    const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
    return Number.isSafeInteger(result) ? result : null
}

// Customer contents and guest blessings never enter the analytical ledger.
// Prepared != delivered; a checkout != a paid order; no inferred clicks/views.
export async function recordConversationEvidence({ eventId, leadId, contract, outcome, delivery = null, db, nowMs = Date.now() }) {
    if (!eventId || !leadId || !contract?.conversationalPolicyVersion) return { recorded: false }
    const database = db || (await import('@/lib/firebaseAdmin')).adminDb
    const reference = database.collection(EVIDENCE_COLLECTION).doc(hash(`inbound:${eventId}`))
    return database.runTransaction(async tx => {
        const previous = await tx.get(reference)
        const row = previous.exists ? previous.data() : null
        const prepared = {
            contactHash: hash(leadId), inboundAtMs: row?.inboundAtMs || nowMs,
            source: row?.source || sourceOf(contract.sourceAttribution),
            route: contract.conversationalState === 'FREE_ACTIVATION' ? 'free' : 'paid',
            policyVersion: contract.conversationalPolicyVersion,
            conversationRevision: contract.conversationRevision,
            state: contract.conversationalState,
            offerPrepared: !!(contract.offerSnapshot || contract.offerSnapshots),
            checkoutPrepared: !!contract.checkoutSnapshot,
            handoffRequested: outcome?.handoff === true,
            marketingStopped: contract.marketingSuppressed === true,
        }
        if (delivery && ['accepted', 'partial', 'failed', 'suppressed'].includes(delivery.status)) {
            prepared.transportStatus = delivery.status
            prepared.acceptedParts = Number.isInteger(delivery.acceptedParts) ? delivery.acceptedParts : 0
        }
        tx.set(reference, prepared, { merge: true })
        return { recorded: true, duplicate: !!row }
    })
}

// Call ONLY from the signature-validated provider boundary after payment truth
// validation. The caller, not a customer/model supplied `verified` flag, owns it.
export async function recordVerifiedOrderEvidence({ order, db, nowMs = Date.now() }) {
    const orderId = String(order?.id || '')
    const amountMinor = decimalMinor(order?.total)
    const contact = normalizePhone(order?.billing?.phone)
    if (!orderId || !contact || amountMinor == null || order?.currency !== 'ILS') return { recorded: false, reason: 'invalid_order_evidence' }
    const paid = ['processing', 'completed'].includes(order.status)
    const refunded = order.status === 'refunded'
    if (!paid && !refunded) return { recorded: false, reason: 'unverified_status' }
    const database = db || (await import('@/lib/firebaseAdmin')).adminDb
    const reference = database.collection(ORDER_EVIDENCE_COLLECTION).doc(hash(orderId))
    return database.runTransaction(async tx => {
        const [existing, leadSnap] = await Promise.all([tx.get(reference), tx.get(database.collection('sales_leads').doc(contact))])
        if (refunded && !existing.exists) return { recorded: false, reason: 'refund_without_verified_purchase' }
        const previous = existing.exists ? existing.data() : null
        const lead = leadSnap.exists ? leadSnap.data() : {}
        const refundValues = Array.isArray(order.refunds) ? order.refunds.map(r => decimalMinor(String(r.total || '').replace(/^-/, ''))) : []
        const refundMinor = refunded ? amountMinor : refundValues.every(v => v != null) ? refundValues.reduce((sum, v) => sum + v, 0) : null
        tx.set(reference, {
            contactHash: hash(contact), provider: 'woocommerce_signed_webhook',
            verifiedAtMs: previous?.verifiedAtMs || nowMs,
            acquiredAtMs: previous?.acquiredAtMs || timestamp(lead.createdAt) || null,
            source: previous?.source || sourceOf(lead.sourceAttribution || { source: lead.source }),
            route: previous?.route || (lead.conversationalState === 'FREE_ACTIVATION' ? 'free_upgrade' : 'paid'),
            currency: 'ILS', grossMinor: previous?.grossMinor ?? amountMinor,
            refundedMinor: refundMinor == null ? previous?.refundedMinor ?? null : Math.max(previous?.refundedMinor || 0, Math.min(refundMinor, previous?.grossMinor ?? amountMinor)),
            status: refunded || previous?.status === 'refunded' ? 'refunded' : 'paid', updatedAtMs: nowMs,
        }, { merge: true })
        return { recorded: true, duplicate: !!previous }
    })
}

function wilson(successes, total) {
    if (!total) return null
    const z = 1.96, p = successes / total, denominator = 1 + z * z / total
    const centre = (p + z * z / (2 * total)) / denominator
    const margin = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator
    return { low: Math.max(0, centre - margin), high: Math.min(1, centre + margin) }
}

export function buildSalesCohortReport({ conversations = [], orders = [], costs = [], fromMs, toMs, asOfMs = Date.now(), maturityHours = 168 } = {}) {
    if (![fromMs, toMs, asOfMs, maturityHours].every(Number.isFinite) || fromMs >= toMs || maturityHours < 24) throw new Error('INVALID_COHORT_WINDOW')
    const first = new Map()
    for (const row of conversations) {
        if (!row?.contactHash || !Number.isFinite(row.inboundAtMs)) continue
        if (!first.has(row.contactHash) || first.get(row.contactHash).inboundAtMs > row.inboundAtMs) first.set(row.contactHash, row)
    }
    const uniqueOrders = new Map(orders.filter(o => o?.id).map(o => [o.id, o]))
    const groups = new Map()
    for (const [contactHash, row] of first) {
        if (row.inboundAtMs < fromMs || row.inboundAtMs >= toMs) continue
        const route = row.route === 'free' ? 'free' : 'paid'
        const source = row.source?.source || 'unknown'
        const key = JSON.stringify([source, row.source?.campaignId || null, route])
        if (!groups.has(key)) groups.set(key, { source, campaignId: row.source?.campaignId || null, route, uniqueLeads: 0, matureLeads: 0, verifiedBuyers: 0, verifiedOrders: 0, grossMinor: 0, refundedMinor: 0, refundDataComplete: true, handoffs: 0, stops: 0, checkoutsPrepared: 0 })
        const group = groups.get(key)
        group.uniqueLeads += 1
        const contactRows = conversations.filter(r => r.contactHash === contactHash && r.inboundAtMs <= asOfMs)
        group.handoffs += Number(contactRows.some(r => r.handoffRequested))
        group.stops += Number(contactRows.some(r => r.marketingStopped))
        group.checkoutsPrepared += Number(contactRows.some(r => r.checkoutPrepared))
        const maturityAt = row.inboundAtMs + maturityHours * 3_600_000
        if (maturityAt > asOfMs) continue
        group.matureLeads += 1
        const purchases = [...uniqueOrders.values()].filter(o => o.contactHash === contactHash && o.provider === 'woocommerce_signed_webhook'
            && o.currency === 'ILS' && Number.isSafeInteger(o.grossMinor) && o.grossMinor > 0
            && o.verifiedAtMs >= row.inboundAtMs && o.verifiedAtMs <= maturityAt)
        group.verifiedBuyers += Number(purchases.length > 0)
        group.verifiedOrders += purchases.length
        for (const order of purchases) {
            group.grossMinor += order.grossMinor
            if (Number.isSafeInteger(order.refundedMinor)) group.refundedMinor += order.refundedMinor
            else group.refundDataComplete = false
        }
    }
    return {
        fromMs, toMs, asOfMs, maturityHours, currency: 'ILS',
        definition: 'Unique inbound contacts; verified purchases within the same fixed maturation window. Prepared links are not clicks or payments.',
        cohorts: [...groups.values()].map(group => {
            const matching = group.matureLeads === group.uniqueLeads && costs.find(c => c.source === group.source && (c.campaignId || null) === group.campaignId && c.route === group.route
                && c.fromMs === fromMs && c.toMs === toMs && c.currency === 'ILS' && c.verified === true)
            const cost = name => Number.isSafeInteger(matching?.[name]) && matching[name] >= 0 ? matching[name] : null
            const media = cost('adCostMinor'), bot = cost('botCostMinor'), messages = cost('messageCostMinor')
            const product = cost('productCostMinor'), delivery = cost('shippingCostMinor'), processing = cost('processingCostMinor')
            const fullKnown = [media, bot, messages].every(v => v != null)
            const contributionKnown = group.refundDataComplete && [product, delivery, processing].every(v => v != null)
            return { ...group,
                conversion: group.matureLeads ? group.verifiedBuyers / group.matureLeads : null,
                conversion95: wilson(group.verifiedBuyers, group.matureLeads),
                adAcquisitionMinor: media != null && group.verifiedBuyers ? media / group.verifiedBuyers : null,
                fullAcquisitionMinor: fullKnown && group.verifiedBuyers ? (media + bot + messages) / group.verifiedBuyers : null,
                contributionMinor: contributionKnown ? group.grossMinor - group.refundedMinor - product - delivery - processing : null,
                comparison: group.matureLeads < 30 ? 'insufficient_sample' : 'descriptive_only',
            }
        }),
        unavailableMetrics: ['link_clicks', 'media_opens', 'platform_blocks', 'first_real_guest_blessing', 'human_resolution_quality'],
    }
}
