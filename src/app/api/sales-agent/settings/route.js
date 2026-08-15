export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { MEDIA } from '@/lib/salesAgent/catalog'
import { OPENING_VARIANTS, ACTIVE_VARIANT_IDS } from '@/lib/salesAgent/experiments'
import { listMedia } from '@/lib/salesAgent/leads'
import { mergeMedia } from '@/lib/salesAgent/mediaLibrary'
import { buildSystemPrompt } from '@/lib/salesAgent/prompt'
import { MODEL_REGISTRY } from '@/lib/salesAgent/settings'
import { readSalesSettings, saveSalesSettings } from '@/lib/salesAgent/settingsStore'

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

const todayISO = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

async function context() {
    const custom = await listMedia({ fresh: true })
    const library = mergeMedia(MEDIA, custom)
    const registeredMediaKeys = Object.keys(library)
    const settings = await readSalesSettings({ registeredMediaKeys })
    return { custom, library, registeredMediaKeys, settings }
}

function publicMedia(library) {
    return Object.entries(library).map(([key, value]) => ({
        key,
        kind: value.kind === 'video' ? 'video' : 'image',
        url: value.url,
        caption: value.caption || '',
        when: value.when || '',
        source: value.source || 'catalog',
    }))
}

function responseBody({ settings, library }) {
    const active = new Set(ACTIVE_VARIANT_IDS)
    const effectivePrompt = buildSystemPrompt({
        isNew: true, stage: 'new', variant: settings.activeOpeningIds[0],
    }, todayISO(), {
        media: library,
        businessInstructions: settings.businessInstructions,
        activeOpeningIds: settings.activeOpeningIds,
    })
    return {
        ok: true,
        settings,
        models: MODEL_REGISTRY,
        openings: OPENING_VARIANTS.filter(row => active.has(row.id)).map(({ id, label, hypothesis, directive }) => ({ id, label, hypothesis, directive })),
        media: publicMedia(library),
        effectivePrompt,
    }
}

export async function GET(req) {
    if (!(await identity(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    try {
        return NextResponse.json(responseBody(await context()))
    } catch {
        return NextResponse.json({ error: 'SETTINGS_READ_FAILED' }, { status: 503 })
    }
}

export async function PUT(req) {
    const updatedBy = await identity(req)
    if (!updatedBy) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    let body
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'BAD_JSON' }, { status: 400 })
    }
    try {
        const { library, registeredMediaKeys } = await context()
        const settings = await saveSalesSettings(body, { updatedBy, registeredMediaKeys })
        return NextResponse.json(responseBody({ settings, library }))
    } catch (error) {
        const code = String(error?.message || '')
        if (code === 'STALE_REVISION') return NextResponse.json({ error: code }, { status: 409 })
        const known = ['INVALID_REVISION', 'INVALID_PROVIDER', 'INVALID_MODEL', 'INSTRUCTIONS_TOO_LONG', 'NO_ACTIVE_OPENING']
        if (known.includes(code)) return NextResponse.json({ error: code }, { status: 400 })
        return NextResponse.json({ error: 'SETTINGS_SAVE_FAILED' }, { status: 503 })
    }
}
