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
import { isPausedForHuman, trimTurns, toApiMessages, isOwnEcho, parseOwnerCommand, isTestPhone, MAX_TURNS, HUMAN_PAUSE_HOURS } from './leadsCore'
import { isoInIsrael } from './leadsView'
import { assertCompletableInboundOutcome, assertInboundClaimToken, decideInboundCompletion, INBOUND_LEASE_MS, sanitizeInboundOutcome, startInboundClaim } from './inboundEventsCore'
import { reserveHalfOpenProbe, resolveProviderFailure, resolveProviderSuccess, sanitizeBreakerRuntimeState } from './circuitBreaker'

// The pure helpers live in leadsCore.js so they stay unit-testable —
// importing this file boots the Admin SDK, which needs credentials.
// Re-exported here so callers still have one import to reach for.
export { isPausedForHuman, trimTurns, toApiMessages, isOwnEcho, parseOwnerCommand, isTestPhone, MAX_TURNS, HUMAN_PAUSE_HOURS }

const COLLECTION = 'sales_leads'
const INBOUND_EVENTS_COLLECTION = 'sales_inbound_events'
const RUNTIME_COLLECTION = 'sales_runtime'
const ANTHROPIC_RUNTIME_ID = 'anthropic'

function ref(phone) {
    return adminDb.collection(COLLECTION).doc(phone)
}

export function inboundEventRef(eventId) {
    return adminDb.collection(INBOUND_EVENTS_COLLECTION).doc(String(eventId))
}

function anthropicRuntimeRef() {
    return adminDb.collection(RUNTIME_COLLECTION).doc(ANTHROPIC_RUNTIME_ID)
}

// Runtime state is metadata only. In particular, do not merge arbitrary
// existing fields: a past operational mistake must not keep a provider body,
// prompt, customer text, phone, or secret alive in this document.
const breakerRuntimeState = sanitizeBreakerRuntimeState
const assertBeforeDeadline = deadlineAtMs => {
    if (deadlineAtMs != null && Date.now() >= Number(deadlineAtMs)) throw new Error('sales runtime deadline exhausted')
}

/**
 * Atomically consults the provider circuit before a model call. A closed
 * circuit needs only a transaction read; a half-open circuit writes a short
 * lease, so exactly one concurrent request becomes the probe.
 */
export async function acquireProviderCircuit({ deadlineAtMs } = {}) {
    assertBeforeDeadline(deadlineAtMs)
    const runtimeRef = anthropicRuntimeRef()
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

export async function recordProviderFailure(errorCode, probeId = null, deadlineAtMs = null) {
    assertBeforeDeadline(deadlineAtMs)
    const runtimeRef = anthropicRuntimeRef()
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

export async function recordProviderSuccess(probeId = null, deadlineAtMs = null) {
    assertBeforeDeadline(deadlineAtMs)
    const runtimeRef = anthropicRuntimeRef()
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

export async function releaseProviderProbe(probeId, deadlineAtMs = null) {
    if (!probeId) return { action: 'released' }
    assertBeforeDeadline(deadlineAtMs)
    const runtimeRef = anthropicRuntimeRef()
    return adminDb.runTransaction(async tx => {
        const snap = await tx.get(runtimeRef)
        if (deadlineAtMs != null && Date.now() >= Number(deadlineAtMs)) return { action: 'deadline' }
        const stored = snap.exists ? breakerRuntimeState(snap.data()) : {}
        if (stored.halfOpenProbeId !== probeId) return { action: 'stale' }
        tx.set(runtimeRef, { ...stored, halfOpenProbeId: null, halfOpenLeaseUntilMs: null, updatedAt: FieldValue.serverTimestamp() }, { merge: false })
        return { action: 'released' }
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
        const [eventSnap] = await Promise.all([tx.get(eventRef), tx.get(leadRef)])
        if (deadlineAtMs != null && Date.now() >= Number(deadlineAtMs)) return { action: 'deadline' }
        const stored = eventSnap.exists ? eventSnap.data() : null
        const decision = decideInboundCompletion(stored, ownedClaimToken, Date.now())
        if (decision.action !== 'complete') return decision
        if (Number(stored.claimGeneration) !== expectedGeneration) return { action: 'stale' }
        if (deadlineAtMs != null && Date.now() >= Number(deadlineAtMs)) return { action: 'deadline' }

        tx.set(leadRef, {
            human: true,
            humanSince: FieldValue.serverTimestamp(),
            handoffReason: String(reason || '').slice(0, 120) || null,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
        tx.set(eventRef, {
            status: 'completed',
            leaseUntilMs: null,
            outcome: cleanOutcome,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
        return { action: 'completed', outcome: cleanOutcome }
    })
}

// Final customer-facing success is durable only when the lead exchange and
// inbound completion commit together under the same claim fence.
export async function completeSuccessfulExchange({ eventId, claimToken, claimGeneration, exchange, outcome, deadlineAtMs = null }) {
    assertBeforeDeadline(deadlineAtMs)
    const ownedClaimToken = assertInboundClaimToken(claimToken)
    const cleanOutcome = sanitizeInboundOutcome(outcome)
    assertCompletableInboundOutcome(cleanOutcome)
    const eventRef = inboundEventRef(eventId)
    const { id, patch } = buildExchangePatch(exchange)
    const leadRef = ref(id)
    return adminDb.runTransaction(async tx => {
        const [eventSnap] = await Promise.all([tx.get(eventRef), tx.get(leadRef)])
        if (deadlineAtMs != null && Date.now() >= Number(deadlineAtMs)) return { action: 'deadline' }
        const stored = eventSnap.exists ? eventSnap.data() : null
        const decision = decideInboundCompletion(stored, ownedClaimToken, Date.now())
        if (decision.action !== 'complete') return decision
        if (Number(stored.claimGeneration) !== Number(claimGeneration)) return { action: 'stale' }
        if (deadlineAtMs != null && Date.now() >= Number(deadlineAtMs)) return { action: 'deadline' }
        tx.set(leadRef, patch, { merge: true })
        tx.set(eventRef, { status: 'completed', leaseUntilMs: null, outcome: cleanOutcome, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        return { action: 'completed', outcome: cleanOutcome }
    })
}

/**
 * Claim the one durable unit of inbound work before a reply can spend
 * money or write a lead. The event id is Meta's stable delivery id; the
 * phone is deliberately reduced to a hash before it reaches Firestore.
 */
export async function claimInboundEvent({ eventId, phone, occurredAt }) {
    const eventRef = inboundEventRef(eventId)
    const claimToken = crypto.randomUUID()
    return adminDb.runTransaction(async tx => {
        const snap = await tx.get(eventRef)
        const stored = snap.exists ? snap.data() : null
        const nowMs = Date.now()
        const claim = startInboundClaim(stored, nowMs, claimToken)
        if (claim.action !== 'process') return claim

        tx.set(eventRef, {
            eventId: String(eventId),
            phoneHash: crypto.createHash('sha256').update(String(phone)).digest('hex'),
            occurredAt: occurredAt || new Date().toISOString(),
            status: 'processing',
            leaseUntilMs: nowMs + INBOUND_LEASE_MS,
            claimToken: claim.claimToken,
            claimGeneration: claim.claimGeneration,
            attempts: FieldValue.increment(1),
            createdAt: stored?.createdAt || FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
        return claim
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
    if (!snap.exists) return { phone, isNew: true, turns: [], stage: 'new', followUpCount: 0, objectionCount: 0 }
    return { phone, isNew: false, ...snap.data() }
}

/**
 * Persist one exchange. Undefined values are stripped — the Firestore
 * client rejects them, and a half-written lead is worse than a stale one.
 */
export function buildExchangePatch({ phone, incomingText, parsed, followUpAt, profileName, source, variant, isNew }) {
    const id = normalizePhone(phone)
    if (!id) throw new Error('bad phone')

    const now = FieldValue.serverTimestamp()
    const turns = [{ role: 'user', text: String(incomingText || '').slice(0, 2000), at: Date.now() }]
    for (const m of parsed.messages || []) turns.push({ role: 'assistant', text: m, at: Date.now() })

    const patch = {
        phone: id,
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
    if (source) patch.source = String(source).slice(0, 60)
    if (parsed.objectionRaised) patch.objectionCount = FieldValue.increment(1)
    // Which media this lead has already seen, so neither the prompt nor
    // the route can send one twice.
    //
    // `pendingMediaKeys` is the other half of the measurement: it holds
    // what was just sent until they either write back within a day (a
    // reply credited to it) or do not (cleared, credited to nothing).
    // Without the timestamp beside it, a reply three weeks later would
    // count as a reaction to a picture nobody remembers seeing.
    if (parsed.image) {
        patch.imagesSent = FieldValue.arrayUnion(parsed.image)
        patch.mediaSent = FieldValue.arrayUnion(parsed.image)
        patch.pendingMediaKeys = [parsed.image]
        patch.lastMediaAt = now
    }

    // followUpAt null means "stop chasing" and must be written, not skipped.
    patch.followUpAt = followUpAt || null

    if (parsed.handoff) {
        patch.human = true
        patch.humanSince = now
        patch.handoffReason = parsed.handoffReason || null
    }

    return { id, patch }
}

export async function saveExchange(args) {
    const { id, patch } = buildExchangePatch(args)
    await ref(id).set(patch, { merge: true })
    // arrayUnion cannot trim, so the cap is enforced on the next read
    // path via trimTurns() and compacted here when it grows too far.
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
    } catch (err) {
        // Compaction is housekeeping — never fail a customer reply over it.
        console.warn('[salesAgent] compact failed', err?.message || err)
    }
}

export function compactLeadBestEffort(phone) {
    const id = normalizePhone(phone)
    if (id) compactIfNeeded(id)
}

export async function markFollowUpSent({ phone, text, nextFollowUpAt, stage }) {
    const id = normalizePhone(phone)
    const patch = {
        lastFollowUpAt: FieldValue.serverTimestamp(),
        lastMessageAt: FieldValue.serverTimestamp(),
        followUpCount: FieldValue.increment(1),
        followUpAt: nextFollowUpAt || null,
        turns: FieldValue.arrayUnion({ role: 'assistant', text: String(text || '').slice(0, 2000), at: Date.now() }),
    }
    if (stage) patch.stage = stage
    await ref(id).set(patch, { merge: true })
}

// Leads due for a follow-up today. `stage` filters are applied in memory
// because Firestore would need a composite index for the combination and
// the daily volume here is tiny.
export async function dueFollowUps(todayISO, limit = 40) {
    const snap = await adminDb
        .collection(COLLECTION)
        .where('followUpAt', '<=', todayISO)
        .limit(limit * 3)
        .get()
    const out = []
    for (const doc of snap.docs) {
        const lead = { phone: doc.id, ...doc.data() }
        if (!lead.followUpAt) continue
        if (lead.stage === 'closed_won' || lead.stage === 'closed_lost') continue
        if (isPausedForHuman(lead)) continue
        if ((lead.followUpCount || 0) >= 3) continue
        out.push(lead)
        if (out.length >= limit) break
    }
    return out
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
// Called only on a lead's FIRST message, so this is one query per new
// conversation, not one per message.
export async function findCustomerByPhone(rawPhone) {
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
    } catch (err) {
        // A missing index or a malformed number must never stop a reply.
        console.warn('[salesAgent] customer lookup failed', err?.message || err)
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
export async function closeLeadOnPurchase({ phone, orderId, weddingId, amount, packageId }) {
    const id = normalizePhone(phone)
    if (!id) return null
    const patch = {
        stage: 'closed_won',
        followUpAt: null,
        closedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    }
    if (orderId) patch.orderId = String(orderId)
    if (weddingId) patch.weddingId = String(weddingId)
    if (amount != null && Number.isFinite(Number(amount))) patch.amount = Number(amount)
    if (packageId) patch.packageInterest = packageId

    // Every asset this conversation saw gets the win, not just the last
    // one. Last-touch attribution in this funnel would hand the credit
    // to whatever happened to be sent nearest the payment link, which is
    // the one thing guaranteed not to have caused the sale.
    //
    // Read before the write, because the write does not change the list
    // and a failure here must not block closing the lead.
    try {
        const seen = await mediaSeenBy(id)
        if (seen.length) creditMediaWin(seen).catch(() => {})
    } catch { /* attribution is never worth a lost close */ }

    await ref(id).set(patch, { merge: true })
    return id
}

export async function setHuman(phone, human, reason = null) {
    const id = normalizePhone(phone)
    if (!id) return null
    await ref(id).set(
        {
            human: !!human,
            humanSince: human ? FieldValue.serverTimestamp() : null,
            handoffReason: human ? reason : null,
            updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
    )
    return id
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
    } catch (err) {
        console.error('[sales-agent] recordSpend failed', err)
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
    } catch (err) {
        console.error('[sales-agent] readSpend failed', err)
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
    const ids = [...new Set(phones.map(normalizePhone).filter(Boolean))].slice(0, 100)
    if (!ids.length || !todayISO) return { revived: 0, ids: [] }
    const batch = adminDb.batch()
    for (const id of ids) {
        batch.set(ref(id), {
            followUpAt: todayISO,
            revivedAt: FieldValue.serverTimestamp(),
            revivedCount: FieldValue.increment(1),
        }, { merge: true })
    }
    await batch.commit()
    return { revived: ids.length, ids }
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
    } catch (err) {
        // A library that fails to load must degrade to the built-in
        // catalog, never to a broken reply. Serving a stale list is the
        // better failure here.
        console.warn('[salesAgent] media list failed', err?.message || err)
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
    } catch (err) {
        console.warn(`[salesAgent] media ${field} failed`, err?.message || err)
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
    } catch (err) {
        console.warn('[salesAgent] clear pending media failed', err?.message || err)
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
