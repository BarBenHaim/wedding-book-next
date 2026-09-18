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
//                 free-form content only in-window and an approved strategy
//                 template outside.
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
import { dueFollowUps, prepareFollowUpDelivery, recordDeliveryEvent, listLeads, reviveOrphans, listMedia, recordFollowUpRun } from '@/lib/salesAgent/leads'
import { sendableNow, MAX_PER_RUN, isFinalAttempt, isInsideWhatsAppWindow } from '@/lib/salesAgent/followupPolicy'
import { MEDIA } from '@/lib/salesAgent/catalog'
import { mergeMedia, performanceNote } from '@/lib/salesAgent/mediaLibrary'
import { findOrphans, findStaleHandoffs, handoffAlert } from '@/lib/salesAgent/sweep'
import { canSendWhatsApp, sendWhatsAppText, sendWhatsAppImage, sendWhatsAppVideo, sendWhatsAppTemplate } from '@/lib/salesAgent/whatsapp'
import { createOutboundId } from '@/lib/salesAgent/delivery'
import { isDemoEvidenceContent } from '@/lib/salesAgent/followupEvidence'
import { readSalesSettings } from '@/lib/salesAgent/settingsStore'
import { planFollowUp, readFollowUpOffer } from '@/lib/salesAgent/followupStrategy'

function unsentVideo(library, lead, strategy) {
    if (strategy?.mediaPreference !== 'video') return null
    const sent = new Set([
        ...(Array.isArray(lead?.mediaSent) ? lead.mediaSent : []),
        ...(Array.isArray(lead?.imagesSent) ? lead.imagesSent : []),
    ].map(String))
    const match = Object.entries(library || {}).find(([key, media]) => media?.kind === 'video' && !sent.has(key))
    return match ? { key: match[0], ...match[1] } : null
}

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

// ── The sweep ───────────────────────────────────────────────────────
//
// One read of the whole lead table, which sounds wasteful and is not:
// the collection is in the hundreds, `listLeads` already strips the
// conversation turns, and the alternative is a composite index on a
// field whose defining feature is that it is missing.
//
// Never throws. A sweep that fails must not stop the follow-ups that
// were already due - that would trade a quiet leak for a loud one.
async function sweep(today, { templateDeliveryEnabled = false, nowMs = Date.now() } = {}) {
    try {
        const all = await listLeads({ limit: 500 })
        const orphans = findOrphans(all)
        const stale = findStaleHandoffs(all)
        const blocked = templateDeliveryEnabled
            ? []
            : orphans.filter(lead => !isInsideWhatsAppWindow(lead, nowMs))
        const blockedSet = new Set(blocked)
        const revivable = orphans.filter(lead => !blockedSet.has(lead))
        if (revivable.length) {
            await reviveOrphans(revivable.map(l => l.phone), today)
        }
        return {
            revived: revivable.map(l => ({ phone: l.phone, name: l.name || l.profileName || null })),
            stale,
            blockedTemplateCount: blocked.length,
        }
    } catch {
        console.error('[sales-agent/followups] sweep failed')
        return { revived: [], stale: [], blockedTemplateCount: 0, error: 'sweep-failed' }
    }
}

export async function GET(req) {
    if (!(await authorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const today = todayISO()
    let settings
    let custom
    let library
    try {
        custom = await listMedia()
        library = mergeMedia(MEDIA, custom)
        settings = await readSalesSettings({ registeredMediaKeys: Object.keys(library) })
    } catch {
        console.error('[sales-agent/followups] settings read failed')
        return NextResponse.json({ error: 'SETTINGS_READ_FAILED' }, { status: 503 })
    }

    if (!settings.enabled) {
        return NextResponse.json({
            ok: true,
            skipped: 'agent-disabled',
            delivery: 'none',
            date: today,
            count: 0,
            items: [],
        })
    }

    // ?dry=1 — compose everything and report it WITHOUT marking anything
    // as sent or reviving anything. Use it on the first few days: you
    // get to read what the bot would have written before any customer
    // does. A dry run also ignores quiet hours, because the point of it
    // is to look, and looking at 23:00 is fine.
    const dry = new URL(req.url).searchParams.get('dry') === '1'
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
    const templateDeliveryEnabled = process.env.SALES_FOLLOWUP_TEMPLATE_ENABLED === 'true'

    // Nothing goes out on Shabbat, or before nine, or after nine. The
    // leads stay due - `dueFollowUps` compares with `<=` - so a skipped
    // Saturday becomes a Sunday morning send, not a lost one.
    const when = sendableNow()
    if (!dry && !when.ok) {
        return NextResponse.json({ ok: true, skipped: when.reason, date: today, count: 0, items: [] })
    }

    const { revived, stale, blockedTemplateCount: sweepBlockedTemplateCount = 0, error: sweepError } = dry
        ? { revived: [], stale: findStaleHandoffs(await listLeads({ limit: 500 }).catch(() => [])), blockedTemplateCount: 0 }
        : await sweep(today, { templateDeliveryEnabled })

    // A dry run composes a model call per lead and has no deadline of its
    // own; with 160 leads due it never returned (18.9, twice, >5 min against
    // a 60s function). Ten is enough to read what the bot would write.
    const DRY_MAX = 10
    let leads
    try {
        leads = await dueFollowUps(today, dry ? Math.min(DRY_MAX, MAX_PER_RUN) : MAX_PER_RUN)
    } catch {
        console.error('[sales-agent/followups] query failed')
        return NextResponse.json({ error: 'query-failed' }, { status: 502 })
    }

    // The same library the live conversation uses. Without it a
    // follow-up would offer only the six built-in images while the reply
    // route knows about a video, which reads as two different bots.
    const perf = performanceNote(Object.fromEntries(custom.map(m => [m.key, m])), library)

    const items = []
    let blockedTemplateCount = sweepBlockedTemplateCount
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
            const withinWindow = isInsideWhatsAppWindow(lead)
            if (!dry && !withinWindow && !templateDeliveryEnabled) {
                // Production currently has no approved proactive template.
                // Fail before strategy composition, delivery preparation, or
                // any customer-linked write. The aggregate counter below is
                // enough to operate the queue without exposing identity data.
                blockedTemplateCount += 1
                return
            }
            const followUpNumber = (lead.followUpCount || 0) + 1
            const isFinal = isFinalAttempt(lead.followUpCount || 0)
            const strategy = planFollowUp(lead, {
                attempt: followUpNumber,
                isFinal,
                offer: readFollowUpOffer(),
                customerName: lead.name || lead.profileName || '',
            })
            let parsed
            let text
            if (withinWindow) {
                const system = buildFollowUpPrompt(lead, today, {
                    isFinal,
                    media: library,
                    performanceNote: perf,
                    strategy,
                })
                // The model needs a user turn to answer; this one is an
                // instruction to the agent, never shown to the customer.
                const { text: raw } = await callClaude({
                    system,
                    messages: [{ role: 'user', content: 'כתוב עכשיו את הפולו-אפ ללקוח הזה, לפי ההיסטוריה והכללים.' }],
                    maxTokens: 500,
                })
                parsed = parseAgentJson(raw, { mediaKeys: Object.keys(library) })
                if (parsed.handoff || parsed.messages.length === 0) return
                text = parsed.messages[0]
            } else {
                // Outside 24 hours the approved template is the customer
                // message. Do not generate and then persist imaginary copy
                // that Meta never sent.
                parsed = {
                    stage: strategy.id === 'graceful_close' ? 'closed_lost' : lead.stage,
                    eventDate: lead.eventDate || null,
                    callbackPromised: lead.callbackPromised || null,
                    followUpAt: null,
                    handoff: false,
                }
                text = strategy.templateText
            }
            // Meta approves an exact template shape. Keep the business-initiated
            // template text-only; product video remains available for replies and
            // follow-ups inside the open 24-hour service window.
            const video = withinWindow ? unsentVideo(library, lead, strategy) : null
            const image = withinWindow && !video && strategy.id === 'proof_site'
                && parsed.image && library[parsed.image]?.kind !== 'video'
                ? { key: parsed.image, ...library[parsed.image] }
                : null
            const nextFollowUpAt = resolveFollowUp({
                parsed,
                todayISO: today,
                followUpCount: followUpNumber,
                addDays: addDaysISO,
            })

            const item = {
                phone: lead.phone,
                name: lead.name || lead.profileName || null,
                stage: parsed.stage,
                text,
                withinWindow,
                isFinal,
                followUpNumber,
                nextFollowUpAt,
                strategyId: strategy.id,
                strategyCta: strategy.cta,
                // The follow-up prompt allows a first image when none was
                // ever sent; until now the route accepted the model's
                // choice, counted it, and then returned no URL — so Make
                // had nothing to send. Same contract as /reply.
                sendImage: image?.url || null,
                sendImageCaption: image?.caption || null,
                hasImage: !!image,
                sendVideo: withinWindow ? video?.url || null : null,
                sendVideoCaption: video?.caption || null,
                hasVideo: !!video,
                templateHeaderVideo: !withinWindow ? video?.url || null : null,
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
            const mediaPart = withinWindow
                ? (item.hasVideo ? 'video' : item.hasImage ? 'image' : null)
                : null
            if (mediaPart) {
                outboundParts[mediaPart] = createOutboundId({
                    scope: 'followup', subject, attempt: item.followUpNumber, part: mediaPart,
                })
            }
            item.outboundId = primaryOutboundId
            item.outboundParts = outboundParts
            item.transport = withinWindow ? 'text' : 'template'
            if (!withinWindow) {
                item.templateName = strategy.templateName
                item.templateParameters = strategy.templateParameters
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
                demoEvidence: advancesFollowUp && item.templateHeaderVideo
                    ? true
                    : isDemoEvidenceContent({ part, text: advancesFollowUp ? text : '' }),
                followUpStrategyId: strategy.id,
                followUpCta: strategy.cta,
                followUpMediaKind: item.hasVideo ? 'video' : item.hasImage ? 'image' : 'none',
                logicalAttemptId,
                templateName: part === 'template' ? strategy.templateName : null,
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
            if (mediaPart) await preparePart(mediaPart, outboundParts[mediaPart], false)

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
                    : item.templateHeaderVideo
                        ? await sendWhatsAppTemplate(
                            lead.phone,
                            strategy.templateName,
                            strategy.templateParameters,
                            { headerVideoUrl: item.templateHeaderVideo },
                        )
                        : await sendWhatsAppTemplate(
                            lead.phone,
                            strategy.templateName,
                            strategy.templateParameters,
                        )
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

            if (mediaPart) {
                let mediaEvidence
                try {
                    const asset = mediaPart === 'video' ? video : image
                    mediaEvidence = mediaPart === 'video'
                        ? await sendWhatsAppVideo(lead.phone, asset.url, asset.caption)
                        : await sendWhatsAppImage(lead.phone, asset.url, asset.caption)
                } catch (error) {
                    const allowed = new Set([
                        'GRAPH_REJECTED', 'GRAPH_TIMEOUT', 'PROVIDER_MESSAGE_ID_MISSING',
                        'WHATSAPP_NOT_CONFIGURED', 'TEMPLATE_NOT_CONFIGURED',
                    ])
                    const errorCode = allowed.has(error?.errorCode) ? error.errorCode : 'PROVIDER_FAILED'
                    try {
                        await fail(outboundParts[mediaPart], errorCode)
                    } catch {
                        console.warn('[sales-agent/followups] media failure acknowledgement failed')
                    }
                    item.mediaSendError = errorCode
                    item.mediaDeliveryStatus = 'failed'
                    console.warn('[sales-agent/followups] media send failed')
                }
                if (mediaEvidence) {
                    item.mediaDeliveryStatus = 'accepted'
                    const mediaAcceptedAt = new Date().toISOString()
                    const mediaAcceptedEvent = {
                        eventId: `${outboundParts[mediaPart]}:accepted`,
                        outboundId: outboundParts[mediaPart],
                        channel: 'whatsapp_graph',
                        status: 'accepted',
                        providerMessageId: mediaEvidence.providerMessageId,
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

    await recordFollowUpRun({
        dry,
        count: items.length,
        blockedCount: blockedTemplateCount,
        delivery: callerDelivers ? 'make' : directSend ? 'direct' : 'none',
    })

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
        templateDelivery: {
            status: templateDeliveryEnabled ? 'enabled' : blockedTemplateCount ? 'blocked' : 'disabled',
            blockedCount: blockedTemplateCount,
        },
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
