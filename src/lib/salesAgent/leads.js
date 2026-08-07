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
import { normalizePhone } from './agent'
import { isPausedForHuman, trimTurns, toApiMessages, isOwnEcho, parseOwnerCommand, isTestPhone, MAX_TURNS, HUMAN_PAUSE_HOURS } from './leadsCore'

// The pure helpers live in leadsCore.js so they stay unit-testable —
// importing this file boots the Admin SDK, which needs credentials.
// Re-exported here so callers still have one import to reach for.
export { isPausedForHuman, trimTurns, toApiMessages, isOwnEcho, parseOwnerCommand, isTestPhone, MAX_TURNS, HUMAN_PAUSE_HOURS }

const COLLECTION = 'sales_leads'

function ref(phone) {
    return adminDb.collection(COLLECTION).doc(phone)
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
export async function saveExchange({ phone, incomingText, parsed, followUpAt, profileName, source, variant, isNew }) {
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
    // Which photos this lead has already seen, so neither the prompt nor
    // the route can send one twice.
    if (parsed.image) patch.imagesSent = FieldValue.arrayUnion(parsed.image)

    // followUpAt null means "stop chasing" and must be written, not skipped.
    patch.followUpAt = followUpAt || null

    if (parsed.handoff) {
        patch.human = true
        patch.humanSince = now
        patch.handoffReason = parsed.handoffReason || null
    }

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
