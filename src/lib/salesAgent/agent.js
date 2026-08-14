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
import { nextFollowUpDate } from './followupPolicy'
import { PROVIDER_PATH_DEADLINE_MS } from './circuitBreaker'

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

// Sonnet, not Haiku. The original reasoning was that the conversation is
// short and cost per lead matters more than eloquence, and on volume
// that was right. It stopped being right once the agent acquired a
// funnel to read, a journey brief to follow, an experiment arm to
// honour and a decision about when to hand over: those are judgement,
// and judgement is the thing tiers actually differ on. At a few
// conversations a day the difference is cents, and the spend panel now
// shows exactly how many.
//
// Override with ANTHROPIC_MODEL. Ids are pinned snapshots and do not
// auto-update, so a newer Sonnet has to be set deliberately.
export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'

// If the configured id is not one the API recognises, fall back to this
// and keep going. A mistyped or retired model id would otherwise turn
// every single conversation into a handoff, and it is the kind of
// failure that looks like the bot is broken rather than misconfigured -
// which is exactly the trap someone hits when they try a newer model.
export const FALLBACK_MODEL = 'claude-haiku-4-5'

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
export function parseAgentJson(raw, { mediaKeys = MEDIA_KEYS } = {}) {
    // `mediaKeys` defaults to the six built-ins, and that default is a
    // trap that already bit once: the reply route builds a MERGED
    // library (catalog + everything Lord uploaded) and tells the model
    // about all of it — so a parse that validates against the static
    // list silently nulled every uploaded key the model ever picked.
    // The model did its job, the upload panel did its job, and the
    // picture vanished right here. Callers that know about uploads must
    // pass the merged keys.

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
        image: messages.length && mediaKeys.includes(obj.image) ? obj.image : null,
        malformed: false,
    }
}

// ── Follow-up safety net ────────────────────────────────────────────
// The model is asked for follow_up_at, but a missing one means the lead
// silently falls out of the funnel forever — the exact failure the whole
// system exists to prevent. So the schedule is decided here, with the
// model's answer as a hint rather than the authority.
export function resolveFollowUp({ parsed, todayISO, followUpCount = 0, addDays }) {
    // Precedence, highest first, and the order is the whole rule:
    //
    //   1. a date the CUSTOMER named  — they chose it, nothing beats it
    //   2. a date the MODEL suggested — it read something from the
    //      conversation the policy cannot see ("after the holiday")
    //   3. the policy's ladder        — stage, attempt, event date
    //
    // A first version put the model above the customer, and a test that
    // pairs a promised callback with a model suggestion caught it: the
    // bot would have written back four days before the date the customer
    // asked for, which is the exact behaviour that makes people stop
    // giving you a date at all.
    if (parsed.callbackPromised && !parsed.handoff) {
        return nextFollowUpDate({
            stage: parsed.stage,
            attempt: followUpCount,
            eventDate: parsed.eventDate,
            todayISO,
            callbackPromised: parsed.callbackPromised,
            handoff: parsed.handoff,
        })
    }

    if (parsed.followUpAt && parsed.followUpAt > todayISO && !parsed.handoff) {
        const stopped = nextFollowUpDate({
            stage: parsed.stage,
            attempt: followUpCount,
            eventDate: parsed.eventDate,
            todayISO,
            handoff: parsed.handoff,
        }) == null
        // ...unless the policy says to stop entirely. A model that
        // suggests a date for a lead whose event was last week is not a
        // reason to send that message.
        if (!stopped) return parsed.followUpAt
        return null
    }

    return nextFollowUpDate({
        stage: parsed.stage,
        attempt: followUpCount,
        eventDate: parsed.eventDate,
        todayISO,
        callbackPromised: parsed.callbackPromised,
        handoff: parsed.handoff,
    })
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
const DEFAULT_TIMEOUT_MS = 16_000

// The environment may shorten an attempt but can never make the provider
// path exceed its shared absolute deadline. A retry receives the remaining
// budget rather than starting a second full timeout.
export function providerDeadlineAt(nowMs = Date.now()) {
    return nowMs + PROVIDER_PATH_DEADLINE_MS
}

function attemptTimeoutMs(deadlineAtMs) {
    const configured = Number(process.env.SALES_AGENT_TIMEOUT_MS)
    const perAttempt = Number.isFinite(configured) && configured > 0 ? Math.min(configured, DEFAULT_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS
    const remaining = Number(deadlineAtMs) - Date.now()
    return Math.max(0, Math.min(perAttempt, remaining))
}

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

export async function callClaude({ system, messages, model = DEFAULT_MODEL, maxTokens = MAX_TOKENS, temperature = 0.6, deadlineAtMs = providerDeadlineAt() }) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

    const controller = new AbortController()
    const timeoutMs = attemptTimeoutMs(deadlineAtMs)
    if (timeoutMs <= 0) throw new Error('anthropic timeout: provider deadline exhausted')
    const timer = setTimeout(() => controller.abort(), timeoutMs)
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
        if (err?.name === 'AbortError') throw new Error(`anthropic timeout after ${timeoutMs}ms`)
        throw err
    } finally {
        clearTimeout(timer)
    }

    if (!res.ok) {
        const body = await res.text().catch(() => '')
        // A model id the API does not know. Retry once on the fallback
        // rather than dropping the customer: a configuration mistake
        // should cost a slightly less capable answer, not the answer.
        if (res.status === 404 && model !== FALLBACK_MODEL && /model/i.test(body)) {
            // Step down to sonnet first, haiku only after. The old
            // behaviour dropped straight to haiku, which punished a
            // typo'd ANTHROPIC_MODEL with the cheapest model in the
            // house — silently, in front of customers.
            const next = model !== DEFAULT_MODEL ? DEFAULT_MODEL : FALLBACK_MODEL
            console.error(`[sales-agent] unknown model ${model}, falling back to ${next}`)
            return callClaude({ system, messages, model: next, maxTokens, temperature, deadlineAtMs })
        }
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
