export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const maxDuration = 60

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebaseAdmin'
import { callClaude } from '@/lib/salesAgent/agent'
import { listLeads } from '@/lib/salesAgent/leads'
import { BENCHMARK_CANDIDATES, runModelBenchmark } from '@/lib/salesAgent/modelBenchmark'

const COLLECTION = 'sales_model_benchmarks'
const LEASE_MS = 10 * 60_000

function authorized(request) {
    const expected = String(process.env.SALES_AGENT_SECRET || '')
    return !!expected && request.headers.get('x-wt-secret') === expected
}

function publicRow(row = {}) {
    const allowed = ['armId', 'provider', 'model', 'cases', 'scoreRate', 'errorRate', 'costUsd', 'latencyP50Ms']
    return Object.fromEntries(allowed.filter(key => row[key] !== undefined).map(key => [key, row[key]]))
}

function publicAggregate(value = {}) {
    return {
        revision: Number(value.revision),
        caseCount: Math.max(0, Number(value.caseCount) || 0),
        callCount: Math.max(0, Number(value.callCount) || 0),
        rows: (Array.isArray(value.rows) ? value.rows : []).slice(0, 3).map(publicRow),
    }
}

export async function POST(request) {
    if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    let body
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'INVALID_BENCHMARK_INPUT' }, { status: 400 })
    }
    const revision = Number(body?.revision)
    const maxCases = body?.maxCases == null ? 12 : Number(body.maxCases)
    if (!Number.isInteger(revision) || revision < 1
        || !Number.isInteger(maxCases) || maxCases < 1 || maxCases > 100) {
        return NextResponse.json({ error: 'INVALID_BENCHMARK_INPUT' }, { status: 400 })
    }

    const runRef = adminDb.collection(COLLECTION).doc(`revision-${revision}`)
    const runToken = crypto.randomUUID()
    const nowMs = Date.now()
    const claim = await adminDb.runTransaction(async tx => {
        const snap = await tx.get(runRef)
        const stored = snap.exists ? snap.data() || {} : null
        if (stored?.status === 'completed' && stored.aggregate) {
            return { action: 'cached', aggregate: publicAggregate(stored.aggregate) }
        }
        if (stored?.status === 'running' && Number(stored.leaseUntilMs) > nowMs) return { action: 'running' }
        tx.set(runRef, {
            revision,
            status: 'running',
            runToken,
            leaseUntilMs: nowMs + LEASE_MS,
            startedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: false })
        return { action: 'run' }
    })
    if (claim.action === 'cached') return NextResponse.json({ ok: true, cached: true, ...claim.aggregate })
    if (claim.action === 'running') return NextResponse.json({ ok: true, running: true, revision }, { status: 202 })

    try {
        const cases = await listLeads({ limit: 100 })
        const aggregate = publicAggregate(await runModelBenchmark({
            revision,
            maxCases,
            cases,
            candidates: BENCHMARK_CANDIDATES,
        }, {
            callModel: callClaude,
            // Individual provider responses are deliberately not persisted.
            saveScore: async () => {},
        }))
        const completed = await adminDb.runTransaction(async tx => {
            const snap = await tx.get(runRef)
            const stored = snap.exists ? snap.data() || {} : {}
            if (stored.runToken !== runToken || stored.status !== 'running') return false
            tx.set(runRef, {
                revision,
                status: 'completed',
                aggregate,
                runToken: null,
                leaseUntilMs: null,
                completedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: false })
            return true
        })
        if (!completed) return NextResponse.json({ error: 'BENCHMARK_CLAIM_STALE' }, { status: 409 })
        return NextResponse.json({ ok: true, cached: false, ...aggregate })
    } catch {
        await adminDb.runTransaction(async tx => {
            const snap = await tx.get(runRef)
            const stored = snap.exists ? snap.data() || {} : {}
            if (stored.runToken !== runToken || stored.status !== 'running') return
            tx.set(runRef, {
                revision,
                status: 'failed',
                errorCode: 'BENCHMARK_FAILED',
                runToken: null,
                leaseUntilMs: null,
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: false })
        }).catch(() => {})
        return NextResponse.json({ error: 'BENCHMARK_FAILED' }, { status: 503 })
    }
}
