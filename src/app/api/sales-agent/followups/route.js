// GET/POST /api/sales-agent/followups
//
// The daily run that actually manages the pipeline. Called by Vercel
// cron (see vercel.json) and by Make. It does three things, in order,
// and the order matters:
//
//   1. SWEEP    — find live leads that lost their next step and put them
//                 back on the ladder, so they are picked up by step 2 in
//                 this same run rather than tomorrow's.
//   2. CHASE    — write a real follow-up for every lead due today, using
//                 free-form content only in-window and wt_followup outside.
//   3. ESCALATE — hand Lord the list of handoffs nobody picked up. The
//                 bot does not resume those, ever.
//
// Step 1 is the one that was missing, and it is the difference between
// an automation that follows up and one that manages conversations. The
// ladder only ever chases leads that already have a `followUpAt`. Every
// way a lead can lose that field - a failed write, a hand edit in the
// admin table, a handoff that expired - was previously a lead that went
// silent forever with nothing in any log to say so.
//
// ── The 24-hour rule, which decides whether any of this works ────────
// WhatsApp only allows free-form messages inside 24 hours of the
// customer's last message. A follow-up the next morning is almost always
// OUTSIDE that window, where Meta accepts only pre-approved template
// messages. So every item carries `withinWindow`:
//
//   withinWindow: true   → send the `text` as a normal message.
//   withinWindow: false  → send your approved TEMPLATE instead; the
//                          personalised `text` is still returned so you
//                          can use it as the template's variable, or
//                          send it as the follow-up once the customer
//                          replies and the window reopens.
//
// Ignoring this is the classic reason a follow-up automation "silently
// stops working" a week after launch: the API keeps returning 200 for
// the template path and rejecting the free-form one.
//
// AUTH: CRON_SECRET (Vercel injects it for cron) or SALES_AGENT_SECRET
// (so the Make scenario can call it too).

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { buildFollowUpPrompt, addDaysISO } from '@/lib/salesAgent/prompt'
import { callClaude, parseAgentJson, resolveFollowUp } from '@/lib/salesAgent/agent'
import { dueFollowUps, prepareFollowUpDelivery, recordDeliveryEvent, listLeads, reviveOrphans, listMedia } from '@/lib/salesAgent/leads'
import { sendableNow, MAX_PER_RUN, isFinalAttempt } from '@/lib/salesAgent/followupPolicy'
import { MEDIA } from '@/lib/salesAgent/catalog'
import { mergeMedia, performanceNote } from '@/lib/salesAgent/mediaLibrary'
import { findOrphans, findStaleHandoffs, handoffAlert } from '@/lib/salesAgent/sweep'
import { canSendWhatsApp, sendWhatsAppText, sendWhatsAppImage, sendWhatsAppTemplate, FOLLOWUP_TEMPLATE } from '@/lib/salesAgent/whatsapp'
import { createOutboundId } from '@/lib/salesAgent/delivery'
import { isDemoEvidenceContent } from '@/lib/salesAgent/followupEvidence'

const WINDOW_MS = 24 * 3600 * 1000

// Three doors, same as the digest: the cron secret for Vercel's
// scheduler, the shared secret for Make, and a verified super-admin ID
// token for a human at a browser. The third one exists because the
// first two are unverifiable from the outside — when the cron 401s,
// the only way to tell a wrong secret from a broken route used to be
// guessing.
async function authorized(req) {
    const auth = req.headers.get('authorization') || ''
    const cron = process.env.CRON_SECRET
    if (cron && auth === `Bearer ${cron}`) return true
    const shared = process.env.SALES_AGENT_SECRET
    if (shared && (req.headers.get('x-wt-secret') || '') === shared) return true
    if (auth.startsWith('Bearer ')) {
        try {
            const decoded = await adminAuth.verifyIdToken(auth.slice(7).trim())
            if (isSuperAdmin(decoded.email)) return true
        } catch { /* fall through to 401 */ }
    }
    return false
}

function todayISO() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
}

function msSince(ts) {
    if (!ts) return Infinity
    const ms = ts?.toMillis ? ts.toMillis() : Number(ts)
    if (!Number.isFinite(ms)) return Infinity
    return Date.now() - ms
}

// ── The sweep ───────────────────────────────────────────────────────
//
// One read of the whole lead table, which sounds wasteful and is not:
// the collection is in the hundreds, `listLeads` already strips the
// conversation turns, and the alternative is a composite index on a
// field whose defining feature is that it is missing.
//
// Never throws. A sweep that fails must not stop the follow-ups that
// were already due - that would trade a quiet leak for a loud one.
async function sweep(today) {
    try {
        const all = await listLeads({ limit: 500 })
        const orphans = findOrphans(all)
        const stale = findStaleHandoffs(all)
        if (orphans.length) {
            await reviveOrphans(orphans.map(l => l.phone), today)
        }
        return {
            revived: orphans.map(l => ({ phone: l.phone, name: l.name || l.profileName || null })),
            stale,
        }
    } catch {
        console.error('[sales-agent/followups] sweep failed')
        return { revived: [], stale: [], error: 'sweep-failed' }
    }
}

export async function GET(req) {
    if (!(await authorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // ?dry=1 — compose everything and report it WITHOUT marking anything
    // as sent or reviving anything. Use it on the first few days: you
    // get to read what the bot would have written before any customer
    // does. A dry run also ignores quiet hours, because the point of it
    // is to look, and looking at 23:00 is fine.
    const dry = new URL(req.url).searchParams.get('dry') === '1'
    const today = todayISO()

    // ── Who actually delivers ────────────────────────────────────────
    //
    // Two legitimate callers, two delivery models. Make calls with the
    // shared secret and sends the items itself, so we mark on handoff
    // exactly as before. Vercel's cron has no hands: it collects JSON
    // and throws it away — so when IT calls, this route must either
    // deliver directly (WHATSAPP_TOKEN + WHATSAPP_PHONE_ID) or compose
    // WITHOUT marking. The bug this guards against was found built and
    // armed: a cron that would have marked 25 leads a morning as chased
    // while delivering nothing, invisibly, until the silence showed up
    // in the close rate.
    const callerDelivers = (req.headers.get('x-wt-secret') || '') === process.env.SALES_AGENT_SECRET
        && !!process.env.SALES_AGENT_SECRET
    const directSend = !callerDelivers && canSendWhatsApp()
    const composeOnly = !dry && !callerDelivers && !directSend

    // Nothing goes out on Shabbat, or before nine, or after nine. The
    // leads stay due - `dueFollowUps` compares with `<=` - so a skipped
    // Saturday becomes a Sunday morning send, not a lost one.
    const when = sendableNow()
    if (!dry && !when.ok) {
        return NextResponse.json({ ok: true, skipped: when.reason, date: today, count: 0, items: [] })
    }

    const { revived, stale, error: sweepError } = dry
        ? { revived: [], stale: findStaleHandoffs(await listLeads({ limit: 500 }).catch(() => [])) }
        : await sweep(today)

    let leads
    try {
        leads = await dueFollowUps(today, MAX_PER_RUN)
    } catch {
        console.error('[sales-agent/followups] query failed')
        return NextResponse.json({ error: 'query-failed' }, { status: 502 })
    }

    // The same library the live conversation uses. Without it a
    // follow-up would offer only the six built-in images while the reply
    // route knows about a video, which reads as two different bots.
    const custom = await listMedia()
    const library = mergeMedia(MEDIA, custom)
    const perf = performanceNote(Object.fromEntries(custom.map(m => [m.key, m])), library)

    const items = []
    // A small worker pool rather than a sequential loop: twenty-five
    // model calls in a row is 60-90 seconds of wall time, which is the
    // function's entire budget. Four at a time lands the same work in a
    // quarter of it. The cap is deliberately small — each worker also
    // sends WhatsApp messages, and hammering Meta's API from one lambda
    // is how sends start failing for reasons that look random.
    const processLead = async lead => {
        try {
            // The last message is a different message. `isFinalAttempt`
            // existed and nothing passed it, so every third follow-up was
            // written as another nudge - and a clean goodbye gets replies
            // that a fourth reminder never will.
            const isFinal = isFinalAttempt(lead.followUpCount || 0)
            const system = buildFollowUpPrompt(lead, today, { isFinal, media: library, performanceNote: perf })
            // The model needs a user turn to answer; this one is an
            // instruction to the agent, never shown to the customer.
            const { text: raw } = await callClaude({
                system,
                messages: [{ role: 'user', content: 'כתוב עכשיו את הפולו-אפ ללקוח הזה, לפי ההיסטוריה והכללים.' }],
                maxTokens: 500,
            })
            const parsed = parseAgentJson(raw, { mediaKeys: Object.keys(library) })
            if (parsed.handoff || parsed.messages.length === 0) return

            const text = parsed.messages[0]
            const withinWindow = msSince(lead.lastInboundAt) < WINDOW_MS
            const nextFollowUpAt = resolveFollowUp({
                parsed,
                todayISO: today,
                followUpCount: (lead.followUpCount || 0) + 1,
                addDays: addDaysISO,
            })

            const item = {
                phone: lead.phone,
                name: lead.name || lead.profileName || null,
                stage: parsed.stage,
                text,
                withinWindow,
                isFinal,
                followUpNumber: (lead.followUpCount || 0) + 1,
                nextFollowUpAt,
                // The follow-up prompt allows a first image when none was
                // ever sent; until now the route accepted the model's
                // choice, counted it, and then returned no URL — so Make
                // had nothing to send. Same contract as /reply.
                sendImage: withinWindow && parsed.image && library[parsed.image]?.kind !== 'video' ? library[parsed.image].url : null,
                sendImageCaption: withinWindow && parsed.image && library[parsed.image]?.kind !== 'video' ? library[parsed.image].caption : null,
                hasImage: withinWindow && !!parsed.image && library[parsed.image]?.kind !== 'video',
                // True when this lead only got here because the sweep
                // caught it. Worth seeing in Make's run log: it is the
                // one number that says whether the safety net is idle
                // or doing daily work it should not have to.
                recovered: revived.some(r => r.phone === lead.phone),
            }
            if (dry || composeOnly) {
                item.deliveryStatus = dry ? 'dry' : 'composed'
                items.push(item)
                return
            }

            const requestedAt = new Date().toISOString()
            const subject = `${lead.phone}:${item.followUpNumber}:${today}:${requestedAt}`
            const logicalAttemptId = createOutboundId({
                scope: 'followup-attempt',
                subject: `${lead.phone}:${item.followUpNumber}:${today}`,
                attempt: item.followUpNumber,
                part: 'logical',
            })
            const primaryPart = withinWindow ? 'text' : 'template'
            const primaryOutboundId = createOutboundId({
                scope: 'followup', subject, attempt: item.followUpNumber, part: primaryPart,
            })
            const outboundParts = { [primaryPart]: primaryOutboundId }
            if (withinWindow && item.hasImage) {
                outboundParts.image = createOutboundId({
                    scope: 'followup', subject, attempt: item.followUpNumber, part: 'image',
                })
            }
            item.outboundId = primaryOutboundId
            item.outboundParts = outboundParts
            item.transport = withinWindow ? 'text' : 'template'
            if (!withinWindow) {
                item.templateName = FOLLOWUP_TEMPLATE
                item.templateParameters = [text]
            }

            const preparePart = (part, outboundId, advancesFollowUp) => prepareFollowUpDelivery({
                phone: lead.phone,
                outboundId,
                channel: callerDelivers ? 'make' : 'whatsapp_graph',
                part,
                text: advancesFollowUp ? text : '',
                nextFollowUpAt,
                stage: parsed.stage,
                advancesFollowUp,
                demoEvidence: isDemoEvidenceContent({ part, text: advancesFollowUp ? text : '' }),
                logicalAttemptId,
                templateName: part === 'template' ? FOLLOWUP_TEMPLATE : null,
                requestedAt,
            })
            const primaryPreparation = await preparePart(primaryPart, primaryOutboundId, true)
            if (primaryPreparation.action !== 'requested') {
                item.outboundId = primaryPreparation.outboundId || primaryOutboundId
                item.deliveryStatus = primaryPreparation.action === 'pending'
                    ? 'pending'
                    : (primaryPreparation.status || 'requested')
                items.push(item)
                return
            }
            if (outboundParts.image) await preparePart('image', outboundParts.image, false)

            if (callerDelivers) {
                item.deliveryStatus = 'requested'
                items.push(item)
                return
            }

            const fail = async (outboundId, errorCode) => recordDeliveryEvent({
                eventId: `${outboundId}:failed`,
                outboundId,
                channel: 'whatsapp_graph',
                status: 'failed',
                errorCode,
                occurredAt: new Date().toISOString(),
            })

            let primaryEvidence
            try {
                primaryEvidence = withinWindow
                    ? await sendWhatsAppText(lead.phone, text)
                    : await sendWhatsAppTemplate(lead.phone, FOLLOWUP_TEMPLATE, [text])
            } catch (error) {
                const allowed = new Set([
                    'GRAPH_REJECTED', 'GRAPH_TIMEOUT', 'PROVIDER_MESSAGE_ID_MISSING',
                    'WHATSAPP_NOT_CONFIGURED', 'TEMPLATE_NOT_CONFIGURED',
                ])
                const errorCode = allowed.has(error?.errorCode) ? error.errorCode : 'PROVIDER_FAILED'
                try {
                    await fail(primaryOutboundId, errorCode)
                } catch {
                    console.warn('[sales-agent/followups] failure acknowledgement failed')
                }
                item.sendError = errorCode
                item.deliveryStatus = 'failed'
                console.warn('[sales-agent/followups] send failed')
                items.push(item)
                return
            }
            const primaryAcceptedAt = new Date().toISOString()
            item.accepted = true
            item.providerMessageId = primaryEvidence.providerMessageId
            item.deliveryStatus = 'accepted'
            try {
                await recordDeliveryEvent({
                    eventId: `${primaryOutboundId}:accepted`,
                    outboundId: primaryOutboundId,
                    channel: 'whatsapp_graph',
                    status: 'accepted',
                    providerMessageId: primaryEvidence.providerMessageId,
                    occurredAt: primaryAcceptedAt,
                })
            } catch {
                item.persistenceDegraded = true
                item.repair = {
                    endpoint: '/api/sales-agent/delivery',
                    event: {
                        eventId: `${primaryOutboundId}:accepted`,
                        outboundId: primaryOutboundId,
                        channel: 'whatsapp_graph',
                        status: 'accepted',
                        providerMessageId: primaryEvidence.providerMessageId,
                        occurredAt: primaryAcceptedAt,
                    },
                }
                console.warn('[sales-agent/followups] acceptance persistence degraded')
            }

            if (outboundParts.image) {
                let imageEvidence
                try {
                    imageEvidence = await sendWhatsAppImage(
                        lead.phone,
                        library[parsed.image].url,
                        library[parsed.image].caption,
                    )
                } catch (error) {
                    const allowed = new Set([
                        'GRAPH_REJECTED', 'GRAPH_TIMEOUT', 'PROVIDER_MESSAGE_ID_MISSING',
                        'WHATSAPP_NOT_CONFIGURED', 'TEMPLATE_NOT_CONFIGURED',
                    ])
                    const errorCode = allowed.has(error?.errorCode) ? error.errorCode : 'PROVIDER_FAILED'
                    try {
                        await fail(outboundParts.image, errorCode)
                    } catch {
                        console.warn('[sales-agent/followups] media failure acknowledgement failed')
                    }
                    item.mediaSendError = errorCode
                    item.mediaDeliveryStatus = 'failed'
                    console.warn('[sales-agent/followups] media send failed')
                }
                if (imageEvidence) {
                    item.mediaDeliveryStatus = 'accepted'
                    const mediaAcceptedAt = new Date().toISOString()
                    const mediaAcceptedEvent = {
                        eventId: `${outboundParts.image}:accepted`,
                        outboundId: outboundParts.image,
                        channel: 'whatsapp_graph',
                        status: 'accepted',
                        providerMessageId: imageEvidence.providerMessageId,
                        occurredAt: mediaAcceptedAt,
                    }
                    try {
                        await recordDeliveryEvent(mediaAcceptedEvent)
                    } catch {
                        item.mediaPersistenceDegraded = true
                        item.mediaRepair = {
                            endpoint: '/api/sales-agent/delivery',
                            event: mediaAcceptedEvent,
                        }
                        console.warn('[sales-agent/followups] media acceptance persistence degraded')
                    }
                }
            }
            items.push(item)
        } catch {
            console.error('[sales-agent/followups] lead failed')
        }
    }

    const queue = [...leads]
    await Promise.all(Array.from({ length: 4 }, async () => {
        for (let lead = queue.shift(); lead; lead = queue.shift()) {
            await processLead(lead)
        }
    }))

    // The owner alert. `alert` is null on a clean day and the caller
    // should send nothing at all - a daily "0 waiting" is a message you
    // stop reading, and then you miss the day it said 3.
    const alert = handoffAlert(stale)

    // No approved business-initiated handoff-alert template exists. Keep the
    // alert inspectable in JSON instead of gambling on a free-form send outside
    // the service window. The scheduled digest has its own approved template.

    return NextResponse.json({
        ok: true,
        dry,
        // How this run's items left the building. 'make' — the caller
        // sends them. 'direct' — this route already sent them. 'none' —
        // composed only, nothing marked, nothing delivered: set
        // WHATSAPP_TOKEN + WHATSAPP_PHONE_ID or call from Make.
        delivery: dry ? 'dry' : callerDelivers ? 'make' : directSend ? 'direct' : 'none',
        whatsappConfigured: canSendWhatsApp(),
        ...(composeOnly ? { warning: 'composed only — no delivery path; nothing was marked as sent' } : {}),
        date: today,
        count: items.length,
        items,
        recovered: revived.length,
        recoveredLeads: revived,
        handoffsWaiting: stale.length,
        alert,
        alertPhone: alert ? (process.env.SALES_AGENT_OWNER_PHONE || null) : null,
        ...(sweepError ? { sweepError } : {}),
    })
}

export async function POST(req) {
    return GET(req)
}
