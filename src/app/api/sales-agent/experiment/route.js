export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { MEDIA } from '@/lib/salesAgent/catalog'
import { listMedia } from '@/lib/salesAgent/leads'
import { decideOpeningApproval, generateOpeningApproval, listOpeningApprovals } from '@/lib/salesAgent/openingApprovals'
import {
    listSalesSettingsHistory,
    readSalesSettings,
    restoreSalesSettingsRevision,
    saveSalesSettings,
} from '@/lib/salesAgent/settingsStore'

const MAX_BODY_CHARS = 100_000

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

const publicMedia = items => items.map(item => ({
    key: String(item.key),
    kind: ['image', 'video', 'audio'].includes(item.kind) ? item.kind : 'image',
    url: String(item.url || ''),
    caption: String(item.caption || ''),
    when: String(item.when || ''),
    source: String(item.source || 'upload'),
}))

async function mediaContext() {
    const custom = await listMedia({ fresh: true })
    const keys = [...new Set([...Object.keys(MEDIA), ...custom.map(item => String(item.key))])]
    return { custom, registeredMediaKeys: keys }
}

async function bodyFor(settings, custom, history = null) {
    const [rows, approvals] = await Promise.all([
        history || listSalesSettingsHistory({ limit: 20 }),
        listOpeningApprovals({ limit: 30 }),
    ])
    return {
        ok: true,
        revision: settings.revision,
        enabled: settings.enabled,
        experiment: settings.openingExperiment,
        history: rows,
        media: publicMedia(custom),
        metrics: null,
        leads: [],
        approvals,
    }
}

function failure(error) {
    const code = String(error?.message || '')
    if (code === 'STALE_REVISION') return NextResponse.json({ error: code }, { status: 409 })
    if (code === 'REVISION_NOT_FOUND') return NextResponse.json({ error: code }, { status: 404 })
    const bad = new Set([
        'INVALID_REVISION', 'INVALID_OPENING_BLOCK', 'INVALID_OPENING_MEDIA',
        'DUPLICATE_OPENING_BLOCK', 'TOO_MANY_OPENING_BLOCKS',
        'INVALID_OPENING_TERMINAL', 'INVALID_OPENING_DESIGN_ORDER',
        'NO_ACTIVE_OPENING_VARIANT', 'INVALID_OPENING_VARIANT',
        'INVALID_OPENING_WEIGHT', 'INVALID_OPENING_REVISION',
        'INVALID_OPENING_SAMPLE', 'INVALID_OPENING_TEXT', 'INVALID_OPENING_TEMPLATE',
    ])
    if (bad.has(code)) return NextResponse.json({ error: code }, { status: 400 })
    if (['APPROVAL_NOT_FOUND'].includes(code)) return NextResponse.json({ error: code }, { status: 404 })
    if (['APPROVAL_MISMATCH', 'APPROVAL_STATE_MISMATCH', 'APPROVAL_SEND_BUSY', 'OPENING_EXPERIMENT_STOPPED'].includes(code)) {
        return NextResponse.json({ error: code }, { status: 409 })
    }
    return NextResponse.json({ error: 'OPENING_EXPERIMENT_UNAVAILABLE' }, { status: 503 })
}

export async function GET(req) {
    if (!(await identity(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    try {
        const { custom, registeredMediaKeys } = await mediaContext()
        const [settings, history] = await Promise.all([
            readSalesSettings({ registeredMediaKeys }),
            listSalesSettingsHistory({ limit: 20 }),
        ])
        return NextResponse.json(await bodyFor(settings, custom, history))
    } catch {
        return NextResponse.json({ error: 'OPENING_EXPERIMENT_UNAVAILABLE' }, { status: 503 })
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
        const { custom, registeredMediaKeys } = await mediaContext()
        let settings
        if (input.action === 'publish') {
            settings = await saveSalesSettings({
                revision: Number(input.revision),
                openingExperiment: input.experiment,
                changeNote: typeof input.changeNote === 'string' ? input.changeNote : '',
            }, { updatedBy, registeredMediaKeys })
        } else if (input.action === 'restore') {
            settings = await restoreSalesSettingsRevision(Number(input.restoreRevision), {
                expectedRevision: Number(input.revision),
                updatedBy,
                registeredMediaKeys,
            })
        } else if (['generate_approval', 'approve', 'reject'].includes(input.action)) {
            const approvalId = String(input.approvalId || '')
            if (!/^[a-f0-9]{32}$/.test(approvalId)) return NextResponse.json({ error: 'INVALID_APPROVAL_ID' }, { status: 400 })
            if (input.action === 'generate_approval') await generateOpeningApproval(approvalId)
            else await decideOpeningApproval(approvalId, input.action)
            settings = await readSalesSettings({ registeredMediaKeys })
        } else {
            return NextResponse.json({ error: 'UNSUPPORTED_ACTION' }, { status: 400 })
        }
        return NextResponse.json(await bodyFor(settings, custom))
    } catch (error) {
        return failure(error)
    }
}
