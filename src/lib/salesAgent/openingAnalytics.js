import crypto from 'crypto'
import { classifyOpeningLead } from './openingExperiment'
import { isVerifiedPayment } from './paymentTruth'

const HOUR_MS = 3_600_000

function toMs(value) {
    if (!value) return null
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
        const parsed = Date.parse(value)
        return Number.isFinite(parsed) ? parsed : null
    }
    if (typeof value?.toMillis === 'function') return value.toMillis()
    if (typeof value?.seconds === 'number') return value.seconds * 1000
    return null
}

function ratio(numerator, denominator) {
    return { numerator, denominator, rate: denominator ? numerator / denominator : null }
}

function within(exposure, reply, hours) {
    return exposure != null && reply != null && reply >= exposure && reply - exposure <= hours * HOUR_MS
}

function hasContinuation(lead) {
    return !!(
        toMs(lead.openingContinuedAt)
        || lead.childPhotoReceived === true
        || lead.openingDesignApproved === true
        || toMs(lead.paymentLinkSentAt)
        || isVerifiedPayment(lead)
        || (lead.eventType && lead.eventDate)
    )
}

function firstOpeningResponseAt(lead) {
    const candidates = [toMs(lead.openingFirstReplyAt)]
    if (lead.childPhotoReceived === true) {
        candidates.push(toMs(lead.openingPhotoReceivedAt), toMs(lead.openingContinuedAt))
    }
    if (lead.eventType && lead.eventDate) candidates.push(toMs(lead.openingContinuedAt))
    const valid = candidates.filter(value => value != null)
    return valid.length ? Math.min(...valid) : null
}

function variantSummary(rows, nowMs) {
    const exposed = rows.filter(row => toMs(row.openingExposedAt) != null)
    const relevant = exposed.map(row => classifyOpeningLead(row, nowMs))
    const relevantCount = relevant.filter(item => item.state === 'relevant').length
    const notRelevantCount = relevant.filter(item => item.state === 'not_relevant').length
    const relevanceDenominator = relevantCount + notRelevantCount
    const replied = hours => exposed.filter(row => within(toMs(row.openingExposedAt), firstOpeningResponseAt(row), hours)).length
    const verified = exposed.filter(isVerifiedPayment)
    return {
        assigned: rows.length,
        delivered: exposed.length,
        reply1h: ratio(replied(1), exposed.length),
        reply24h: ratio(replied(24), exposed.length),
        reply72h: ratio(replied(72), exposed.length),
        continuation: ratio(exposed.filter(hasContinuation).length, exposed.length),
        relevance: {
            relevant: relevantCount,
            notRelevant: notRelevantCount,
            unknown: relevant.filter(item => item.state === 'unknown').length,
            denominator: relevanceDenominator,
            rate: relevanceDenominator ? relevantCount / relevanceDenominator : null,
        },
        approval: ratio(exposed.filter(row => row.openingDesignApproved === true).length, exposed.length),
        paymentLink: ratio(exposed.filter(row => toMs(row.paymentLinkSentAt) != null).length, exposed.length),
        verifiedPayment: ratio(verified.length, exposed.length),
        verifiedRevenue: verified.reduce((sum, row) => sum + (Number.isFinite(Number(row.amount)) ? Number(row.amount) : 0), 0),
    }
}

export function summarizeOpeningExperiment(leads = [], { experiment, nowMs = Date.now() } = {}) {
    const variants = {}
    const definitions = Array.isArray(experiment?.variants) ? experiment.variants : []
    for (const definition of definitions) {
        const revision = Number(definition.revision)
        variants[definition.id] = {
            id: definition.id,
            label: String(definition.label || definition.id),
            enabled: definition.enabled === true,
            ...variantSummary(leads.filter(lead =>
                lead?.openingVariantId === definition.id
                && Number(lead?.openingVariantRevision) === revision), nowMs),
        }
    }
    const minSample = Number(experiment?.minSamplePerVariant || 30)
    const enabled = Object.values(variants).filter(item => item.enabled)
    const trendReady = experiment?.enabled === true
        && enabled.length > 1
        && enabled.every(item => item.delivered >= minSample)
    const ranked = trendReady
        ? [...enabled].sort((a, b) =>
            (b.verifiedPayment.rate - a.verifiedPayment.rate)
            || (b.continuation.rate - a.continuation.rate)
            || (b.reply24h.rate - a.reply24h.rate))
        : []
    return {
        enabled: experiment?.enabled === true,
        minSamplePerVariant: minSample,
        trendReady,
        leadingVariantId: ranked[0]?.id || null,
        variants,
    }
}

function maskedPhone(value) {
    const digits = String(value || '').replace(/\D/g, '')
    return `•••${digits.slice(-4).padStart(4, '•')}`
}

export function openingLeadRow(lead = {}, nowMs = Date.now()) {
    const phone = String(lead.phone || '')
    const exposure = toMs(lead.openingExposedAt)
    const reply = firstOpeningResponseAt(lead)
    const relevance = classifyOpeningLead(lead, nowMs)
    const state = lead.openingState && typeof lead.openingState === 'object' ? lead.openingState : {}
    return {
        id: crypto.createHash('sha256').update(`opening-lead:${phone}`).digest('hex').slice(0, 16),
        phone: maskedPhone(phone),
        name: String(lead.name || lead.profileName || '').slice(0, 80),
        source: String(lead.source || '').slice(0, 60),
        campaignId: String(lead.campaignId || '').slice(0, 120) || null,
        variantId: String(lead.openingVariantId || '').slice(0, 1),
        variantRevision: Number(lead.openingVariantRevision || 0),
        eventType: String(lead.eventType || '').slice(0, 40) || null,
        eventDate: String(lead.eventDate || '').slice(0, 10) || null,
        relevance: relevance.state,
        relevanceReason: relevance.reason,
        cursor: Number.isInteger(state.cursor) ? state.cursor : null,
        waitingFor: typeof state.waitingFor === 'string' ? state.waitingFor : null,
        status: String(lead.openingStatus || 'assigned').slice(0, 40),
        exposedAt: exposure,
        repliedAt: reply,
        reply24h: within(exposure, reply, 24),
        continuedAt: toMs(lead.openingContinuedAt),
        approval: lead.openingDesignApproved === true
            ? 'approved'
            : lead.openingApprovalRequest || lead.openingStatus === 'approval_pending'
                ? 'pending'
                : 'none',
        paymentLinkSent: toMs(lead.paymentLinkSentAt) != null,
        paymentVerified: isVerifiedPayment(lead),
        verifiedRevenue: isVerifiedPayment(lead) && Number.isFinite(Number(lead.amount)) ? Number(lead.amount) : 0,
    }
}

const openingAnalytics = { summarizeOpeningExperiment, openingLeadRow }

export default openingAnalytics
