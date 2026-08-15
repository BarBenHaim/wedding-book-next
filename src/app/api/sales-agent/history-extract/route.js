export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const maxDuration = 30

import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { extractHistoricalLead } from '@/lib/salesAgent/historyExtraction'

const MAX_BODY_CHARS = 100_000

function secretDigest(value) {
    return createHash('sha256').update(String(value || ''), 'utf8').digest()
}

function authorized(request) {
    const expected = process.env.HISTORY_EXTRACT_SECRET
    if (!expected) return null
    const supplied = request.headers.get('x-history-extract-secret') || ''
    return timingSafeEqual(secretDigest(expected), secretDigest(supplied))
}

export async function POST(request) {
    const auth = authorized(request)
    if (auth === null) return NextResponse.json({ error: 'HISTORY_EXTRACT_NOT_CONFIGURED' }, { status: 503 })
    if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

    let raw
    try {
        raw = await request.text()
    } catch {
        return NextResponse.json({ error: 'HISTORY_INVALID_INPUT' }, { status: 400 })
    }
    if (raw.length > MAX_BODY_CHARS) {
        return NextResponse.json({ error: 'HISTORY_INPUT_TOO_LARGE' }, { status: 400 })
    }

    let body
    try {
        body = JSON.parse(raw)
    } catch {
        return NextResponse.json({ error: 'HISTORY_INVALID_INPUT' }, { status: 400 })
    }

    try {
        const result = await extractHistoricalLead(body)
        return NextResponse.json(result)
    } catch (error) {
        if (error?.code === 'HISTORY_INVALID_INPUT' || error?.code === 'HISTORY_INPUT_TOO_LARGE') {
            return NextResponse.json({ error: error.code }, { status: 400 })
        }
        console.error('[history-extract] extraction failed')
        return NextResponse.json({ error: 'HISTORY_EXTRACT_UNAVAILABLE' }, { status: 503 })
    }
}
