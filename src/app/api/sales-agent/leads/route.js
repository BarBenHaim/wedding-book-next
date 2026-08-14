// GET  /api/sales-agent/leads            → every lead, scored, plus totals
// GET  /api/sales-agent/leads?phone=972…  → one lead WITH its transcript
// PATCH /api/sales-agent/leads            → hand edits from the table
//
// The read side of the WhatsApp sales agent: what the management screen
// at /admin/sales-leads runs on.
//
// `sales_leads` sits under the default deny in firestore.rules — no
// browser can read it directly, by design, because it holds every
// customer's phone number and conversation. So the screen cannot use the
// client SDK the way the rest of the admin does; it comes through here
// with a Firebase ID token and a super-admin email.
//
// Scoring (which lead is urgent, what the funnel looks like) happens
// server-side in leadsView so the browser renders an answer rather than
// computing one, and so the same logic is unit-testable without booting
// Firebase.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { normalizePhone } from '@/lib/salesAgent/agent'
import { listLeads, getLead, adminPatchLead, deleteLeads, isTestPhone, readSpend, readSalesHealthRuntime, readDueFollowUpHealth } from '@/lib/salesAgent/leads'
import { summarizeSalesHealth } from '@/lib/salesAgent/leadsCore'
import { unitEconomics, RATES_CHECKED_ON } from '@/lib/salesAgent/pricing'
import { deriveLead, sortLeads, summarizeLeads, isoInIsrael } from '@/lib/salesAgent/leadsView'
import { STAGES } from '@/lib/salesAgent/catalog'
import { summarizeExperiments, summarizeGaps } from '@/lib/salesAgent/experiments'

// Same door as /api/sales-agent/control: the shared secret for machines,
// a verified super-admin ID token for a human at a browser.
async function authorized(req) {
    const shared = process.env.SALES_AGENT_SECRET
    if (shared && (req.headers.get('x-wt-secret') || '') === shared) return true
    const header = req.headers.get('authorization') || ''
    if (header.startsWith('Bearer ')) {
        try {
            const decoded = await adminAuth.verifyIdToken(header.slice(7).trim())
            if (isSuperAdmin(decoded.email)) return true
        } catch {
            /* fall through to 401 */
        }
    }
    return false
}

// Firestore Timestamps do not survive JSON in a form the browser can do
// arithmetic on. Flattening to epoch ms here keeps every date comparison
// in one place and keeps leadsView free of Firebase types.
function toMs(v) {
    if (!v) return null
    if (typeof v === 'number') return v
    if (typeof v?.toMillis === 'function') return v.toMillis()
    if (typeof v?.seconds === 'number') return v.seconds * 1000
    return null
}

const TIME_FIELDS = ['lastInboundAt', 'lastMessageAt', 'lastFollowUpAt', 'updatedAt', 'closedAt', 'humanSince']

function flattenTimes(lead) {
    const out = { ...lead }
    for (const f of TIME_FIELDS) out[f] = toMs(lead?.[f])
    return out
}

export async function GET(req) {
    if (!(await authorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const today = isoInIsrael()
    const now = Date.now()

    // ── one lead, with the conversation ──────────────────────────────
    const phone = normalizePhone(url.searchParams.get('phone') || '')
    if (phone) {
        let lead
        try {
            lead = await getLead(phone)
        } catch {
            console.error('[sales-leads] read failed')
            return NextResponse.json({ error: 'read-failed' }, { status: 500 })
        }
        if (!lead || lead.isNew) return NextResponse.json({ error: 'not-found' }, { status: 404 })
        const turns = (Array.isArray(lead.turns) ? lead.turns : []).map(t => ({
            role: t?.role === 'assistant' ? 'assistant' : 'user',
            text: String(t?.text || ''),
            at: Number(t?.at) || null,
        }))
        return NextResponse.json({
            ok: true,
            lead: { ...deriveLead(flattenTimes({ ...lead, turns: undefined }), { todayISO: today, nowMs: now }), turns },
        })
    }

    // ── the whole table ──────────────────────────────────────────────
    let raw
    try {
        raw = await listLeads({ limit: 500 })
    } catch {
        console.error('[sales-leads] list failed')
        return NextResponse.json({ error: 'list-failed' }, { status: 500 })
    }

    const items = sortLeads(raw.map(l => deriveLead(flattenTimes(l), { todayISO: today, nowMs: now })))

    // Two windows because they answer different questions: 7 days is
    // "is it working right now", 30 days is "is the trend real or noise".
    const summary7 = summarizeLeads(items, { sinceMs: now - 7 * 86400000 })
    const summary30 = summarizeLeads(items, { sinceMs: now - 30 * 86400000 })

    // What the thing costs to run. Read alongside the leads rather than
    // from its own endpoint so the screen shows spend and outcome in the
    // same refresh — a cost figure that can disagree with the lead count
    // beside it invites exactly the wrong conclusion.
    let spend, healthRuntime, dueHealth
    try {
        ;[spend, healthRuntime, dueHealth] = await Promise.all([
            readSpend({ todayISO: today }),
            readSalesHealthRuntime(),
            readDueFollowUpHealth(today),
        ])
    } catch {
        console.error('[sales-leads] health read failed')
        return NextResponse.json({ error: 'health-read-failed' }, { status: 500 })
    }
    const health = summarizeSalesHealth({
        nowMs: now,
        ...healthRuntime,
        dueFollowUps: dueHealth.dueFollowUps,
        followupsScanSaturated: dueHealth.scanSaturated,
    })

    return NextResponse.json({
        ok: true,
        today,
        now,
        count: items.length,
        items,
        summary: summarizeLeads(items),
        window7: summary7,
        window30: summary30,
        // Which opening is winning, and what the bot keeps failing at.
        // Both computed over ALL leads, never a window: an A/B test that
        // forgets last month has no chance of ever reaching significance.
        experiments: summarizeExperiments(items),
        gaps: summarizeGaps(items),
        health,
        spend: spend && {
            ...spend,
            // Divided by the ALL-TIME counts, matching the all-time
            // total. Dividing a running total by a 30-day lead count
            // would flatter the number every month it ran.
            ...unitEconomics({
                usd: spend.total,
                leads: items.length,
                won: items.filter(i => i.stage === 'closed_won').length,
            }),
            ratesCheckedOn: RATES_CHECKED_ON,
        },
    })
}

// Hand edits from the table: change the stage, stop the follow-ups, fix
// a name the agent misheard. Pause/resume of the bot itself stays in
// /api/sales-agent/control, which already owns that switch.
export async function PATCH(req) {
    if (!(await authorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'bad-json' }, { status: 400 })
    }

    const phone = normalizePhone(body?.phone)
    if (!phone) return NextResponse.json({ error: 'bad-phone' }, { status: 400 })

    const patch = {}
    if (body?.stage !== undefined) {
        if (!STAGES.includes(body.stage)) return NextResponse.json({ error: 'bad-stage' }, { status: 400 })
        patch.stage = body.stage
        // Marking a lead won or lost by hand has to stop the chasing too,
        // or tomorrow morning a paying customer gets "עוד מתלבטים?".
        if (body.stage === 'closed_won' || body.stage === 'closed_lost') patch.followUpAt = null
    }
    if (body?.followUpAt !== undefined) {
        const v = body.followUpAt
        if (v !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
            return NextResponse.json({ error: 'bad-date' }, { status: 400 })
        }
        patch.followUpAt = v
    }
    if (typeof body?.notes === 'string') patch.notes = body.notes.slice(0, 600)
    if (typeof body?.name === 'string') patch.name = body.name.slice(0, 80)

    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing-to-update' }, { status: 400 })

    try {
        await adminPatchLead(phone, patch)
    } catch {
        console.error('[sales-leads] patch failed')
        return NextResponse.json({ error: 'write-failed' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, phone, patch })
}

// DELETE /api/sales-agent/leads
//   { phones: ["972501234567", …] }  → delete exactly those
//   { testOnly: true }               → delete every synthetic test lead
//
// Real data loss with no undo, so it is super-admin only and the bulk
// form cannot name its own targets: `testOnly` re-derives the list from
// the phone-shape pattern server-side, which means a bad client can
// never turn "clean the demo rows" into "clean the customers".
export async function DELETE(req) {
    if (!(await authorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'bad-json' }, { status: 400 })
    }

    let phones = []
    if (body?.testOnly === true) {
        try {
            phones = (await listLeads({ limit: 500 })).map(l => l.phone).filter(isTestPhone)
        } catch {
            console.error('[sales-leads] test sweep failed')
            return NextResponse.json({ error: 'list-failed' }, { status: 500 })
        }
    } else if (Array.isArray(body?.phones)) {
        phones = body.phones
    } else {
        return NextResponse.json({ error: 'nothing-to-delete' }, { status: 400 })
    }

    if (phones.length === 0) return NextResponse.json({ ok: true, deleted: 0, ids: [] })

    try {
        const res = await deleteLeads(phones)
        return NextResponse.json({ ok: true, ...res })
    } catch {
        console.error('[sales-leads] delete failed')
        return NextResponse.json({ error: 'delete-failed' }, { status: 500 })
    }
}
