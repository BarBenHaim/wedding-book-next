export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { MEDIA } from '@/lib/salesAgent/catalog'
import { listMedia } from '@/lib/salesAgent/leads'
import { mergeMedia } from '@/lib/salesAgent/mediaLibrary'
import { sendOpeningVariantTest } from '@/lib/salesAgent/openingTestSend'
import {
    loadOpeningVariableVersions,
    signOpeningVariableDownload,
} from '@/lib/salesAgent/openingVariableRuntimeStore'
import { readSalesSettings } from '@/lib/salesAgent/settingsStore'

const VARIANTS = new Set(['A', 'B', 'C'])

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

export async function POST(req) {
    if (!(await identity(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const raw = await req.text()
    if (!raw || raw.length > 1_024) return NextResponse.json({ error: 'INVALID_TEST_REQUEST' }, { status: 400 })
    let input
    try {
        input = JSON.parse(raw)
    } catch {
        return NextResponse.json({ error: 'INVALID_TEST_REQUEST' }, { status: 400 })
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).sort().join(',') !== 'variantId'
        || !VARIANTS.has(String(input.variantId))) {
        return NextResponse.json({ error: 'INVALID_TEST_REQUEST' }, { status: 400 })
    }

    try {
        const custom = await listMedia({ fresh: true })
        const library = mergeMedia(MEDIA, Array.isArray(custom) ? custom : []) || MEDIA || {}
        const settings = await readSalesSettings({ registeredMediaKeys: Object.keys(library) })
        const variableVersions = await loadOpeningVariableVersions(settings.openingExperiment)
        const result = await sendOpeningVariantTest({
            variantId: String(input.variantId),
            recipient: process.env.SALES_TEST_PHONE,
            experiment: settings.openingExperiment,
            variableVersions,
            legacyLibrary: library,
            leadContext: {
                first_name: 'בר', event_type: 'בר מצווה', event_date: '2030-12-31',
                child_name: 'ילד לדוגמה', days_to_event: 60, payment_link: 'https://weddingtales.co.il',
            },
            signDownload: signOpeningVariableDownload,
        })
        return NextResponse.json(result)
    } catch {
        return NextResponse.json({ error: 'OPENING_TEST_UNAVAILABLE' }, { status: 503 })
    }
}
