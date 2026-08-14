// src/lib/salesAgent/leadsCore.js
//
// The pure half of the CRM: history shaping and the handoff-pause rule.
// Deliberately free of any Firestore import.
//
// This split is not cosmetic. `leads.js` imports firebaseAdmin, which
// initialises the Admin SDK at module load and throws without service
// account credentials — so anything that imports it cannot be unit
// tested. These are exactly the functions whose edge cases matter
// (a dropped turn, a pause that never expires), so they live where a
// test can reach them.

import { normalizePhone } from './agent'

const MAX_TURNS = 24 // 12 exchanges — plenty for a sale, cheap to send

// How long a human handoff silences the bot. Without an expiry a single
// handoff would mute that lead forever, and a lead nobody remembers to
// resume is a lead lost more quietly than one never contacted.
const HUMAN_PAUSE_HOURS = 48

// True when a human took the wheel and the pause has not expired yet.
export function isPausedForHuman(lead, nowMs = Date.now()) {
    if (!lead?.human) return false
    const since = lead.humanSince?.toMillis ? lead.humanSince.toMillis() : Number(lead.humanSince) || 0
    if (!since) return true // paused with no timestamp — stay quiet, be safe
    return nowMs - since < HUMAN_PAUSE_HOURS * 3600 * 1000
}

// Trim to the last MAX_TURNS, always keeping whole turns.
export function trimTurns(turns) {
    const list = Array.isArray(turns) ? turns : []
    return list.slice(-MAX_TURNS)
}

// The history in the shape the Messages API wants. Roles must alternate
// cleanly; a stray double-user turn is merged rather than sent, because
// the API rejects the request and the customer would get nothing.
export function toApiMessages(turns, incomingText) {
    const out = []
    for (const t of trimTurns(turns)) {
        const role = t.role === 'assistant' ? 'assistant' : 'user'
        const content = String(t.text || '').trim()
        if (!content) continue
        if (out.length && out[out.length - 1].role === role) {
            out[out.length - 1].content += `\n${content}`
        } else {
            out.push({ role, content })
        }
    }
    const text = String(incomingText || '').trim()
    if (text) {
        if (out.length && out[out.length - 1].role === 'user') {
            out[out.length - 1].content += `\n${text}`
        } else {
            out.push({ role: 'user', content: text })
        }
    }
    // The API requires the first message to be from the user.
    while (out.length && out[0].role !== 'user') out.shift()
    return out
}

// ── Telling our own voice apart from Lord's ─────────────────────────
//
// When the number runs in "coexistence" mode — the WhatsApp Business app
// on the phone alongside the Cloud API — Meta echoes back every message
// the BUSINESS sends, including the ones this bot just sent through the
// API. Those two are indistinguishable by sender: both are "from the
// business".
//
// So we distinguish by content. The bot's outgoing text is stored
// verbatim in `turns`, so an echo whose text we have just written is
// ours; anything else was typed by a human on the phone, and a human
// typing in a conversation is the loudest possible signal that the bot
// should get out of the way.
//
// Compared against the trailing run of assistant turns, both
// individually and joined, because the reply goes out as one message
// but is stored as one turn per bubble.
const squash = s => String(s || '').replace(/\s+/g, ' ').trim()

export function isOwnEcho(lead, text) {
    const t = squash(text)
    if (!t) return false
    const turns = Array.isArray(lead?.turns) ? lead.turns : []
    const tail = []
    for (let i = turns.length - 1; i >= 0 && turns[i]?.role === 'assistant'; i--) tail.unshift(turns[i])
    if (tail.length === 0) return false
    if (tail.some(x => squash(x.text) === t)) return true
    return squash(tail.map(x => x.text).join(' ')) === t
}

// ── Owner commands ──────────────────────────────────────────────────
//
// Lord can steer the bot from his own phone by messaging the business
// number, which matters because the moment he needs to mute it is the
// moment he is in a conversation and not at a laptop.
//
//   שקט 050-1234567   → mute the bot for that customer
//   בוט 0501234567    → give it back
//   סטטוס 0501234567  → where that lead stands
//
// Only ever consulted for messages from the configured owner number, so
// a customer who happens to write "שקט" is just a customer writing.
// Verbs are chosen to be things nobody starts an ordinary sentence with.
// "אני" was in this list for about ten minutes and matched "אני רוצה
// לשאול על המחיר" — a command vocabulary has to be deliberately awkward.
const OWNER_VERBS = [
    { action: 'pause', words: ['שקט', 'עצור', 'תפסיק', 'mute', 'stop', 'quiet'] },
    { action: 'resume', words: ['בוט', 'המשך', 'תמשיך', 'resume', 'start', 'bot'] },
    { action: 'status', words: ['סטטוס', 'מצב', 'status'] },
    // No phone argument: the digest is about the whole pipeline.
    { action: 'digest', words: ['דוח', 'דוח', 'סיכום', 'digest', 'report'] },
]

export function parseOwnerCommand(text) {
    const raw = squash(text)
    if (!raw) return null
    const first = raw.split(' ')[0].toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
    const verb = OWNER_VERBS.find(v => v.words.includes(first))
    if (!verb) return null
    // A run of 9+ digits anywhere after the verb is the target. Written
    // loosely on purpose: 050-123-4567, +972 50 1234567 and 0501234567
    // are all things a person types one-handed.
    const digits = raw.slice(first.length).replace(/[^\d+]/g, '')
    if (digits.replace(/\D/g, '').length < 9) return { action: verb.action, phone: null }
    return { action: verb.action, phone: digits }
}

// ── The synthetic leads created while building this agent ───────────
//
// 972500000901, 972500000942, and so on — 972 500000 9XX. They sit in
// the same collection as real customers, dragging the funnel numbers and
// the A/B arms toward nonsense, so the table offers to sweep them.
//
// This pattern gates a bulk delete with no undo, which is why it lives
// here rather than beside the delete call: if it can ever match a real
// number it deletes a real customer, and that is worth a test. Israeli
// mobiles are 05X-XXXXXXX and never land on this shape.
const TEST_PHONE_RE = /^9725000009\d{2}$/

export function isTestPhone(phone) {
    return TEST_PHONE_RE.test(normalizePhone(phone))
}

// ── Operational health ───────────────────────────────────────────────
//
// This is deliberately a pure projection. Firestore documents may carry
// lead identifiers, provider IDs, and transport payloads; this function
// reads only allowlisted counters/timestamps/enums and returns none of the
// source objects. Keeping the privacy boundary here makes every caller use
// the same truthful rules.
const HOUR_MS = 60 * 60 * 1000
const DELIVERY_REQUEST_LEASE_MS = 2 * 60 * 1000
const INBOUND_AMBER_MS = 6 * HOUR_MS
const INBOUND_RED_MS = 24 * HOUR_MS
const DELIVERY_STATUSES = new Set(['requested', 'accepted', 'delivered', 'read', 'failed'])
const MAKE_STATUSES = new Set(['active', 'inactive', 'unknown'])
const OPERATIONS_STATUSES = new Set(['available', 'exhausted', 'unknown'])

const finiteMs = value => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null
const nonNegativeCount = value => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : null
const enumValue = (value, allowed, fallback = 'unknown') => allowed.has(value) ? value : fallback

function summarizeInbound(input, nowMs) {
    const source = input && typeof input === 'object' ? input : null
    const makeStatus = enumValue(source?.makeStatus, MAKE_STATUSES)
    const operationsStatus = enumValue(source?.operationsStatus, OPERATIONS_STATUSES)
    const lastHeartbeatAtMs = finiteMs(source?.lastHeartbeatAtMs)
    const activationAtMs = finiteMs(source?.activationAtMs)
    const evidenceAtMs = lastHeartbeatAtMs ?? activationAtMs
    const ageMs = evidenceAtMs == null ? null : Math.max(0, nowMs - evidenceAtMs)

    let status = 'unknown'
    let reason = 'no-heartbeat'
    if (operationsStatus === 'exhausted') {
        status = 'red'
        reason = 'make-operations-exhausted'
    } else if (makeStatus === 'inactive') {
        status = 'red'
        reason = 'make-inactive'
    } else if (evidenceAtMs != null && ageMs >= INBOUND_RED_MS) {
        status = 'red'
        reason = lastHeartbeatAtMs == null ? 'activation-stale' : 'heartbeat-stale'
    } else if (evidenceAtMs != null && ageMs >= INBOUND_AMBER_MS) {
        status = 'amber'
        reason = lastHeartbeatAtMs == null ? 'activation-aging' : 'heartbeat-aging'
    } else if (evidenceAtMs != null) {
        status = 'green'
        reason = lastHeartbeatAtMs == null ? 'activation-recent' : 'heartbeat-recent'
    }

    return { status, reason, makeStatus, operationsStatus, lastHeartbeatAtMs, activationAtMs, ageMs }
}

function summarizeAnthropic(input, nowMs) {
    const source = input && typeof input === 'object' ? input : null
    if (!source) {
        return {
            status: 'unknown', reason: 'no-runtime-evidence', consecutiveFailures: 0,
            openUntilMs: null, lastFailureAtMs: null, lastSuccessAtMs: null, lastErrorCode: null,
        }
    }
    const consecutiveFailures = nonNegativeCount(source.consecutiveFailures) ?? 0
    const openUntilMs = finiteMs(source.openUntilMs)
    const lastFailureAtMs = finiteMs(source.lastFailureAtMs)
    const lastSuccessAtMs = finiteMs(source.lastSuccessAtMs)
    const lastErrorCode = ['timeout', 'rate_limit', 'low_credit', 'invalid_json', 'provider_error']
        .includes(source.lastErrorCode) ? source.lastErrorCode : null

    let status = 'green'
    let reason = 'provider-healthy'
    if (openUntilMs != null && openUntilMs > nowMs) {
        status = 'red'
        reason = 'circuit-open'
    } else if (consecutiveFailures > 0) {
        status = 'amber'
        reason = consecutiveFailures >= 3 ? 'half-open-recovery' : 'consecutive-failures'
    }
    return { status, reason, consecutiveFailures, openUntilMs, lastFailureAtMs, lastSuccessAtMs, lastErrorCode }
}

function summarizeWhatsapp(attempts, nowMs, operationsStatus) {
    const counts = {
        requested: 0, accepted: 0, delivered: 0, read: 0, failed: 0,
        pendingRequested: 0, pendingAccepted: 0, staleRequested: 0, staleAccepted: 0,
    }
    let lastEvidenceAtMs = null
    for (const raw of (Array.isArray(attempts) ? attempts : []).slice(0, 20)) {
        const status = DELIVERY_STATUSES.has(raw?.status) ? raw.status : null
        if (!status) continue
        counts[status]++
        const requestedAtMs = finiteMs(raw?.requestedAtMs)
        const occurredAtMs = finiteMs(raw?.occurredAtMs)
        const updatedAtMs = finiteMs(raw?.updatedAtMs)
        const evidenceAtMs = occurredAtMs ?? updatedAtMs ?? requestedAtMs
        if (evidenceAtMs != null) lastEvidenceAtMs = Math.max(lastEvidenceAtMs ?? evidenceAtMs, evidenceAtMs)

        if (status === 'requested') {
            if (requestedAtMs != null && requestedAtMs + DELIVERY_REQUEST_LEASE_MS <= nowMs) counts.staleRequested++
            else counts.pendingRequested++
        }
        if (status === 'accepted') {
            const pendingUntilMs = finiteMs(raw?.deliveryPendingUntilMs)
            if (pendingUntilMs != null && pendingUntilMs <= nowMs) counts.staleAccepted++
            else counts.pendingAccepted++
        }
    }

    const stale = counts.staleRequested + counts.staleAccepted
    const pending = counts.pendingRequested + counts.pendingAccepted
    const verified = counts.delivered + counts.read
    let status = 'unknown'
    let reason = 'no-delivery-evidence'
    if (operationsStatus === 'exhausted') {
        status = 'red'
        reason = 'make-operations-exhausted'
    } else if (counts.failed >= 5) {
        status = 'red'
        reason = 'failure-threshold'
    } else if (stale > 5) {
        status = 'red'
        reason = 'stale-threshold'
    } else if (counts.failed > 0) {
        status = 'amber'
        reason = 'delivery-failures'
    } else if (stale > 0) {
        status = 'amber'
        reason = 'stale-attempts'
    } else if (pending > 0) {
        status = 'amber'
        reason = 'pending'
    } else if (verified > 0) {
        status = 'green'
        reason = 'verified-delivery'
    }
    return { status, reason, ...counts, lastEvidenceAtMs }
}

function summarizeFollowups(dueFollowUps, lastRunAtMs) {
    const due = nonNegativeCount(dueFollowUps)
    const safeLastRunAtMs = finiteMs(lastRunAtMs)
    if (due == null) return { status: 'unknown', reason: 'no-queue-evidence', due: null, lastRunAtMs: safeLastRunAtMs }
    if (due > 25) return { status: 'red', reason: 'queue-overloaded', due, lastRunAtMs: safeLastRunAtMs }
    if (due > 0) return { status: 'amber', reason: 'followups-due', due, lastRunAtMs: safeLastRunAtMs }
    return { status: 'green', reason: 'queue-clear', due, lastRunAtMs: safeLastRunAtMs }
}

export function summarizeSalesHealth(input = {}) {
    const nowMs = finiteMs(input.nowMs) ?? Date.now()
    const inbound = summarizeInbound(input.inbound, nowMs)
    return {
        generatedAtMs: nowMs,
        inbound,
        anthropic: summarizeAnthropic(input.breaker, nowMs),
        whatsapp: summarizeWhatsapp(input.deliveryAttempts, nowMs, inbound.operationsStatus),
        followups: summarizeFollowups(input.dueFollowUps, input.followupsLastRunAtMs),
    }
}

const STATUS_LABELS = {
    green: 'תקין',
    amber: 'דורש תשומת לב',
    red: 'תקלה',
    unknown: 'לא ידוע',
}

// Text for the signal rail is derived from the same enum reasons as the
// backend summary. The UI never has to infer operational truth from color.
export function salesHealthStageView(health = {}) {
    const inbound = health.inbound || {}
    const anthropic = health.anthropic || {}
    const whatsapp = health.whatsapp || {}
    const followups = health.followups || {}
    const statusLabel = stage => STATUS_LABELS[stage.status] || STATUS_LABELS.unknown
    return [
        {
            key: 'inbound', label: 'קליטה', status: inbound.status || 'unknown', statusLabel: statusLabel(inbound),
            metric: inbound.lastHeartbeatAtMs ? 'התקבל אות כניסה' : 'אין עדיין אות כניסה',
            evidenceAtMs: inbound.lastHeartbeatAtMs || inbound.activationAtMs || null,
            action: inbound.status === 'red' ? 'בדקו שהתרחיש פעיל ושנותרו פעולות ב־Make.' : null,
        },
        {
            key: 'anthropic', label: 'AI', status: anthropic.status || 'unknown', statusLabel: statusLabel(anthropic),
            metric: `${anthropic.consecutiveFailures || 0} כשלים רצופים`,
            evidenceAtMs: anthropic.lastSuccessAtMs || anthropic.lastFailureAtMs || null,
            action: anthropic.status === 'red' ? 'המתינו לסגירת מפסק ההגנה ובדקו את יתרת הספק.' : null,
        },
        {
            key: 'whatsapp', label: 'WhatsApp', status: whatsapp.status || 'unknown',
            statusLabel: whatsapp.reason === 'pending' ? 'בהמתנה לאישור מסירה' : statusLabel(whatsapp),
            metric: `${whatsapp.accepted || 0} התקבלו · ${(whatsapp.delivered || 0) + (whatsapp.read || 0)} נמסרו/נקראו`,
            evidenceAtMs: whatsapp.lastEvidenceAtMs || null,
            action: whatsapp.status === 'red' || ['delivery-failures', 'stale-attempts'].includes(whatsapp.reason)
                ? 'בדקו כשלי שליחה, סטטוסים תקועים ופעולות Make.'
                : null,
        },
        {
            key: 'followups', label: 'פולואפים', status: followups.status || 'unknown', statusLabel: statusLabel(followups),
            metric: followups.due == null ? 'מצב התור לא ידוע' : `${followups.due} ממתינים`,
            evidenceAtMs: followups.lastRunAtMs || health.generatedAtMs || null,
            action: followups.status === 'red' ? 'בדקו את תור הפולואפים והריצו בדיקה יבשה.' : null,
        },
    ]
}

export { MAX_TURNS, HUMAN_PAUSE_HOURS }
