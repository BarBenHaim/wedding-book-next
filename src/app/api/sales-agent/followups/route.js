// GET/POST /api/sales-agent/followups
//
// The daily chase. Returns every lead that went quiet and is due today,
// each with a follow-up message written from that specific conversation
// — not a template. Make's daily scenario calls this once and sends what
// comes back.
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
import { dueFollowUps, markFollowUpSent, recordSpend } from '@/lib/salesAgent/leads'
import { costOfClaudeUsage } from '@/lib/salesAgent/pricing'
import { sendableNow, isFinalAttempt, MAX_PER_RUN } from '@/lib/salesAgent/followupPolicy'

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

export async function GET(req) {
    if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // ?dry=1 — compose everything and report it WITHOUT marking anything
    // as sent. Use it on the first few days: you get to read what the bot
    // would have written before any customer does.
    const params = new URL(req.url).searchParams
    const dry = params.get('dry') === '1'
    const today = todayISO()

    // Nothing goes out at 03:00, or during Shabbat. The scheduler can be
    // pointed at this route as often as is convenient and the policy
    // decides whether this particular moment is one a person would want
    // to be sold to in. `force=1` exists for testing from a laptop at a
    // reasonable hour of somebody else's night.
    const window = sendableNow()
    if (!window.ok && params.get('force') !== '1') {
        return NextResponse.json({ ok: true, skipped: window.reason, date: today, count: 0, items: [] })
    }

    let leads
    try {
        leads = await dueFollowUps(today)
    } catch (err) {
        console.error('[sales-agent/followups] query failed', err)
        return NextResponse.json({ error: 'query-failed' }, { status: 502 })
    }

    const items = []
    const spends = []
    // Capped rather than unbounded: the failure mode of a scheduled job
    // is not sending too few, it is one bad day where everything comes
    // due at once and each item costs a model call and a Make operation.
    const queue = leads.slice(0, MAX_PER_RUN)
    const deferred = leads.length - queue.length

    for (const lead of queue) {
        try {
            const attempt = lead.followUpCount || 0
            const isFinal = isFinalAttempt(attempt)
            const system = buildFollowUpPrompt(lead, today, { isFinal })
            // The model needs a user turn to answer; this one is an
            // instruction to the agent, never shown to the customer.
            const { text: raw, usage, model } = await callClaude({
                system,
                messages: [{ role: 'user', content: 'כתוב עכשיו את הפולו-אפ ללקוח הזה, לפי ההיסטוריה והכללים.' }],
                maxTokens: 500,
            })
            if (usage) {
                const { usd } = costOfClaudeUsage(usage, model)
                spends.push(recordSpend({ provider: 'anthropic', model, usd, usage, todayISO: today }))
            }
            const parsed = parseAgentJson(raw)
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
                followUpNumber: attempt + 1,
                isFinal,
                nextFollowUpAt,
            })

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

    await Promise.allSettled(spends)

    // `deferred` is reported rather than swallowed. A cap that silently
    // drops work reads as "there was nothing to do", which is the one
    // thing this endpoint must never imply.
    return NextResponse.json({ ok: true, dry, date: today, count: items.length, deferred, items })
}

export async function POST(req) {
    return GET(req)
}
