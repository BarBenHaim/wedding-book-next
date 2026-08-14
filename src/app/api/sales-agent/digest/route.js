// GET /api/sales-agent/digest
//
// The morning message, ready to send. Called once a day by Make, and by
// Lord on demand when he texts "דוח" to the business number.
//
// Returns the digest in two shapes because the transport has two modes:
//   text  — one string, for a free-form WhatsApp message. Only valid
//           inside the 24-hour window (i.e. if he has written to the bot
//           since yesterday morning).
//   lines — single-line parts, for an approved TEMPLATE, which is what a
//           scheduled 08:30 send actually needs. A template parameter
//           cannot contain a newline, so the digest has to arrive
//           pre-split or it will be rejected.
//
// `hasNews` is false on a genuinely quiet day and the caller should send
// nothing. A digest that arrives every morning saying "nothing to do" is
// one you stop reading, and then you miss the morning that mattered.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { listLeads } from '@/lib/salesAgent/leads'
import { deriveLead, sortLeads, isoInIsrael } from '@/lib/salesAgent/leadsView'
import { summarizeExperiments, summarizeGaps } from '@/lib/salesAgent/experiments'
import { buildDigest } from '@/lib/salesAgent/digest'

// Three doors, same as the rest of the agent: the cron secret for
// Vercel's scheduler, the shared secret for Make, a super-admin token
// for a browser.
async function authorized(req) {
    const header = req.headers.get('authorization') || ''
    const cron = process.env.CRON_SECRET
    if (cron && header === `Bearer ${cron}`) return true
    const shared = process.env.SALES_AGENT_SECRET
    if (shared && (req.headers.get('x-wt-secret') || '') === shared) return true
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

function toMs(v) {
    if (!v) return null
    if (typeof v === 'number') return v
    if (typeof v?.toMillis === 'function') return v.toMillis()
    if (typeof v?.seconds === 'number') return v.seconds * 1000
    return null
}

const TIME_FIELDS = ['lastInboundAt', 'lastMessageAt', 'lastFollowUpAt', 'updatedAt', 'closedAt', 'humanSince', 'createdAt']

export async function GET(req) {
    if (!(await authorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const today = isoInIsrael()
    const now = Date.now()

    let raw
    try {
        raw = await listLeads({ limit: 500 })
    } catch {
        console.error('[digest] list failed')
        return NextResponse.json({ error: 'list-failed' }, { status: 500 })
    }

    const items = sortLeads(
        raw.map(l => {
            const flat = { ...l }
            for (const f of TIME_FIELDS) flat[f] = toMs(l?.[f])
            const derived = deriveLead(flat, { todayISO: today, nowMs: now })
            // deriveLead does not know about createdAt; the digest needs
            // it to tell a genuinely new lead from a returning one.
            derived.createdAtMs = flat.createdAt
            return derived
        }),
    )

    const digest = buildDigest(items, {
        todayISO: today,
        nowMs: now,
        experiments: summarizeExperiments(items),
        gaps: summarizeGaps(items),
    })

    return NextResponse.json({ ok: true, today, ...digest })
}
