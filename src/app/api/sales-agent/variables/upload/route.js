export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { salesVariableUploadHandlers } from '@/lib/salesAgent/salesVariableHandlers'

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
    if (['UPLOAD_ALREADY_CONSUMED', 'STALE_VARIABLE_DRAFT'].includes(code)) {
        return NextResponse.json({ error: code }, { status: 409 })
    }
    if (code === 'UPLOAD_EXPIRED') return NextResponse.json({ error: code }, { status: 410 })
    if (['UPLOAD_NOT_FOUND', 'UPLOAD_OBJECT_MISSING'].includes(code)) {
        return NextResponse.json({ error: code }, { status: 404 })
    }
    const bad = new Set([
        'INVALID_UPLOAD_ID', 'INVALID_VARIABLE_KEY', 'INVALID_VARIABLE_KIND',
        'INVALID_VARIABLE_CONTENT_TYPE', 'INVALID_VARIABLE_BYTES', 'INVALID_VARIABLE_CHECKSUM',
        'INVALID_VARIABLE_LABEL', 'INVALID_VARIABLE_CAPTION', 'INVALID_VARIABLE_WHEN',
        'UPLOAD_METADATA_MISMATCH', 'UNSUPPORTED_ACTION',
    ])
    if (bad.has(code)) return NextResponse.json({ error: code }, { status: 400 })
    return NextResponse.json({ error: 'VARIABLE_UPLOAD_UNAVAILABLE' }, { status: 503 })
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
        if (input.action === 'prepare') {
            return NextResponse.json({ ok: true, ...await salesVariableUploadHandlers.prepare(input, { updatedBy }) })
        }
        if (input.action === 'finalize') {
            return NextResponse.json({ ok: true, ...await salesVariableUploadHandlers.finalize(input, { updatedBy }) })
        }
        return NextResponse.json({ error: 'UNSUPPORTED_ACTION' }, { status: 400 })
    } catch (error) {
        return failure(error)
    }
}
