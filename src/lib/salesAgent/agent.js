// src/lib/salesAgent/agent.js
//
// The model call and — more importantly — everything that makes its
// output safe to send to a paying customer.
//
// An LLM in a sales seat fails in three ways, and each has a guard here:
//   1. It returns prose around the JSON, or a trailing comma.  → parseAgentJson
//      extracts the object and never throws; a malformed answer degrades
//      to a handoff instead of a crash.
//   2. It invents a field value ("stage": "almost_closed").  → every
//      enum is whitelisted and anything unknown falls back to a safe value.
//   3. It writes a wall of text, or eight messages in a row.  → messages
//      are clamped to 3 and trimmed.
//
// The rule behind all of it: when the agent is unsure, the system must
// fail toward a human, never toward a confident wrong answer.

import { STAGES, MEDIA_KEYS } from './catalog'

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

// Haiku is the right tier here: the conversation is short, the rules are
// in the prompt, and cost per lead matters more than eloquence. Override
// with ANTHROPIC_MODEL if you move tiers or the id changes — model ids
// are pinned snapshots and do not auto-update.
export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5'

const EVENT_TYPES = ['bar_mitzvah', 'bat_mitzvah', 'wedding', 'birthday', 'brit', 'other']
const PACKAGE_IDS = ['digital', 'printed', 'premium']

const MAX_MESSAGES = 3
const MAX_MESSAGE_CHARS = 900

// ── Phone normalisation ─────────────────────────────────────────────
// The doc id for a lead. WhatsApp hands us wa_id (972501234567), humans
// type 050-123-4567, and a mismatch would silently create a SECOND lead
// mid-conversation — the agent would forget everything and start over.
export function normalizePhone(raw) {
    let s = String(raw || '').replace(/[^\d+]/g, '')
    if (!s) return ''
    if (s.startsWith('+')) s = s.slice(1)
    if (s.startsWith('00')) s = s.slice(2)
    if (s.startsWith('0')) s = `972${s.slice(1)}`
    // A bare Israeli mobile without the leading zero (501234567).
    if (s.length === 9 && s.startsWith('5')) s = `972${s}`
    return s
}

function isISODate(v) {
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

function cleanStr(v, max = 300) {
    if (typeof v !== 'string') return null
    const t = v.trim()
    if (!t || t === 'null' || t === 'undefined') return null
    return t.slice(0, max)
}

// ── Making it not read like a bot ───────────────────────────────────
//
// The prompt already asks for all of this. This function exists because
// asking is not the same as guaranteeing: across a few hundred messages
// a model WILL drift back to an em dash and a decorative emoji, and the
// one message where it does is the one the customer screenshots.
//
// Everything here is deterministic and content-preserving. It changes
// punctuation and ornament, never words.
//
// The em dash deserves its own note. No Hebrew keyboard produces one —
// not a single customer of this business has ever typed one — so it is
// the loudest possible tell that nobody was actually there. In Hebrew it
// is almost always doing a comma's job, so that is what it becomes.
const EMOJI = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu
const LEADING_ORNAMENT = /^[\s\p{Extended_Pictographic}️‍]+/u

export function sanitizeReply(raw, { maxEmoji = 1 } = {}) {
    let s = String(raw || '')

    // Markdown first: WhatsApp renders none of it, so the customer would
    // literally see the asterisks and hashes.
    s = s.replace(/\*\*(.+?)\*\*/gs, '$1')
    s = s.replace(/__(.+?)__/gs, '$1')
    s = s.replace(/^#{1,6}[ \t]+/gm, '')
    // Bullets and numbered lists read as a brochure, not a person.
    s = s.replace(/^[ \t]*[-*•‣][ \t]+/gm, '')
    s = s.replace(/^[ \t]*\d+[.)][ \t]+/gm, '')

    // Dashes. Order matters: the spaced form is a clause break (comma),
    // the bare form is a joiner (plain hyphen).
    s = s.replace(/[ \t]*[—–][ \t]+/g, ', ')
    s = s.replace(/[—–]/g, '-')
    // The rewrite above can butt a new comma against existing punctuation.
    s = s.replace(/,\s*([,.!?:;])/g, '$1')
    s = s.replace(/([,.!?:;])\s*,/g, '$1')

    // Ornament at the start of a message reads as a broadcast blast.
    s = s.replace(LEADING_ORNAMENT, '')

    // Emoji budget, counted across the whole message.
    let kept = 0
    s = s.replace(EMOJI, m => (kept++ < maxEmoji ? m : ''))

    // Tidy whatever the removals left behind.
    s = s.replace(/[ \t]{2,}/g, ' ')
    s = s.replace(/[ \t]+([,.!?:;])/g, '$1')
    s = s.replace(/\n[ \t]+/g, '\n')
    s = s.replace(/\n{3,}/g, '\n\n')
    return s.trim()
}

// ── Output parsing ──────────────────────────────────────────────────
// Tolerant on the way in, strict on the way out. Anything we can't
// understand becomes a handoff — a human reading one extra conversation
// costs far less than a customer receiving nonsense.
export function parseAgentJson(raw) {
    const fallback = {
        messages: [],
        stage: 'handoff',
        handoff: true,
        handoffReason: 'התשובה מהמודל לא הייתה תקינה',
        eventType: null,
        eventDate: null,
        celebrantName: null,
        customerName: null,
        packageInterest: null,
        callbackPromised: null,
        followUpAt: null,
        objectionRaised: false,
        notes: null,
        image: null,
        malformed: true,
    }

    let obj = null
    if (raw && typeof raw === 'object') {
        obj = raw
    } else {
        const text = String(raw || '')
        // Models like to wrap JSON in ```json fences or a friendly
        // sentence. Take the outermost brace pair and try that.
        const start = text.indexOf('{')
        const end = text.lastIndexOf('}')
        if (start === -1 || end <= start) return fallback
        const slice = text.slice(start, end + 1)
        try {
            obj = JSON.parse(slice)
        } catch {
            try {
                // One common repair: a trailing comma before } or ].
                obj = JSON.parse(slice.replace(/,\s*([}\]])/g, '$1'))
            } catch {
                return fallback
            }
        }
    }
    if (!obj || typeof obj !== 'object') return fallback

    // messages — accept the array, or a single `reply` string, because
    // that is the shape a prompt edit is most likely to drift back to.
    let messages = []
    if (Array.isArray(obj.messages)) messages = obj.messages
    else if (typeof obj.messages === 'string') messages = [obj.messages]
    else if (typeof obj.reply === 'string') messages = [obj.reply]
    messages = messages
        .map(m => cleanStr(m, MAX_MESSAGE_CHARS))
        .filter(Boolean)
        .map(m => sanitizeReply(m))
        .filter(Boolean)
        .slice(0, MAX_MESSAGES)

    const handoff = obj.handoff === true
    const stage = STAGES.includes(obj.stage) ? obj.stage : handoff ? 'handoff' : 'engaged'

    // No text and no handoff is a dead end — the customer would get
    // silence. Treat it as a handoff so someone actually replies.
    if (messages.length === 0 && !handoff) {
        return { ...fallback, handoffReason: 'המודל לא החזיר תשובה ללקוח' }
    }

    const eventType = EVENT_TYPES.includes(obj.event_type) ? obj.event_type : null
    const pkg = PACKAGE_IDS.includes(obj.package_interest) ? obj.package_interest : null

    return {
        messages,
        stage,
        handoff,
        handoffReason: handoff ? cleanStr(obj.handoff_reason) || 'הבוט ביקש עזרה' : null,
        eventType,
        eventDate: isISODate(obj.event_date) ? obj.event_date : null,
        celebrantName: cleanStr(obj.celebrant_name, 80),
        customerName: cleanStr(obj.customer_name, 80),
        packageInterest: pkg,
        callbackPromised: isISODate(obj.callback_promised) ? obj.callback_promised : null,
        followUpAt: isISODate(obj.follow_up_at) ? obj.follow_up_at : null,
        objectionRaised: obj.objection_raised === true,
        notes: cleanStr(obj.notes, 400),
        // An image with no words is a message from nobody. The caption
        // rides along with the picture, so requiring text here costs
        // nothing and removes the silent-photo failure mode.
        image: messages.length && MEDIA_KEYS.includes(obj.image) ? obj.image : null,
        malformed: false,
    }
}

// ── Follow-up safety net ────────────────────────────────────────────
// The model is asked for follow_up_at, but a missing one means the lead
// silently falls out of the funnel forever — the exact failure the whole
// system exists to prevent. So the schedule is decided here, with the
// model's answer as a hint rather than the authority.
export function resolveFollowUp({ parsed, todayISO, followUpCount = 0, addDays }) {
    if (parsed.handoff) return null // a human owns it now
    if (parsed.stage === 'closed_won' || parsed.stage === 'closed_lost') return null
    if (followUpCount >= 3) return null // the ladder is done; stop chasing

    // A promised callback always wins — following up the day after the
    // customer said they would come back is the highest-yield moment
    // there is, and the least annoying.
    if (parsed.callbackPromised) return addDays(parsed.callbackPromised, 1)
    if (parsed.followUpAt && parsed.followUpAt > todayISO) return parsed.followUpAt
    if (parsed.stage === 'offer_sent' || parsed.stage === 'objection') return addDays(todayISO, 2)
    return addDays(todayISO, 1)
}

// ── The call ────────────────────────────────────────────────────────
//
// TIMEOUT_MS is not a nicety — it is what stops one slow upstream from
// taking the whole site down.
//
// Without it, a hanging Anthropic request pins the serverless function
// until Vercel's own maxDuration (up to 60s). Each pinned function holds
// a concurrency slot, so a handful of slow calls saturate the plan's
// limit and EVERY route on the deployment starts queueing — including
// static-ish ones that never touch the model. We watched exactly that
// happen during the first live test: the bot answered twice, then the
// third call hung and within a minute unrelated routes were hanging too.
//
// 20s is chosen against reality: a normal reply comes back in 2-6s, so
// anything past 20s is already a lost conversation. Better to hand that
// one customer to a human than to queue everyone else behind it.
const TIMEOUT_MS = Number(process.env.SALES_AGENT_TIMEOUT_MS) || 20000

// 2000, not 700. The reply is Hebrew, and Hebrew costs far more tokens
// per character than English — a normal 4-line answer plus the dozen
// metadata fields lands close to 700. When it crosses, the model stops
// MID-JSON, the output no longer parses, and the conversation falls to a
// handoff. We watched that happen live on "זה יקר לי" — the objection
// turn, which is the single moment you least want the bot to bail.
//
// The ceiling is not what you pay for; output tokens are billed as used.
// A generous ceiling costs nothing and removes a whole failure mode.
const MAX_TOKENS = Number(process.env.SALES_AGENT_MAX_TOKENS) || 2000

export async function callClaude({ system, messages, model = DEFAULT_MODEL, maxTokens = MAX_TOKENS, temperature = 0.6 }) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let res
    try {
        res = await fetch(API_URL, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': API_VERSION,
            },
            body: JSON.stringify({
                model,
                max_tokens: maxTokens,
                temperature,
                system,
                messages,
            }),
        })
    } catch (err) {
        // An abort surfaces as a generic AbortError; name it so the
        // handoff message to the owner says something useful.
        if (err?.name === 'AbortError') throw new Error(`anthropic timeout after ${TIMEOUT_MS}ms`)
        throw err
    } finally {
        clearTimeout(timer)
    }

    if (!res.ok) {
        const body = await res.text().catch(() => '')
        // 401 = bad key · 429 = rate limited · 400 with credit_balance =
        // out of credit. All three read identically from the outside
        // ("the bot stopped answering"), so keep the upstream text.
        throw new Error(`anthropic ${res.status}: ${body.slice(0, 400)}`)
    }
    const data = await res.json()
    const text = (data?.content || [])
        .filter(b => b?.type === 'text')
        .map(b => b.text)
        .join('')
    // stopReason 'max_tokens' means the JSON is truncated and WILL fail to
    // parse. Surfaced so the caller can retry instead of guessing why.
    return { text, usage: data?.usage || null, model: data?.model || model, stopReason: data?.stop_reason || null }
}

export default { callClaude, parseAgentJson, normalizePhone, resolveFollowUp, sanitizeReply }
