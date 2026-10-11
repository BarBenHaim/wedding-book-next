// Pure lifecycle and minimal-summary boundary. No transcripts, guest content,
// photos, owner links, or arbitrary model objects enter a human task.
import crypto from 'node:crypto'

export const HUMAN_TASK_STATUSES = ['requested', 'acknowledged', 'resolved', 'released']
export const HUMAN_TASKS_COLLECTION = 'sales_human_tasks'
const text = (value, max = 160) => typeof value === 'string' ? value.trim().slice(0, max) || null : null
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null
const keys = value => [...new Set((Array.isArray(value) ? value : []).filter(x => typeof x === 'string').map(x => x.slice(0, 100)))].slice(0, 20)

export function humanTaskId(leadId, generation = 1) {
    return crypto.createHash('sha256').update(`human-task:${leadId}:${generation}`).digest('hex').slice(0, 32)
}

export function buildHumanSummary(lead = {}, { parsed = {}, conversationContract = {}, reason, incomingText, source } = {}) {
    const state = { ...lead, ...conversationContract }
    const offer = state.offerSnapshot || {}
    const checkout = state.checkoutSnapshot || {}
    const consent = state.followUpConsent || {}
    const attribution = state.sourceAttribution || {}
    return {
        eventType: text(parsed.eventType || state.eventType, 60),
        eventDate: text(parsed.eventDate || state.eventDate || state.eventDateText, 100),
        celebrantName: text(parsed.celebrantName || state.celebrantName, 100),
        customerName: text(parsed.customerName || state.name, 100),
        source: text(source || state.source, 120),
        campaignId: text(attribution.campaignId),
        adId: text(attribution.adId),
        offer: {
            id: text(offer.offerId || offer.id || state.offerId),
            version: text(offer.version || offer.offerVersion || state.offerVersion),
            productId: text(offer.productId || parsed.packageInterest || state.packageInterest),
            total: number(offer.total ?? offer.totalPrice),
            totalMinor: number(offer.price?.totalMinor ?? offer.totalMinor),
            currency: text(offer.currency || offer.price?.currency, 10),
            inclusions: keys(offer.inclusions || offer.shortInclusions || offer.scope?.includes),
            exclusions: keys(offer.scope?.excludes),
            shipping: text(offer.price?.shipping?.summary, 300),
            timing: { production: text(offer.timing?.production, 300), delivery: text(offer.timing?.delivery, 300), startsFrom: text(offer.timing?.startsFrom, 200) },
            policies: Object.fromEntries(['service', 'dateChange', 'cancellation', 'refunds'].map(key => [key, { version: text(offer.policies?.[key]?.version), summary: text(offer.policies?.[key]?.summary, 400) }])),
            termsVersion: text(offer.termsVersion),
        },
        mediaSent: keys([...(Array.isArray(state.mediaSent) ? state.mediaSent : []), ...(Array.isArray(state.imagesSent) ? state.imagesSent : [])]),
        checkout: { created: checkout.created === true || !!checkout.checkoutId || !!checkout.url, id: text(checkout.checkoutId || checkout.id) },
        // Caller supplies only the relevant sales objection, never guest text.
        objection: text(parsed.objection || state.lastObjection || state.objection || incomingText, 600),
        reason: text(reason || parsed.handoffReason, 240),
        consent: { status: text(consent.status, 30), scope: text(consent.scope, 60), source: text(consent.source, 60), recordedAtMs: number(consent.recordedAtMs), maxReminders: number(consent.maxReminders) },
        callback: { atMs: number(consent.callbackAtMs), date: text(state.customerCallbackAt || state.callbackPromised, 100) },
        nextStep: text(parsed.handoffNextStep || reason || parsed.handoffReason, 240) || 'Review the customer request and respond through the approved service channel',
    }
}

export function humanPausePatch({ taskId, status = 'requested', generation, now }) {
    return {
        human: true,
        humanTakeover: true,
        handoffPending: false,
        pendingHumanRequestEventId: null,
        pendingHumanRequestText: null,
        pendingHumanRequestAtMs: null,
        humanTaskId: taskId,
        humanTaskStatus: status,
        ...(generation == null ? {} : { humanTaskGeneration: generation }),
        humanSince: now,
        followUpAt: null,
        followUpSchedule: null,
        callbackPromised: null,
        customerCallbackAt: null,
        deliveryRequestOutboundId: null,
        deliveryRequestAttemptId: null,
        deliveryRequestUntilMs: null,
        deliveryPendingOutboundId: null,
        deliveryPendingAttemptId: null,
        deliveryPendingUntilMs: null,
        pendingDeliveryMessages: {},
        updatedAt: now,
    }
}

export function transitionHumanTask(task, action, actor, nowMs = Date.now()) {
    if (!task || !HUMAN_TASK_STATUSES.includes(task.status)) throw Object.assign(new Error('human task not found'), { code: 'TASK_NOT_FOUND' })
    const status = { acknowledge: 'acknowledged', resolve: 'resolved', release: 'released' }[action]
    if (!status) throw Object.assign(new Error('unknown human task action'), { code: 'INVALID_TASK_ACTION' })
    if (task.status === status) return { changed: false, status }
    if (task.status === 'released' || (action === 'acknowledge' && task.status === 'resolved')) {
        throw Object.assign(new Error('invalid human task transition'), { code: 'INVALID_TASK_TRANSITION' })
    }
    const by = text(actor, 160)
    if (!by) throw Object.assign(new Error('human action requires authenticated actor'), { code: 'ACTOR_REQUIRED' })
    return { changed: true, status, patch: { status, [`${status}AtMs`]: nowMs, [`${status}By`]: by, updatedAtMs: nowMs } }
}
