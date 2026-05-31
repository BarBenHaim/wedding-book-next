export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { runScheduledCampaigns, runAutomations } from '@/lib/emailEngine'

// Daily evaluator — wired via vercel.json crons. Sends any scheduled
// campaigns whose time has arrived, and any event-relative automation
// emails due today (deduped by emailLog so re-runs never double-send).
//
// Security: if CRON_SECRET is set, require `Authorization: Bearer <secret>`
// (Vercel injects exactly this header for cron invocations when the env
// var exists). If it's not set yet, we allow the call so the feature
// works out of the box — set CRON_SECRET in Vercel to lock it down.

function authorized(req) {
    const secret = process.env.CRON_SECRET
    if (!secret) return true
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
