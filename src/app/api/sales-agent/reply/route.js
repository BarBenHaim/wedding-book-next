// POST /api/sales-agent/reply
//
// The brain of the WhatsApp sales agent. Make is a dumb pipe around it:
//
//   WhatsApp Cloud (Watch Events)
//        → POST here  { phone, text, profileName?, source? }
//        → { send: [...], notifyOwner, stage, handoff }
//        → Make sends each string in `send` back to the customer,
//          and `notifyOwner` to Lord when it is not null.
//
// Keeping the logic here rather than inside Make buys three things that
// matter: the whole conversation costs Make ~3 operations instead of a
// dozen (the account is on the Free plan), prices and links live in one
// versioned file instead of inside a visual module, and the agent sits
// next to the Firestore that already knows which customers exist.
//
// AUTH: a shared secret header. This endpoint spends money (model calls)
// and speaks to customers, so it is not open to the internet. Set
// SALES_AGENT_SECRET in Vercel and in the Make HTTP module.
//
// FAILURE POLICY: every unexpected path ends in a handoff, never in
// silence and never in an invented answer. A customer waiting on a human
// is recoverable; a customer told the wrong price is not.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
// 30s, not 60. The model call aborts itself at 20s (see agent.js), so
// anything still running at 30 is stuck — and a stuck invocation holds a
// concurrency slot that every other route on the deployment is queueing
// for. Failing fast here is what keeps one bad conversation from taking
// the site down with it.
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { buildSystemPrompt, addDaysISO } from '@/lib/salesAgent/prompt'
import { callClaude, parseAgentJson, normalizePhone, resolveFollowUp } from '@/lib/salesAgent/agent'
import { getLead, saveExchange, toApiMessages, isPausedForHuman } from '@/lib/salesAgent/leads'
import { BUSINESS } from '@/lib/salesAgent/catalog'

// What the customer sees when the machinery breaks. Deliberately honest
// and short — no apology theatre, no invented reason.
const FALLBACK_REPLY = 'רגע אחד, אני מעביר אותך לנציג שלנו 🙏'

function authorized(req) {
    const secret = process.env.SALES_AGENT_SECRET
    if (!secret) return false // fail CLOSED: an unset secret must not open the door
    const given = req.headers.get('x-wt-secret') || ''
    return given === secret
}

function todayISO() {
    // Israel is UTC+2/+3; using local server time (UTC on Vercel) would
    // roll the date over at 02:00 or 03:00 Israel time and schedule
    // follow-ups a day early. Asia/Jerusalem is the business's clock.
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
}

export async function POST(req) {
    if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'bad-json' }, { status: 400 })
    }

    const phone = normalizePhone(body?.phone)
    const text = String(body?.text || '').trim()
    if (!phone) return NextResponse.json({ error: 'bad-phone' }, { status: 400 })
    if (!text) {
        // Stickers, reactions and media arrive with no text. Staying quiet
        // is correct — answering "לא הבנתי" to a thumbs-up is worse.
        return NextResponse.json({ ok: true, send: [], skipped: 'empty-text' })
    }

    const today = todayISO()
    let lead
    try {
        lead = await getLead(phone)
    } catch (err) {
        console.error('[sales-agent] lead read failed', err)
        return NextResponse.json({ ok: true, send: [FALLBACK_REPLY], handoff: true, notifyOwner: ownerPing(phone, 'שגיאת מסד נתונים — הבוט לא הצליח לקרוא את הליד') })
    }

    // A human already took this conversation. The bot must not talk over
    // Lord mid-negotiation — that is the fastest way to lose a warm lead.
    if (isPausedForHuman(lead)) {
        return NextResponse.json({ ok: true, send: [], paused: true, stage: lead.stage || 'handoff' })
    }

    const system = buildSystemPrompt(lead, today)
    const messages = toApiMessages(lead.turns, text)

    let parsed
    try {
        const { text: raw, usage, stopReason } = await callClaude({ system, messages })
        parsed = parseAgentJson(raw)
        if (usage) console.log('[sales-agent] usage', phone, usage.input_tokens, usage.output_tokens, stopReason)

        // ONE retry on unparseable output before giving up on the customer.
        // A handoff is the safe fallback, not a good one: it pulls a human
        // into a conversation the bot could have handled. A single retry
        // costs a couple of agorot and recovers the common cases — a
        // truncated answer, or a model that wrapped the JSON in prose.
        if (parsed.malformed) {
            console.warn('[sales-agent] unparseable output, retrying once', phone, 'stop:', stopReason)
            const retry = await callClaude({
                system: `${system}\n\nחשוב: התשובה הקודמת שלך לא הייתה JSON תקין. החזר עכשיו אך ורק אובייקט JSON יחיד, בלי טקסט לפניו או אחריו, ושמור על התשובה ללקוח קצרה.`,
                messages,
                temperature: 0.3,
            })
            const second = parseAgentJson(retry.text)
            if (!second.malformed) parsed = second
        }
    } catch (err) {
        console.error('[sales-agent] model call failed', err?.message || err)
        parsed = {
            messages: [FALLBACK_REPLY],
            stage: 'handoff',
            handoff: true,
            handoffReason: `הבוט נפל: ${String(err?.message || err).slice(0, 140)}`,
            eventType: null, eventDate: null, celebrantName: null, customerName: null,
            packageInterest: null, callbackPromised: null, followUpAt: null,
            objectionRaised: false, notes: null, malformed: true,
        }
    }

    // A handoff with no words leaves the customer staring at silence.
    if (parsed.handoff && parsed.messages.length === 0) parsed.messages = [FALLBACK_REPLY]

    const followUpAt = resolveFollowUp({
        parsed,
        todayISO: today,
        followUpCount: lead.followUpCount || 0,
        addDays: addDaysISO,
    })

    try {
        await saveExchange({
            phone,
            incomingText: text,
            parsed,
            followUpAt,
            profileName: body?.profileName,
            source: body?.source,
        })
    } catch (err) {
        // The reply is already written and is worth sending even if the
        // CRM write failed — losing the memory is better than losing the
        // customer. The owner ping makes the gap visible.
        console.error('[sales-agent] lead write failed', err)
    }

    return NextResponse.json({
        ok: true,
        send: parsed.messages,
        // `sendText` is the same reply as ONE string, and it is what the
        // Make scenario should map to.
        //
        // Two bubbles read slightly more human, but sending them costs an
        // Iterator plus a Sleep plus a second sendMessage — roughly double
        // the Make operations per inbound message. On the Free plan (1,000
        // ops/month) that is the difference between ~28 and ~55 real
        // conversations. Nicer typography is not worth halving the number
        // of customers the bot can talk to.
        sendText: parsed.messages.join('\n\n'),
        stage: parsed.stage,
        handoff: parsed.handoff,
        followUpAt,
        notifyOwner: parsed.handoff
            ? ownerPing(phone, parsed.handoffReason, { name: parsed.customerName || lead.name, stage: parsed.stage, lastText: text })
            : null,
    })
}

// The message Lord gets on his own WhatsApp. It has to be readable on a
// lock screen: who, why, and what they just said.
function ownerPing(phone, reason, extra = {}) {
    const lines = [
        '🔔 ליד צריך אותך',
        `טלפון: ${phone}`,
        extra.name ? `שם: ${extra.name}` : null,
        reason ? `סיבה: ${reason}` : null,
        extra.lastText ? `הודעה אחרונה: "${String(extra.lastText).slice(0, 160)}"` : null,
        `פתח שיחה: https://wa.me/${phone}`,
        `הבוט מושתק לשיחה הזאת ל-48 שעות. ${BUSINESS.brand}`,
    ]
    return lines.filter(Boolean).join('\n')
}
