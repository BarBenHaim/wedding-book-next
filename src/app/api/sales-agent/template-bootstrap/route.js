import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { handleWhatsAppTemplateBootstrap } from '@/lib/salesAgent/whatsappTemplateBootstrap'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Up to six sequential Graph calls (WABA discovery, template list, create),
// each with its own 7.5s timeout. Twenty seconds was not enough on 18.9:
// the function was cut mid-flight and the admin saw a bare 502 from
// Cloudflare instead of a JSON answer.
export const maxDuration = 60

// Same door as /api/sales-agent/leads: machines bring the shared secret,
// a human at the admin brings a verified super-admin ID token. The
// handler itself only knows the secret, so a valid token is translated
// into that header here and the pure module stays as it is.
async function withAdminDoor(request) {
    const header = request.headers.get('authorization') || ''
    if (!header.startsWith('Bearer ') || request.headers.get('x-wt-secret')) return request
    const shared = process.env.SALES_AGENT_SECRET
    if (!shared) return request
    try {
        const decoded = await adminAuth.verifyIdToken(header.slice(7).trim())
        if (!isSuperAdmin(decoded.email)) return request
    } catch {
        return request
    }
    const headers = new Headers(request.headers)
    headers.set('x-wt-secret', shared)
    return new Request(request.url, { method: request.method, headers, body: await request.text() })
}

export async function POST(request) {
    try {
        const result = await handleWhatsAppTemplateBootstrap(await withAdminDoor(request))
        return NextResponse.json(result.body, { status: result.status })
    } catch (error) {
        console.error('[sales-agent/template-bootstrap] failed', error?.message || error)
        return NextResponse.json({ ok: false, error: 'ROUTE_FAILED', detail: String(error?.message || error).slice(0, 200) }, { status: 500 })
    }
}
