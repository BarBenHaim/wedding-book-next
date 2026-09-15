export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import { MEDIA } from '@/lib/salesAgent/catalog'
import { listLeads, listMedia, readDueFollowUpHealth, readSalesHealthRuntime } from '@/lib/salesAgent/leads'
import { summarizeSalesHealth } from '@/lib/salesAgent/leadsCore'
import { isoInIsrael } from '@/lib/salesAgent/leadsView'
import { summarizeLiveModelExperiment } from '@/lib/salesAgent/modelExperimentAnalytics'
import { buildOwnerStatusPayload, claimOwnerStatusNotification, finishOwnerStatusNotification } from '@/lib/salesAgent/ownerStatus'
import { readSalesSettings } from '@/lib/salesAgent/settingsStore'
import { DAILY_DIGEST_TEMPLATE, sendWhatsAppTemplate } from '@/lib/salesAgent/whatsapp'

const allowedTransportErrors = new Set([
    'GRAPH_REJECTED', 'GRAPH_TIMEOUT', 'PROVIDER_MESSAGE_ID_MISSING',
    'WHATSAPP_NOT_CONFIGURED', 'TEMPLATE_NOT_CONFIGURED',
])

function authorized(request) {
    const secret = String(process.env.CRON_SECRET || '')
    return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`
}

async function currentTruth(nowMs) {
    const customMedia = await listMedia({ fresh: true })
    const registeredMediaKeys = [...new Set([...Object.keys(MEDIA), ...customMedia.map(item => String(item.key))])]
    const settings = await readSalesSettings({ registeredMediaKeys })
    const [leads, healthRuntime, dueHealth] = await Promise.all([
        listLeads({ limit: 500 }), readSalesHealthRuntime(), readDueFollowUpHealth(isoInIsrael()),
    ])
    const health = summarizeSalesHealth({
        nowMs, ...healthRuntime, catalogFallbackEnabled: true,
        dueFollowUps: dueHealth.dueFollowUps, followupsScanSaturated: dueHealth.scanSaturated,
    })
    const model = summarizeLiveModelExperiment(leads, { experiment: settings.modelExperiment, nowMs })
    return {
        verifiedPaidToday: model.summary.verifiedPaidToday,
        targetVerifiedSalesPerDay: model.summary.targetVerifiedSalesPerDay,
        health: {
            inbound: health.inbound.status, whatsapp: health.whatsapp.status, followups: health.followups.status,
        },
        recommendation: model.recommendation,
        pausedArms: (Array.isArray(settings.modelExperiment.arms) ? settings.modelExperiment.arms : [])
            .filter(arm => !arm.enabled || arm.weight === 0).map(arm => arm.id),
    }
}

export async function GET(request) {
    if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const nowMs = Date.now()
    let claim
    try {
        claim = await claimOwnerStatusNotification(adminDb, await currentTruth(nowMs), nowMs)
    } catch {
        console.error('[sales-model-status] STATUS_READ_FAILED')
        return NextResponse.json({ error: 'OWNER_STATUS_UNAVAILABLE' }, { status: 503 })
    }
    if (claim.action !== 'claimed') return NextResponse.json({ ok: true, action: 'none' })

    const ownerPhone = process.env.SALES_AGENT_OWNER_PHONE
    const lines = buildOwnerStatusPayload(claim.decision)
    if (!ownerPhone) {
        await finishOwnerStatusNotification(adminDb, claim.eventKey, { status: 'not_sent', reason: 'OWNER_PHONE_MISSING', nowMs }).catch(() => undefined)
        return NextResponse.json({ error: 'OWNER_STATUS_NOT_SENT', reason: 'OWNER_PHONE_MISSING' }, { status: 503 })
    }
    try {
        await sendWhatsAppTemplate(ownerPhone, DAILY_DIGEST_TEMPLATE, lines)
    } catch (error) {
        const reason = allowedTransportErrors.has(error?.errorCode) ? error.errorCode : 'PROVIDER_FAILED'
        await finishOwnerStatusNotification(adminDb, claim.eventKey, { status: 'not_sent', reason, nowMs }).catch(() => undefined)
        return NextResponse.json({ error: 'OWNER_STATUS_NOT_SENT', reason }, { status: 503 })
    }

    let persistenceDegraded = false
    try {
        await finishOwnerStatusNotification(adminDb, claim.eventKey, { status: 'accepted', nowMs })
    } catch {
        persistenceDegraded = true
        console.error('[sales-model-status] ACCEPTANCE_PERSISTENCE_DEGRADED')
    }
    return NextResponse.json({
        ok: true, action: 'accepted', kind: claim.decision.kind,
        ...(persistenceDegraded ? { persistenceDegraded: true } : {}),
    })
}
