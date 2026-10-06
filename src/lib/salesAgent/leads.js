// src/lib/salesAgent/leads.js
//
// The CRM behind the WhatsApp agent. One Firestore document per phone
// number in `sales_leads`, holding the conversation and everything the
// agent has learned. Server-only (Admin SDK) — firestore.rules leaves
// this collection under the default deny, so no client can read a lead.
//
// Why Firestore rather than a Google Sheet: the app already runs on it,
// the webhook that creates a wedding after payment already runs on it,
// and closing the loop from "paid" back to "stop the follow-ups" has to
// be a single transaction against the same store. A sheet would have
// meant a second integration and a race.
//
// The conversation is capped at MAX_TURNS. Sending an unbounded history
// to the model costs more every message and eventually blows the context
// window mid-negotiation; the CRM fields carry the durable memory, so
// what matters survives being trimmed.

import { adminDb } from '@/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'
import crypto from 'node:crypto'
import { normalizePhone } from './agent'
import { isPausedForHuman, trimTurns, toApiMessages, isOwnEcho, isOwnMediaEcho, parseOwnerCommand, isTestPhone, MAX_TURNS, HUMAN_PAUSE_HOURS } from './leadsCore'
import { isoInIsrael } from './leadsView'
import { FOLLOWUP_STRATEGY_IDS, FOLLOWUP_CTAS } from './followupStrategy'
import { assertCompletableInboundOutcome, assertInboundClaimToken, decideInboundCompletion, INBOUND_LEASE_MS, sanitizeInboundOutcome, startInboundClaim } from './inboundEventsCore'
import { reserveHalfOpenProbe, resolveProviderFailure, resolveProviderSuccess, sanitizeBreakerRuntimeState } from './circuitBreaker'
import { providerCircuitRuntimeId } from './circuitIdentity'
import { createOutboundId, DELIVERY_ERROR_CODES, DELIVERY_REQUEST_LEASE_MS, decideDeliveryTransition, deliveryEventFingerprint, deliveryEventLedgerId, isDeliveryPending, providerMessageCorrelationId } from './delivery'
import { isDueFollowUpCandidate, nextFollowUpDate, pendingFollowUpStatus, selectDueFollowUps, strictFollowUpEligibility, createStrictFollowUpSchedule, strictFollowUpDate } from './followupPolicy'
import { isDemoEvidenceContent } from './followupEvidence'
import { normalizeOpeningVariantId } from './openingExperiment'
import { assignModelArm } from './modelExperiment'
import { findOrphans } from './sweep'
import { isConversationalPolicyEnabled, sanitizeConversationContract, isMarketingStopRequest, isHumanServiceRequest } from './salesContract'
import { decideStrictInboundTime } from './transportPolicy'
import { extractReferralTouch, mergeAttribution } from './referralEvidence'
import { resolveOrderAttribution } from './orderAttribution'
import { buildHumanSummary, humanPausePatch, humanTaskId, HUMAN_TASKS_COLLECTION, transitionHumanTask } from './humanHandoff'


// The pure helpers live in leadsCore.js so they stay unit-testable —
// importing this file boots the Admin SDK, which needs credentials.
// Re-exported here so callers still have one import to reach for.
export { isPausedForHuman, trimTurns, toApiMessages, isOwnEcho, isOwnMediaEcho, parseOwnerCommand, isTestPhone, MAX_TURNS, HUMAN_PAUSE_HOURS }

const COLLECTION = 'sales_leads'
const INBOUND_EVENTS_COLLECTION = 'sales_inbound_events'
const RUNTIME_COLLECTION = 'sales_runtime'
const ANTHROPIC_RUNTIME_ID = 'anthropic'
const DELIVERY_EVENTS_COLLECTION = 'sales_delivery_events'
const DELIVERY_EVENT_IDS_COLLECTION = 'sales_delivery_event_ids'
const DELIVERY_PROVIDER_IDS_COLLECTION = 'sales_delivery_provider_ids'
const VERIFIED_ORDERS_COLLECTION = 'sales_verified_orders'
const OPENING_APPROVALS_COLLECTION = 'sales_opening_approvals'

// A strict inbound reservation is coordination state, not proof that this
// phone has ever been checked against historical conversations/customer data.
function hasInitializedConversation(lead = {}) {
    if (typeof lead.conversationInitialized === 'boolean') return lead.conversationInitialized
    return lead.createdAt != null || lead.paymentVerified === true || !!lead.weddingId
        || (Array.isArray(lead.turns) && lead.turns.length > 0)
        || Number(lead.userTurns || 0) > 0
        || (typeof lead.stage === 'string' && lead.stage !== 'new' && !!lead.stage)
}

function ref(phone) {
    return adminDb.collection(COLLECTION).doc(phone)
}

export function inboundEventRef(eventId) {
    return adminDb.collection(INBOUND_EVENTS_COLLECTION).doc(String(eventId))
}

// Read this plan before any transaction writes (Firestore read-before-write).
// A generation changes only after explicit release, so duplicate requests and
// concurrent retries share one task, even without a transport event ID.
async function prepareHumanTask(tx, leadId, lead = {}, request = {}) {
    const active = lead.humanTaskId && lead.humanTaskStatus !== 'released'
    const generation = Math.max(0, Number(lead.humanTaskGeneration) || 0) + (active ? 0 : 1)
    const taskId = active ? lead.humanTaskId : humanTaskId(leadId, generation)
    const taskRef = adminDb.collection(HUMAN_TASKS_COLLECTION).doc(taskId)
    const snap = await tx.get(taskRef)
    const stored = snap.exists ? snap.data() : null
    if (stored && stored.leadId !== leadId) throw new Error('human task ownership mismatch')
    const nowMs = Date.now()
    const task = stored || {
        id: taskId, leadId, generation, status: 'requested',
        summary: buildHumanSummary(lead, { ...request, incomingText: lead.pendingHumanRequestText || request.incomingText }),
        sourceEventId: typeof request.eventId === 'string' ? request.eventId.slice(0, 200) : null,
        requestedAtMs: nowMs, updatedAtMs: nowMs,
        requestedBy: String(request.actor || 'sales_agent').slice(0, 160),
    }
    if (task.status === 'released') throw new Error('released task cannot own a human pause')
    return {
        taskRef, task, create: !stored,
        patch: {
            ...humanPausePatch({ taskId, status: task.status, generation, now: FieldValue.serverTimestamp() }),
            ...(lead.humanSince ? { humanSince: lead.humanSince } : {}),
            handoffReason: String(request.reason || request.parsed?.handoffReason || lead.handoffReason || '').slice(0, 240) || null,
        },
        result: { ok: true, taskId, status: task.status },
    }
}

function writeHumanTask(tx, plan) {
    if (plan.create) tx.set(plan.taskRef, plan.task, { merge: false })
}

function anthropicRuntimeRef() {
    return adminDb.collection(RUNTIME_COLLECTION).doc(ANTHROPIC_RUNTIME_ID)
}

function providerRuntimeRef(identity = null) {
    if (identity?.provider && identity?.model) {
        return adminDb.collection(RUNTIME_COLLECTION).doc(providerCircuitRuntimeId(identity))
    }
    return anthropicRuntimeRef()
}

function deliveryEventRef(outboundId) {
    return adminDb.collection(DELIVERY_EVENTS_COLLECTION).doc(String(outboundId))
}

function deliveryEventIdRef(eventId) {
    return adminDb.collection(DELIVERY_EVENT_IDS_COLLECTION).doc(deliveryEventLedgerId(eventId))
}

function deliveryProviderIdRef(providerMessageId) {
    return adminDb.collection(DELIVERY_PROVIDER_IDS_COLLECTION).doc(providerMessageCorrelationId(providerMessageId))
}

function openingApprovalIdentity(leadId, stateVersion) {
    const id = crypto.createHash('sha256')
        .update(`opening-approval:${String(leadId)}:${Number(stateVersion) || 0}`)
        .digest('hex')
        .slice(0, 32)
    return { id, ref: adminDb.collection(OPENING_APPROVALS_COLLECTION).doc(id) }
}

function verifiedOrderRef(orderId) {
    const id = crypto.createHash('sha256').update(String(orderId)).digest('hex')
    return adminDb.collection(VERIFIED_ORDERS_COLLECTION).doc(id)
}

function correlationOutboundId(value) {
    const stored = value && typeof value === 'object' ? value : {}
    const candidates = [
        ...(typeof stored.outboundId === 'string' && stored.outboundId ? [stored.outboundId] : []),
        ...(Array.isArray(stored.outboundIds) ? stored.outboundIds.filter(item => typeof item === 'string' && item) : []),
    ]
    const unique = [...new Set(candidates)]
    if (unique.length > 1) throw deliveryError('PROVIDER_MESSAGE_ID_AMBIGUOUS')
    return unique[0] || null
}

// Runtime state is metadata only. In particular, do not merge arbitrary
// existing fields: a past operational mistake must not keep a provider body,
// prompt, customer text, phone, or secret alive in this document.
const breakerRuntimeState = sanitizeBreakerRuntimeState
const assertBeforeDeadline = deadlineAtMs => {
    if (deadlineAtMs != null && Date.now() >= Number(deadlineAtMs)) throw new Error('sales runtime deadline exhausted')
}

const healthMs = value => {
    if (value == null || value === '') return null
    if (typeof value?.toMillis === 'function') return value.toMillis()
    if (typeof value?.seconds === 'number') return value.seconds * 1000
    return Number.isFinite(Number(value)) ? Number(value) : null
}

const healthEnum = (value, allowed) => allowed.includes(value) ? value : 'unknown'

/**
 * The authenticated reply request is the heartbeat; no extra Make module is
 * needed. Replace the runtime document with an allowlist so an old accidental
 * payload/phone field cannot survive forever through merge semantics.
 */
/**
 * Stamp the end of a follow-up run. The health card reads
 * `sales_runtime/followups.lastRunAtMs` and showed `null` forever because
 * nothing wrote it - the cron could be dead or fine and the admin could
 * not tell. Best effort: a failed stamp must not fail the run.
 */
export async function recordFollowUpRun({ ranAtMs = Date.now(), dry = false, count = 0, blockedCount = 0, failedCount = 0, delivery = 'none' } = {}) {
    if (dry) return
    try {
        await adminDb.collection(RUNTIME_COLLECTION).doc('followups').set({
            lastRunAtMs: healthMs(ranAtMs) ?? Date.now(),
            lastRunCount: Math.max(0, Number(count) || 0),
            lastRunBlockedCount: Math.max(0, Number(blockedCount) || 0),
            lastRunFailedCount: Math.max(0, Number(failedCount) || 0),
            lastRunDelivery: String(delivery || 'none').slice(0, 20),
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
    } catch {
        console.error('[sales-agent] followup run stamp failed')
    }
}

export async function recordInboundHeartbeat({ receivedAtMs = Date.now() } = {}) {
    const inboundRef = adminDb.collection(RUNTIME_COLLECTION).doc('inbound')
    const safeReceivedAtMs = healthMs(receivedAtMs) ?? Date.now()
    return adminDb.runTransaction(async tx => {
        const snap = await tx.get(inboundRef)
        const stored = snap.exists ? snap.data() || {} : {}
        const patch = {
            lastHeartbeatAtMs: safeReceivedAtMs,
            makeStatus: 'active',
            heartbeatCount: Math.max(0, Number(stored.heartbeatCount) || 0) + 1,
            updatedAt: FieldValue.serverTimestamp(),
        }
        const activationAtMs = healthMs(stored.activationAtMs)
        if (activationAtMs != null) patch.activationAtMs = activationAtMs
        const operationsStatus = healthEnum(stored.operationsStatus, ['available', 'exhausted', 'unknown'])
        if (operationsStatus !== 'unknown' || stored.operationsStatus === 'unknown') patch.operationsStatus = operationsStatus
        tx.set(inboundRef, patch, { merge: false })
    })
}

/**
 * Read the live metadata used by the admin health summary. Every returned key
 * is allowlisted; provider IDs, outbound IDs, lead IDs and stored bodies stay
 * inside Firestore.
 */
export async function readSalesHealthRuntime() {
    const inboundRef = adminDb.collection(RUNTIME_COLLECTION).doc('inbound')
    const followupsRef = adminDb.collection(RUNTIME_COLLECTION).doc('followups')
    const [inboundSnap, breakerSnap, followupsSnap, deliverySnap] = await Promise.all([
        adminDb.getAll(inboundRef).then(snaps => snaps[0]),
        adminDb.getAll(anthropicRuntimeRef()).then(snaps => snaps[0]),
        adminDb.getAll(followupsRef).then(snaps => snaps[0]),
        adminDb.collection(DELIVERY_EVENTS_COLLECTION).orderBy('updatedAt', 'desc').limit(20).get(),
    ])
    const inbound = inboundSnap?.exists ? inboundSnap.data() || {} : null
    const breaker = breakerSnap?.exists ? breakerSnap.data() || {} : null
    const followups = followupsSnap?.exists ? followupsSnap.data() || {} : null
    return {
        inbound: inbound ? {
            lastHeartbeatAtMs: healthMs(inbound.lastHeartbeatAtMs),
            activationAtMs: healthMs(inbound.activationAtMs),
            makeStatus: healthEnum(inbound.makeStatus, ['active', 'inactive', 'unknown']),
            operationsStatus: healthEnum(inbound.operationsStatus, ['available', 'exhausted', 'unknown']),
        } : null,
        breaker: breaker ? {
            consecutiveFailures: Math.max(0, Number(breaker.consecutiveFailures) || 0),
            openUntilMs: healthMs(breaker.openUntilMs),
            lastFailureAtMs: healthMs(breaker.lastFailureAtMs),
            lastSuccessAtMs: healthMs(breaker.lastSuccessAtMs),
            lastErrorCode: ['timeout', 'rate_limit', 'low_credit', 'invalid_json', 'provider_error']
                .includes(breaker.lastErrorCode) ? breaker.lastErrorCode : null,
        } : null,
        deliveryAttempts: (deliverySnap?.docs || []).map(doc => {
            const value = doc.data() || {}
            return {
                status: ['requested', 'accepted', 'delivered', 'read', 'failed'].includes(value.status) ? value.status : 'unknown',
                requestedAtMs: healthMs(value.requestedAtMs),
                occurredAtMs: healthMs(value.occurredAtMs),
                updatedAtMs: healthMs(value.updatedAt),
                deliveryPendingUntilMs: healthMs(value.deliveryPendingUntilMs),
            }
        }),
        followupsLastRunAtMs: healthMs(followups?.lastRunAtMs),
    }
}

/**
 * Atomically consults the provider circuit before a model call. A closed
 * circuit needs only a transaction read; a half-open circuit writes a short
 * lease, so exactly one concurrent request becomes the probe.
 */
export async function acquireProviderCircuit({ provider, model, deadlineAtMs } = {}) {
    assertBeforeDeadline(deadlineAtMs)
    const runtimeRef = providerRuntimeRef({ provider, model })
    const probeId = crypto.randomUUID()
    return adminDb.runTransaction(async tx => {
        assertBeforeDeadline(deadlineAtMs)
        const snap = await tx.get(runtimeRef)
        if (deadlineAtMs != null && Date.now() >= Number(deadlineAtMs)) return { allow: false, mode: 'deadline' }
        const stored = snap.exists ? breakerRuntimeState(snap.data()) : {}
        const reservation = reserveHalfOpenProbe(stored, Date.now(), probeId)
        if (reservation.decision.mode === 'half-open') {
            if (deadlineAtMs != null && Date.now() >= Number(deadlineAtMs)) return { allow: false, mode: 'deadline' }
            tx.set(runtimeRef, {
                ...breakerRuntimeState(reservation.state),
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: false })
            return { ...reservation.decision, probeId }
        }
        return reservation.decision
    })
}

export async function recordProviderFailure(errorOrOptions, probeId = null, deadlineAtMs = null) {
    const options = errorOrOptions && typeof errorOrOptions === 'object'
        ? errorOrOptions
        : { errorCode: errorOrOptions, probeId, deadlineAtMs }
    const errorCode = options.errorCode
    probeId = options.probeId || null
    deadlineAtMs = options.deadlineAtMs ?? null
    assertBeforeDeadline(deadlineAtMs)
    const runtimeRef = providerRuntimeRef(options)
    return adminDb.runTransaction(async tx => {
        assertBeforeDeadline(deadlineAtMs)
        const snap = await tx.get(runtimeRef)
        if (deadlineAtMs != null && Date.now() >= Number(deadlineAtMs)) return { action: 'deadline' }
        const resolution = resolveProviderFailure(snap.exists ? breakerRuntimeState(snap.data()) : {}, Date.now(), errorCode, probeId)
        if (resolution.action === 'stale') return resolution
        if (deadlineAtMs != null && Date.now() >= Number(deadlineAtMs)) return { action: 'deadline' }
        tx.set(runtimeRef, { ...breakerRuntimeState(resolution.state), updatedAt: FieldValue.serverTimestamp() }, { merge: false })
        return resolution
    })
}

export async function recordProviderSuccess(probeOrOptions = null, deadlineAtMs = null) {
    const options = probeOrOptions && typeof probeOrOptions === 'object'
        ? probeOrOptions
        : { probeId: probeOrOptions, deadlineAtMs }
    const probeId = options.probeId || null
    deadlineAtMs = options.deadlineAtMs ?? null
    assertBeforeDeadline(deadlineAtMs)
    const runtimeRef = providerRuntimeRef(options)
    return adminDb.runTransaction(async tx => {
        assertBeforeDeadline(deadlineAtMs)
        const snap = await tx.get(runtimeRef)
        if (deadlineAtMs != null && Date.now() >= Number(deadlineAtMs)) return { action: 'deadline' }
        const resolution = resolveProviderSuccess(snap.exists ? breakerRuntimeState(snap.data()) : {}, Date.now(), probeId)
        if (resolution.action === 'stale') return resolution
        if (deadlineAtMs != null && Date.now() >= Number(deadlineAtMs)) return { action: 'deadline' }
        tx.set(runtimeRef, { ...breakerRuntimeState(resolution.state), updatedAt: FieldValue.serverTimestamp() }, { merge: false })
        return resolution
    })
}

export async function releaseProviderProbe(probeOrOptions, deadlineAtMs = null) {
    const options = probeOrOptions && typeof probeOrOptions === 'object'
        ? probeOrOptions
        : { probeId: probeOrOptions, deadlineAtMs }
    const probeId = options.probeId || null
    deadlineAtMs = options.deadlineAtMs ?? null
    if (!probeId) return { action: 'released' }
    assertBeforeDeadline(deadlineAtMs)
    const runtimeRef = providerRuntimeRef(options)
    return adminDb.runTransaction(async tx => {
        const snap = await tx.get(runtimeRef)
        if (deadlineAtMs != null && Date.now() >= Number(deadlineAtMs)) return { action: 'deadline' }
        const stored = snap.exists ? breakerRuntimeState(snap.data()) : {}
        if (stored.halfOpenProbeId !== probeId) return { action: 'stale' }
        tx.set(runtimeRef, { ...stored, halfOpenProbeId: null, halfOpenLeaseUntilMs: null, updatedAt: FieldValue.serverTimestamp() }, { merge: false })
        return { action: 'released' }
    })
}

function modelAssignmentFields(value = {}) {
    return {
        experimentId: String(value.experimentId || ''),
        experimentRevision: Number(value.experimentRevision),
        armId: String(value.armId || ''),
        armRevision: Number(value.armRevision),
        provider: String(value.provider || ''),
        model: String(value.model || ''),
    }
}

function matchingModelAssignment(stored, experiment) {
    const candidate = modelAssignmentFields(stored)
    if (candidate.experimentId !== String(experiment?.id || '')
        || candidate.experimentRevision !== Number(experiment?.revision)) return null
    const arm = (Array.isArray(experiment?.arms) ? experiment.arms : []).find(row => (
        row?.id === candidate.armId
        && Number(row?.revision) === candidate.armRevision
        && row?.provider === candidate.provider
        && row?.model === candidate.model
    ))
    return arm ? candidate : null
}

const MODEL_FAILURE_CODES = new Set([
    'timeout', 'rate_limit', 'low_credit', 'invalid_json', 'provider_error',
    'provider_unavailable', 'circuit_open',
])
const MODEL_STAGE_RANK = Object.freeze({
    new: 0, engaged: 1, opening_completed: 1, qualified: 2, demo_sent: 2,
    offer_sent: 3, objection: 3, ready_to_pay: 4, closed_won: 5,
})

function sanitizedModelExecution(value = {}, assignment = {}) {
    const provider = String(value.provider || '')
    const model = String(value.model || '')
    if (provider !== assignment.provider || model !== assignment.model) throw new Error('MODEL_EXECUTION_ASSIGNMENT_MISMATCH')
    const actualProvider = ['anthropic', 'openai', 'gemini'].includes(value.actualProvider)
        ? value.actualProvider
        : null
    const actualModel = typeof value.actualModel === 'string' && value.actualModel.length <= 120
        ? value.actualModel
        : null
    const attempts = Math.min(3, Math.max(0, Number.isInteger(Number(value.attempts)) ? Number(value.attempts) : 0))
    const costUsd = Number.isFinite(Number(value.costUsd)) ? Math.max(0, Number(value.costUsd)) : 0
    const latencyMs = value.latencyMs == null || !Number.isFinite(Number(value.latencyMs))
        ? null
        : Math.min(120_000, Math.max(0, Number(value.latencyMs)))
    const failureCode = MODEL_FAILURE_CODES.has(value.failureCode) ? value.failureCode : null
    return {
        provider,
        model,
        primaryAttempted: value.primaryAttempted === true,
        fallback: value.fallback === true,
        failureCode,
        attempts,
        costUsd,
        latencyMs,
        actualProvider,
        actualModel,
    }
}

/**
 * Assign one experiment arm under the same durable lease that owns the
 * inbound event. Retries see the stored assignment; stale workers write
 * nothing. The assignment contains experiment metadata only.
 */
export async function resolveOrEnrollModelAssignment({
    eventId, leadId, experiment, claimToken, generation, deadlineAtMs = null,
}) {
    assertBeforeDeadline(deadlineAtMs)
    const safeLeadId = String(leadId || '')
    if (!safeLeadId || safeLeadId.length > 160 || safeLeadId.includes('/')) throw new Error('INVALID_MODEL_LEAD_ID')
    const ownedClaimToken = assertInboundClaimToken(claimToken)
    const expectedGeneration = Number(generation)
    if (!Number.isInteger(expectedGeneration) || expectedGeneration < 1) throw new Error('INVALID_MODEL_CLAIM_GENERATION')
    const eventRef = inboundEventRef(eventId)
    const leadRef = ref(safeLeadId)

    return adminDb.runTransaction(async tx => {
        assertBeforeDeadline(deadlineAtMs)
        const [eventSnap, leadSnap] = await Promise.all([tx.get(eventRef), tx.get(leadRef)])
        if (deadlineAtMs != null && Date.now() >= Number(deadlineAtMs)) return { action: 'deadline' }
        const event = eventSnap.exists ? eventSnap.data() : null
        const claim = decideInboundCompletion(event, ownedClaimToken, Date.now())
        if (claim.action !== 'complete' || Number(event?.claimGeneration) !== expectedGeneration) {
            return { action: 'stale' }
        }
        const lead = leadSnap.exists ? leadSnap.data() || {} : {}
        const existing = matchingModelAssignment(lead.modelAssignment, experiment)
        if (existing) return { action: 'existing', assignment: existing }

        const assignment = modelAssignmentFields(assignModelArm(experiment, safeLeadId))
        assertBeforeDeadline(deadlineAtMs)
        tx.set(leadRef, {
            modelAssignment: { ...assignment, assignedAt: FieldValue.serverTimestamp() },
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
        return { action: 'assigned', assignment }
    })
}

/**
 * Commit a provider fallback as one fenced transaction. A stale outbound
 * worker cannot pause a lead after its inbound lease was reclaimed.
 */
export async function completeProviderFallback({ eventId, claimToken, claimGeneration, phone, reason, outcome, deadlineAtMs = null }) {
    assertBeforeDeadline(deadlineAtMs)
    const ownedClaimToken = assertInboundClaimToken(claimToken)
    const cleanOutcome = sanitizeInboundOutcome(outcome)
    assertCompletableInboundOutcome(cleanOutcome)
    const eventRef = inboundEventRef(eventId)
    const leadRef = ref(normalizePhone(phone))
    const expectedGeneration = Number(claimGeneration)
    if (!Number.isInteger(expectedGeneration) || expectedGeneration < 1) throw new Error('inbound fallback needs claimGeneration')

    return adminDb.runTransaction(async tx => {
        assertBeforeDeadline(deadlineAtMs)
        const [eventSnap, leadSnap] = await Promise.all([tx.get(eventRef), tx.get(leadRef)])
        if (deadlineAtMs != null && Date.now() >= Number(deadlineAtMs)) return { action: 'deadline' }
        const stored = eventSnap.exists ? eventSnap.data() : null
        const decision = decideInboundCompletion(stored, ownedClaimToken, Date.now())
        if (decision.action !== 'complete') return decision
        if (Number(stored.claimGeneration) !== expectedGeneration) return { action: 'stale' }
        if (deadlineAtMs != null && Date.now() >= Number(deadlineAtMs)) return { action: 'deadline' }

        const lead = leadSnap.exists ? leadSnap.data() || {} : {}
        if (stored.conversationRevision != null && stored.conversationRevision !== lead.conversationRevision) return { action: 'stale' }
        const plan = await prepareHumanTask(tx, normalizePhone(phone), lead, { eventId, reason })
        if (deadlineAtMs != null && Date.now() >= Number(deadlineAtMs)) return { action: 'deadline' }
        if (lead.activeInboundEventId === String(eventId)) Object.assign(plan.patch, { activeInboundEventId: null, activeInboundLeaseUntilMs: null })
        writeHumanTask(tx, plan)
        tx.set(leadRef, plan.patch, { merge: true })
        tx.set(eventRef, {
            status: 'completed',
            leaseUntilMs: null,
            outcome: cleanOutcome,
            humanHandoffTaskId: plan.task.id,
            responseHumanGeneration: plan.task.generation,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
        return { action: 'completed', outcome: cleanOutcome, humanHandoff: plan.result }
    })
}

// Final customer-facing success is durable only when the lead exchange and
// inbound completion commit together under the same claim fence.
export async function completeSuccessfulExchange({
    eventId, claimToken, claimGeneration, exchange, outcome,
    deadlineAtMs = null, deliveryChannel = 'make',
    modelAssignment = null, modelExecution = null,
}) {
    assertBeforeDeadline(deadlineAtMs)
    const ownedClaimToken = assertInboundClaimToken(claimToken)
    const cleanOutcome = sanitizeInboundOutcome(outcome)
    assertCompletableInboundOutcome(cleanOutcome)
    const eventRef = inboundEventRef(eventId)
    const { id, patch } = buildExchangePatch(exchange)
    const leadRef = ref(id)
    const inboundAttemptId = createOutboundId({ scope: 'inbound', subject: eventId, attempt: 0, part: 'reply' })
    const orderedOpeningParts = cleanOutcome.openingSequenceParts || []
    const replyParts = orderedOpeningParts.length
        ? orderedOpeningParts.map(item => ({
            part: item.kind,
            order: item.order,
            mediaKey: item.mediaKey,
            blockId: item.blockId,
            demoEvidence: item.demoEvidence,
            variableKey: item.variableKey,
            variableVersionId: item.variableVersionId,
            voiceNote: item.voiceNote === true,
            outboundId: item.partId,
        }))
        : [
            { part: 'text', enabled: !!String(outcome?.sendText || '').trim(), text: outcome?.sendText },
            { part: 'image', enabled: !!String(outcome?.sendImage || '').trim(), mediaKey: exchange?.parsed?.image || null },
            { part: 'video', enabled: !!String(outcome?.sendVideo || '').trim() },
        ].filter(item => item.enabled).map(item => ({
            ...item,
            demoEvidence: isDemoEvidenceContent(item),
            outboundId: createOutboundId({ scope: 'inbound', subject: eventId, attempt: 0, part: item.part }),
        }))
    return adminDb.runTransaction(async tx => {
        const [eventSnap, leadSnap] = await Promise.all([tx.get(eventRef), tx.get(leadRef)])
        if (deadlineAtMs != null && Date.now() >= Number(deadlineAtMs)) return { action: 'deadline' }
        const stored = eventSnap.exists ? eventSnap.data() : null
        const decision = decideInboundCompletion(stored, ownedClaimToken, Date.now())
        if (decision.action !== 'complete') return decision
        if (Number(stored.claimGeneration) !== Number(claimGeneration)) return { action: 'stale' }
        const storedLead = leadSnap.exists ? leadSnap.data() || {} : {}
        if (storedLead.createdAt != null) delete patch.createdAt
        else if (storedLead.conversationInitialized === false) {
            patch.createdAt = storedLead.firstContactAtMs || stored.occurredAtMs || FieldValue.serverTimestamp()
        }
        // Exchange completion can update reply activity, but never reopen the
        // 24-hour window by replacing the verified provider time with receipt.
        if (stored.occurredAtMs != null && stored.conversationRevision != null) {
            patch.lastInboundAtMs = stored.occurredAtMs
            patch.lastInboundAt = stored.occurredAtMs
        }
        if (stored.inboundRecorded === true) {
            const assistantTurns = (exchange?.parsed?.messages || []).map(text => ({ role: 'assistant', text, at: Date.now() }))
            if (assistantTurns.length) patch.turns = FieldValue.arrayUnion(...assistantTurns)
            else delete patch.turns
            delete patch.userTurns
        }
        if (exchange?.expectedHumanTaskGeneration != null && Number(exchange.expectedHumanTaskGeneration) !== Number(storedLead.humanTaskGeneration || 0)) return { action: 'human-paused' }
        if (stored.paymentVerifiedAtClaim === false && (storedLead.paymentVerified === true || storedLead.boundCheckoutPaid === true) && !exchange?.parsed?.handoff && exchange?.conversationContract?.marketingSuppressed !== true && replyParts.length) return { action: 'payment-changed' }
        if (storedLead.handoffPending === true && !exchange?.parsed?.handoff && exchange?.conversationContract?.marketingSuppressed !== true && !(exchange?.conversationContract?.handoffPending === true && exchange?.conversationContract?.conversationalState === 'SERVICE') && replyParts.length) return { action: 'human-paused' }
        if (isPausedForHuman(storedLead) && !exchange?.parsed?.handoff && exchange?.conversationContract?.marketingSuppressed !== true && replyParts.length) return { action: 'human-paused' }
        if (isConversationalPolicyEnabled() && stored.conversationRevision != null
            && (storedLead.conversationRevision !== stored.conversationRevision
                || exchange?.conversationContract?.conversationRevision !== stored.conversationRevision)) {
            if (storedLead.activeInboundEventId === String(eventId)) tx.set(leadRef, { activeInboundEventId: null, activeInboundLeaseUntilMs: null }, { merge: true })
            return { action: 'stale' }
        }
        if (isConversationalPolicyEnabled() && storedLead.activeInboundEventId === String(eventId)) {
            patch.activeInboundEventId = null
            patch.activeInboundLeaseUntilMs = null
        }
        const handoffPlan = exchange?.parsed?.handoff
            ? await prepareHumanTask(tx, id, storedLead, { ...exchange, eventId })
            : null
        if (handoffPlan) Object.assign(patch, handoffPlan.patch)
        else if (isPausedForHuman(storedLead)) { patch.followUpAt = null; patch.followUpSchedule = null }
        if (!handoffPlan && storedLead.handoffPending === true) { patch.handoffPending = true; patch.followUpAt = null; patch.followUpSchedule = null }
        if (exchange?.openingRuntime) {
            const storedStateVersion = Number(storedLead.openingStateVersion || 0)
            if (storedStateVersion !== Number(exchange.openingRuntime.expectedStateVersion || 0)) return { action: 'stale' }
        }
        let execution = null
        if (modelAssignment) {
            const canonicalAssignment = modelAssignmentFields(modelAssignment)
            if (!matchingModelAssignment(storedLead.modelAssignment, {
                id: canonicalAssignment.experimentId,
                revision: canonicalAssignment.experimentRevision,
                arms: [{
                    id: canonicalAssignment.armId,
                    revision: canonicalAssignment.armRevision,
                    provider: canonicalAssignment.provider,
                    model: canonicalAssignment.model,
                }],
            })) return { action: 'stale' }
            execution = sanitizedModelExecution(modelExecution, canonicalAssignment)
            patch.modelAssignment = storedLead.modelAssignment
            patch.modelExecution = execution
            patch.modelPrimaryAttempted = storedLead.modelPrimaryAttempted === true || execution.primaryAttempted
            patch.modelFallbackUsed = storedLead.modelFallbackUsed === true || execution.fallback
            patch.modelLatencyMs = execution.latencyMs
            patch.modelExecutionAt = FieldValue.serverTimestamp()
            patch.modelCostUsd = FieldValue.increment(execution.costUsd)
            patch.modelExecutionCount = FieldValue.increment(1)
            if (execution.failureCode) patch.providerFailureCode = execution.failureCode
            const deliveredAtMs = healthMs(storedLead.modelDeliveredAt)
            if (deliveredAtMs != null && Date.now() - deliveredAtMs <= 86_400_000) patch.modelReply24h = true
            const priorRank = MODEL_STAGE_RANK[storedLead.stage] ?? 0
            const nextRank = MODEL_STAGE_RANK[exchange?.parsed?.stage] ?? priorRank
            if (nextRank > priorRank) patch.modelProgressed = true
        }
        // When we send a picture, a video or a document, Meta echoes it
        // back through the same webhook a few seconds later, and Make does
        // not always mark it as ours. The reply route reads this stamp to
        // tell that echo from a customer attachment (see isOwnMediaEcho).
        const mediaPart = replyParts.find(item => ['image', 'video', 'document', 'audio'].includes(item.part))
        if (mediaPart) {
            patch.lastOutboundMediaAt = Date.now()
            patch.lastOutboundMediaKind = mediaPart.part
        }
        if (deadlineAtMs != null && Date.now() >= Number(deadlineAtMs)) return { action: 'deadline' }
        if (handoffPlan) writeHumanTask(tx, handoffPlan)
        tx.set(leadRef, patch, { merge: true })
        tx.set(eventRef, { status: 'completed', leaseUntilMs: null, outcome: cleanOutcome, ...(handoffPlan ? { humanHandoffTaskId: handoffPlan.task.id } : {}), responseHumanGeneration: handoffPlan?.task.generation ?? (Number(storedLead.humanTaskGeneration) || 0), pendingIncomingText: null, responsePaymentVerified: storedLead.paymentVerified === true || storedLead.boundCheckoutPaid === true, responseMarketingSuppressed: storedLead.marketingSuppressed === true, controlResponse: exchange?.conversationContract?.marketingSuppressed === true || (exchange?.conversationContract?.handoffPending === true && exchange?.conversationContract?.conversationalState === 'SERVICE'), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        if (exchange?.openingRuntime?.approvalRequest) {
            const stateVersion = Number(exchange.openingRuntime.expectedStateVersion || 0) + 1
            const approval = openingApprovalIdentity(id, stateVersion)
            tx.set(approval.ref, {
                id: approval.id,
                leadId: id,
                stateVersion,
                mediaId: String(exchange.openingRuntime.approvalRequest.mediaId || '').slice(0, 500),
                templateId: String(exchange.openingRuntime.approvalRequest.templateId || '').slice(0, 80),
                variantId: normalizeOpeningVariantId(exchange.openingRuntime.variantId),
                variantRevision: Number(exchange.openingRuntime.variantRevision || 1),
                status: 'pending_generation',
                storagePath: null,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: false })
        }
        for (const replyPart of replyParts) {
            tx.set(deliveryEventRef(replyPart.outboundId), {
                outboundId: replyPart.outboundId,
                channel: deliveryChannel === 'whatsapp_graph' ? 'whatsapp_graph' : 'make',
                status: 'requested',
                leadId: id,
                part: replyPart.part,
                ...(replyPart.order == null ? {} : { order: replyPart.order }),
                ...(replyPart.mediaKey ? { mediaKey: replyPart.mediaKey } : {}),
                ...(replyPart.blockId ? { openingBlockId: replyPart.blockId } : {}),
                ...(replyPart.variableKey && replyPart.variableVersionId ? {
                    variableKey: replyPart.variableKey,
                    variableVersionId: replyPart.variableVersionId,
                } : {}),
                ...(replyPart.part === 'audio' ? { voiceNote: replyPart.voiceNote === true } : {}),
                ...(exchange?.openingRuntime ? {
                    openingVariantId: exchange.openingRuntime.variantId,
                    openingVariantRevision: exchange.openingRuntime.variantRevision,
                    openingExposure: !!exchange.openingRuntime.enrollment && replyPart.order === 1,
                } : {}),
                ...(execution ? { modelAttributed: true } : {}),
                deliveryRole: 'secondary',
                advanceOnDelivery: false,
                logicalAttemptId: inboundAttemptId,
                advancesFollowUp: false,
                demoEvidence: replyPart.demoEvidence,
                requestedAtMs: Date.now(),
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: false })
        }
        return { action: 'completed', outcome: cleanOutcome, ...(handoffPlan ? { humanHandoff: handoffPlan.result } : {}) }
    })
}

// The Graph transport calls this after completion, immediately before sending
// each part. A human intervention/new inbound can revoke already-prepared sales.
export async function validateInboundBeforeSend({ phone, eventId, nowMs = Date.now() }) {
    const id = normalizePhone(phone)
    if (!id) return { ok: false, reason: 'invalid-lead' }
    return adminDb.runTransaction(async tx => {
        const [leadSnap, eventSnap] = await Promise.all([tx.get(ref(id)), tx.get(inboundEventRef(eventId))])
        const lead = leadSnap.exists ? leadSnap.data() || {} : {}
        const event = eventSnap.exists ? eventSnap.data() : null
        if (event?.status !== 'completed' || event.outcome?.noReply) return { ok: false, reason: 'inbound-not-sendable' }
        if (event.conversationRevision != null && event.conversationRevision !== lead.conversationRevision) return { ok: false, reason: 'superseded-inbound' }
        if (event.conversationRevision != null) {
            const customerAtMs = lead.lastInboundAtMs
            if (!Number.isFinite(customerAtMs) || customerAtMs <= 0 || customerAtMs > nowMs
                || nowMs - customerAtMs >= 24 * 60 * 60 * 1000) return { ok: false, reason: 'whatsapp-window-closed' }
        }
        if ((Number(event.responseHumanGeneration) || 0) !== (Number(lead.humanTaskGeneration) || 0)) return { ok: false, reason: 'human-ownership-changed' }
        if ((lead.paymentVerified === true || lead.boundCheckoutPaid === true) && event.responsePaymentVerified !== true && event.controlResponse !== true && event.outcome?.handoff !== true) return { ok: false, reason: 'payment-state-changed' }
        if (lead.marketingSuppressed === true && event.responseMarketingSuppressed !== true && event.controlResponse !== true && event.outcome?.handoff !== true) return { ok: false, reason: 'marketing-suppressed' }
        const handoffAcknowledgment = event.outcome?.handoff === true && event.humanHandoffTaskId === lead.humanTaskId
        if ((isPausedForHuman(lead) || lead.handoffPending === true) && !handoffAcknowledgment && event.controlResponse !== true) return { ok: false, reason: 'human-takeover' }
        return { ok: true, reason: null }
    })
}

// Register a single truthful text alternative after a definite, persisted media
// failure. This does not dispatch, retry the media, or credit media delivery.
export async function prepareInboundMediaFallback({ phone, eventId, text, failedPartId }) {
    const id = normalizePhone(phone)
    const fallbackText = typeof text === 'string' ? text.trim().slice(0, 2000) : ''
    if (!id || !fallbackText || !failedPartId) return { action: 'blocked', reason: 'invalid-fallback', part: null }
    const outboundId = createOutboundId({ scope: 'inbound', subject: `${eventId}:media-fallback`, attempt: 0, part: 'text' })
    const logicalAttemptId = createOutboundId({ scope: 'inbound', subject: eventId, attempt: 0, part: 'reply' })
    return adminDb.runTransaction(async tx => {
        const target = deliveryEventRef(outboundId)
        const [leadSnap, eventSnap, failedSnap, existingSnap] = await Promise.all([
            tx.get(ref(id)), tx.get(inboundEventRef(eventId)), tx.get(deliveryEventRef(failedPartId)), tx.get(target),
        ])
        const lead = leadSnap.exists ? leadSnap.data() || {} : {}
        const event = eventSnap.exists ? eventSnap.data() : null
        const failed = failedSnap.exists ? failedSnap.data() : null
        if (event?.status !== 'completed' || event.outcome?.noReply
            || (event.conversationRevision != null && event.conversationRevision !== lead.conversationRevision)
            || (Number(event.responseHumanGeneration) || 0) !== (Number(lead.humanTaskGeneration) || 0)
            || isPausedForHuman(lead) || (lead.paymentVerified === true && event.responsePaymentVerified !== true)) return { action: 'blocked', reason: 'conversation-changed', part: null }
        if (failed?.status !== 'failed' || failed.leadId !== id || failed.logicalAttemptId !== logicalAttemptId
            || !['image', 'video', 'document', 'audio', 'approved_design'].includes(failed.part)) {
            return { action: 'blocked', reason: 'media-failure-not-confirmed', part: null }
        }
        // A previous registration may already have reached the provider. Do not
        // duplicate it after a timeout or crash at the dispatch boundary.
        if (existingSnap.exists) return { action: 'existing', outboundId, part: null }
        const order = Math.max(1, Number(failed.order) || 1) + 1
        tx.set(target, {
            outboundId, channel: failed.channel === 'whatsapp_graph' ? 'whatsapp_graph' : 'make',
            status: 'requested', leadId: id, part: 'text', order,
            deliveryRole: 'secondary', advanceOnDelivery: false, advancesFollowUp: false,
            logicalAttemptId, demoEvidence: false, mediaFallbackFor: String(failedPartId),
            requestedAtMs: Date.now(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        }, { merge: false })
        return { action: 'requested', outboundId, part: { kind: 'text', partId: outboundId, text: fallbackText, order } }
    })
}

/**
 * Claim the one durable unit of inbound work before a reply can spend
 * money or write a lead. The event id is Meta's stable delivery id. Strict
 * records carry a server-only lead reference to release conversation locks.
 */
export async function claimInboundEvent({ eventId, phone, occurredAt, outgoing = false, incomingText = null, attributionBody = null, attributionPayloadRepaired = false, attributionStructured = false }) {
    const eventRef = inboundEventRef(eventId)
    const claimToken = crypto.randomUUID()
    const strict = isConversationalPolicyEnabled() && outgoing !== true
    const leadRef = strict ? ref(normalizePhone(phone)) : null
    return adminDb.runTransaction(async tx => {
        const snap = await tx.get(eventRef)
        const stored = snap.exists ? snap.data() : null
        const nowMs = Date.now()
        if (strict && stored?.phoneHash && stored.phoneHash !== crypto.createHash('sha256').update(String(phone)).digest('hex')) return { action: 'rejected', noReply: true, reason: 'inbound-phone-mismatch' }
        const claim = startInboundClaim(stored, nowMs, claimToken)
        if (claim.action !== 'process') return claim
        let conversationRevision = null
        let occurredAtMs = null
        let inboundRecorded = stored?.inboundRecorded === true
        let paymentVerifiedAtClaim = stored?.paymentVerifiedAtClaim ?? false
        const receivedAtMs = stored?.receivedAtMs || nowMs
        if (strict) {
            const leadSnap = await tx.get(leadRef)
            const lead = leadSnap.exists ? leadSnap.data() || {} : {}
            const timing = decideStrictInboundTime({ occurredAt, nowMs, latestAtMs: activityMs(lead.lastInboundAtMs) ?? activityMs(lead.lastInboundAt) })
            if (!timing.ok) return { action: 'rejected', noReply: true, reason: timing.reason }
            if (stored?.occurredAtMs != null && stored.occurredAtMs !== timing.occurredAtMs) return { action: 'rejected', noReply: true, reason: 'inbound-timestamp-mismatch' }
            occurredAtMs = timing.occurredAtMs
            paymentVerifiedAtClaim = stored?.paymentVerifiedAtClaim ?? (lead.paymentVerified === true || lead.boundCheckoutPaid === true)
            conversationRevision = stored?.conversationRevision ?? ((Number(lead.conversationRevision) || 0) + 1)
            // An obsolete queued event can never overwrite a later decision.
            if (stored?.conversationRevision != null && stored.conversationRevision < Number(lead.conversationRevision)) {
                const outcome = sanitizeInboundOutcome({ noReply: true, skipped: 'superseded-inbound' })
                tx.set(eventRef, { status: 'completed', outcome, leaseUntilMs: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
                return { action: 'cached', outcome }
            }
            // Each new customer event invalidates pending sales immediately,
            // including a superseded worker still computing the previous response.
            const revisionPatch = stored?.conversationRevision == null ? {
                conversationRevision, lastInboundAtMs: occurredAtMs, lastInboundAt: occurredAtMs, lastInboundReceivedAtMs: nowMs,
                latestInboundEventId: String(eventId), followUpSchedule: null, followUpAt: null,
                unansweredSalesReminders: 0,
                ...(!hasInitializedConversation(lead) ? {
                    conversationInitialized: false,
                    firstContactAtMs: lead.firstContactAtMs || occurredAtMs,
                } : {}),
            } : {}
            if (attributionBody && stored?.conversationRevision == null) {
                const touch = extractReferralTouch(attributionBody, { eventId, occurredAtMs, receivedAtMs,
                    transport: { authenticated: true, providerSignatureVerified: false, provider: 'make', payloadRepaired: attributionPayloadRepaired,
                        structuredPayloadVerified: attributionStructured === true },
                })
                revisionPatch.sourceAttribution = mergeAttribution(lead.sourceAttribution, touch)
                revisionPatch.attributionContactHash = crypto.createHash('sha256').update(normalizePhone(phone)).digest('hex')
            }
            // Safety intent is durable at receipt, before another customer
            // event can supersede this worker's response. A task is not yet
            // claimed for human intent; the latest worker must create it.
            if (isMarketingStopRequest(incomingText)) Object.assign(revisionPatch, {
                marketingSuppressed: true, marketingSuppressedAtMs: nowMs,
                followUpConsent: { status: 'revoked', scope: 'sales_reminders', source: 'customer_message', sourceMessageId: String(eventId).slice(0, 300), recordedAtMs: nowMs },
                followUpAt: null, followUpSchedule: null, callbackPromised: null, customerCallbackAt: null,
                deliveryRequestOutboundId: null, deliveryRequestAttemptId: null, deliveryRequestUntilMs: null,
                deliveryPendingOutboundId: null, deliveryPendingAttemptId: null, deliveryPendingUntilMs: null,
                pendingDeliveryMessages: {},
            })
            else if (isHumanServiceRequest(incomingText)) Object.assign(revisionPatch, {
                handoffPending: true, pendingHumanRequestEventId: String(eventId),
                pendingHumanRequestText: String(incomingText).slice(0, 600), pendingHumanRequestAtMs: occurredAtMs,
                followUpAt: null, followUpSchedule: null, callbackPromised: null, customerCallbackAt: null,
                deliveryRequestOutboundId: null, deliveryRequestAttemptId: null, deliveryRequestUntilMs: null,
                deliveryPendingOutboundId: null, deliveryPendingAttemptId: null, deliveryPendingUntilMs: null,
                pendingDeliveryMessages: {},
            })
            if (lead.activeInboundEventId && lead.activeInboundEventId !== String(eventId)
                && Number(lead.activeInboundLeaseUntilMs) > nowMs) {
                const activeRef = inboundEventRef(lead.activeInboundEventId)
                const activeSnap = await tx.get(activeRef)
                const active = activeSnap.exists ? activeSnap.data() : null
                const queuedTurns = []
                if (active?.inboundRecorded !== true && active?.pendingIncomingText) {
                    queuedTurns.push({ role: 'user', text: active.pendingIncomingText, at: active.occurredAtMs || active.receivedAtMs || nowMs })
                }
                const currentText = typeof incomingText === 'string' ? incomingText.slice(0, 2000) : ''
                const currentRecorded = stored?.inboundRecorded === true || !!currentText
                if (stored?.inboundRecorded !== true && currentText) queuedTurns.push({ role: 'user', text: currentText, at: occurredAtMs })
                if (queuedTurns.length) Object.assign(revisionPatch, { turns: FieldValue.arrayUnion(...queuedTurns), userTurns: FieldValue.increment(queuedTurns.length) })
                if (active?.inboundRecorded !== true && active?.pendingIncomingText) tx.set(activeRef, { inboundRecorded: true, pendingIncomingText: null }, { merge: true })
                inboundRecorded = currentRecorded
                // This latest customer event owns the new lease now. Persisted
                // context is ordered, and the prior worker fails the revision
                // fence; no external retry/queue dispatcher is required.
            }
            tx.set(leadRef, { ...revisionPatch, activeInboundEventId: String(eventId), activeInboundLeaseUntilMs: nowMs + INBOUND_LEASE_MS }, { merge: true })
        }
        tx.set(eventRef, {
            eventId: String(eventId),
            phoneHash: crypto.createHash('sha256').update(String(phone)).digest('hex'),
            occurredAt: strict ? new Date(occurredAtMs).toISOString() : occurredAt || new Date().toISOString(),
            status: 'processing', leaseUntilMs: nowMs + INBOUND_LEASE_MS,
            claimToken: claim.claimToken, claimGeneration: claim.claimGeneration,
            ...(strict ? { conversationRevision, leadId: normalizePhone(phone), occurredAtMs, receivedAtMs, inboundRecorded, paymentVerifiedAtClaim, pendingIncomingText: inboundRecorded ? null : (typeof incomingText === 'string' ? incomingText.slice(0, 2000) : null) } : {}),
            attempts: FieldValue.increment(1),
            createdAt: stored?.createdAt || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
        return { ...claim, ...(strict ? { conversationRevision, occurredAtMs, receivedAtMs } : {}) }
    })
}

// A trusted STOP is effective even when its transport timestamp cannot open a
// customer-service window. Persist suppression without any customer send or
// fabricated inbound time. Caller must already own this event's claim.
export async function suppressMarketingFromInbound({ phone, eventId, claimToken }) {
    const id = normalizePhone(phone)
    if (!id) throw Object.assign(new Error('invalid lead'), { code: 'INVALID_LEAD_ID' })
    const ownedClaimToken = assertInboundClaimToken(claimToken)
    const eventRef = inboundEventRef(eventId)
    const leadRef = ref(id)
    return adminDb.runTransaction(async tx => {
        const [eventSnap, leadSnap] = await Promise.all([tx.get(eventRef), tx.get(leadRef)])
        const stored = eventSnap.exists ? eventSnap.data() : null
        const lead = leadSnap.exists ? leadSnap.data() || {} : {}
        if ((stored?.leadId && stored.leadId !== id) || (stored?.phoneHash && stored.phoneHash !== crypto.createHash('sha256').update(String(phone)).digest('hex'))) return { action: 'rejected', noReply: true, reason: 'inbound-phone-mismatch' }
        if (stored?.marketingSuppressionApplied === true) return { action: 'cached', outcome: stored.outcome, marketingSuppressed: true }
        const decision = decideInboundCompletion(stored, ownedClaimToken, Date.now())
        if (decision.action !== 'complete') return decision
        const outcome = sanitizeInboundOutcome({ noReply: true, skipped: 'marketing-suppressed-no-ack', handoff: false })
        tx.set(leadRef, {
            marketingSuppressed: true,
            marketingSuppressedAtMs: Date.now(),
            followUpConsent: { status: 'revoked', scope: 'sales_reminders', source: 'customer_message', sourceMessageId: String(eventId).slice(0, 300), recordedAtMs: Date.now() },
            followUpAt: null, followUpSchedule: null, callbackPromised: null, customerCallbackAt: null,
            conversationRevision: (Number(lead.conversationRevision) || 0) + 1,
            activeInboundEventId: null, activeInboundLeaseUntilMs: null,
            deliveryRequestOutboundId: null, deliveryRequestAttemptId: null, deliveryRequestUntilMs: null,
            deliveryPendingOutboundId: null, deliveryPendingAttemptId: null, deliveryPendingUntilMs: null,
            pendingDeliveryMessages: {}, updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
        tx.set(eventRef, {
            status: 'completed', leaseUntilMs: null, outcome, marketingSuppressionApplied: true,
            pendingIncomingText: null, updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
        return { action: 'completed', outcome, marketingSuppressed: true }
    })
}

/**
 * Finalize an event once its reply outcome has been assembled. The stored
 * shape is intentionally descriptive only: Task 2's duplicate wrapper is
 * the only thing permitted to decide whether anything may be sent.
 */
export async function completeInboundEvent({ eventId, claimToken, outcome }) {
    const ownedClaimToken = assertInboundClaimToken(claimToken)
    const cleanOutcome = sanitizeInboundOutcome(outcome)
    assertCompletableInboundOutcome(cleanOutcome)
    const eventRef = inboundEventRef(eventId)

    return adminDb.runTransaction(async tx => {
        const snap = await tx.get(eventRef)
        const stored = snap.exists ? snap.data() : null
        const decision = decideInboundCompletion(stored, ownedClaimToken, Date.now())
        if (decision.action !== 'complete') return decision
        const leadRef = stored?.leadId ? ref(stored.leadId) : null
        const leadSnap = leadRef ? await tx.get(leadRef) : null
        const lead = leadSnap?.exists ? leadSnap.data() : null
        if (lead?.activeInboundEventId === String(eventId)) tx.set(leadRef, { activeInboundEventId: null, activeInboundLeaseUntilMs: null }, { merge: true })

        tx.set(eventRef, {
            status: 'completed',
            leaseUntilMs: null,
            outcome: cleanOutcome,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
        return { action: 'completed', outcome: cleanOutcome }
    })
}

export async function getLead(rawPhone) {
    const phone = normalizePhone(rawPhone)
    if (!phone) return null
    const snap = await ref(phone).get()
    const lead = snap.exists ? snap.data() || {} : {}
    return { phone, turns: [], stage: 'new', followUpCount: 0, objectionCount: 0, ...lead, isNew: !hasInitializedConversation(lead) }
}

/**
 * Persist one exchange. Undefined values are stripped — the Firestore
 * client rejects them, and a half-written lead is worse than a stale one.
 */
export function buildExchangePatch({ phone, incomingText, parsed, followUpAt, profileName, source, variant, isNew, openingRuntime = null, conversationContract = null }) {
    const id = normalizePhone(phone)
    if (!id) throw new Error('bad phone')

    const now = FieldValue.serverTimestamp()
    const turns = [{ role: 'user', text: String(incomingText || '').slice(0, 2000), at: Date.now() }]
    for (const m of parsed.messages || []) turns.push({ role: 'assistant', text: m, at: Date.now() })

    const patch = {
        phone: id,
        conversationInitialized: true,
        lastInboundAt: now,
        lastMessageAt: now,
        updatedAt: now,
        stage: parsed.stage,
        turns: FieldValue.arrayUnion(...turns),
        // Counted rather than derived from turns[], which is trimmed. The
        // A/B report's headline metric is "did they write back", and that
        // answer must survive compaction.
        userTurns: FieldValue.increment(1),
        // The funnel is a ladder, but `stage` only remembers the rung
        // they are on. A lead who reached offer_sent and then went quiet
        // reads as 'objection' forever, so the arm that got them there
        // never gets the credit. This keeps every rung they touched.
        stagesReached: FieldValue.arrayUnion(parsed.stage),
    }
    // Set once, on first contact. Re-writing it later would move a lead
    // between arms mid-experiment and quietly corrupt the comparison.
    if (variant && isNew) patch.variant = variant
    // When this person first wrote. `updatedAt` moves every message, so
    // without this the daily digest cannot tell a genuinely new lead from
    // an old one who happened to reply yesterday.
    if (isNew) patch.createdAt = now

    // Only write what we actually learned — a null from one turn must not
    // erase a name the customer gave three messages ago.
    if (parsed.customerName) patch.name = parsed.customerName
    else if (profileName && !parsed.customerName) patch.profileName = String(profileName).slice(0, 80)
    if (parsed.eventType) patch.eventType = parsed.eventType
    if (parsed.eventDate) patch.eventDate = parsed.eventDate
    if (parsed.celebrantName) patch.celebrantName = parsed.celebrantName
    if (parsed.packageInterest) patch.packageInterest = parsed.packageInterest
    if (parsed.notes) patch.notes = parsed.notes
    if (parsed.callbackPromised) patch.callbackPromised = parsed.callbackPromised
    if (typeof parsed.customerDeferred === 'boolean') {
        patch.customerDeferred = parsed.customerDeferred
        patch.customerCallbackAt = parsed.customerCallbackAt || null
        patch.callbackPromised = null
    }
    if (source) patch.source = String(source).slice(0, 60)
    if (parsed.objectionRaised) patch.objectionCount = FieldValue.increment(1)
    // Media is deliberately not marked SEEN here. This transaction only
    // prepares delivery records; the provider's delivered/read callback is
    // the first truthful evidence that the customer actually received it.
    // It is marked REQUESTED, though: on 21.9 a customer wrote twice inside
    // one minute and got the same spread twice, because the second turn
    // ran before the first delivery callback landed. The reply route treats
    // a requested key like a sent one when it picks the next picture.
    if (parsed.image) patch.mediaRequested = FieldValue.arrayUnion(String(parsed.image).slice(0, 80))

    // followUpAt null means "stop chasing" and must be written, not skipped.
    patch.followUpAt = followUpAt || null

    Object.assign(patch, sanitizeConversationContract(conversationContract))

    if (parsed.handoff) {
        patch.human = true
        patch.humanSince = now
        patch.handoffReason = parsed.handoffReason || null
        patch.followUpAt = null
    }

    if (openingRuntime) {
        const expectedVersion = Number(openingRuntime.expectedStateVersion || 0)
        patch.openingStateVersion = expectedVersion + 1
        patch.openingState = {
            cursor: Number(openingRuntime.state?.cursor || 0),
            waitingFor: openingRuntime.state?.waitingFor || null,
        }
        patch.openingStatus = openingRuntime.completed === true ? 'completed' : String(openingRuntime.action || 'active').slice(0, 40)
        patch.openingVariantId = normalizeOpeningVariantId(openingRuntime.variantId)
        patch.openingVariantRevision = Number(openingRuntime.variantRevision || 1)
        if (openingRuntime.enrollment?.flow) patch.openingFlow = openingRuntime.enrollment.flow
        const captures = openingRuntime.captures || {}
        if (captures.eventType) patch.eventType = String(captures.eventType).slice(0, 40)
        if (captures.eventDate) patch.eventDate = String(captures.eventDate).slice(0, 10)
        if (captures.qualificationNeedsReview === true) patch.openingQualificationNeedsReview = true
        if (captures.childPhotoReceived === true) {
            patch.childPhotoReceived = true
            patch.childPhotoMediaId = String(captures.childPhotoMediaId || '').slice(0, 500)
            patch.openingPhotoReceivedAt = now
        }
        if (captures.designApproved === true) {
            patch.openingDesignApproved = true
            patch.openingApprovalId = String(captures.approvalId || '').slice(0, 160)
        }
        if (openingRuntime.approvalRequest) {
            patch.openingApprovalRequest = {
                templateId: String(openingRuntime.approvalRequest.templateId || '').slice(0, 80),
                mediaId: String(openingRuntime.approvalRequest.mediaId || '').slice(0, 500),
                status: 'pending',
            }
        }
        if (openingRuntime.enrollment) patch.openingEnrolledAt = now
        if (openingRuntime.completed === true) patch.openingCompletedAt = now
        if (openingRuntime.replyToExposure === true) {
            patch.openingFirstReplyAt = now
            const exposedAtMs = Date.parse(String(openingRuntime.exposedAt || ''))
            if (Number.isFinite(exposedAtMs)) patch.openingFirstReplyLatencyMs = Math.max(0, Date.now() - exposedAtMs)
        }
        if (captures.childPhotoReceived === true || captures.eventType || captures.eventDate) {
            patch.openingContinuedAt = now
        }
    }

    return { id, patch }
}

export async function saveExchange(args) {
    const { id, patch } = buildExchangePatch(args)
    await adminDb.runTransaction(async tx => {
        const leadRef = ref(id)
        const snap = await tx.get(leadRef)
        const lead = snap.exists ? snap.data() || {} : {}
        if (lead.createdAt != null) delete patch.createdAt
        else if (lead.conversationInitialized === false) patch.createdAt = lead.firstContactAtMs || FieldValue.serverTimestamp()
        if (isPausedForHuman(lead) && !args.parsed?.handoff && args.parsed?.messages?.length) {
            throw Object.assign(new Error('human takeover suppresses automated reply'), { code: 'HUMAN_TAKEOVER' })
        }
        if (isPausedForHuman(lead)) { patch.followUpAt = null; patch.followUpSchedule = null }
        const plan = args.parsed?.handoff ? await prepareHumanTask(tx, id, lead, args) : null
        if (plan) {
            Object.assign(patch, plan.patch)
            writeHumanTask(tx, plan)
        }
        tx.set(leadRef, patch, { merge: true })
    })
    await compactIfNeeded(id)
    return id
}

async function compactIfNeeded(id) {
    try {
        const snap = await ref(id).get()
        const turns = snap.data()?.turns
        if (Array.isArray(turns) && turns.length > MAX_TURNS * 2) {
            await ref(id).update({ turns: turns.slice(-MAX_TURNS) })
        }
    } catch {
        // Compaction is housekeeping — never fail a customer reply over it.
        console.warn('[salesAgent] compact failed')
    }
}

export function compactLeadBestEffort(phone) {
    const id = normalizePhone(phone)
    if (id) compactIfNeeded(id)
}

function deliveryError(code) {
    const error = new Error('delivery event rejected')
    error.code = code
    return error
}

function normalizedDeliveryOwnership(stored, outboundId) {
    const hasExplicitRole = typeof stored?.deliveryRole === 'string' && !!stored.deliveryRole
    const hasExplicitAdvance = typeof stored?.advanceOnDelivery === 'boolean'
    let deliveryRole
    let advanceOnDelivery
    if (hasExplicitRole || hasExplicitAdvance) {
        deliveryRole = hasExplicitRole
            ? stored.deliveryRole
            : stored.advanceOnDelivery
                ? 'primary'
                : 'secondary'
        const requestedAdvance = hasExplicitAdvance ? stored.advanceOnDelivery : deliveryRole === 'primary'
        advanceOnDelivery = deliveryRole === 'primary' && requestedAdvance
        if (!advanceOnDelivery && deliveryRole === 'primary') deliveryRole = 'secondary'
    } else {
        advanceOnDelivery = stored?.advancesFollowUp === true
        deliveryRole = advanceOnDelivery
            ? 'primary'
            : stored?.advancesFollowUp === false
                ? 'secondary'
                : 'external'
    }
    const logicalAttemptId = typeof stored?.logicalAttemptId === 'string' && stored.logicalAttemptId
        ? stored.logicalAttemptId
        : String(stored?.outboundId || outboundId)
    return { deliveryRole, advanceOnDelivery, logicalAttemptId }
}

// Delivery evidence may arrive after a customer reply, owner intervention,
// or a new callback choice. Those decisions outrank an old transport plan.
const followUpStopped = lead => lead.paymentVerified === true || isPausedForHuman(lead) || lead.handoffPending === true
    || lead.marketingSuppressed === true || lead.followUpConsent?.status === 'revoked'
    || ['closed_won', 'closed_lost', 'handoff'].includes(lead.stage)
const activityMs = value => healthMs(value) ?? (typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null)
const followUpState = lead => ({
    stage: lead.stage || null,
    conversationRevision: Number(lead.conversationRevision) || 0,
    eventDate: lead.eventDate || null,
    followUpAt: lead.followUpAt || null,
    callbackPromised: lead.callbackPromised || null,
    customerDeferred: lead.customerDeferred === true,
    customerCallbackAt: lead.customerCallbackAt || null,
    lastInboundAtMs: activityMs(lead.lastInboundAtMs) ?? activityMs(lead.lastInboundAt),
    userTurns: Number(lead.userTurns) || 0,
})

function followUpStateUnchanged(lead, delivery, scannedLead = null) {
    const state = followUpState(lead)
    if (delivery?.leadStateAtRequest) {
        return Object.entries(delivery.leadStateAtRequest).every(([key, value]) => state[key] === value)
    }
    // Legacy delivery records lack a snapshot; a later customer message is
    // still enough evidence that their current decision must be preserved.
    const requestedAtMs = healthMs(delivery?.requestedAtMs)
    if (state.lastInboundAtMs != null
        && (requestedAtMs == null ? !scannedLead : state.lastInboundAtMs > requestedAtMs)) return false
    if (scannedLead) {
        const previous = followUpState(scannedLead)
        return Object.keys(previous).every(key => {
            const sourceKey = key === 'lastInboundAtMs' ? 'lastInboundAt' : key
            return !Object.hasOwn(scannedLead, sourceKey) || previous[key] === state[key]
        })
    }
    return true
}

function canAdvanceFollowUpSchedule(lead, delivery, scannedLead = null) {
    return !followUpStopped(lead) && lead.customerDeferred !== true && !lead.customerCallbackAt
        && !(lead.stage === 'commit_later' && !lead.callbackPromised)
        && followUpStateUnchanged(lead, delivery, scannedLead)
}

function nextStrictSchedulePatch(lead, delivery, patch = {}) {
    if (!isConversationalPolicyEnabled()) return {}
    // Old transport events cannot enroll a lead into the new consent policy.
    // A newer inbound owns its own schedule; leave it untouched.
    if (!delivery?.strictFollowUpSchedule || !followUpStateUnchanged(lead, delivery)) return {}
    const sameGeneration = delivery.strictFollowUpSchedule.generation === lead.conversationRevision
        && delivery.strictFollowUpSchedule.consentSourceMessageId === lead.followUpConsent?.sourceMessageId
    if (!sameGeneration) return {}
    const schedule = createStrictFollowUpSchedule({ ...lead, ...patch }, { nowMs: Date.now() })
    return { followUpSchedule: schedule, followUpAt: strictFollowUpDate(schedule) }
}

/**
 * Register the exact outbound part before transport starts. This is metadata,
 * not a success claim: cadence advances only on delivery or stale settlement.
 * A customer-selected callback is one permission, consumed here even if the
 * transport later fails, so it can never become a new automatic ladder.
 */
export async function prepareFollowUpDelivery({
    phone,
    outboundId,
    channel,
    part = 'text',
    text = '',
    nextFollowUpAt = null,
    stage = null,
    advancesFollowUp = true,
    demoEvidence = false,
    followUpStrategyId = undefined,
    followUpCta = undefined,
    followUpMediaKind = undefined,
    logicalAttemptId = outboundId,
    templateName = null,
    requestedAt = new Date().toISOString(),
    expectedSchedule = null,
}) {
    const strategyIds = new Set(FOLLOWUP_STRATEGY_IDS)
    const ctas = new Set(FOLLOWUP_CTAS)
    const mediaKinds = new Set(['image', 'video', 'none'])
    if (followUpStrategyId !== undefined && !strategyIds.has(followUpStrategyId)) {
        throw deliveryError('INVALID_FOLLOWUP_METADATA')
    }
    if (followUpCta !== undefined && !ctas.has(followUpCta)) {
        throw deliveryError('INVALID_FOLLOWUP_METADATA')
    }
    if (followUpMediaKind !== undefined && !mediaKinds.has(followUpMediaKind)) {
        throw deliveryError('INVALID_FOLLOWUP_METADATA')
    }
    const id = normalizePhone(phone)
    if (!id) throw deliveryError('INVALID_LEAD_ID')
    const deliveryRef = deliveryEventRef(outboundId)
    const leadRef = ref(id)
    const requestedAtMs = Date.parse(requestedAt)
    if (!Number.isFinite(requestedAtMs)) throw deliveryError('INVALID_OCCURRED_AT')

    return adminDb.runTransaction(async tx => {
        const [deliverySnap, leadSnap] = await Promise.all([tx.get(deliveryRef), tx.get(leadRef)])
        const stored = deliverySnap.exists ? deliverySnap.data() : null
        const lead = leadSnap.exists ? leadSnap.data() : {}
        const requestDay = new Date(requestedAtMs).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
        if (followUpStopped(lead)) {
            return { action: 'blocked', outboundId: null, status: 'followup-stopped' }
        }
        const strictGuard = strictFollowUpEligibility(lead, {
            nowMs: requestedAtMs, expectedSchedule: stored?.strictFollowUpSchedule || expectedSchedule,
            checkPending: false, transport: part, templateName,
            claimedAttemptNumber: stored?.strictFollowUpSchedule?.attemptNumber ?? null,
        })
        if (!strictGuard.ok) return { action: 'blocked', outboundId: null, status: strictGuard.reason }
        if (stored) return { action: 'existing', outboundId: String(outboundId), status: stored.status }
        // A secondary part belongs to the already-authorized primary, but
        // only while that exact request and its conversation state still own
        // the lease. Consuming the primary must not discard its own media.
        let callbackSibling = false
        if (!advancesFollowUp && lead.customerDeferred === true && !lead.customerCallbackAt
            && lead.deliveryRequestOutboundId && lead.deliveryRequestAttemptId === String(logicalAttemptId)
            && Number(lead.deliveryRequestUntilMs) > requestedAtMs) {
            const primarySnap = await tx.get(deliveryEventRef(lead.deliveryRequestOutboundId))
            const primary = primarySnap.exists ? primarySnap.data() : null
            callbackSibling = !!primary?.consumedCustomerCallbackAt && followUpStateUnchanged(lead, primary)
        }
        if (!strictGuard.strict && !callbackSibling && ((lead.customerDeferred === true && (!lead.customerCallbackAt || lead.customerCallbackAt > requestDay))
            || (lead.customerCallbackAt && lead.customerCallbackAt > requestDay)
            || (lead.stage === 'commit_later' && !lead.customerCallbackAt && !lead.callbackPromised))) {
            return { action: 'blocked', outboundId: null, status: 'customer-deferred' }
        }
        if (isDeliveryPending({
            status: lead.lastDeliveryStatus,
            deliveryPendingUntilMs: lead.deliveryPendingUntilMs,
        }, requestedAtMs)) {
            return { action: 'pending', outboundId: lead.deliveryPendingOutboundId || null }
        }
        const operationalStatus = pendingFollowUpStatus(lead, requestedAtMs)
        if (advancesFollowUp && operationalStatus === 'requested') {
            return {
                action: 'busy',
                outboundId: lead.deliveryRequestOutboundId || null,
                status: 'requested',
            }
        }

        const attemptNumber = Number(lead.followUpCount || 0) + 1
        const consumedCustomerCallbackAt = advancesFollowUp ? lead.customerCallbackAt || null : null
        const callbackPatch = consumedCustomerCallbackAt ? {
            customerDeferred: true,
            customerCallbackAt: null,
            callbackPromised: null,
            followUpAt: null,
        } : {}
        tx.set(deliveryRef, {
            outboundId: String(outboundId),
            channel: String(channel),
            status: 'requested',
            leadId: id,
            part: String(part),
            deliveryRole: advancesFollowUp ? 'primary' : 'secondary',
            advanceOnDelivery: !!advancesFollowUp,
            logicalAttemptId: String(logicalAttemptId),
            advancesFollowUp: !!advancesFollowUp,
            demoEvidence: demoEvidence === true,
            attemptNumber,
            nextFollowUpAt: consumedCustomerCallbackAt ? null : nextFollowUpAt || null,
            consumedCustomerCallbackAt,
            leadStateAtRequest: followUpState({ ...lead, ...callbackPatch }),
            ...(strictGuard.strict ? { strictFollowUpSchedule: strictGuard.schedule } : {}),
            stage: stage || null,
            templateName: templateName || null,
            ...(followUpStrategyId ? {
                followUpStrategyId,
                followUpCta: followUpCta || 'none',
                followUpMediaKind: followUpMediaKind || 'none',
            } : {}),
            requestedAtMs,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: false })
        const leadPatch = { ...callbackPatch }
        if (strictGuard.strict && advancesFollowUp) {
            leadPatch.followUpConsent = { ...strictGuard.consent, usedReminders: strictGuard.consent.usedReminders + 1 }
            leadPatch.unansweredSalesReminders = (Number(lead.unansweredSalesReminders) || 0) + 1
            leadPatch.lastSalesReminderClaimedAtMs = requestedAtMs
        }
        if (operationalStatus === 'stale') {
            leadPatch.lastDeliveryStatus = 'requested'
            leadPatch.deliveryPendingOutboundId = null
            leadPatch.deliveryPendingUntilMs = null
            // The attempt id too. Leaving it behind was the loop found on
            // 1.10: recordDeliveryEvent compared it with the NEW attempt,
            // saw a stranger, and dropped the new attempt's own 'accepted'
            // and 'failed' events - so the lead sat on 'requested' and was
            // sent again next run, forever.
            leadPatch.deliveryPendingAttemptId = null
            leadPatch.staleDeliveryOutboundId = lead.deliveryPendingOutboundId || null
            leadPatch.staleDeliveryDetectedAtMs = requestedAtMs
        }
        if (advancesFollowUp) {
            leadPatch.lastDeliveryStatus = 'requested'
            leadPatch.deliveryRequestOutboundId = String(outboundId)
            leadPatch.deliveryRequestAttemptId = String(logicalAttemptId)
            leadPatch.deliveryRequestUntilMs = requestedAtMs + DELIVERY_REQUEST_LEASE_MS
            if (operationalStatus === 'stale-requested') {
                leadPatch.staleRequestOutboundId = lead.deliveryRequestOutboundId || null
                leadPatch.staleRequestDetectedAtMs = requestedAtMs
            }
            leadPatch.pendingDeliveryMessages = {
                    ...(lead.pendingDeliveryMessages && typeof lead.pendingDeliveryMessages === 'object'
                        ? lead.pendingDeliveryMessages
                        : {}),
                    [String(outboundId)]: String(text || '').slice(0, 2000),
                }
        }
        if (Object.keys(leadPatch).length) {
            leadPatch.updatedAt = FieldValue.serverTimestamp()
            tx.set(leadRef, leadPatch, { merge: true })
        }
        return { action: 'requested', outboundId: String(outboundId) }
    })
}

// Re-read authoritative ownership immediately before provider dispatch. A
// prepared item is not a permanent send permission and cannot survive takeover.
export async function validateFollowUpBeforeSend({ phone, outboundId, nowMs = Date.now() }) {
    const id = normalizePhone(phone)
    if (!id) return { ok: false, reason: 'invalid-lead' }
    return adminDb.runTransaction(async tx => {
        const [leadSnap, deliverySnap] = await Promise.all([tx.get(ref(id)), tx.get(deliveryEventRef(outboundId))])
        const lead = leadSnap.exists ? leadSnap.data() || {} : {}
        const delivery = deliverySnap.exists ? deliverySnap.data() : null
        if (!delivery || delivery.leadId !== id || delivery.status !== 'requested') return { ok: false, reason: 'delivery-not-requested' }
        if (followUpStopped(lead)) return { ok: false, reason: 'followup-stopped' }
        if (!followUpStateUnchanged(lead, delivery)) return { ok: false, reason: 'conversation-changed' }
        if (lead.deliveryRequestAttemptId !== delivery.logicalAttemptId || Number(lead.deliveryRequestUntilMs) <= nowMs) return { ok: false, reason: 'delivery-lease-lost' }
        const guard = strictFollowUpEligibility(lead, {
            nowMs, expectedSchedule: delivery.strictFollowUpSchedule, checkPending: false,
            transport: delivery.part, templateName: delivery.templateName,
            claimedAttemptNumber: delivery.strictFollowUpSchedule?.attemptNumber ?? null,
        })
        return { ok: guard.ok, reason: guard.reason || null }
    })
}

/**
 * Apply one provider callback and the lead truth in the same transaction.
 * The pure state machine rejects mismatches/regressions before any write.
 */
export async function recordDeliveryEvent(event) {
    const deliveryRef = deliveryEventRef(event.outboundId)
    const eventIdRef = deliveryEventIdRef(event.eventId)
    const correlationRef = event.providerMessageId ? deliveryProviderIdRef(event.providerMessageId) : null
    const fingerprint = deliveryEventFingerprint(event)
    return adminDb.runTransaction(async tx => {
        const [deliverySnap, eventIdSnap, correlationSnap] = await Promise.all([
            tx.get(deliveryRef),
            tx.get(eventIdRef),
            correlationRef ? tx.get(correlationRef) : null,
        ])
        if (eventIdSnap.exists) {
            if (eventIdSnap.data()?.fingerprint === fingerprint) return { action: 'noop', reason: 'EVENT_REPLAY' }
            throw deliveryError('EVENT_ID_CONFLICT')
        }
        const correlatedOutboundId = correlationSnap?.exists ? correlationOutboundId(correlationSnap.data()) : null
        if (correlatedOutboundId && correlatedOutboundId !== event.outboundId) {
            throw deliveryError('PROVIDER_MESSAGE_ID_MISMATCH')
        }
        const stored = deliverySnap.exists ? deliverySnap.data() : null
        const ownership = normalizedDeliveryOwnership(stored, event.outboundId)
        const isCorrelatedMakeDeliveryRelay = (
            stored?.channel === 'whatsapp_graph'
            && event.channel === 'make'
            && (event.status === 'delivered' || event.status === 'read')
            && !!event.providerMessageId
            && correlationSnap?.exists
            && correlatedOutboundId === event.outboundId
            && (!stored?.providerMessageId || stored.providerMessageId === event.providerMessageId)
        )
        const ownedEvent = isCorrelatedMakeDeliveryRelay
            ? { ...event, channel: stored.channel }
            : event
        const decision = decideDeliveryTransition(stored, ownedEvent)
        if (decision.action === 'reject') throw deliveryError(decision.error)
        const ledgerPatch = {
            eventIdHash: deliveryEventLedgerId(event.eventId),
            fingerprint,
            createdAt: FieldValue.serverTimestamp(),
        }
        if (decision.action === 'noop') {
            tx.set(deliveryRef, {
                outboundId: String(stored?.outboundId || event.outboundId),
                ...ownership,
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true })
            tx.set(eventIdRef, ledgerPatch, { merge: false })
            if (correlationRef) {
                tx.set(correlationRef, {
                    outboundId: String(event.outboundId),
                    ...(!correlationSnap?.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
                    updatedAt: FieldValue.serverTimestamp(),
                }, { merge: true })
            }
            return decision
        }

        const leadRef = stored?.leadId ? ref(stored.leadId) : null
        const leadSnap = leadRef ? await tx.get(leadRef) : null
        const lead = leadSnap?.exists ? leadSnap.data() : {}
        const pendingMessages = lead.pendingDeliveryMessages && typeof lead.pendingDeliveryMessages === 'object'
            ? lead.pendingDeliveryMessages
            : {}
        const withoutCurrentMessage = Object.fromEntries(
            Object.entries(pendingMessages).filter(([outboundId]) => outboundId !== event.outboundId),
        )
        const { advanceOnDelivery, logicalAttemptId } = ownership
        const logicalAlreadyAdvanced = !!(advanceOnDelivery && (
            stored?.followUpAdvanced === true
            || lead.lastAdvancedDeliveryAttemptId === logicalAttemptId
            || Number(lead.followUpCount || 0) >= Number(stored.attemptNumber || 1)
        ))
        const advances = !!(decision.advanceFollowUp && advanceOnDelivery && !logicalAlreadyAdvanced)

        const deliveryPatch = {
            outboundId: String(stored?.outboundId || event.outboundId),
            ...ownership,
            eventId: event.eventId,
            channel: ownedEvent.channel,
            status: decision.nextStatus,
            providerMessageId: event.providerMessageId || stored?.providerMessageId || null,
            errorCode: event.status === 'failed' ? event.errorCode : null,
            occurredAt: event.occurredAt,
            occurredAtMs: Date.parse(event.occurredAt),
            deliveryPendingUntilMs: decision.pendingUntilMs,
            followUpAdvanced: !!(stored?.followUpAdvanced || advances),
            updatedAt: FieldValue.serverTimestamp(),
        }
        tx.set(deliveryRef, deliveryPatch, { merge: true })
        tx.set(eventIdRef, ledgerPatch, { merge: false })
        if (correlationRef) {
            tx.set(correlationRef, {
                outboundId: String(event.outboundId),
                ...(!correlationSnap?.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true })
        }

        const firstDeliveryEvidence = (decision.nextStatus === 'delivered' || decision.nextStatus === 'read')
            && stored?.status !== 'delivered'
            && stored?.status !== 'read'
        if (leadRef && firstDeliveryEvidence && (
            stored?.demoEvidence === true
            || stored?.mediaKey
            || stored?.openingExposure === true
            || stored?.modelAttributed === true
        )) {
            const evidencePatch = { updatedAt: FieldValue.serverTimestamp() }
            if (stored?.modelAttributed === true && !lead.modelDeliveredAt) {
                evidencePatch.modelDeliveredAt = event.occurredAt
            }
            if (stored?.openingExposure === true && !lead.openingExposedAt) {
                evidencePatch.openingVariantId = normalizeOpeningVariantId(stored.openingVariantId)
                evidencePatch.openingVariantRevision = Number(stored.openingVariantRevision || 1)
                evidencePatch.openingExposedAt = event.occurredAt
                evidencePatch.openingExposureOutboundId = String(event.outboundId)
            }
            if (stored?.demoEvidence === true && lead.demoEvidenceDelivered !== true) {
                evidencePatch.demoEvidenceDelivered = true
                evidencePatch.demoEvidenceDeliveredAt = event.occurredAt
            }
            if (stored?.mediaKey) {
                evidencePatch.imagesSent = FieldValue.arrayUnion(String(stored.mediaKey))
                evidencePatch.mediaSent = FieldValue.arrayUnion(String(stored.mediaKey))
                evidencePatch.pendingMediaKeys = FieldValue.arrayUnion(String(stored.mediaKey))
                evidencePatch.lastMediaAt = Date.parse(event.occurredAt)
                tx.set(mediaRef(String(stored.mediaKey)), {
                    delivered: FieldValue.increment(1),
                    updatedAt: FieldValue.serverTimestamp(),
                }, { merge: true })
            }
            tx.set(leadRef, evidencePatch, { merge: true })
        }

        if (leadRef && advanceOnDelivery) {
            if (logicalAlreadyAdvanced && decision.nextStatus !== 'read') {
                return { action: 'applied', status: decision.nextStatus, advanced: false }
            }
            const ownsPending = (!lead.deliveryPendingOutboundId || lead.deliveryPendingOutboundId === event.outboundId)
                && (!lead.deliveryRequestOutboundId || lead.deliveryRequestOutboundId === event.outboundId)
            const ownsLogicalAttempt = (!lead.deliveryPendingAttemptId || lead.deliveryPendingAttemptId === logicalAttemptId)
                && (!lead.deliveryRequestAttemptId || lead.deliveryRequestAttemptId === logicalAttemptId)
            // The lead's CURRENT request is this very outbound: whatever an
            // older, expired attempt left in the pending fields, this event
            // is the one the lead is waiting for. Without this, a stale
            // deliveryPendingAttemptId vetoed the new attempt's 'accepted'
            // and 'failed' alike (see prepareFollowUpDelivery).
            const ownsRequest = !!lead.deliveryRequestOutboundId
                && lead.deliveryRequestOutboundId === event.outboundId
                && (!lead.deliveryRequestAttemptId || lead.deliveryRequestAttemptId === logicalAttemptId)
            const owns = ownsRequest || (ownsPending && ownsLogicalAttempt)
            if (!owns && !advances) {
                if (Object.hasOwn(pendingMessages, event.outboundId) && decision.clearPending) {
                    tx.set(leadRef, { pendingDeliveryMessages: withoutCurrentMessage }, { merge: true })
                }
                return { action: 'applied', status: decision.nextStatus, advanced: false }
            }
            const controlsAttempt = owns || ownsLogicalAttempt
            const leadPatch = {
                ...(controlsAttempt ? {
                    lastDeliveryStatus: decision.nextStatus,
                    deliveryRequestOutboundId: null,
                    deliveryRequestUntilMs: null,
                    deliveryRequestAttemptId: null,
                } : {}),
                updatedAt: FieldValue.serverTimestamp(),
            }
            if (event.status === 'accepted' && advanceOnDelivery && !logicalAlreadyAdvanced && owns) {
                leadPatch.deliveryPendingOutboundId = event.outboundId
                leadPatch.deliveryPendingUntilMs = decision.pendingUntilMs
                leadPatch.deliveryPendingAttemptId = logicalAttemptId
                leadPatch.lastDeliveryError = null
            } else if (decision.clearPending && owns) {
                leadPatch.deliveryPendingOutboundId = null
                leadPatch.deliveryPendingUntilMs = null
                leadPatch.deliveryPendingAttemptId = null
                leadPatch.pendingDeliveryMessages = withoutCurrentMessage
            }
            if (event.status === 'failed' && owns) leadPatch.lastDeliveryError = event.errorCode
            if (advances) {
                if (controlsAttempt) {
                    leadPatch.deliveryPendingOutboundId = null
                    leadPatch.deliveryPendingUntilMs = null
                    leadPatch.deliveryPendingAttemptId = null
                }
                leadPatch.lastAdvancedDeliveryAttemptId = logicalAttemptId
                leadPatch.lastDeliveryError = null
                leadPatch.lastFollowUpAt = FieldValue.serverTimestamp()
                leadPatch.followUpCount = FieldValue.increment(1)
                if (controlsAttempt && canAdvanceFollowUpSchedule(lead, stored)) {
                    leadPatch.lastMessageAt = FieldValue.serverTimestamp()
                    leadPatch.followUpAt = stored.nextFollowUpAt || null
                    if (stored.stage) leadPatch.stage = stored.stage
                }
                leadPatch.pendingDeliveryMessages = controlsAttempt ? {} : withoutCurrentMessage
                if (['proof_site', 'resolve_blocker', 'qualified_offer', 'graceful_close'].includes(stored?.followUpStrategyId)) {
                    leadPatch.lastFollowUpStrategyId = stored.followUpStrategyId
                    leadPatch.lastFollowUpCta = ['website', 'reply', 'coupon', 'none'].includes(stored?.followUpCta)
                        ? stored.followUpCta
                        : 'none'
                    leadPatch.lastFollowUpMediaKind = ['image', 'video', 'none'].includes(stored?.followUpMediaKind)
                        ? stored.followUpMediaKind
                        : 'none'
                }
                leadPatch.turns = FieldValue.arrayUnion({
                    role: 'assistant',
                    text: String(pendingMessages[event.outboundId] || '').slice(0, 2000),
                    at: Date.parse(event.occurredAt),
                })
            }
            if (isConversationalPolicyEnabled() && advances) {
                // Never let the legacy date-only ladder mint a strict schedule.
                delete leadPatch.followUpAt
                Object.assign(leadPatch, nextStrictSchedulePatch(lead, stored, leadPatch))
            }
            tx.set(leadRef, leadPatch, { merge: true })
        }

        return { action: 'applied', status: decision.nextStatus, advanced: advances }
    })
}

/** Resolve Meta's provider message ID without storing the ID itself or a phone. */
export async function resolveProviderMessageOutboundId(providerMessageId) {
    const correlationRef = deliveryProviderIdRef(providerMessageId)
    return adminDb.runTransaction(async tx => {
        const snap = await tx.get(correlationRef)
        if (!snap.exists) throw deliveryError('PROVIDER_MESSAGE_ID_NOT_FOUND')
        const outboundId = correlationOutboundId(snap.data())
        if (!outboundId) throw deliveryError('PROVIDER_MESSAGE_ID_NOT_FOUND')
        return outboundId
    })
}

// Kept as the named provider-acceptance seam for direct callers. It does
// not advance the follow-up cadence; only a later delivered/read callback can.
export const markFollowUpAccepted = recordDeliveryEvent

/** Claim one immutable daily digest attempt before any provider call. */
export async function prepareDigestDelivery({ outboundId, requestedAt = new Date().toISOString(), attemptNumber = 1 }) {
    const requestedAtMs = Date.parse(requestedAt)
    if (!Number.isFinite(requestedAtMs)) throw deliveryError('INVALID_OCCURRED_AT')
    const deliveryRef = deliveryEventRef(outboundId)
    return adminDb.runTransaction(async tx => {
        const snap = await tx.get(deliveryRef)
        if (snap.exists) {
            return { action: 'existing', outboundId: String(outboundId), status: snap.data()?.status || 'requested' }
        }
        tx.set(deliveryRef, {
            outboundId: String(outboundId),
            channel: 'whatsapp_graph',
            status: 'requested',
            kind: 'daily_digest',
            part: 'template',
            deliveryRole: 'owner_digest',
            advanceOnDelivery: false,
            logicalAttemptId: String(outboundId),
            advancesFollowUp: false,
            attemptNumber: Math.max(1, Number.parseInt(attemptNumber, 10) || 1),
            requestedAtMs,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: false })
        return { action: 'requested', outboundId: String(outboundId) }
    })
}

/** Sanitized digest transport state consumed by the operational health view. */
export async function recordDigestOutcome({ status, errorCode = null, outboundId, occurredAt }) {
    if (status !== 'digest_accepted' && status !== 'digest_failed') throw deliveryError('INVALID_DIGEST_STATUS')
    if (status === 'digest_failed' && !DELIVERY_ERROR_CODES.includes(errorCode)) throw deliveryError('INVALID_ERROR_CODE')
    const runtimeRef = adminDb.collection(RUNTIME_COLLECTION).doc('digest')
    return adminDb.runTransaction(async tx => {
        tx.set(runtimeRef, {
            status,
            errorCode: status === 'digest_failed' ? errorCode : null,
            outboundId: String(outboundId || '').slice(0, 500),
            occurredAt: String(occurredAt || '').slice(0, 100),
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: false })
    })
}

// Leads due for a follow-up today. `stage` filters are applied in memory
// because Firestore would need a composite index for the combination and
// the daily volume here is tiny.
export async function dueFollowUps(todayISO, limit = 40) {
    const snap = await adminDb
        .collection(COLLECTION)
        .where('followUpAt', '<=', todayISO)
        .get()
    const out = []
    for (const doc of snap.docs) {
        const lead = { phone: doc.id, ...doc.data() }
        if (!isDueFollowUpCandidate(lead, todayISO)) continue
        out.push(lead)
    }
    return selectDueFollowUps(out, todayISO, limit)
}

// Health needs only enough information to distinguish 25 from 26 due rows,
// and must never turn a saturated in-memory filter into a false zero. A full
// 78-row window with fewer than 26 eligible rows therefore returns unknown.
// No lead IDs, phone numbers, or row bodies leave this function.
const FOLLOWUP_HEALTH_RED_COUNT = 26
const FOLLOWUP_HEALTH_SCAN_LIMIT = FOLLOWUP_HEALTH_RED_COUNT * 3

export async function readDueFollowUpHealth(todayISO) {
    const snap = await adminDb
        .collection(COLLECTION)
        .where('followUpAt', '<=', todayISO)
        .limit(FOLLOWUP_HEALTH_SCAN_LIMIT)
        .get()
    const docs = snap.docs || []
    let dueFollowUps = 0
    for (const doc of docs) {
        const lead = { phone: doc.id, ...doc.data() }
        if (!isDueFollowUpCandidate(lead, todayISO)) continue
        dueFollowUps += 1
        if (dueFollowUps >= FOLLOWUP_HEALTH_RED_COUNT) break
    }
    const scanSaturated = docs.length >= FOLLOWUP_HEALTH_SCAN_LIMIT
    return {
        dueFollowUps: scanSaturated && dueFollowUps < FOLLOWUP_HEALTH_RED_COUNT ? null : dueFollowUps,
        scanSaturated,
        scanned: docs.length,
    }
}

// ── Is this already a customer? ─────────────────────────────────────
//
// Someone who already bought is not a lead, and pitching them the three
// packages is worse than saying nothing: it tells them nobody at this
// company knows who they are. Their questions belong to a human.
//
// `weddings.ownerPhone` is whatever the WooCommerce billing form
// captured, so it is stored unnormalised — '050-123-4567', '0501234567',
// '+972501234567'. Rather than scanning the whole collection on every
// inbound message, we ask for the handful of shapes a person actually
// types. It misses exotic formatting, and that is an acceptable miss:
// the fallback is the bot behaving exactly as it does today.
//
// Called on a lead's first message and bounded support-like continuations
// from existing leads. The route still requires a real ownerPhone match;
// support wording alone does not prove a customer relationship or payment.
export async function findCustomerByPhone(rawPhone, { strict = false } = {}) {
    const intl = normalizePhone(rawPhone) // 972501234567
    if (!intl || intl.length < 11) return null
    const local = `0${intl.slice(3)}` // 0501234567
    const variants = [
        intl,
        `+${intl}`,
        local,
        `${local.slice(0, 3)}-${local.slice(3)}`, // 050-1234567
        `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`, // 050-123-4567
    ]
    try {
        const snap = await adminDb.collection('weddings').where('ownerPhone', 'in', variants).limit(1).get()
        if (snap.empty) return null
        const doc = snap.docs[0]
        const d = doc.data() || {}
        return { weddingId: doc.id, ownerName: d.ownerName || null, ownerEmail: d.ownerEmail || null }
    } catch {
        console.warn('[salesAgent] customer lookup failed')
        // Unknown customer status must not be misrepresented as a successful
        // negative lookup when the strict sales policy is in use.
        if (strict) throw Object.assign(new Error('customer lookup unavailable'), { code: 'CUSTOMER_LOOKUP_UNAVAILABLE' })
        return null
    }
}

// ── Deleting ────────────────────────────────────────────────────────
//
// A lead document holds a real person's phone number and the whole
// conversation, so deletion is genuine data loss with no undo. It exists
// for one honest reason: the test leads created while building this
// agent are sitting in the same collection as real customers, dragging
// the funnel numbers and the A/B arms toward nonsense.
//
// Bounded at 200 per call — enough for any cleanup, small enough that a
// mistake is survivable.
export async function deleteLeads(phones = []) {
    const ids = [...new Set(phones.map(normalizePhone).filter(Boolean))].slice(0, 200)
    if (ids.length === 0) return { deleted: 0, ids: [] }
    const batch = adminDb.batch()
    for (const id of ids) batch.delete(ref(id))
    await batch.commit()
    return { deleted: ids.length, ids }
}

// ── The admin table ─────────────────────────────────────────────────
//
// Every lead, newest first, for the management screen.
//
// No `orderBy` and no server-side stage filter, on purpose. Firestore
// would drop any document missing the ordered field — and the earliest
// leads predate `updatedAt` — so an ordered query would silently hide
// exactly the rows most likely to be interesting. Sorting happens in
// memory instead, where a missing field is just an old lead.
//
// `turns` is stripped here rather than in the route: 24 turns × 2000
// chars per lead is megabytes over the wire for a list nobody reads in
// full. The transcript is fetched one lead at a time by getLead().
export async function listLeads({ limit = 500 } = {}) {
    const snap = await adminDb.collection(COLLECTION).limit(limit).get()
    return snap.docs.map(doc => {
        const { turns, ...rest } = doc.data() || {}
        return {
            ...rest,
            phone: doc.id,
            turnCount: Array.isArray(turns) ? turns.length : 0,
        }
    })
}

// Fields the admin screen is allowed to change by hand. A whitelist and
// not a spread: this endpoint is reachable with the shared secret, and
// letting it write arbitrary keys would let a leaked secret rewrite the
// conversation history rather than merely annoy a customer.
const ADMIN_PATCHABLE = new Set(['stage', 'followUpAt', 'notes', 'eventType', 'eventDate', 'name', 'packageInterest'])

export async function adminPatchLead(phone, patch = {}) {
    const id = normalizePhone(phone)
    if (!id) throw new Error('bad phone')
    const clean = { updatedAt: FieldValue.serverTimestamp() }
    for (const [k, v] of Object.entries(patch)) {
        if (!ADMIN_PATCHABLE.has(k)) continue
        // undefined is rejected by Firestore; null is meaningful here
        // (followUpAt: null is precisely how you stop the chasing).
        clean[k] = v === undefined ? null : v
    }
    await ref(id).set(clean, { merge: true })
    return id
}

// ── Closing the loop ────────────────────────────────────────────────
// Called from the WooCommerce webhook the moment a payment lands. This
// is what stops a paying customer from receiving "עוד מתלבטים?" the next
// morning — the single most damaging thing an automated funnel can do.
// A paid checkout may have been forwarded to another payer. Stop marketing to
// its originating lead without transferring the payer's book/owner identity.
export async function suppressBoundCheckoutLead({ order, trustedSource = false, db = adminDb, nowMs = Date.now() }) {
    if (trustedSource !== true) return { suppressed: false, reason: 'untrusted_order_source' }
    return db.runTransaction(async tx => {
        const binding = await resolveOrderAttribution({ order, db, transaction: tx, trustedSource: true, nowMs })
        if (binding.status !== 'bound') return { suppressed: false, reason: binding.reason }
        const query = db.collection(COLLECTION).where('attributionContactHash', '==', binding.contactHash).limit(2)
        const matches = await tx.get(query)
        if (matches.docs.length !== 1) return { suppressed: false, reason: matches.docs.length ? 'ambiguous_bound_lead' : 'bound_lead_missing' }
        const matched = matches.docs[0]
        if (crypto.createHash('sha256').update(matched.id).digest('hex') !== binding.contactHash) return { suppressed: false, reason: 'bound_lead_hash_mismatch' }
        tx.set(db.collection(COLLECTION).doc(matched.id), {
            stage: 'closed_won', boundCheckoutPaid: true, boundCheckoutOrderId: binding.bindingId,
            marketingSuppressed: true, marketingSuppressedAtMs: nowMs,
            followUpAt: null, followUpSchedule: null, callbackPromised: null, customerCallbackAt: null,
            followUpConsent: null, deliveryRequestOutboundId: null, deliveryRequestAttemptId: null, deliveryRequestUntilMs: null,
            deliveryPendingOutboundId: null, deliveryPendingAttemptId: null, deliveryPendingUntilMs: null, pendingDeliveryMessages: {},
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
        return { suppressed: true, reason: null }
    })
}
export async function closeLeadOnPurchase({ phone, orderId, weddingId, amount, packageId, buyerName, paymentSource }) {
    const id = normalizePhone(phone)
    if (!id) return null
    const patch = {
        stage: 'closed_won',
        followUpAt: null,
        followUpSchedule: null,
        deliveryRequestOutboundId: null,
        deliveryRequestAttemptId: null,
        deliveryRequestUntilMs: null,
        deliveryPendingOutboundId: null,
        deliveryPendingAttemptId: null,
        deliveryPendingUntilMs: null,
        pendingDeliveryMessages: {},
        closedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    }
    const verifiedOrderId = String(orderId || '').trim()
    if (verifiedOrderId) patch.orderId = verifiedOrderId
    if (weddingId) patch.weddingId = String(weddingId)
    if (amount != null && Number.isFinite(Number(amount))) patch.amount = Number(amount)
    if (packageId) patch.packageInterest = packageId
    const normalizedBuyerName = typeof buyerName === 'string' ? buyerName.trim().slice(0, 160) : ''
    if (normalizedBuyerName && normalizedBuyerName !== id) patch.name = normalizedBuyerName
    const normalizedPaymentSource = typeof paymentSource === 'string' ? paymentSource.trim().slice(0, 48) : ''
    if (normalizedPaymentSource) patch.paymentSource = normalizedPaymentSource

    // Legacy/manual callers may still close a lead, but without an order
    // identity they can never create a payment fact or train experiments.
    if (!verifiedOrderId) {
        await ref(id).set(patch, { merge: true })
        return id
    }

    const leadRef = ref(id)
    const markerRef = verifiedOrderRef(verifiedOrderId)
    const outcome = await adminDb.runTransaction(async tx => {
        const [markerSnap, leadSnap] = await Promise.all([tx.get(markerRef), tx.get(leadRef)])
        const lead = leadSnap.exists ? leadSnap.data() || {} : {}
        const media = [...new Set([...(lead.imagesSent || []), ...(lead.mediaSent || [])])]
        const verifiedPatch = {
            ...patch,
            paymentVerified: true,
            verifiedOrderId,
        }
        if (!markerSnap.exists) {
            verifiedPatch.paymentVerifiedAt = FieldValue.serverTimestamp()
            if (lead.modelAssignment) verifiedPatch.modelPaymentAttributedAt = FieldValue.serverTimestamp()
        }
        tx.set(leadRef, verifiedPatch, { merge: true })
        if (markerSnap.exists) return { credited: false, media: [] }

        // The document id is already the order hash. No phone, order id,
        // transcript, or provider payload is duplicated into this ledger.
        tx.set(markerRef, {
            verifiedAt: FieldValue.serverTimestamp(),
            leadHash: crypto.createHash('sha256').update(id).digest('hex'),
        })
        return { credited: true, media }
    })

    // Attribution is diagnostic and intentionally happens after the
    // durable sale. A replay cannot increment it twice because the
    // order-keyed transaction above owns the single credit decision.
    if (outcome.credited && outcome.media.length) await creditMediaWin(outcome.media)
    return id
}

// Only authenticated owner/control handlers may call release. Resolution never
// calls this implicitly; no timer or customer/model text is a release authority.
export async function setHuman(phone, human, reason = null, options = {}) {
    if (human) return requestHumanHandoff({ phone, reason, ...options })
    return updateHumanHandoff({ phone, action: 'release', actor: options.actor || 'authenticated_owner' })
}

export async function requestHumanHandoff({ phone, reason = null, actor = 'sales_agent', ...request }) {
    const id = normalizePhone(phone)
    if (!id) throw Object.assign(new Error('invalid lead'), { code: 'INVALID_LEAD_ID' })
    return adminDb.runTransaction(async tx => {
        const leadRef = ref(id)
        const snap = await tx.get(leadRef)
        const lead = snap.exists ? snap.data() || {} : {}
        const plan = await prepareHumanTask(tx, id, lead, { ...request, reason, actor })
        writeHumanTask(tx, plan)
        tx.set(leadRef, plan.patch, { merge: true })
        return plan.result
    })
}

export async function updateHumanHandoff({ phone, taskId = null, action, actor }) {
    const id = normalizePhone(phone)
    if (!id) throw Object.assign(new Error('invalid lead'), { code: 'INVALID_LEAD_ID' })
    return adminDb.runTransaction(async tx => {
        const leadRef = ref(id)
        const snap = await tx.get(leadRef)
        const lead = snap.exists ? snap.data() || {} : {}
        if (taskId && taskId !== lead.humanTaskId) throw Object.assign(new Error('task is not current for lead'), { code: 'TASK_MISMATCH' })
        // Explicit release of a legacy pause gets a task/audit record first.
        const plan = !lead.humanTaskId && isPausedForHuman(lead)
            ? await prepareHumanTask(tx, id, lead, { reason: lead.handoffReason, actor })
            : null
        const currentId = plan?.task.id || lead.humanTaskId
        if (!currentId) throw Object.assign(new Error('human task not found'), { code: 'TASK_NOT_FOUND' })
        const taskRef = plan?.taskRef || adminDb.collection(HUMAN_TASKS_COLLECTION).doc(currentId)
        const taskSnap = plan ? null : await tx.get(taskRef)
        const task = plan?.task || (taskSnap?.exists ? taskSnap.data() : null)
        if (task && task.leadId !== id) throw Object.assign(new Error('task ownership mismatch'), { code: 'TASK_MISMATCH' })
        const transition = transitionHumanTask(task, action, actor)
        if (!transition.changed) return { ok: true, taskId: currentId, status: transition.status, changed: false }
        if (plan) writeHumanTask(tx, plan)
        tx.set(taskRef, transition.patch, { merge: true })
        tx.set(leadRef, {
            ...(plan?.patch || {}),
            humanTaskStatus: transition.status,
            ...(action === 'release' ? {
                human: false, humanTakeover: false, humanSince: null, handoffReason: null, handoffPending: false, pendingHumanRequestEventId: null, pendingHumanRequestText: null, pendingHumanRequestAtMs: null,
                humanReleasedAtMs: Date.now(), humanReleasedBy: String(actor).slice(0, 160),
                // Release allows future inbound responses; it never restarts a
                // stale reminder, pending response, or previously consumed consent.
                followUpAt: null, followUpSchedule: null,
                deliveryRequestOutboundId: null, deliveryRequestAttemptId: null, deliveryRequestUntilMs: null,
                deliveryPendingOutboundId: null, deliveryPendingAttemptId: null, deliveryPendingUntilMs: null,
                pendingDeliveryMessages: {},
            } : { human: true, humanTakeover: true }),
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
        return { ok: true, taskId: currentId, status: transition.status, changed: true }
    })
}

export async function listHumanHandoffs({ limit = 50 } = {}) {
    const snap = await adminDb.collection(HUMAN_TASKS_COLLECTION).orderBy('updatedAtMs', 'desc').limit(Math.min(100, Math.max(1, Number(limit) || 50))).get()
    return snap.docs.map(doc => ({ ...doc.data(), id: doc.id }))
}

export async function getHumanHandoff(taskId) {
    if (!/^[a-f0-9]{32}$/.test(String(taskId || ''))) return null
    const snap = await adminDb.collection(HUMAN_TASKS_COLLECTION).doc(taskId).get()
    return snap.exists ? { ...snap.data(), id: taskId } : null
}

export const SALES_LEADS_COLLECTION = COLLECTION

// ── What it costs ───────────────────────────────────────────────────
//
// Every model call is metered as it happens and rolled up into one
// document per Israeli calendar day, plus a running total.
//
// Per-day documents rather than a query over the leads: the leads
// collection grows without bound and "what did today cost" would become
// a full scan of it, run every time the admin screen is opened. Thirty
// small documents answer every window the UI asks for — today, the last
// week, the last month — at thirty reads flat.
//
// The day boundary is Israel's, not UTC. A bot answering at 01:00 local
// belongs to that morning's number, and rolling over at 02:00 or 03:00
// would put it on the wrong day in a way nobody would ever notice was
// wrong.
const USAGE_COLLECTION = 'sales_usage'
const TOTALS_DOC = '_totals'

const usageRef = id => adminDb.collection(USAGE_COLLECTION).doc(id)

/**
 * Record the cost of one call.
 *
 * Deliberately never throws. This is bookkeeping attached to a customer
 * conversation, and a failed write here must not cost somebody an answer
 * — the money is the cheaper of the two things to lose.
 */
export async function recordSpend({ provider, model, usd, usage, images = 0, todayISO }) {
    try {
        const day = todayISO || isoInIsrael()
        const u = usage || {}
        const inc = FieldValue.increment
        const patch = {
            usd: inc(Number(usd) || 0),
            calls: inc(1),
            images: inc(Number(images) || 0),
            inputTokens: inc(Number(u.input_tokens) || 0),
            outputTokens: inc(Number(u.output_tokens) || 0),
            cacheReadTokens: inc(Number(u.cache_read_input_tokens) || 0),
            cacheWriteTokens: inc(Number(u.cache_creation_input_tokens) || 0),
            // Kept per provider so the screen can say which half of the
            // bill is the salesperson and which half is the pictures.
            [`${provider}Usd`]: inc(Number(usd) || 0),
            [`${provider}Calls`]: inc(1),
            updatedAt: FieldValue.serverTimestamp(),
            // Written every time on purpose: if the model is swapped, the
            // most recent id is the one whose rates the number reflects.
            lastModel: String(model || ''),
        }
        await Promise.all([
            usageRef(day).set({ date: day, ...patch }, { merge: true }),
            usageRef(TOTALS_DOC).set(patch, { merge: true }),
        ])
    } catch {
        console.error('[sales-agent] recordSpend failed')
    }
}

const emptyDay = date => ({ date, usd: 0, calls: 0, images: 0, anthropicUsd: 0, openaiUsd: 0 })

function daysBack(n, todayISO) {
    const base = Date.parse(`${todayISO}T12:00:00Z`)
    const out = []
    for (let i = 0; i < n; i++) out.push(new Date(base - i * 86400000).toISOString().slice(0, 10))
    return out
}

/**
 * Spend for the windows the admin screen shows.
 *
 * `total` comes from the running document rather than summing the days,
 * because the days are only kept for a month and a total that silently
 * meant "the last 30 days" would be the most misleading number on the
 * page.
 */
export async function readSpend({ days = 30, todayISO } = {}) {
    const today = todayISO || isoInIsrael()
    const dates = daysBack(days, today)
    const refs = [...dates.map(usageRef), usageRef(TOTALS_DOC)]

    let snaps
    try {
        snaps = await adminDb.getAll(...refs)
    } catch {
        console.error('[sales-agent] readSpend failed')
        return null
    }

    const totalsSnap = snaps[snaps.length - 1]
    const byDay = dates.map((date, i) => {
        const d = snaps[i]?.exists ? snaps[i].data() : null
        return d ? { ...emptyDay(date), ...d, date } : emptyDay(date)
    })

    const sum = (from, to) => byDay.slice(from, to).reduce((acc, d) => acc + (Number(d.usd) || 0), 0)
    const totals = totalsSnap?.exists ? totalsSnap.data() : null

    return {
        today: byDay[0]?.usd || 0,
        yesterday: byDay[1]?.usd || 0,
        week: sum(0, 7),
        month: sum(0, 30),
        total: Number(totals?.usd) || 0,
        totalCalls: Number(totals?.calls) || 0,
        totalImages: Number(totals?.images) || 0,
        anthropicTotal: Number(totals?.anthropicUsd) || 0,
        openaiTotal: Number(totals?.openaiUsd) || 0,
        // Oldest first reads better as a sparkline than newest first.
        byDay: byDay.slice(0, 14).reverse().map(d => ({ date: d.date, usd: Number(d.usd) || 0 })),
        // The earliest day inside the window that saw any spend. Not the
        // date tracking began — if the bot has been running longer than
        // the window it is simply the window's edge. The screen says
        // "since tracking started" rather than printing a date, because a
        // date this can only sometimes know is worse than no date.
        firstActiveDay: [...byDay].reverse().find(d => (Number(d.calls) || 0) > 0)?.date || null,
    }
}

// ── Putting a forgotten lead back on the ladder ─────────────────────
//
// The sweep (see sweep.js) finds live leads that lost their next step.
// Reviving one is deliberately the smallest possible write: set
// `followUpAt` to today and let every existing rule - the ladder, the
// quiet hours, the three-attempt ceiling, the handoff pause - apply
// exactly as it would to any other due lead. Nothing here decides to
// message anybody; it only puts them back in the queue that does.
//
// `revivedCount` is not bookkeeping for its own sake. If the sweep is
// reviving the same leads week after week, something upstream is
// dropping writes, and this counter is the only place that would show.
export async function reviveOrphans(phones = [], todayISO) {
    if (isConversationalPolicyEnabled()) return { revived: 0, ids: [] }
    const candidates = [...new Set(phones.map(normalizePhone).filter(Boolean))].slice(0, 100)
    if (!candidates.length || !todayISO) return { revived: 0, ids: [] }
    const ids = []
    for (const id of candidates) {
        const revived = await adminDb.runTransaction(async tx => {
            const leadRef = ref(id)
            const snap = await tx.get(leadRef)
            if (!snap.exists) return false
            const lead = { ...snap.data(), phone: id }
            // The scan can predate a reply, a payment, a handoff or a chosen
            // callback. Re-run orphan eligibility against transaction truth.
            if (followUpStopped(lead) || lead.customerCallbackAt
                || pendingFollowUpStatus(lead) !== 'none' || !findOrphans([lead]).length) return false
            tx.set(leadRef, {
                followUpAt: todayISO,
                revivedAt: FieldValue.serverTimestamp(),
                revivedCount: FieldValue.increment(1),
            }, { merge: true })
            return true
        })
        if (revived) ids.push(id)
    }
    return { revived: ids.length, ids }
}

/**
 * Count an expired attempt as the touch it was. A fresh transactional read
 * prevents stale scans from replacing a new request, customer decision or
 * terminal state. Only unchanged, active conversations continue the ladder.
 */
export async function settleStaleDeliveries(leads = [], todayISO) {
    const rows = (Array.isArray(leads) ? leads : []).filter(l => l && l.phone).slice(0, 100)
    if (!rows.length || !todayISO) return { settled: 0, ids: [] }
    const ids = []
    for (const scanned of rows) {
        const id = normalizePhone(scanned.phone)
        if (!id || ids.includes(id)) continue
        const settled = await adminDb.runTransaction(async tx => {
            const leadRef = ref(id)
            const snap = await tx.get(leadRef)
            if (!snap.exists) return false
            const lead = snap.data()
            if (!['stale', 'stale-requested'].includes(pendingFollowUpStatus(lead))) return false
            const outboundId = lead.deliveryRequestOutboundId || lead.deliveryPendingOutboundId || null
            const scannedOutboundId = scanned.deliveryRequestOutboundId || scanned.deliveryPendingOutboundId || null
            if (scannedOutboundId && scannedOutboundId !== outboundId) return false
            if (Object.hasOwn(scanned, 'followUpCount') && Number(scanned.followUpCount || 0) !== Number(lead.followUpCount || 0)) return false
            const deliveryRef = outboundId ? deliveryEventRef(outboundId) : null
            const deliverySnap = deliveryRef ? await tx.get(deliveryRef) : null
            const delivery = deliverySnap?.exists ? deliverySnap.data() : null
            const logicalAttemptId = delivery?.logicalAttemptId || lead.deliveryRequestAttemptId || lead.deliveryPendingAttemptId || outboundId
            const alreadyCounted = delivery?.followUpAdvanced === true || (logicalAttemptId && lead.lastAdvancedDeliveryAttemptId === logicalAttemptId)
                || (delivery?.attemptNumber && Number(lead.followUpCount || 0) >= Number(delivery.attemptNumber))
            const attempt = Math.max(0, Number(lead.followUpCount) || 0) + (alreadyCounted ? 0 : 1)
            const patch = {
                followUpCount: attempt,
                ...(!alreadyCounted ? { lastFollowUpAt: FieldValue.serverTimestamp() } : {}),
                ...(logicalAttemptId ? { lastAdvancedDeliveryAttemptId: logicalAttemptId } : {}),
                lastDeliveryStatus: 'stale',
                deliveryPendingOutboundId: null,
                deliveryPendingUntilMs: null,
                deliveryPendingAttemptId: null,
                deliveryRequestOutboundId: null,
                deliveryRequestUntilMs: null,
                deliveryRequestAttemptId: null,
                pendingDeliveryMessages: {},
                staleSettledAt: FieldValue.serverTimestamp(),
                staleSettledCount: FieldValue.increment(1),
                updatedAt: FieldValue.serverTimestamp(),
            }
            if (followUpStopped(lead) || (lead.customerDeferred === true && !lead.customerCallbackAt)
                || (lead.stage === 'commit_later' && !lead.customerCallbackAt && !lead.callbackPromised)) {
                patch.followUpAt = null
            } else if (!alreadyCounted && canAdvanceFollowUpSchedule(lead, delivery, scanned)) {
                patch.followUpAt = nextFollowUpDate({
                    stage: lead.stage,
                    attempt,
                    eventDate: lead.eventDate || null,
                    todayISO,
                    callbackPromised: lead.callbackPromised || null,
                })
            }
            if (isConversationalPolicyEnabled()) {
                delete patch.followUpAt
                Object.assign(patch, nextStrictSchedulePatch(lead, delivery, patch))
                if (followUpStopped(lead)) { patch.followUpAt = null; patch.followUpSchedule = null }
            }
            tx.set(leadRef, patch, { merge: true })
            // Keep the provider status truthful; only accounting is settled.
            // A late delivered/read callback may still add delivery evidence.
            if (deliveryRef && delivery) tx.set(deliveryRef, { followUpAdvanced: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
            return true
        })
        if (settled) ids.push(id)
    }
    return { settled: ids.length, ids }
}

// ── The media library ───────────────────────────────────────────────
//
// Everything Lord uploads from the leads screen, plus the counters that
// say whether it was worth uploading. One document per asset, keyed by
// the same string the model puts in its `image` field.
//
// The counters live on the asset document rather than in a separate
// stats collection because they are only ever read together with it,
// and a FieldValue.increment on a doc we are already fetching is free
// compared with a second collection to keep in sync.
const MEDIA_COLLECTION = 'sales_media'

const mediaRef = key => adminDb.collection(MEDIA_COLLECTION).doc(String(key))

// The library is read on EVERY inbound message to build the prompt, and
// it changes about once a week. A short cache turns that into roughly
// one Firestore query per lambda per minute. Sixty seconds is short
// enough that an upload feels immediate and long enough to matter.
const MEDIA_TTL_MS = 60_000
let mediaCache = { at: 0, items: null }

export async function listMedia({ fresh = false } = {}) {
    if (!fresh && mediaCache.items && Date.now() - mediaCache.at < MEDIA_TTL_MS) {
        return mediaCache.items
    }
    try {
        const snap = await adminDb.collection(MEDIA_COLLECTION).limit(100).get()
        const items = snap.docs.map(d => ({ key: d.id, ...d.data() }))
        mediaCache = { at: Date.now(), items }
        return items
    } catch {
        // A library that fails to load must degrade to the built-in
        // catalog, never to a broken reply. Serving a stale list is the
        // better failure here.
        console.warn('[salesAgent] media list failed')
        return mediaCache.items || []
    }
}

export async function saveMedia(item = {}) {
    const key = String(item.key || '').trim()
    if (!key) throw new Error('bad key')
    const patch = {
        key,
        kind: item.kind === 'video' ? 'video' : 'image',
        url: String(item.url || ''),
        label: String(item.label || '').slice(0, 80),
        // `when` is the only field the model reads as an instruction, so
        // it is the one worth writing carefully: it is what decides
        // whether the asset gets sent to the right person.
        when: String(item.when || '').slice(0, 200),
        caption: String(item.caption || '').slice(0, 200),
        disabled: !!item.disabled,
        updatedAt: FieldValue.serverTimestamp(),
    }
    if (item.bytes != null) patch.bytes = Number(item.bytes) || 0
    if (item.createdAt === undefined) patch.createdAt = FieldValue.serverTimestamp()
    await mediaRef(key).set(patch, { merge: true })
    mediaCache = { at: 0, items: null }
    return key
}

export async function deleteMedia(key) {
    const id = String(key || '').trim()
    if (!id) return null
    await mediaRef(id).delete()
    mediaCache = { at: 0, items: null }
    return id
}

// ── The three counters ──────────────────────────────────────────────
//
// All of them swallow their errors. A miscounted send is a slightly
// worse ranking next week; a throw here is a customer who got no reply.

const bump = async (keys, field, by = 1) => {
    const list = [...new Set((Array.isArray(keys) ? keys : [keys]).filter(Boolean))].slice(0, 20)
    if (!list.length) return
    try {
        const batch = adminDb.batch()
        for (const key of list) {
            batch.set(mediaRef(key), { [field]: FieldValue.increment(by) }, { merge: true })
        }
        await batch.commit()
    } catch {
        console.warn(`[salesAgent] media ${field} failed`)
    }
}

export const recordMediaSent = keys => bump(keys, 'sent')

// Credited when they write back within a day of receiving something.
// Not proof it was the picture that did it — nothing cheap is — but a
// person who answers within a day of seeing a book is a different
// person from one who does not, and that difference is the signal.
export const creditMediaReply = keys => bump(keys, 'replied')

// Credited to EVERY asset the conversation saw, not just the last one.
// Last-touch would hand the credit to whatever happened to be sent near
// the finish line, which in this funnel is usually the payment link.
export const creditMediaWin = keys => bump(keys, 'won')

// How long after a send a reply still counts as a reply to it.
const REPLY_WINDOW_MS = 24 * 3600 * 1000

/**
 * Called on every inbound message, before the reply is written.
 *
 * Returns the keys it credited so the caller can clear them, because
 * crediting the same reply twice would inflate exactly the asset that
 * started a long conversation.
 */
export async function creditPendingMedia(lead, nowMs = Date.now()) {
    const keys = Array.isArray(lead?.pendingMediaKeys) ? lead.pendingMediaKeys : []
    if (!keys.length) return []
    const at = lead.lastMediaAt?.toMillis ? lead.lastMediaAt.toMillis() : Number(lead.lastMediaAt)
    if (!Number.isFinite(at) || nowMs - at > REPLY_WINDOW_MS) {
        // Too late to count, but still clear it: leaving it pending
        // means a reply three weeks from now credits a picture nobody
        // remembers seeing.
        await clearPendingMedia(lead.phone)
        return []
    }
    await creditMediaReply(keys)
    await clearPendingMedia(lead.phone)
    return keys
}

async function clearPendingMedia(phone) {
    const id = normalizePhone(phone)
    if (!id) return
    try {
        await ref(id).set({ pendingMediaKeys: [] }, { merge: true })
    } catch {
        console.warn('[salesAgent] clear pending media failed')
    }
}

/** Every asset this conversation saw — the input to win attribution. */
export async function mediaSeenBy(phone) {
    const id = normalizePhone(phone)
    if (!id) return []
    try {
        const snap = await ref(id).get()
        const d = snap.data() || {}
        return [...new Set([...(d.imagesSent || []), ...(d.mediaSent || [])])]
    } catch {
        return []
    }
}
