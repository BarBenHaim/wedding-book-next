// POST /api/sales-agent/control — take the wheel, or give it back.
//
// The one operational control the system needs. After a handoff the bot
// goes quiet for 48 hours; when Lord finishes the conversation himself he
// calls `resume` (or lets it expire), and when he wants to step into a
// live conversation he calls `pause` BEFORE typing, so the bot does not
// answer on top of him.
//
// Wire it to a WhatsApp keyword in Make if you like ("#אני" / "#בוט"),
// or just curl it. Auth is the same shared secret as the reply route,
// or a super-admin Firebase ID token so it can be driven from the admin
// UI later without handing the secret to a browser.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { normalizePhone } from '@/lib/salesAgent/agent'
import { getLead, setHuman, isPausedForHuman } from '@/lib/salesAgent/leads'

async function authorized(req) {
    const shared = process.env.SALES_AGENT_SECRET
    if (shared && (req.headers.get('x-wt-secret') || '') === shared) return true
    const auth = req.headers.get('authorization') || ''
    if (auth.startsWith('Bearer ')) {
        try {
            const decoded = await adminAuth.verifyIdToken(auth.slice(7).trim())
            if (isSuperAdmin(decoded.email)) return true
        } catch {
            /* fall through to 401 */
        }
    }
    return false
}

export async function POST(req) {
    if (!(await authorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'bad-json' }, { status: 400 })
    }

    const phone = normalizePhone(body?.phone)
    const action = String(body?.action || '').toLowerCase()
    if (!phone) return NextResponse.json({ error: 'bad-phone' }, { status: 400 })

    if (action === 'pause') {
        await setHuman(phone, true, body?.reason || 'לורד נכנס לשיחה')
        return NextResponse.json({ ok: true, phone, human: true })
    }
    if (action === 'resume') {
        await setHuman(phone, false)
        return NextResponse.json({ ok: true, phone, human: false })
    }
    if (action === 'status') {
        const lead = await getLead(phone)
        return NextResponse.json({
            ok: true,
            phone,
            stage: lead?.stage || 'new',
            paused: isPausedForHuman(lead),
            followUpAt: lead?.followUpAt || null,
            followUpCount: lead?.followUpCount || 0,
            eventType: lead?.eventType || null,
            eventDate: lead?.eventDate || null,
            notes: lead?.notes || null,
        })
    }
    return NextResponse.json({ error: 'unknown-action', allowed: ['pause', 'resume', 'status'] }, { status: 400 })
}
