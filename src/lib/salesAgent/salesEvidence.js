import crypto from 'node:crypto'
import { normalizePhone } from './agent'
import { safeOrderId, validateWooPayment } from './paymentTruth'
import { resolveOrderAttribution } from './orderAttribution'

export const EVIDENCE_COLLECTION = 'sales_conversation_evidence'
export const ORDER_EVIDENCE_COLLECTION = 'sales_order_evidence'
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex')
const timestamp = value => typeof value?.toMillis === 'function' ? value.toMillis()
    : Number.isFinite(value) ? value : typeof value === 'string' ? Date.parse(value) : null
const safeToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value) ? value : null
const SOURCES = new Set(['unknown', 'meta_ad', 'meta_post', 'instagram_ad', 'facebook_ad', 'tiktok', 'google', 'referral'])
const SOURCE_CONFIDENCES = new Set(['authenticated_transport', 'provider_signature_verified'])
const FIELD_EVIDENCE = new Set(['meta_referral', 'transport_mapping', 'transport_source', 'legacy_unverified', 'unknown'])
// A checkout binding authenticates the lead/order join, not Meta's ad metadata.
// Operational identifiers, URLs and customer content are never analytical fields.
const sourceOf = value => {
    const source = value?.firstTouch || value
    const confidence = ['authenticated_transport', 'provider_signature_verified', 'unverified_transport', 'legacy_unverified', 'unknown'].includes(source?.confidence) ? source.confidence : 'unknown'
    const supported = SOURCE_CONFIDENCES.has(confidence)
    return {
        source: supported && SOURCES.has(source?.source) ? source.source : 'unknown',
        campaignId: supported ? safeToken(source?.campaignId) : null,
        adsetId: supported ? safeToken(source?.adsetId) : null,
        adId: supported ? safeToken(source?.adId) : null,
        confidence,
        evidence: supported && FIELD_EVIDENCE.has(source?.evidence) ? source.evidence : 'unknown',
        fieldEvidence: Object.fromEntries(['adId', 'campaignId', 'adsetId'].map(field => [field,
            supported && FIELD_EVIDENCE.has(source?.fieldEvidence?.[field]) ? source.fieldEvidence[field] : 'unknown'])),
    }
}
const bindingConfidenceOf = order => ['verified_checkout_binding', 'phone_association', 'unlinked', 'pending'].includes(order?.bindingConfidence)
    ? order.bindingConfidence : order?.contactHash ? 'phone_association' : 'unlinked'
const purchaseAt = order => Number.isFinite(order?.paidAtMs) ? order.paidAtMs : order?.verifiedAtMs
const isVerifiedPaidEvidence = order => order?.provider === 'woocommerce_signed_webhook' && order.paymentConfidence === 'verified_paid'
    && ['paid', 'refunded'].includes(order.status) && order.currency === 'ILS'
    && Number.isSafeInteger(order.grossMinor) && order.grossMinor > 0 && Number.isFinite(purchaseAt(order))

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

// Only fields needed to re-check an interrupted binding lookup are retained.
// This comes from the first strictly verified provider event, never lead data.
const bindingPaymentSnapshot = (order, payment) => ({
    id: safeOrderId(order.id), status: 'processing', total: order.total, currency: order.currency,
    date_paid_gmt: order.date_paid_gmt ? new Date(payment.paidAtMs).toISOString() : null,
    date_paid: !order.date_paid_gmt && typeof order.date_paid === 'string' ? order.date_paid : null,
    transaction_id: order.transaction_id, payment_method: order.payment_method,
    total_tax: decimalMinor(order.total_tax) == null ? null : String(order.total_tax),
    shipping_total: decimalMinor(order.shipping_total) == null ? null : String(order.shipping_total),
    line_items: order.line_items.map(item => ({ product_id: item.product_id, quantity: item.quantity, total: item.total })),
})

// Call ONLY from the signature-validated provider boundary. Explicit server-owned
// trust plus strict paid evidence is required even while legacy fulfillment is on.
export async function recordVerifiedOrderEvidence({ order, db, trustedSource = false, nowMs = Date.now() }) {
    if (trustedSource !== true) return { recorded: false, reason: 'untrusted_payment_source' }
    const orderId = safeOrderId(order?.id)
    const amountMinor = decimalMinor(order?.total)
    if (!orderId || amountMinor == null || order?.currency !== 'ILS') return { recorded: false, reason: 'invalid_order_evidence' }
    const refunded = order.status === 'refunded'
    const payment = validateWooPayment(order, { strict: true, trustedSource: true, nowMs })
    if (!refunded && !payment.ok) return { recorded: false, reason: payment.reason }
    const database = db || (await import('@/lib/firebaseAdmin')).adminDb
    const reference = database.collection(ORDER_EVIDENCE_COLLECTION).doc(hash(orderId))
    return database.runTransaction(async tx => {
        const existing = await tx.get(reference)
        const previous = existing.exists ? existing.data() : null
        const priorPayment = isVerifiedPaidEvidence(previous) ? previous : null
        if (refunded && !priorPayment) return { recorded: false, reason: 'refund_without_verified_purchase' }
        let attribution = {}
        if (!previous || (priorPayment && previous.attributionStatus === 'pending')) {
            const originalPayment = previous?.bindingPaymentSnapshot || bindingPaymentSnapshot(order, payment)
            const binding = await resolveOrderAttribution({ order: originalPayment, db: database, transaction: tx, trustedSource: true, nowMs })
            const deferred = binding.retryable === true
            const bound = binding.status === 'bound' && binding.confidence === 'verified_checkout_binding' && !!binding.contactHash
            const contact = !previous && !bound && normalizePhone(order?.billing?.phone)
            const leadSnap = contact ? await tx.get(database.collection('sales_leads').doc(contact)) : null
            const lead = leadSnap?.exists ? leadSnap.data() : null
            const phoneAssociationHash = previous ? previous.phoneAssociationHash || null : lead ? hash(contact) : null
            const acquiredAtMs = previous ? previous.acquiredAtMs : lead ? timestamp(lead.createdAt) : null
            const firstTouch = sourceOf(bound ? binding.firstTouch : null)
            const latestTouch = sourceOf(bound ? binding.latestTouch : null)
            attribution = {
                contactHash: bound ? binding.contactHash : deferred ? null : phoneAssociationHash,
                bindingConfidence: deferred ? 'pending' : bound ? 'verified_checkout_binding' : phoneAssociationHash ? 'phone_association' : 'unlinked',
                attributionStatus: deferred ? 'pending' : 'resolved',
                bindingPaymentSnapshot: deferred ? originalPayment : null,
                phoneAssociationHash: deferred ? phoneAssociationHash : null,
                attributionReason: bound ? null : safeToken(binding.reason) || 'missing_checkout_binding',
                acquiredAtMs,
                source: firstTouch, sourceConfidence: firstTouch.confidence,
                sourceSnapshot: { firstTouch, latestTouch },
                bindingId: bound ? safeToken(binding.bindingId) : null,
                checkoutId: bound ? safeToken(binding.checkoutId) : null,
                offerId: bound ? safeToken(binding.offerId) : null,
                offerVersion: bound ? safeToken(String(binding.offerVersion ?? '')) : null,
                // A phone association cannot establish the purchase's sales route.
                route: bound && binding.route === 'free_upgrade' ? 'free_upgrade' : 'paid',
            }
        } else if (!priorPayment) {
            // A newly verified callback can establish payment truth, but never
            // turn a historical phone/source guess into checkout attribution.
            const unknown = sourceOf(null)
            attribution = {
                bindingConfidence: previous.contactHash ? 'phone_association' : 'unlinked', attributionStatus: 'resolved',
                attributionReason: 'legacy_attribution_unverified', source: unknown,
                sourceConfidence: 'unknown', sourceSnapshot: { firstTouch: unknown, latestTouch: unknown },
                bindingId: null, checkoutId: null, offerId: null, offerVersion: null,
                bindingPaymentSnapshot: null, phoneAssociationHash: null, route: 'paid',
            }
        }
        const grossMinor = priorPayment?.grossMinor ?? amountMinor
        const refundValues = Array.isArray(order.refunds) ? order.refunds.map(r => decimalMinor(String(r?.total ?? '').replace(/^-/, ''))) : null
        const refundTotal = refundValues?.every(v => v != null) ? refundValues.reduce((sum, v) => sum + v, 0) : null
        const refundMinor = refunded ? grossMinor : Number.isSafeInteger(refundTotal) ? refundTotal : null
        tx.set(reference, {
            ...attribution,
            schemaVersion: 2, provider: 'woocommerce_signed_webhook', paymentConfidence: 'verified_paid',
            verifiedAtMs: priorPayment?.verifiedAtMs ?? nowMs,
            paidAtMs: priorPayment?.paidAtMs ?? payment.paidAtMs,
            currency: 'ILS', grossMinor,
            refundedMinor: refundMinor == null ? priorPayment?.refundedMinor ?? null : Math.max(priorPayment?.refundedMinor || 0, Math.min(refundMinor, grossMinor)),
            status: refunded || priorPayment?.status === 'refunded' ? 'refunded' : 'paid', updatedAtMs: nowMs,
        }, { merge: true })
        return { recorded: true, duplicate: !!previous, deferred: (attribution.attributionStatus || previous?.attributionStatus) === 'pending' }
    })
}

function wilson(successes, total) {
    if (!total) return null
    const z = 1.96, p = successes / total, denominator = 1 + z * z / total
    const centre = (p + z * z / (2 * total)) / denominator
    const margin = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator
    return { low: Math.max(0, centre - margin), high: Math.min(1, centre + margin) }
}

function purchaseAttributionReport(orders, fromMs, toMs) {
    const totals = { verifiedOrders: 0, stronglyBoundOrders: 0, phoneAssociatedOrders: 0, unlinkedOrders: 0, pendingOrders: 0,
        knownFirstTouchOrders: 0, unknownFirstTouchOrders: 0, knownLatestTouchOrders: 0, unknownLatestTouchOrders: 0,
        knownFirstTouchAdOrders: 0, unknownFirstTouchAdOrders: 0, knownLatestTouchAdOrders: 0, unknownLatestTouchAdOrders: 0,
        grossMinor: 0, refundedMinor: 0, refundDataComplete: true, legacyUnverifiedOrders: 0 }
    const first = new Map(), latest = new Map()
    const add = (groups, touch, order) => {
        const source = sourceOf(touch)
        const bindingConfidence = bindingConfidenceOf(order)
        const key = JSON.stringify([source, bindingConfidence])
        if (!groups.has(key)) groups.set(key, { ...source, bindingConfidence, verifiedOrders: 0, grossMinor: 0, refundedMinor: 0, refundDataComplete: true })
        const group = groups.get(key)
        group.verifiedOrders += 1
        group.grossMinor += order.grossMinor
        if (Number.isSafeInteger(order.refundedMinor)) group.refundedMinor += order.refundedMinor
        else group.refundDataComplete = false
        return { knownSource: source.source !== 'unknown', knownAd: source.source !== 'unknown' && source.adId !== null }
    }
    for (const order of orders) {
        if (purchaseAt(order) < fromMs || purchaseAt(order) >= toMs || !Number.isFinite(purchaseAt(order))) continue
        if (!isVerifiedPaidEvidence(order)) {
            if (order.provider === 'woocommerce_signed_webhook' && order.paymentConfidence !== 'verified_paid') totals.legacyUnverifiedOrders += 1
            continue
        }
        totals.verifiedOrders += 1
        totals.grossMinor += order.grossMinor
        if (Number.isSafeInteger(order.refundedMinor)) totals.refundedMinor += order.refundedMinor
        else totals.refundDataComplete = false
        const confidence = bindingConfidenceOf(order)
        totals[confidence === 'verified_checkout_binding' ? 'stronglyBoundOrders' : confidence === 'phone_association' ? 'phoneAssociatedOrders' : confidence === 'pending' ? 'pendingOrders' : 'unlinkedOrders'] += 1
        // Never backfill the paid order from the lead's current referral source.
        const snapshot = confidence === 'verified_checkout_binding' ? order.sourceSnapshot : null
        const knownFirst = add(first, snapshot?.firstTouch, order)
        const knownLatest = add(latest, snapshot?.latestTouch, order)
        totals[knownFirst.knownSource ? 'knownFirstTouchOrders' : 'unknownFirstTouchOrders'] += 1
        totals[knownLatest.knownSource ? 'knownLatestTouchOrders' : 'unknownLatestTouchOrders'] += 1
        totals[knownFirst.knownAd ? 'knownFirstTouchAdOrders' : 'unknownFirstTouchAdOrders'] += 1
        totals[knownLatest.knownAd ? 'knownLatestTouchAdOrders' : 'unknownLatestTouchAdOrders'] += 1
    }
    return {
        definition: 'Strictly verified provider payments whose paid time is in [fromMs, toMs). Lead/order binding and referral-source confidence are separate. Known touch counts identify a source label; known ad counts require an observed ad ID as well. First and latest source observations are frozen at checkout; phone association never establishes ad attribution. Pending binding lookups retain paid truth and await reconciliation. Refunds reconcile these same purchases.',
        ...totals, byFirstTouch: [...first.values()], byLatestTouch: [...latest.values()],
    }
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
        const source = sourceOf(row.source)
        const key = JSON.stringify([source.source, source.campaignId, source.confidence, route])
        if (!groups.has(key)) groups.set(key, { source: source.source, campaignId: source.campaignId, sourceConfidence: source.confidence, route, uniqueLeads: 0, matureLeads: 0, verifiedBuyers: 0, verifiedOrders: 0, stronglyBoundOrders: 0, phoneAssociatedOrders: 0, grossMinor: 0, refundedMinor: 0, refundDataComplete: true, handoffs: 0, stops: 0, checkoutsPrepared: 0 })
        const group = groups.get(key)
        group.uniqueLeads += 1
        const contactRows = conversations.filter(r => r.contactHash === contactHash && r.inboundAtMs <= asOfMs)
        group.handoffs += Number(contactRows.some(r => r.handoffRequested))
        group.stops += Number(contactRows.some(r => r.marketingStopped))
        group.checkoutsPrepared += Number(contactRows.some(r => r.checkoutPrepared))
        const maturityAt = row.inboundAtMs + maturityHours * 3_600_000
        if (maturityAt > asOfMs) continue
        group.matureLeads += 1
        const purchases = [...uniqueOrders.values()].filter(o => o.contactHash === contactHash && isVerifiedPaidEvidence(o)
            && purchaseAt(o) >= row.inboundAtMs && purchaseAt(o) <= maturityAt)
        group.verifiedBuyers += Number(purchases.length > 0)
        group.verifiedOrders += purchases.length
        for (const order of purchases) {
            group[bindingConfidenceOf(order) === 'verified_checkout_binding' ? 'stronglyBoundOrders' : 'phoneAssociatedOrders'] += 1
            group.grossMinor += order.grossMinor
            if (Number.isSafeInteger(order.refundedMinor)) group.refundedMinor += order.refundedMinor
            else group.refundDataComplete = false
        }
    }
    return {
        fromMs, toMs, asOfMs, maturityHours, currency: 'ILS',
        definition: 'Unique inbound contacts grouped by their first recorded source observation. Conversion counts strictly verified purchases associated with those contacts within equal maturation windows; this association does not establish ad attribution. Prepared links are not clicks or payments.',
        purchaseAttribution: purchaseAttributionReport([...uniqueOrders.values()], fromMs, toMs),
        cohorts: [...groups.values()].map(group => {
            const compatibleGroups = [...groups.values()].filter(g => g.source === group.source && g.campaignId === group.campaignId && g.route === group.route).length
            const matching = compatibleGroups === 1 && group.matureLeads === group.uniqueLeads && costs.find(c => c.source === group.source && (c.campaignId || null) === group.campaignId && c.route === group.route
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
