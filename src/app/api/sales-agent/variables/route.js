export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { salesVariableHandlers } from '@/lib/salesAgent/salesVariableHandlers'

const MAX_BODY_CHARS = 64 * 1024

async function identity(req) {
    const shared = process.env.SALES_AGENT_SECRET
    if (shared && req.headers.get('x-wt-secret') === shared) return 'shared-secret'
    const header = req.headers.get('authorization') || ''
    if (!header.startsWith('Bearer ')) return null
    try {
        const decoded = await adminAuth.verifyIdToken(header.slice(7).trim())
        return isSuperAdmin(decoded.email) ? decoded.email : null
    } catch {
        return null
    }
}

function failure(error) {
    const code = String(error?.message || '')
    if (['STALE_VARIABLE_DRAFT', 'VARIABLE_VERSION_EXISTS'].includes(code)) {
        return NextResponse.json({ error: code }, { status: 409 })
    }
    if (code === 'VARIABLE_NOT_FOUND') return NextResponse.json({ error: code }, { status: 404 })
    const bad = new Set([
        'INVALID_VARIABLE_KEY', 'INVALID_VARIABLE_KIND', 'INVALID_VARIABLE_LABEL',
        'INVALID_VARIABLE_VALUE', 'UNKNOWN_SYSTEM_VARIABLE', 'INVALID_SYSTEM_VARIABLE_TEMPLATE',
        'UNSUPPORTED_VARIABLE_ACTION',
    ])
    if (bad.has(code)) return NextResponse.json({ error: code }, { status: 400 })
    return NextResponse.json({ error: 'VARIABLES_UNAVAILABLE' }, { status: 503 })
}

export async function GET(req) {
    if (!(await identity(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    try {
        return NextResponse.json({ ok: true, ...await salesVariableHandlers.list() })
    } catch (error) {
        return failure(error)
    }
}

export async function POST(req) {
    const updatedBy = await identity(req)
    if (!updatedBy) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const raw = await req.text()
    if (!raw || raw.length > MAX_BODY_CHARS) {
        return NextResponse.json({ error: raw ? 'REQUEST_TOO_LARGE' : 'BAD_JSON' }, { status: raw ? 413 : 400 })
    }
    let input
    try {
        input = JSON.parse(raw)
    } catch {
        return NextResponse.json({ error: 'BAD_JSON' }, { status: 400 })
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return NextResponse.json({ error: 'BAD_JSON' }, { status: 400 })
    }
    try {
        return NextResponse.json({ ok: true, ...await salesVariableHandlers.mutate(input, { updatedBy }) })
    } catch (error) {
        return failure(error)
    }
}
