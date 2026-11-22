export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { runScheduledCampaigns, runAutomations } from '@/lib/emailEngine'

// Daily evaluator — wired via vercel.json crons. Sends any scheduled
// campaigns whose time has arrived, and any event-relative automation
// emails due today (deduped by emailLog so re-runs never double-send).
//
// Security: `Authorization: Bearer <CRON_SECRET>` (Vercel injects exactly this
// header for cron invocations). With no CRON_SECRET the job does not run.

function authorized(req) {
    const secret = process.env.CRON_SECRET
    if (!secret) return false
    return (req.headers.get('authorization') || '') === `Bearer ${secret}`
}

export async function GET(req) {
    if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    try {
        const scheduled = await runScheduledCampaigns()
        const automations = await runAutomations()
        return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), scheduled, automations })
    } catch (err) {
        console.error('[cron/email] failed:', err)
        return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
    }
}

export async function POST(req) {
    return GET(req)
}
