export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { MEDIA } from '@/lib/salesAgent/catalog'
import { listLeads, listMedia } from '@/lib/salesAgent/leads'
import { summarizeLiveModelExperiment } from '@/lib/salesAgent/modelExperimentAnalytics'
import { readSalesSettings, saveSalesSettings } from '@/lib/salesAgent/settingsStore'

const MAX_BODY_CHARS = 20_000

async function identity(request) {
    const shared = String(process.env.SALES_AGENT_SECRET || '')
    if (shared && request.headers.get('x-wt-secret') === shared) return 'shared-secret'
    const header = request.headers.get('authorization') || ''
    if (!header.startsWith('Bearer ')) return null
    try {
        const decoded = await adminAuth.verifyIdToken(header.slice(7).trim())
        return isSuperAdmin(decoded.email) ? decoded.email : null
    } catch {
        return null
    }
}

async function settingsContext() {
    const custom = await listMedia({ fresh: true })
    const registeredMediaKeys = [...new Set([...Object.keys(MEDIA), ...custom.map(item => String(item.key))])]
    const settings = await readSalesSettings({ registeredMediaKeys })
    return { settings, registeredMediaKeys }
}

function publicBenchmark(value = {}) {
    const allowedRowKeys = ['armId', 'provider', 'model', 'cases', 'scoreRate', 'errorRate', 'costUsd', 'latencyP50Ms']
    return {
        revision: Number(value.revision) || 0,
        caseCount: Math.max(0, Number(value.caseCount) || 0),
        callCount: Math.max(0, Number(value.callCount) || 0),
        rows: (Array.isArray(value.rows) ? value.rows : []).slice(0, 3).map(row => Object.fromEntries(
            allowedRowKeys.filter(key => row?.[key] !== undefined).map(key => [key, row[key]]),
        )),
    }
}

async function readBenchmark(revision) {
    const snap = await adminDb.collection('sales_model_benchmarks').doc(`revision-${revision}`).get()
    const stored = snap.exists ? snap.data() || {} : null
    return stored?.status === 'completed' && stored.aggregate ? publicBenchmark(stored.aggregate) : null
}

async function responseBody(settings) {
    const [leads, benchmark] = await Promise.all([
        listLeads({ limit: 500 }),
        readBenchmark(settings.modelExperiment.revision),
    ])
    return {
        ok: true,
        revision: settings.revision,
        experiment: settings.modelExperiment,
        live: summarizeLiveModelExperiment(leads, {
            experiment: settings.modelExperiment,
            nowMs: Date.now(),
        }),
        benchmark,
    }
}

function setAllocation(experiment, weights) {
    if (!weights || typeof weights !== 'object' || Array.isArray(weights)) throw new Error('INVALID_MODEL_ALLOCATION')
    const expected = new Set(experiment.arms.map(arm => arm.id))
    if (Object.keys(weights).some(id => !expected.has(id)) || [...expected].some(id => !Object.hasOwn(weights, id))) {
        throw new Error('INVALID_MODEL_ALLOCATION')
    }
    const values = experiment.arms.map(arm => Number(weights[arm.id]))
    if (values.some(value => !Number.isInteger(value) || value < 0 || value > 100)
        || values.reduce((sum, value) => sum + value, 0) !== 100) throw new Error('INVALID_MODEL_ALLOCATION')
    return {
        ...experiment,
        arms: experiment.arms.map((arm, index) => ({ ...arm, weight: values[index], enabled: values[index] > 0 })),
    }
}

function applyAction(experiment, input) {
    const current = structuredClone(experiment)
    if (input.action === 'set_allocation') return setAllocation(current, input.weights)
    if (input.action === 'set_enabled') return { ...current, enabled: input.enabled === true }
    const armIndex = current.arms.findIndex(arm => arm.id === String(input.armId || ''))
    if (armIndex < 0) throw new Error('INVALID_MODEL_ARM_ID')
    if (input.action === 'pause_arm') {
        const removed = current.arms[armIndex].weight
        const recipientIndex = current.arms.findIndex((arm, index) => index !== armIndex && arm.id === current.championArmId)
        const fallbackIndex = current.arms.findIndex((arm, index) => index !== armIndex && arm.enabled && arm.weight > 0)
        const targetIndex = recipientIndex >= 0 ? recipientIndex : fallbackIndex
        if (targetIndex < 0) throw new Error('INVALID_MODEL_ALLOCATION')
        current.arms[armIndex] = { ...current.arms[armIndex], enabled: false, weight: 0 }
        current.arms[targetIndex] = {
            ...current.arms[targetIndex],
            enabled: true,
            weight: current.arms[targetIndex].weight + removed,
        }
        return current
    }
    if (input.action === 'resume_arm') {
        const weight = Number(input.weight ?? 20)
        if (!Number.isInteger(weight) || weight < 1 || weight > 50) throw new Error('INVALID_MODEL_ALLOCATION')
        const donorIndex = current.arms.findIndex((arm, index) => index !== armIndex && arm.id === current.championArmId)
        if (donorIndex < 0 || current.arms[donorIndex].weight < weight) throw new Error('INVALID_MODEL_ALLOCATION')
        current.arms[donorIndex] = { ...current.arms[donorIndex], weight: current.arms[donorIndex].weight - weight }
        current.arms[armIndex] = { ...current.arms[armIndex], enabled: true, weight }
        return current
    }
    throw new Error('UNSUPPORTED_ACTION')
}

function failure(error) {
    const code = String(error?.message || '')
    if (code === 'STALE_REVISION') return NextResponse.json({ error: code }, { status: 409 })
    const bad = new Set([
        'INVALID_MODEL_ALLOCATION', 'INVALID_MODEL_ARM_ID', 'UNSUPPORTED_ACTION',
        'MODEL_ARM_CREDENTIAL_MISSING', 'INVALID_MODEL_EXPERIMENT_WEIGHT',
        'INVALID_MODEL_EXPERIMENT_REVISION', 'INVALID_MODEL_ARM_REVISION',
    ])
    if (bad.has(code)) return NextResponse.json({ error: code }, { status: 400 })
    return NextResponse.json({ error: 'MODEL_EXPERIMENT_UNAVAILABLE' }, { status: 503 })
}

export async function GET(request) {
    if (!(await identity(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    try {
        const { settings } = await settingsContext()
        return NextResponse.json(await responseBody(settings))
    } catch {
        return NextResponse.json({ error: 'MODEL_EXPERIMENT_UNAVAILABLE' }, { status: 503 })
    }
}

export async function POST(request) {
    const updatedBy = await identity(request)
    if (!updatedBy) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const raw = await request.text()
    if (!raw || raw.length > MAX_BODY_CHARS) {
        return NextResponse.json({ error: raw ? 'REQUEST_TOO_LARGE' : 'BAD_JSON' }, { status: raw ? 413 : 400 })
    }
    let input
    try {
        input = JSON.parse(raw)
    } catch {
        return NextResponse.json({ error: 'BAD_JSON' }, { status: 400 })
    }
    try {
        const { settings, registeredMediaKeys } = await settingsContext()
        const modelExperiment = applyAction(settings.modelExperiment, input)
        const saved = await saveSalesSettings({
            revision: Number(input.revision),
            modelExperiment,
            changeNote: `model experiment: ${String(input.action || '').slice(0, 40)}`,
        }, { updatedBy, registeredMediaKeys })
        return NextResponse.json({ ok: true, revision: saved.revision, experiment: saved.modelExperiment })
    } catch (error) {
        return failure(error)
    }
}
