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
import { createHash } from 'crypto'
import { buildSystemPrompt, addDaysISO } from '@/lib/salesAgent/prompt'
import { callClaude, parseAgentJson, normalizePhone, resolveFollowUp } from '@/lib/salesAgent/agent'
import {
    getLead, toApiMessages, isPausedForHuman,
    isOwnEcho, parseOwnerCommand, setHuman, findCustomerByPhone, listLeads, recordSpend,
    listMedia, creditPendingMedia,
    claimInboundEvent, completeInboundEvent,
    acquireProviderCircuit, recordProviderFailure, recordProviderSuccess, releaseProviderProbe, completeProviderFallback as persistProviderFallback, completeSuccessfulExchange, compactLeadBestEffort,
    recordInboundHeartbeat,
} from '@/lib/salesAgent/leads'
import { costOfClaudeUsage } from '@/lib/salesAgent/pricing'
import { parseInboundBody } from '@/lib/salesAgent/inbound'
import { resolveSource } from '@/lib/salesAgent/attribution'
import { BUSINESS, MEDIA } from '@/lib/salesAgent/catalog'
import { mergeMedia, performanceNote } from '@/lib/salesAgent/mediaLibrary'
import { priceDodged, priceFallbackMessage } from '@/lib/salesAgent/selling'
import { mediaGuard } from '@/lib/salesAgent/mediaGuard'
import { DEFAULT_SALES_SETTINGS, resolveSalesSettings } from '@/lib/salesAgent/settings'
import { readSalesSettings } from '@/lib/salesAgent/settingsStore'
import { assignVariant, summarizeExperiments, summarizeGaps } from '@/lib/salesAgent/experiments'
import { deriveLead, sortLeads, isoInIsrael } from '@/lib/salesAgent/leadsView'
import { buildDigest } from '@/lib/salesAgent/digest'
import { normalizeProviderError, INBOUND_ROUTE_DEADLINE_MS, INBOUND_HEARTBEAT_BUDGET_MS, FALLBACK_COMMIT_RESERVE_MS } from '@/lib/salesAgent/circuitBreaker'
import { decideInboundAge } from '@/lib/salesAgent/transportPolicy'
import { buildDeterministicSalesReply, decideSalesTurn, enforceSalesReply } from '@/lib/salesAgent/decisionPolicy'
import { buildOpeningPlan } from '@/lib/salesAgent/openingPlan'
import { buildOpeningOnlyPlan } from '@/lib/salesAgent/openingOnly'
import { prepareOpeningRuntime } from '@/lib/salesAgent/openingRuntime'
import {
    loadOpeningVariableVersions,
    signOpeningVariableDownload,
} from '@/lib/salesAgent/openingVariableRuntimeStore'
import { readPriorConversationContext } from '@/lib/salesAgent/priorContext'

// What the customer sees when the machinery breaks. Deliberately honest
// and short — no apology theatre, no invented reason.
const FALLBACK_REPLY = 'רגע אחד, אני מעביר אותך לנציג שלנו 🙏'
const AI_OUTAGE_REPLY = 'קיבלתי את ההודעה שלך. מישהו מהצוות יחזור אליך בהקדם.'
const AI_OUTAGE_REASON = 'תקלה בשירות ה-AI'

// What an existing customer hears. Deliberately not a sales sentence:
// they already bought, and the only useful thing the bot can do is
// acknowledge them and get out of the way fast.
const CUSTOMER_REPLY = `היי! קיבלתי את ההודעה ואני מעביר אותה ל${BUSINESS.ownerName || 'צוות'}, נחזור אליך ממש עוד מעט 🙏`

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

async function recordInboundHeartbeatBestEffort(receivedAtMs) {
    let timeoutId
    const timeout = new Promise(resolve => {
        timeoutId = setTimeout(() => resolve('timeout'), INBOUND_HEARTBEAT_BUDGET_MS)
    })
    const write = Promise.resolve()
        .then(() => recordInboundHeartbeat({ receivedAtMs }))
        .then(() => 'recorded', () => 'failed')
    const result = await Promise.race([write, timeout])
    clearTimeout(timeoutId)
    if (result === 'timeout') console.warn('[sales-agent] inbound heartbeat timed out')
    if (result === 'failed') console.warn('[sales-agent] inbound heartbeat write failed')
}

export async function POST(req) {
    // One end-to-end deadline starts before body parsing and claim work. It
    // leaves a fenced final reserve for durable fallback and HTTP transport.
    const routeDeadlineAtMs = Date.now() + INBOUND_ROUTE_DEADLINE_MS
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
            console.error('[sales-agent] unreadable body', parsed.reason)
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

    const eventId = String(body.eventId || '').trim()
    if (!eventId) return NextResponse.json({ error: 'missing-event-id' }, { status: 400 })

    // This authenticated request is already the Make heartbeat. Persist a
    // timestamp only; never copy the event ID, phone, message, or payload.
    // Give the health write a brief durability opportunity, then continue.
    // A stalled or failed monitoring write must never delay event claiming,
    // duplicate fencing, or the customer response.
    await recordInboundHeartbeatBestEffort(Date.now())

    const text = String(body?.text || '').trim()
    const messageType = body.messageType

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
    if (Date.now() >= routeDeadlineAtMs) return NextResponse.json({ error: 'inbound-deadline-exhausted' }, { status: 503 })

    let claim
    try {
        claim = await claimInboundEvent({ eventId, phone, occurredAt: body.occurredAt })
    } catch {
        console.error('[sales-agent] event claim failed')
        return NextResponse.json({ error: 'event-claim-failed' }, { status: 503 })
    }
    if (claim.action === 'cached') {
        return NextResponse.json({
            ok: true,
            duplicate: true,
            shouldSend: false,
            cachedOutcome: claim.outcome,
            sendText: '',
            hasImage: false,
            hasVideo: false,
            handoff: false,
        })
    }
    if (claim.action === 'busy') {
        return NextResponse.json({ ok: true, duplicate: true, processing: true, shouldSend: false }, { status: 202 })
    }
    const providerDeadlineAtMs = routeDeadlineAtMs - FALLBACK_COMMIT_RESERVE_MS

    // Once this worker owns the event, no response may leave without
    // finalizing it. A stale worker must go silent rather than replaying
    // an answer that a newer worker has already made durable.
    const complete = async (payload, transport = payload) => {
        const outcome = {
            sendText: payload.sendText || '',
            sendImage: payload.sendImage || null,
            sendImageCaption: payload.sendImageCaption || null,
            sendVideo: payload.sendVideo || null,
            sendVideoCaption: payload.sendVideoCaption || null,
            // Handoff is reserved for an actual human takeover. An
            // intentional no-send event remains truthful in the event
            // record, so a duplicate cannot turn silence into a handoff.
            handoff: payload.handoff === true,
            noReply: payload.noReply === true,
            skipped: payload.skipped || null,
            stage: payload.stage || null,
            followUpAt: payload.followUpAt || null,
            notifyOwner: payload.notifyOwner || null,
        }
        try {
            const result = await completeInboundEvent({ eventId, claimToken: claim.claimToken, outcome })
            if (result.action === 'completed') return NextResponse.json(transport)
            if (result.action === 'cached') {
                return NextResponse.json({
                    ok: true, duplicate: true, shouldSend: false, cachedOutcome: result.outcome,
                    sendText: '', hasImage: false, hasVideo: false, handoff: false,
                })
            }
            return NextResponse.json({ ok: true, duplicate: true, processing: true, shouldSend: false }, { status: 202 })
        } catch {
            console.error('[sales-agent] event completion failed')
            return NextResponse.json({ error: 'event-completion-failed' }, { status: 503 })
        }
    }

    // A provider queue can survive an outage longer than the customer's
    // context. Replaying those records as fresh conversations produces the
    // worst possible recovery: a surprise sales reply hours later. Complete
    // the event durably so provider retries stay silent, but do no lead,
    // media, breaker, or model work.
    const inboundAge = decideInboundAge({ occurredAt: body.occurredAt })
    if (inboundAge.action === 'skip-stale') {
        return complete({
            ok: true,
            shouldSend: false,
            send: [],
            sendText: '',
            handoff: false,
            noReply: true,
            skipped: 'stale-inbound',
        })
    }

    // A breaker fallback is not durable until the handoff state and inbound
    // completion both succeed. If either write fails, leave the claim for a
    // retry rather than claiming that a human was notified when they were not.
    const completeProviderFallback = async () => {
        try {
            if (Date.now() >= routeDeadlineAtMs) return NextResponse.json({ error: 'provider-fallback-deadline-exhausted' }, { status: 503 })
            const result = await persistProviderFallback({
                eventId,
                claimToken: claim.claimToken,
                claimGeneration: claim.claimGeneration,
                phone,
                reason: AI_OUTAGE_REASON,
                // This is a technical handoff, not a customer request for a
                // person. Keep the 48-hour human-pause safety window, then let
                // the normal WhatsApp follow-up ladder recover the sale.
                recoveryFollowUpAt: addDaysISO(today, 2),
                outcome: {
                    sendText: AI_OUTAGE_REPLY,
                    stage: 'handoff',
                    handoff: true,
                    notifyOwner: ownerPing(phone, AI_OUTAGE_REASON, { name: body.profileName || lead?.name }),
                },
                deadlineAtMs: routeDeadlineAtMs,
            })
            if (result.action === 'completed') {
                return NextResponse.json({
                    ok: true,
                    send: [AI_OUTAGE_REPLY],
                    sendText: AI_OUTAGE_REPLY,
                    stage: 'handoff',
                    handoff: true,
                    handoffReason: AI_OUTAGE_REASON,
                    notifyOwner: ownerPing(phone, AI_OUTAGE_REASON, { name: body.profileName || lead?.name }),
                })
            }
            if (result.action === 'cached') {
                return NextResponse.json({ ok: true, duplicate: true, shouldSend: false, cachedOutcome: result.outcome, sendText: '', hasImage: false, hasVideo: false, handoff: false })
            }
            if (result.action === 'busy') return NextResponse.json({ ok: true, duplicate: true, processing: true, shouldSend: false }, { status: 202 })
            return NextResponse.json({ error: 'provider-fallback-stale' }, { status: 503 })
        } catch {
            console.error('[sales-agent] provider fallback commit failed')
            return NextResponse.json({ error: 'provider-fallback-commit-failed' }, { status: 503 })
        }
    }

    if (!text && messageType === 'text') {
        // Reactions and empty text events stay quiet. Their event is still
        // finalized above so a provider retry cannot later wake the bot.
        return complete({ ok: true, send: [], sendText: '', handoff: false, noReply: true, skipped: 'empty-text' })
    }

    // Load the owner-controlled mode before any branch that could create a
    // customer-visible fallback. In opening-only mode the configured opening
    // is the sole permitted automated message; database or settings trouble
    // must therefore fail silent, never invent a support/handoff reply.
    let custom = []
    try {
        const mediaRows = await listMedia()
        custom = Array.isArray(mediaRows) ? mediaRows : []
    } catch {
        console.warn('[sales-agent] media library read failed; using built-ins')
    }
    const library = mergeMedia(MEDIA, custom) || MEDIA || {}
    const stats = Object.fromEntries(custom.map(m => [m.key, m]))
    const perf = performanceNote(stats, library)
    let settings
    try {
        settings = await readSalesSettings({ registeredMediaKeys: Object.keys(library) })
    } catch {
        console.warn('[sales-agent] settings read failed; using safe defaults')
        settings = resolveSalesSettings(DEFAULT_SALES_SETTINGS, { registeredMediaKeys: Object.keys(library) })
    }
    const today = todayISO()
    let lead
    try {
        lead = await getLead(phone)
    } catch {
        console.error('[sales-agent] lead read failed')
        if (!settings.enabled || settings.mode === 'opening_only') {
            return complete({
                ok: true, shouldSend: false, send: [], sendText: '', hasImage: false, hasVideo: false,
                handoff: false, noReply: true,
                skipped: settings.enabled ? 'opening-only-state-unavailable' : 'agent-disabled',
            })
        }
        return complete({ ok: true, send: [FALLBACK_REPLY], sendText: FALLBACK_REPLY, handoff: true, notifyOwner: ownerPing(phone, 'שגיאת מסד נתונים — הבוט לא הצליח לקרוא את הליד') })
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
            return complete({ ok: true, send: [], sendText: '', handoff: false, noReply: true, skipped: 'own-echo' })
        }
        try {
            await setHuman(phone, true, 'ענית בעצמך בשיחה')
        } catch {
            console.error('[sales-agent] auto-pause failed')
            return NextResponse.json({ error: 'owner-takeover-persist-failed' }, { status: 503 })
        }
        return complete(
            { ok: true, send: [], sendText: '', handoff: true, noReply: false, paused: true, reason: 'owner-replied' },
            {
                ok: true, send: [], sendText: '', hasImage: false, hasVideo: false,
                shouldSend: false, handoff: false, noReply: true, paused: true, reason: 'owner-replied',
            },
        )
    }

    // ── A command from Lord's own phone ──────────────────────────────
    // He is never a lead, so this branch also stops the bot from trying
    // to sell a wedding book to its owner.
    if (OWNER_PHONE && phone === OWNER_PHONE) {
        const cmd = parseOwnerCommand(text)
        if (!cmd) {
            return complete({ ok: true, send: [], sendText: '', handoff: false, noReply: true, skipped: 'owner-message' })
        }
        // The digest is about the whole pipeline, so it takes no number
        // and must be handled before the "give me a number" guard.
        if (cmd.action === 'digest') {
            try {
                const d = await buildOwnerDigest()
                return complete({ ok: true, send: [d], sendText: d, skipped: 'owner-command' })
            } catch {
                console.error('[sales-agent] digest command failed')
                const oops = 'לא הצלחתי להרכיב את הדוח כרגע.'
                return complete({ ok: true, send: [oops], sendText: oops, skipped: 'owner-command' })
            }
        }

        const target = normalizePhone(cmd.phone)
        if (!target) {
            const help = 'צריך מספר. למשל:\nשקט 0501234567\nבוט 0501234567\nסטטוס 0501234567\n\nאו פשוט: דוח'
            return complete({ ok: true, send: [help], sendText: help, skipped: 'owner-command' })
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
        } catch {
            console.error('[sales-agent] owner command failed')
            reply = 'הפעולה נכשלה. נסה שוב.'
        }
        return complete({ ok: true, send: [reply], sendText: reply, skipped: 'owner-command' })
    }

    if (!settings.enabled) {
        return complete({
            ok: true, shouldSend: false, send: [], sendText: '', hasImage: false, hasVideo: false,
            handoff: false, noReply: true, skipped: 'agent-disabled',
        })
    }

    // Firestore only knows conversations that already passed through this
    // agent. BusinessOS also holds the historical WhatsApp import. Before a
    // locally-new phone is allowed to receive the opening bundle, prove that
    // it has no older conversation there. An unavailable check is treated as
    // prior history: the normal answer may continue, but never a cold reset.
    if (lead.isNew === true) {
        const prior = await readPriorConversationContext(phone, { occurredAt: body.occurredAt })
        if (prior.state === 'found') {
            lead = {
                ...lead,
                isNew: false,
                hasPriorConversation: true,
                eventType: lead.eventType || prior.eventType,
                eventDate: lead.eventDate || prior.eventDate,
                name: lead.name || prior.celebrantName,
                stage: prior.stage || lead.stage,
                notes: lead.notes || prior.summary,
                historicalMessageCount: prior.messageCount,
                historicalLastMessageAt: prior.lastMessageAt,
            }
        } else {
            lead = { ...lead, hasPriorConversation: prior.hasPriorConversation === true }
        }
    }

    // A human already took this conversation. The bot must not talk over
    // Lord mid-negotiation — that is the fastest way to lose a warm lead.
    if (isPausedForHuman(lead)) {
        return complete({ ok: true, send: [], sendText: '', handoff: false, noReply: true, paused: true, stage: lead.stage || 'handoff' })
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
        } catch {
            console.error('[sales-agent] customer mute failed')
        }
        if (settings.mode === 'opening_only') {
            return complete({
                ok: true,
                shouldSend: false,
                send: [],
                sendText: '',
                handoff: false,
                noReply: true,
                customer: true,
                skipped: 'opening-only-customer',
                notifyOwner: ownerPing(phone, 'לקוח קיים כתב — האוטומציה נשארה שקטה', {
                    name: customer.ownerName || lead.name,
                    stage: lead.stage,
                    lastText: text,
                }),
            })
        }
        return complete({
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

    // The published A/B/C opening experiment is deterministic and has no
    // model dependency. A lead is enrolled only once; subsequent inbound
    // events resume the pinned revision and state instead of restarting.
    let openingRuntime
    try {
        const variableVersions = await loadOpeningVariableVersions(settings.openingExperiment)
        openingRuntime = await prepareOpeningRuntime({
            lead,
            experiment: settings.openingExperiment,
            leadKey: phone,
            inbound: { kind: messageType, text, mediaId: body.mediaId },
            library,
            variableVersions,
            leadContext: {
                first_name: body?.profileName || lead.name || null,
                event_type: lead.eventType || null,
                event_date: lead.eventDate || null,
                child_name: lead.childName || null,
                days_to_event: lead.daysToEvent ?? null,
                payment_link: lead.paymentLink || null,
            },
            signDownload: signOpeningVariableDownload,
            eventId,
        })
    } catch {
        console.error('[sales-agent] opening variable resolution failed')
        return NextResponse.json({ error: 'opening-variable-resolution-failed' }, { status: 503 })
    }
    if (openingRuntime.eligible) {
        const { result, enrollment, expectedStateVersion, replyToExposure } = openingRuntime
        const sequenceParts = result.parts || []
        const textParts = sequenceParts.filter(part => part.kind === 'text' && String(part.text || '').trim())
        const images = sequenceParts.filter(part => part.kind === 'image')
        const videos = sequenceParts.filter(part => part.kind === 'video')
        const audios = sequenceParts.filter(part => part.kind === 'audio')
        const mediaParts = sequenceParts.filter(part => ['image', 'video', 'audio'].includes(part.kind))
        const variantId = enrollment?.variantId || lead.openingVariantId
        const variantRevision = enrollment?.variantRevision || lead.openingVariantRevision
        const shouldSend = sequenceParts.length > 0
        const parsed = {
            malformed: false,
            messages: textParts.map(part => part.text),
            stage: result.completed ? 'opening_completed' : 'engaged',
            handoff: false,
            handoffReason: null,
            image: images[0]?.mediaKey || null,
            openingMediaKeys: sequenceParts.flatMap(part => part.mediaKey ? [part.mediaKey] : []),
            eventType: result.captures?.eventType || lead.eventType || null,
            eventDate: result.captures?.eventDate || lead.eventDate || null,
            callbackPromised: null,
            followUpAt: null,
        }
        const responsePayload = {
            ok: true,
            shouldSend,
            send: textParts.map(part => part.text),
            sendText: textParts[0]?.text || '',
            sendImage: images[0]?.url || null,
            sendImageCaption: images[0]?.caption || null,
            hasImage: images.length > 0,
            sendVideo: videos[0]?.url || null,
            sendVideoCaption: videos[0]?.caption || null,
            hasVideo: videos.length > 0,
            sendAudio: audios[0]?.url || null,
            sendAudioCaption: audios[0]?.caption || null,
            sendAudioVoiceNote: audios[0]?.voiceNote === true,
            hasAudio: audios.length > 0,
            openingMediaCount: mediaParts.length,
            openingMediaParts: mediaParts,
            ...Object.fromEntries(mediaParts.flatMap((part, index) => {
                const slot = index + 1
                return [
                    [`openingMedia${slot}Id`, part.partId],
                    [`openingMedia${slot}Kind`, part.kind],
                    [`openingMedia${slot}Url`, part.url],
                    [`openingMedia${slot}Caption`, part.caption || ''],
                    [`openingMedia${slot}VoiceNote`, part.kind === 'audio' && part.voiceNote === true],
                ]
            })),
            openingSequenceParts: sequenceParts,
            openingExperiment: { variantId, variantRevision, action: result.action },
            stage: parsed.stage,
            handoff: false,
            noReply: !shouldSend,
            followUpAt: null,
            notifyOwner: null,
        }
        const exchange = {
            phone,
            incomingText: text || `[${messageType}]`,
            parsed,
            followUpAt: null,
            profileName: body?.profileName,
            source: resolveSource({ isNew: !!lead.isNew, text, existing: lead.source, fallback: body?.source }),
            variant: null,
            isNew: !!lead.isNew,
            openingRuntime: {
                expectedStateVersion,
                enrollment,
                state: result.state,
                captures: result.captures,
                approvalRequest: result.approvalRequest,
                completed: result.completed,
                action: result.action,
                variantId,
                variantRevision,
                replyToExposure,
                exposedAt: lead.openingExposedAt || null,
            },
        }
        try {
            const durable = await completeSuccessfulExchange({
                eventId,
                claimToken: claim.claimToken,
                claimGeneration: claim.claimGeneration,
                exchange,
                outcome: responsePayload,
                deadlineAtMs: routeDeadlineAtMs,
            })
            if (durable.action === 'completed') {
                compactLeadBestEffort(phone)
                return NextResponse.json(responsePayload)
            }
            if (durable.action === 'cached') {
                return NextResponse.json({
                    ok: true, duplicate: true, shouldSend: false, cachedOutcome: durable.outcome,
                    sendText: '', hasImage: false, hasVideo: false, hasAudio: false, handoff: false,
                })
            }
            return NextResponse.json({ error: 'opening-experiment-commit-stale' }, { status: 503 })
        } catch {
            console.error('[sales-agent] opening experiment commit failed')
            return NextResponse.json({ error: 'opening-experiment-commit-failed' }, { status: 503 })
        }
    }

    // A photo, video, voice note, or document cannot be interpreted
    // reliably without its bytes. Keep the handoff in this WhatsApp chat;
    // do not spend a model call inventing what the attachment might show.
    if (messageType !== 'text') {
        const handoffReason = messageType === 'image'
            ? 'הלקוח שלח תמונה — נדרשת בדיקה אנושית והכנת דוגמה אם הוצעה'
            : `הלקוח שלח ${messageType} — נדרשת בדיקה אנושית`
        try {
            // This write is deliberately before event completion. Otherwise
            // a retry could be suppressed while the lead was never marked
            // for the human who needs to open the existing WhatsApp chat.
            await setHuman(phone, true, handoffReason)
        } catch {
            console.error('[sales-agent] media handoff persistence failed')
            return NextResponse.json({ error: 'media-handoff-persist-failed' }, { status: 503 })
        }
        return complete({
            ok: true,
            send: [],
            sendText: '',
            hasImage: false,
            hasVideo: false,
            stage: 'handoff',
            handoff: true,
            noReply: false,
            handoffReason,
            notifyOwner: ownerPing(phone, handoffReason, { name: body.profileName }),
        })
    }

    // How long he has been gone. The prompt uses this to decide between
    // continuing a thread and reopening one; without it the agent either
    // greets someone who wrote a minute ago or resumes mid-sentence with
    // someone who disappeared for two weeks.
    const lastMs = lead.lastInboundAt?.toMillis?.() || Number(lead.lastInboundAt) || 0
    const daysSinceLastMessage = lastMs ? Math.floor((Date.now() - lastMs) / 86400000) : null

    if (settings.mode === 'opening_only') {
        const opening = buildOpeningOnlyPlan({ lead, settings, library, eventId })
        if (!opening.eligible) {
            return complete({
                ok: true, shouldSend: false, sendText: '', hasImage: false, hasVideo: false,
                handoff: false, noReply: true, skipped: 'opening-only-existing', stage: lead.stage || 'engaged',
            })
        }

        const images = opening.mediaParts.filter(part => part.kind === 'image')
        const videos = opening.mediaParts.filter(part => part.kind === 'video')
        const parsed = {
            malformed: false,
            messages: [opening.text],
            stage: 'engaged',
            handoff: false,
            handoffReason: null,
            image: images[0]?.mediaKey || null,
            openingMediaKeys: opening.mediaParts.map(part => part.mediaKey),
            eventType: lead.eventType || null,
            eventDate: lead.eventDate || null,
            callbackPromised: null,
            followUpAt: null,
        }
        const responsePayload = {
            ok: true,
            shouldSend: true,
            send: [opening.text],
            sendText: opening.text,
            sendImage: images[0]?.url || null,
            sendImageCaption: images[0]?.caption || null,
            hasImage: images.length > 0,
            sendVideo: videos[0]?.url || null,
            sendVideoCaption: videos[0]?.caption || null,
            hasVideo: videos.length > 0,
            openingMediaCount: opening.mediaParts.length,
            openingMediaParts: opening.mediaParts,
            openingSequenceParts: opening.sequenceParts,
            postOpeningText: '',
            openingAnswerId: opening.sequenceParts[0]?.partId || null,
            openingAnswerText: opening.text,
            openingImage1Id: images[0]?.partId || null,
            openingImage1Url: images[0]?.url || null,
            openingImage1Caption: images[0]?.caption || null,
            openingImage2Id: images[1]?.partId || null,
            openingImage2Url: images[1]?.url || null,
            openingImage2Caption: images[1]?.caption || null,
            openingClosingId: null,
            openingClosingText: null,
            ...Object.fromEntries(opening.mediaParts.flatMap((part, index) => {
                const slot = index + 1
                return [
                    [`openingMedia${slot}Id`, part.partId],
                    [`openingMedia${slot}Kind`, part.kind],
                    [`openingMedia${slot}Url`, part.url],
                    [`openingMedia${slot}Caption`, part.caption],
                ]
            })),
            stage: 'engaged',
            handoff: false,
            followUpAt: null,
            notifyOwner: null,
        }
        const exchange = {
            phone,
            incomingText: text,
            parsed,
            followUpAt: null,
            profileName: body?.profileName,
            source: resolveSource({ isNew: true, text, existing: lead.source, fallback: body?.source }),
            variant: null,
            isNew: true,
        }
        try {
            const durable = await completeSuccessfulExchange({
                eventId,
                claimToken: claim.claimToken,
                claimGeneration: claim.claimGeneration,
                exchange,
                outcome: responsePayload,
                deadlineAtMs: routeDeadlineAtMs,
            })
            if (durable.action === 'completed') {
                compactLeadBestEffort(phone)
                return NextResponse.json(responsePayload)
            }
            if (durable.action === 'cached') {
                return NextResponse.json({
                    ok: true, duplicate: true, shouldSend: false, cachedOutcome: durable.outcome,
                    sendText: '', hasImage: false, hasVideo: false, handoff: false,
                })
            }
            return NextResponse.json({
                error: durable.action === 'deadline'
                    ? 'success-commit-deadline-exhausted'
                    : 'success-commit-stale',
            }, { status: 503 })
        } catch {
            console.error('[sales-agent] opening-only commit failed')
            return NextResponse.json({ error: 'success-commit-failed' }, { status: 503 })
        }
    }

    // Which opening this lead is testing. Assignment uses the configured
    // executable pool, while an existing lead keeps its historical arm.
    const variant = lead.variant || assignVariant(phone, settings.activeOpeningIds)
    // The route already returned above while the 48h handoff pause was
    // live; passing the expiry-aware value keeps the decision layer from
    // re-muting an expired handoff forever.
    const turnDecision = decideSalesTurn({
        lead,
        incomingText: text,
        isExistingCustomer: false,
        pausedForHuman: isPausedForHuman(lead),
    })

    // They wrote back. If something was sent to them inside the last day,
    // that write-back is the only evidence we will ever get that it was
    // worth sending, so it is credited before anything else can fail.
    creditPendingMedia(lead).catch(() => {})

    const providerKeyAvailable = settings.provider === 'anthropic'
        ? !!String(process.env.ANTHROPIC_API_KEY || '').trim()
        : settings.provider === 'openai'
            ? !!String(process.env.OPENAI_API_KEY || '').trim()
            : !!String(process.env.ANTHROPIC_API_KEY || '').trim() || !!String(process.env.OPENAI_API_KEY || '').trim()
    let parsed = providerKeyAvailable
        ? null
        : buildDeterministicSalesReply({ decision: turnDecision, lead, incomingText: text })

    const system = parsed ? '' : buildSystemPrompt({ ...lead, daysSinceLastMessage, variant }, today, {
        media: library,
        performanceNote: perf,
        businessInstructions: settings.businessInstructions,
        activeOpeningIds: settings.activeOpeningIds,
        turnDecision,
    })
    const messages = parsed ? [] : toApiMessages(lead.turns, text)
    const spends = []

    if (!parsed) {
        // Provider enrichment is optional; the deterministic sales policy is
        // the durable engine. A missing key, open breaker, or provider error
        // must not turn a catalog question into a human handoff.
        let circuit = null
        if (Date.now() >= providerDeadlineAtMs) {
            parsed = buildDeterministicSalesReply({ decision: turnDecision, lead, incomingText: text })
        } else {
            try {
                circuit = await acquireProviderCircuit({ deadlineAtMs: providerDeadlineAtMs })
            } catch {
                console.error('[sales-agent] provider breaker check failed')
                return NextResponse.json({ error: 'provider-breaker-unavailable' }, { status: 503 })
            }
            if (!circuit.allow) {
                parsed = buildDeterministicSalesReply({ decision: turnDecision, lead, incomingText: text })
            }
        }

        if (!parsed) {
            const meter = (usage, model, provider = 'anthropic') => {
                if (!usage) return
                const { usd, known } = costOfClaudeUsage(usage, model)
                if (!known) console.warn('[sales-agent] no price known for model', model)
                spends.push(recordSpend({ provider: provider === 'openai' ? 'openai' : 'anthropic', model, usd, usage, todayISO: today }))
            }

            let providerFailureCode = null
            let providerStarted = false
            try {
                const { text: raw, usage, model, stopReason, provider } = await callClaude({
                    system, messages, deadlineAtMs: providerDeadlineAtMs,
                    provider: settings.provider, model: settings.model,
                })
                providerStarted = true
                parsed = parseAgentJson(raw, { mediaKeys: Object.keys(library) })
                if (usage) console.log('[sales-agent] usage', usage.input_tokens, usage.output_tokens, stopReason)
                meter(usage, model, provider)

                if (parsed.malformed) {
                    console.warn('[sales-agent] unparseable output, retrying once', 'stop:', stopReason)
                    let retry
                    try {
                        retry = await callClaude({
                            system: `${system}\n\nחשוב: התשובה הקודמת שלך לא הייתה JSON תקין. החזר עכשיו אך ורק אובייקט JSON יחיד, בלי טקסט לפניו או אחריו, ושמור על התשובה ללקוח קצרה.`,
                            messages,
                            temperature: 0.3,
                            deadlineAtMs: providerDeadlineAtMs,
                            provider: settings.provider,
                            model: settings.model,
                        })
                        providerStarted = true
                    } catch (err) {
                        providerStarted = providerStarted || err?.providerStarted !== false
                        providerFailureCode = err?.providerStarted === false ? 'invalid_json' : normalizeProviderError(err)
                    }
                    if (retry) {
                        meter(retry.usage, retry.model, retry.provider)
                        const second = parseAgentJson(retry.text, { mediaKeys: Object.keys(library) })
                        if (!second.malformed) parsed = second
                    }
                }
                if (parsed.malformed && !providerFailureCode) providerFailureCode = 'invalid_json'
            } catch (err) {
                providerStarted = providerStarted || err?.providerStarted !== false
                providerFailureCode = providerFailureCode || normalizeProviderError(err)
            }

            if (!providerStarted) {
                try {
                    const released = await releaseProviderProbe(circuit.probeId || null, routeDeadlineAtMs)
                    if (released.action === 'deadline') return NextResponse.json({ error: 'provider-probe-release-deadline-exhausted' }, { status: 503 })
                } catch {
                    return NextResponse.json({ error: 'provider-probe-release-failed' }, { status: 503 })
                }
                parsed = buildDeterministicSalesReply({ decision: turnDecision, lead, incomingText: text })
            } else if (providerFailureCode) {
                console.error('[sales-agent] model provider failure', providerFailureCode)
                try {
                    if (Date.now() >= routeDeadlineAtMs) return NextResponse.json({ error: 'provider-failure-deadline-exhausted' }, { status: 503 })
                    await recordProviderFailure(providerFailureCode, circuit.probeId || null, routeDeadlineAtMs)
                } catch {
                    console.error('[sales-agent] provider breaker failure record failed')
                    return NextResponse.json({ error: 'provider-failure-record-failed' }, { status: 503 })
                }
                parsed = buildDeterministicSalesReply({ decision: turnDecision, lead, incomingText: text })
            } else {
                try {
                    if (Date.now() >= routeDeadlineAtMs) return NextResponse.json({ error: 'provider-success-deadline-exhausted' }, { status: 503 })
                    await recordProviderSuccess(circuit.probeId || null, routeDeadlineAtMs)
                } catch {
                    console.error('[sales-agent] provider breaker success record failed')
                    return NextResponse.json({ error: 'provider-success-record-failed' }, { status: 503 })
                }
            }
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
    // ── The price guard ──────────────────────────────────────────────
    //
    // Somebody asked what it costs and the answer came back without a
    // number. The prompt says not to do this in about four places; under
    // pressure the model still does, and it is the specific failure that
    // loses the lead, so it gets a deterministic repair rather than
    // another paragraph of instruction.
    //
    // Appended as a second message rather than replacing the first: the
    // model's sentence is usually fine, it was just missing the one
    // thing that was asked for.
    if (priceDodged(text, parsed.messages)) {
        console.warn('[sales-agent] price dodged, repairing')
        parsed.messages = [...parsed.messages, priceFallbackMessage()].slice(0, 3)
    }

    // ── The media guard ──────────────────────────────────────────────
    //
    // 72 model calls, zero images — including a reply that literally
    // said "אשמח להראות לך" with image: null. The customer asked to
    // see, or the bot promised to show, and nothing was attached. Same
    // pathology as the price dodge: the model narrates the capability
    // instead of using it. Same remedy: a deterministic net.
    if (!parsed.image && !parsed.handoff && parsed.messages.length) {
        const pick = mediaGuard({
            incomingText: text,
            messages: parsed.messages,
            eventType: parsed.eventType || lead.eventType,
            seen: [...(lead.imagesSent || []), ...(lead.mediaSent || [])],
            library,
        })
        if (pick) {
            console.log('[sales-agent] media guard attached', pick)
            parsed.image = pick
        }
    }

    // The provider wrote a draft; this is the only object allowed to
    // leave the route. It enforces the one-message WhatsApp contract,
    // known-fact repetition, truthful links, clean losses, and the exact
    // next action selected before the model call.
    parsed = enforceSalesReply({ parsed, decision: turnDecision, lead, incomingText: text })

    const openingPlan = buildOpeningPlan({ lead, decision: turnDecision, settings, library, stats, eventId })
    const openingMediaParts = openingPlan.eligible ? openingPlan.mediaParts : []
    if (openingMediaParts.length) {
        parsed.image = openingMediaParts[0].key
        parsed.openingMediaKeys = openingMediaParts.map(part => part.key)
    }

    // Resolved AFTER both guards and the deterministic opening sequence,
    // or the selected asset could never reach the existing Make branch.
    const media = parsed.image ? library[parsed.image] || null : null
    if (!media) parsed.image = null

    const followUpAt = resolveFollowUp({
        parsed,
        todayISO: today,
        followUpCount: lead.followUpCount || 0,
        addDays: addDaysISO,
    })

    const directAnswer = parsed.messages.join('\n\n')
    const openingSequenceParts = openingPlan.eligible && directAnswer
        ? [
            {
                partId: createHash('sha256').update(`opening:${eventId}:answer`).digest('hex').slice(0, 32),
                order: 1,
                kind: 'text',
                text: directAnswer,
                mediaKey: null,
                demoEvidence: false,
            },
            ...openingMediaParts,
            ...(openingPlan.closingText ? [{
                partId: createHash('sha256').update(`opening:${eventId}:closing`).digest('hex').slice(0, 32),
                order: openingMediaParts.length + 2,
                kind: 'text',
                text: openingPlan.closingText,
                mediaKey: null,
                demoEvidence: true,
            }] : []),
        ]
        : []
    const responsePayload = {
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
        sendText: directAnswer,
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
        sendImage: media && media.kind !== 'video' ? media.url : null,
        sendImageCaption: media && media.kind !== 'video' ? media.caption : null,
        hasImage: !!media && media.kind !== 'video',
        // Video is a different WhatsApp module with a different payload,
        // so it gets its own pair of fields rather than being smuggled
        // through sendImage. `hasVideo` is the gate for that branch in
        // Make; when no video module exists yet these stay false and
        // nothing changes.
        sendVideo: media && media.kind === 'video' ? media.url : null,
        sendVideoCaption: media && media.kind === 'video' ? media.caption : null,
        hasVideo: !!media && media.kind === 'video',
        openingMediaCount: openingMediaParts.length,
        openingMediaParts,
        openingSequenceParts,
        postOpeningText: openingPlan.eligible ? openingPlan.closingText : '',
        openingAnswerId: openingSequenceParts[0]?.partId || null,
        openingAnswerText: openingSequenceParts[0]?.text || null,
        openingImage1Id: openingMediaParts[0]?.partId || null,
        openingImage1Url: openingMediaParts[0]?.url || null,
        openingImage1Caption: openingMediaParts[0]?.caption || null,
        openingImage2Id: openingMediaParts[1]?.partId || null,
        openingImage2Url: openingMediaParts[1]?.url || null,
        openingImage2Caption: openingMediaParts[1]?.caption || null,
        openingClosingId: openingSequenceParts.at(-1)?.kind === 'text' && openingSequenceParts.length > 1
            ? openingSequenceParts.at(-1).partId
            : null,
        openingClosingText: openingSequenceParts.at(-1)?.kind === 'text' && openingSequenceParts.length > 1
            ? openingSequenceParts.at(-1).text
            : null,
        stage: parsed.stage,
        handoff: parsed.handoff,
        followUpAt,
        notifyOwner: parsed.handoff
            ? ownerPing(phone, parsed.handoffReason, { name: parsed.customerName || lead.name, stage: parsed.stage, lastText: text })
            : null,
    }
    const exchange = {
        phone, incomingText: text, parsed, followUpAt, profileName: body?.profileName,
        source: resolveSource({ isNew: !!lead.isNew, text, existing: lead.source, fallback: body?.source }),
        variant, isNew: !!lead.isNew,
    }
    try {
        const durable = await completeSuccessfulExchange({ eventId, claimToken: claim.claimToken, claimGeneration: claim.claimGeneration, exchange, outcome: responsePayload, deadlineAtMs: routeDeadlineAtMs })
        if (durable.action === 'completed') {
            compactLeadBestEffort(phone)
            Promise.allSettled(spends).catch(() => {})
            return NextResponse.json(responsePayload)
        }
        if (durable.action === 'cached') return NextResponse.json({ ok: true, duplicate: true, shouldSend: false, cachedOutcome: durable.outcome, sendText: '', hasImage: false, hasVideo: false, handoff: false })
        return NextResponse.json({ error: durable.action === 'deadline' ? 'success-commit-deadline-exhausted' : 'success-commit-stale' }, { status: 503 })
    } catch {
        console.error('[sales-agent] success commit failed')
        return NextResponse.json({ error: 'success-commit-failed' }, { status: 503 })
    }
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
