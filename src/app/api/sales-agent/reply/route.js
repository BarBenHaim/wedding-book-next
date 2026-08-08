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
import {
    getLead, saveExchange, toApiMessages, isPausedForHuman,
    isOwnEcho, parseOwnerCommand, setHuman, findCustomerByPhone, listLeads, recordSpend,
} from '@/lib/salesAgent/leads'
import { costOfClaudeUsage } from '@/lib/salesAgent/pricing'
import { parseInboundBody } from '@/lib/salesAgent/inbound'
import { BUSINESS, findMedia } from '@/lib/salesAgent/catalog'
import { assignVariant, summarizeExperiments, summarizeGaps } from '@/lib/salesAgent/experiments'
import { deriveLead, sortLeads, isoInIsrael } from '@/lib/salesAgent/leadsView'
import { buildDigest } from '@/lib/salesAgent/digest'

// What the customer sees when the machinery breaks. Deliberately honest
// and short — no apology theatre, no invented reason.
const FALLBACK_REPLY = 'רגע אחד, אני מעביר אותך לנציג שלנו 🙏'

// What an existing customer hears. Deliberately not a sales sentence:
// they already bought, and the only useful thing the bot can do is
// acknowledge them and get out of the way fast.
const CUSTOMER_REPLY = 'היי! קיבלתי את ההודעה ואני מעביר אותה ללורד, הוא יחזור אליך ממש עוד מעט 🙏'

// The owner's own WhatsApp number, in 972… form. When set, messages
// arriving FROM it are treated as commands rather than as a customer,
// so Lord can mute the bot mid-conversation from his phone. Unset means
// the feature is simply off.
const OWNER_PHONE = normalizePhone(process.env.SALES_AGENT_OWNER_PHONE || '')

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

    // Not req.json(). Make builds the body by interpolating values into a
    // raw string, so one newline or quote in a customer's message makes it
    // stop being JSON — and a strict parse turns that into a 400, which
    // turns into silence for someone who asked a question. See inbound.js.
    let body, repaired
    {
        const raw = await req.text().catch(() => '')
        const parsed = parseInboundBody(raw)
        if (!parsed.body) {
            console.error('[sales-agent] unreadable body', parsed.reason, raw.slice(0, 200))
            return NextResponse.json({ error: 'bad-json', reason: parsed.reason }, { status: 400 })
        }
        body = parsed.body
        repaired = parsed.repaired
    }
    if (repaired) {
        // Not an error — the customer is answered either way. Logged
        // because a rising count is the signal to go fix Make's body
        // template, and without this line nobody would ever know.
        console.warn('[sales-agent] repaired a malformed body from Make')
    }

    const text = String(body?.text || '').trim()

    // Who sent this, and to whom. On a coexistence number Meta echoes
    // the business's OWN outgoing messages back through the same webhook,
    // so "the sender" is not automatically the customer.
    const businessPhone = normalizePhone(body?.businessPhone)
    const from = normalizePhone(body?.from)
    const to = normalizePhone(body?.to)
    const fieldName = String(body?.field || '')
    const outgoing =
        (!!businessPhone && !!from && from === businessPhone) || /echo/i.test(fieldName)

    // For an echo the customer is the RECIPIENT; for a normal message the
    // sender. `body.phone` stays the fallback so the older Make mapping,
    // which sent only that, keeps working unchanged.
    const phone = outgoing ? to || normalizePhone(body?.phone) : normalizePhone(body?.phone) || from
    if (!phone) return NextResponse.json({ error: 'bad-phone' }, { status: 400 })
    if (!text) {
        // Stickers, reactions and media arrive with no text. Staying quiet
        // is correct — answering "לא הבנתי" to a thumbs-up is worse.
        return NextResponse.json({ ok: true, send: [], sendText: '', skipped: 'empty-text' })
    }

    const today = todayISO()
    let lead
    try {
        lead = await getLead(phone)
    } catch (err) {
        console.error('[sales-agent] lead read failed', err)
        return NextResponse.json({ ok: true, send: [FALLBACK_REPLY], sendText: FALLBACK_REPLY, handoff: true, notifyOwner: ownerPing(phone, 'שגיאת מסד נתונים — הבוט לא הצליח לקרוא את הליד') })
    }

    // ── Lord answered in the chat himself ────────────────────────────
    //
    // The single most embarrassing thing this bot can do is talk over its
    // owner. If a message went out from the business and it is not one
    // this bot just wrote, a human is in the conversation — so the bot
    // steps back for 48 hours, exactly as it does after a handoff.
    //
    // Silence here is the whole feature: no reply, no owner ping. Lord
    // knows he is typing.
    if (outgoing) {
        if (isOwnEcho(lead, text)) {
            return NextResponse.json({ ok: true, send: [], sendText: '', skipped: 'own-echo' })
        }
        try {
            await setHuman(phone, true, 'ענית בעצמך בשיחה')
        } catch (err) {
            console.error('[sales-agent] auto-pause failed', err)
        }
        return NextResponse.json({ ok: true, send: [], sendText: '', paused: true, reason: 'owner-replied' })
    }

    // ── A command from Lord's own phone ──────────────────────────────
    // He is never a lead, so this branch also stops the bot from trying
    // to sell a wedding book to its owner.
    if (OWNER_PHONE && phone === OWNER_PHONE) {
        const cmd = parseOwnerCommand(text)
        if (!cmd) {
            return NextResponse.json({ ok: true, send: [], sendText: '', skipped: 'owner-message' })
        }
        // The digest is about the whole pipeline, so it takes no number
        // and must be handled before the "give me a number" guard.
        if (cmd.action === 'digest') {
            try {
                const d = await buildOwnerDigest()
                return NextResponse.json({ ok: true, send: [d], sendText: d, skipped: 'owner-command' })
            } catch (err) {
                console.error('[sales-agent] digest command failed', err)
                const oops = 'לא הצלחתי להרכיב את הדוח כרגע.'
                return NextResponse.json({ ok: true, send: [oops], sendText: oops, skipped: 'owner-command' })
            }
        }

        const target = normalizePhone(cmd.phone)
        if (!target) {
            const help = 'צריך מספר. למשל:\nשקט 0501234567\nבוט 0501234567\nסטטוס 0501234567\n\nאו פשוט: דוח'
            return NextResponse.json({ ok: true, send: [help], sendText: help, skipped: 'owner-command' })
        }
        let reply
        try {
            if (cmd.action === 'pause') {
                await setHuman(target, true, 'השתקת את הבוט מהטלפון')
                reply = `הבוט שותק מול ${target} ל-48 שעות.`
            } else if (cmd.action === 'resume') {
                await setHuman(target, false)
                reply = `הבוט חזר לטפל ב-${target}.`
            } else {
                const t = await getLead(target)
                reply = t?.isNew
                    ? `אין ליד עם המספר ${target}.`
                    : `${target}\nשלב: ${t.stage || 'new'}\nמושתק: ${isPausedForHuman(t) ? 'כן' : 'לא'}\nמעקב: ${t.followUpAt || 'אין'}\n${t.notes || ''}`.trim()
            }
        } catch (err) {
            console.error('[sales-agent] owner command failed', err)
            reply = 'הפעולה נכשלה. נסה שוב.'
        }
        return NextResponse.json({ ok: true, send: [reply], sendText: reply, skipped: 'owner-command' })
    }

    // A human already took this conversation. The bot must not talk over
    // Lord mid-negotiation — that is the fastest way to lose a warm lead.
    if (isPausedForHuman(lead)) {
        return NextResponse.json({ ok: true, send: [], sendText: '', paused: true, stage: lead.stage || 'handoff' })
    }

    // ── Already a customer ───────────────────────────────────────────
    //
    // Someone who has paid is not a lead. Pitching them the packages
    // tells them nobody here knows who they are, and the questions they
    // actually ask — where is my book, can I still add a blessing — are
    // support, not sales. So the bot acknowledges, pings Lord, and mutes
    // itself.
    //
    // Two ways to be a customer: the bot closed them (stage), or they
    // bought before the bot existed (a wedding with their phone on it).
    // The second is checked only on a first message, so it costs one
    // query per new conversation rather than one per message.
    let customer = null
    if (lead.stage === 'closed_won') {
        customer = { weddingId: lead.weddingId || null, ownerName: lead.name || null }
    } else if (lead.isNew) {
        customer = await findCustomerByPhone(phone)
    }
    if (customer) {
        try {
            await setHuman(phone, true, 'לקוח קיים כתב')
        } catch (err) {
            console.error('[sales-agent] customer mute failed', err)
        }
        return NextResponse.json({
            ok: true,
            send: [CUSTOMER_REPLY],
            sendText: CUSTOMER_REPLY,
            handoff: true,
            customer: true,
            notifyOwner: ownerPing(phone, 'לקוח קיים כתב — הבוט לא מכר לו, השיחה שלך', {
                name: customer.ownerName || lead.name,
                stage: lead.stage,
                lastText: text,
            }),
        })
    }

    // How long he has been gone. The prompt uses this to decide between
    // continuing a thread and reopening one; without it the agent either
    // greets someone who wrote a minute ago or resumes mid-sentence with
    // someone who disappeared for two weeks.
    const lastMs = lead.lastInboundAt?.toMillis?.() || Number(lead.lastInboundAt) || 0
    const daysSinceLastMessage = lastMs ? Math.floor((Date.now() - lastMs) / 86400000) : null

    // Which opening this lead is testing. Assigned from the phone number
    // rather than drawn at random, so a retry can never move them to a
    // different arm and quietly bias the comparison.
    const variant = lead.variant || assignVariant(phone)

    const system = buildSystemPrompt({ ...lead, daysSinceLastMessage, variant }, today)
    const messages = toApiMessages(lead.turns, text)

    // Cost bookkeeping. Fire-and-forget on purpose: the customer is
    // waiting on this request, and a Firestore write for accounting must
    // never be on the path between them and an answer.
    const spends = []
    const meter = (usage, model) => {
        if (!usage) return
        const { usd, known } = costOfClaudeUsage(usage, model)
        if (!known) console.warn('[sales-agent] no price known for model', model)
        spends.push(recordSpend({ provider: 'anthropic', model, usd, usage, todayISO: today }))
    }

    let parsed
    try {
        const { text: raw, usage, model, stopReason } = await callClaude({ system, messages })
        parsed = parseAgentJson(raw)
        if (usage) console.log('[sales-agent] usage', phone, usage.input_tokens, usage.output_tokens, stopReason)
        // Metered here rather than after the retry, because a retry is a
        // second billed call and hiding it would make the failure look
        // free. See pricing.js.
        meter(usage, model)

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
            meter(retry.usage, retry.model)
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
            objectionRaised: false, notes: null, image: null, malformed: true,
        }
    }

    // A handoff with no words leaves the customer staring at silence.
    if (parsed.handoff && parsed.messages.length === 0) parsed.messages = [FALLBACK_REPLY]

    // Never send the same photo twice. The model is told which ones went
    // out already, but the CRM is the thing that actually knows, and a
    // repeated image is the kind of small wrongness that makes a whole
    // conversation feel automated.
    if (parsed.image && Array.isArray(lead.imagesSent) && lead.imagesSent.includes(parsed.image)) {
        parsed.image = null
    }
    const media = parsed.image ? findMedia(parsed.image) : null
    if (!media) parsed.image = null

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
            variant,
            isNew: !!lead.isNew,
        })
    } catch (err) {
        // The reply is already written and is worth sending even if the
        // CRM write failed — losing the memory is better than losing the
        // customer. The owner ping makes the gap visible.
        console.error('[sales-agent] lead write failed', err)
    }

    // Settled, not awaited earlier: the accounting rides along with the
    // CRM write instead of adding its own round trip before it.
    await Promise.allSettled(spends)

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
        // The photo, if the agent asked for one. Make sends it as a second
        // message right after the text, gated on `hasImage`.
        //
        // Two bubbles rather than one photo-with-a-long-caption is
        // deliberate: it is how a person actually sends a picture in
        // WhatsApp — a line, then the photo — and it keeps the text
        // module unconditional, so a bad image URL can never swallow the
        // reply the customer was waiting for.
        //
        // The caption comes from the catalog, not the model. It is one
        // factual line about what is in the frame, and it cannot drift.
        sendImage: media ? media.url : null,
        sendImageCaption: media ? media.caption : null,
        hasImage: !!media,
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

// The same digest the scheduled job sends, on demand. Worth having as a
// command as well as a schedule: a template takes days to get approved,
// and "דוח" works this afternoon.
const DIGEST_TIME_FIELDS = ['lastInboundAt', 'lastMessageAt', 'updatedAt', 'closedAt', 'humanSince', 'createdAt']

async function buildOwnerDigest() {
    const today = isoInIsrael()
    const now = Date.now()
    const raw = await listLeads({ limit: 500 })
    const items = sortLeads(
        raw.map(l => {
            const flat = { ...l }
            for (const f of DIGEST_TIME_FIELDS) {
                const v = l?.[f]
                flat[f] = v == null ? null : typeof v === 'number' ? v : typeof v?.toMillis === 'function' ? v.toMillis() : typeof v?.seconds === 'number' ? v.seconds * 1000 : null
            }
            const d = deriveLead(flat, { todayISO: today, nowMs: now })
            d.createdAtMs = flat.createdAt
            return d
        }),
    )
    const d = buildDigest(items, {
        todayISO: today,
        nowMs: now,
        experiments: summarizeExperiments(items),
        gaps: summarizeGaps(items),
    })
    return d.hasNews ? d.text : 'הכל שקט. אין ממתינים, אין פולו-אפים להיום, ולא היו שיחות אתמול.'
}
