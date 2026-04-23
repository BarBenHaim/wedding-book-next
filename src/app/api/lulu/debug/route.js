export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'

// Diagnostic endpoint for the "same keys but Lulu 401 on prod" mystery.
//
// Visit /api/lulu/debug?secret=weddingtalesdebug to see:
//   - whether each Lulu env var is set in this runtime
//   - its exact length (so you can compare to .env.local — if Vercel has
//     length N+1, something pasted a trailing newline or space)
//   - whether it starts/ends with whitespace (the #1 cause of invalid_client)
//   - a single live auth probe against the configured Lulu URL, reporting
//     just the HTTP status and first 200 chars of response
//
// We NEVER return the secret itself.
const DEBUG_SECRET = 'weddingtalesdebug'

function describe(name, value) {
    if (value === undefined || value === null) {
        return { name, present: false }
    }
    const s = String(value)
    return {
        name,
        present: true,
        length: s.length,
        startsWithWhitespace: /^\s/.test(s),
        endsWithWhitespace: /\s$/.test(s),
        containsCR: s.includes('\r'),
        containsLF: s.includes('\n'),
        first4: s.slice(0, 4),
        last4: s.slice(-4),
    }
}

export async function GET(req) {
    const url = new URL(req.url)
    if (url.searchParams.get('secret') !== DEBUG_SECRET) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const key = process.env.LULU_API_KEY
    const secret = process.env.LULU_API_SECRET
    const base = process.env.LULU_API_BASE || 'https://api.lulu.com'
    const authUrl =
        process.env.LULU_AUTH_URL ||
        'https://api.lulu.com/auth/realms/glasstree/protocol/openid-connect/token'

    const envReport = {
        LULU_API_KEY: describe('LULU_API_KEY', key),
        LULU_API_SECRET: describe('LULU_API_SECRET', secret),
        LULU_API_BASE: describe('LULU_API_BASE', base),
        LULU_AUTH_URL: describe('LULU_AUTH_URL', authUrl),
        NODE_ENV: process.env.NODE_ENV,
        VERCEL_ENV: process.env.VERCEL_ENV || null,
    }

    // Live auth probe — uses the raw env values, so any hidden whitespace
    // shows up as a 401 here too.
    let probe = null
    try {
        const res = await fetch(authUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: key || '',
                client_secret: secret || '',
            }),
        })
        const text = await res.text()
        probe = {
            status: res.status,
            ok: res.ok,
            bodyPreview: text.slice(0, 300),
        }
    } catch (err) {
        probe = { error: err.message }
    }

    return NextResponse.json({ envReport, probe })
}
