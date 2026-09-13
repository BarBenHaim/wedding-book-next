// GET /api/admin/project-health
//
// Asks the Flask service whether it is up, for the project page's live
// indicator. Proxied through the server because BLESSING_ASSIST_URL is a
// server-only variable and the service may sit on a host the browser
// cannot reach directly.
//
// Never throws: the whole point is to report "down" calmly, and a demo
// screen that 500s while showing that something is down is worse than
// the thing being down.

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
    const url = process.env.BLESSING_ASSIST_URL || ''
    if (!url) {
        return NextResponse.json({ configured: false, ok: false, reason: 'BLESSING_ASSIST_URL not set' })
    }
    try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 4000)
        const res = await fetch(`${url.replace(/\/$/, '')}/health`, { signal: ctrl.signal, cache: 'no-store' })
        clearTimeout(t)
        if (!res.ok) return NextResponse.json({ configured: true, ok: false, reason: `HTTP ${res.status}`, url })
        const data = await res.json()
        return NextResponse.json({ configured: true, ok: true, url, ...data })
    } catch (err) {
        return NextResponse.json({ configured: true, ok: false, url, reason: err?.name === 'AbortError' ? 'timeout' : 'unreachable' })
    }
}
