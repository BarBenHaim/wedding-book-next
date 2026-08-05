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

export { MAX_TURNS, HUMAN_PAUSE_HOURS }
