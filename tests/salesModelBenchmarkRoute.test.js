import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => {
    const docs = new Map()
    const ref = key => ({ key })
    const db = {
        collection: name => ({ doc: id => ref(`${name}/${id}`) }),
        runTransaction: async work => {
            const writes = []
            const result = await work({
                get: async target => ({ exists: docs.has(target.key), data: () => docs.get(target.key) }),
                set: (target, value, options) => writes.push({ target, value, options }),
            })
            for (const write of writes) {
                const previous = docs.get(write.target.key) || {}
                docs.set(write.target.key, write.options?.merge ? { ...previous, ...write.value } : write.value)
            }
            return result
        },
    }
    return { db, reset: () => docs.clear(), set: (key, value) => docs.set(key, value), get: key => docs.get(key) }
})

const mocks = vi.hoisted(() => ({
    listLeads: vi.fn(),
    callClaude: vi.fn(),
    runModelBenchmark: vi.fn(),
}))

vi.mock('@/lib/firebaseAdmin', () => ({ adminDb: store.db }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'SERVER_TIME' } }))
vi.mock('@/lib/salesAgent/leads', () => ({ listLeads: mocks.listLeads }))
vi.mock('@/lib/salesAgent/agent', () => ({ callClaude: mocks.callClaude }))
vi.mock('@/lib/salesAgent/modelBenchmark', async importOriginal => {
    const actual = await importOriginal()
    return { ...actual, runModelBenchmark: mocks.runModelBenchmark }
})

let POST
const request = (body, secret = 'benchmark-secret') => new Request('http://localhost/api/sales-agent/model-benchmark', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-wt-secret': secret },
    body: typeof body === 'string' ? body : JSON.stringify(body),
})

beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    store.reset()
    process.env.SALES_AGENT_SECRET = 'benchmark-secret'
    mocks.listLeads.mockResolvedValue([{ phone: 'private-phone', incomingText: 'private text' }])
    mocks.runModelBenchmark.mockResolvedValue({
        revision: 3, caseCount: 1, callCount: 3,
        rows: [{ armId: 'gemini', cases: 1, scoreRate: 1, errorRate: 0, costUsd: 0.01, latencyP50Ms: 500 }],
    })
    ;({ POST } = await import('@/app/api/sales-agent/model-benchmark/route'))
})

describe('model benchmark route', () => {
    it('authenticates before reading any historical lead', async () => {
        const response = await POST(request({ revision: 3 }, 'wrong'))
        expect(response.status).toBe(401)
        expect(mocks.listLeads).not.toHaveBeenCalled()
        expect(mocks.runModelBenchmark).not.toHaveBeenCalled()
    })

    it('runs one bounded dry benchmark and stores only aggregate rows', async () => {
        const response = await POST(request({ revision: 3, maxCases: 12 }))
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toEqual({
            ok: true, cached: false, revision: 3, caseCount: 1, callCount: 3,
            rows: [{ armId: 'gemini', cases: 1, scoreRate: 1, errorRate: 0, costUsd: 0.01, latencyP50Ms: 500 }],
        })
        expect(mocks.listLeads).toHaveBeenCalledWith({ limit: 100 })
        expect(mocks.runModelBenchmark).toHaveBeenCalledWith(expect.objectContaining({
            revision: 3, maxCases: 12, cases: expect.any(Array), candidates: expect.any(Array),
        }), expect.objectContaining({ callModel: mocks.callClaude, saveScore: expect.any(Function) }))
        expect(JSON.stringify(store.get('sales_model_benchmarks/revision-3'))).not.toMatch(/private-phone|private text/)
    })

    it('returns a completed replay without another lead read or provider call', async () => {
        store.set('sales_model_benchmarks/revision-3', {
            status: 'completed', aggregate: { revision: 3, caseCount: 2, callCount: 6, rows: [] },
        })

        const response = await POST(request({ revision: 3 }))
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            ok: true, cached: true, revision: 3, caseCount: 2, callCount: 6, rows: [],
        })
        expect(mocks.listLeads).not.toHaveBeenCalled()
        expect(mocks.runModelBenchmark).not.toHaveBeenCalled()
    })

    it('does not overlap an already-running revision', async () => {
        store.set('sales_model_benchmarks/revision-3', { status: 'running', leaseUntilMs: Date.now() + 60_000 })

        const response = await POST(request({ revision: 3 }))
        expect(response.status).toBe(202)
        expect(await response.json()).toEqual({ ok: true, running: true, revision: 3 })
        expect(mocks.runModelBenchmark).not.toHaveBeenCalled()
    })

    it.each([{ revision: 0 }, { revision: 3, maxCases: 101 }, '{bad'])('rejects invalid bounded input', async body => {
        const response = await POST(request(body))
        expect(response.status).toBe(400)
        expect(mocks.listLeads).not.toHaveBeenCalled()
    })
})
