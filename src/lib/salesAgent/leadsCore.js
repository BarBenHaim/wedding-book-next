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

export { MAX_TURNS, HUMAN_PAUSE_HOURS }
