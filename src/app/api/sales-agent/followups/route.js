// GET/POST /api/sales-agent/followups
//
// The daily run that actually manages the pipeline. Called by Vercel
// cron (see vercel.json) and by Make. It does three things, in order,
// and the order matters:
//
//   1. SWEEP    — find live leads that lost their next step and put them
//                 back on the ladder, so they are picked up by step 2 in
//                 this same run rather than tomorrow's.
//   2. CHASE    — write a real follow-up for every lead due today, from
//                 that specific conversation, never a template.
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
import { buildFollowUpPrompt, addDaysISO } from '@/lib/salesAgent/prompt'
import { callClaude, parseAgentJson, resolveFollowUp } from '@/lib/salesAgent/agent'
import { dueFollowUps, markFollowUpSent, listLeads, reviveOrphans, listMedia, recordMediaSent } from '@/lib/salesAgent/leads'
import { sendableNow, MAX_PER_RUN, isFinalAttempt } from '@/lib/salesAgent/followupPolicy'
import { MEDIA } from '@/lib/salesAgent/catalog'
import { mergeMedia, performanceNote } from '@/lib/salesAgent/mediaLibrary'
import { findOrphans, findStaleHandoffs, handoffAlert } from '@/lib/salesAgent/sweep'

const WINDOW_MS = 24 * 3600 * 1000

function authorized(req) {
    const auth = req.headers.get('authorization') || ''
    const cron = process.env.CRON_SECRET
    if (cron && auth === `Bearer ${cron}`) return true
    const shared = process.env.SALES_AGENT_SECRET
    if (shared && (req.headers.get('x-wt-secret') || '') === shared) return true
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
    } catch (err) {
        console.error('[sales-agent/followups] sweep failed', err?.message || err)
        return { revived: [], stale: [], error: 'sweep-failed' }
    }
}

export async function GET(req) {
    if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // ?dry=1 — compose everything and report it WITHOUT marking anything
    // as sent or reviving anything. Use it on the first few days: you
    // get to read what the bot would have written before any customer
    // does. A dry run also ignores quiet hours, because the point of it
    // is to look, and looking at 23:00 is fine.
    const dry = new URL(req.url).searchParams.get('dry') === '1'
    const today = todayISO()

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
    } catch (err) {
        console.error('[sales-agent/followups] query failed', err)
        return NextResponse.json({ error: 'query-failed' }, { status: 502 })
    }

    // The same library the live conversation uses. Without it a
    // follow-up would offer only the six built-in images while the reply
    // route knows about a video, which reads as two different bots.
    const custom = await listMedia()
    const library = mergeMedia(MEDIA, custom)
    const perf = performanceNote(Object.fromEntries(custom.map(m => [m.key, m])), library)

    const items = []
    for (const lead of leads) {
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
            if (parsed.handoff || parsed.messages.length === 0) continue

            const text = parsed.messages[0]
            const withinWindow = msSince(lead.lastInboundAt) < WINDOW_MS
            const nextFollowUpAt = resolveFollowUp({
                parsed,
                todayISO: today,
                followUpCount: (lead.followUpCount || 0) + 1,
                addDays: addDaysISO,
            })

            items.push({
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
                sendImage: parsed.image && library[parsed.image]?.kind !== 'video' ? library[parsed.image].url : null,
                sendImageCaption: parsed.image && library[parsed.image]?.kind !== 'video' ? library[parsed.image].caption : null,
                hasImage: !!parsed.image && library[parsed.image]?.kind !== 'video',
                // True when this lead only got here because the sweep
                // caught it. Worth seeing in Make's run log: it is the
                // one number that says whether the safety net is idle
                // or doing daily work it should not have to.
                recovered: revived.some(r => r.phone === lead.phone),
            })

            if (parsed.image && !dry) recordMediaSent(parsed.image).catch(() => {})

            if (!dry) {
                // Marked as sent when handed to Make, not after Make
                // confirms — an ack round-trip would double the operation
                // cost on the Free plan. The trade-off: a Make failure
                // loses ONE follow-up, which the CRM still shows.
                await markFollowUpSent({
                    phone: lead.phone,
                    text,
                    nextFollowUpAt,
                    stage: parsed.stage,
                })
            }
        } catch (err) {
            console.error('[sales-agent/followups] lead failed', lead.phone, err?.message || err)
        }
    }

    // The owner alert. `alert` is null on a clean day and the caller
    // should send nothing at all - a daily "0 waiting" is a message you
    // stop reading, and then you miss the day it said 3.
    const alert = handoffAlert(stale)

    return NextResponse.json({
        ok: true,
        dry,
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
