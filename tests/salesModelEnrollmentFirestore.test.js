import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => {
    const docs = new Map()
    let queue = Promise.resolve()
    let nowMs = 10_000
    let committedWrites = []
    const doc = key => ({ key })
    const snapshot = target => ({ exists: docs.has(target.key), data: () => docs.get(target.key) })
    const db = {
        collection: name => ({ doc: id => doc(`${name}/${id}`) }),
        runTransaction: work => {
            const run = queue.then(async () => {
                const writes = []
                const tx = {
                    get: async target => snapshot(target),
                    set: (target, value, options) => writes.push({ key: target.key, value, options }),
                }
                const result = await work(tx)
                for (const write of writes) {
                    const previous = docs.get(write.key) || {}
                    docs.set(write.key, write.options?.merge ? { ...previous, ...write.value } : write.value)
                    committedWrites.push(write)
                }
                return result
            })
            queue = run.catch(() => {})
            return run
        },
    }
    return {
        db,
        reset() {
            docs.clear()
            queue = Promise.resolve()
            nowMs = 10_000
            committedWrites = []
        },
        set(key, value) { docs.set(key, value) },
        get(key) { return docs.get(key) },
        now() { return nowMs },
        setNow(value) { nowMs = value },
        committed() { return [...committedWrites] },
    }
})

vi.mock('@/lib/firebaseAdmin', () => ({ adminDb: store.db }))
vi.mock('firebase-admin/firestore', () => ({
    FieldValue: {
        serverTimestamp: () => 'SERVER_TIME',
        increment: n => ({ increment: n }),
        arrayUnion: (...items) => ({ arrayUnion: items }),
    },
}))

import { resolveOrEnrollModelAssignment } from '@/lib/salesAgent/leads'

const EVENT = 'sales_inbound_events/model-event'
const LEAD = 'sales_leads/opaque-lead'
const experiment = {
    id: 'sales-models', revision: 4, enabled: true,
    championArmId: 'gemini', targetVerifiedSalesPerDay: 2,
    minimumDeliveredPerArm: 30, minimumDays: 7,
    arms: [
        { id: 'gemini', revision: 2, provider: 'gemini', model: 'gemini-3.6-flash', weight: 50, enabled: true },
        { id: 'claude', revision: 3, provider: 'anthropic', model: 'claude-sonnet-4-5', weight: 50, enabled: true },
    ],
}
const input = (overrides = {}) => ({
    eventId: 'model-event', leadId: 'opaque-lead', experiment,
    claimToken: 'claim-token', generation: 2, deadlineAtMs: 10_100,
    ...overrides,
})

beforeEach(() => {
    store.reset()
    store.set(EVENT, {
        status: 'processing', leaseUntilMs: 20_000,
        claimToken: 'claim-token', claimGeneration: 2,
    })
    vi.spyOn(Date, 'now').mockImplementation(() => store.now())
})

afterEach(() => vi.restoreAllMocks())

describe('sticky model enrollment', () => {
    it('creates one assignment and returns it unchanged to concurrent claimants', async () => {
        const [first, second] = await Promise.all([
            resolveOrEnrollModelAssignment(input()),
            resolveOrEnrollModelAssignment(input()),
        ])

        expect(first.assignment).toEqual(second.assignment)
        expect(store.get(LEAD).modelAssignment).toMatchObject(first.assignment)
        expect(store.get(LEAD).modelAssignment.assignedAt).toBe('SERVER_TIME')
        expect(store.committed()).toHaveLength(1)
    })

    it('returns an existing matching assignment without writing', async () => {
        const existing = {
            experimentId: 'sales-models', experimentRevision: 4,
            armId: 'claude', armRevision: 3,
            provider: 'anthropic', model: 'claude-sonnet-4-5', assignedAt: 9_000,
        }
        store.set(LEAD, { modelAssignment: existing })

        await expect(resolveOrEnrollModelAssignment(input())).resolves.toEqual({
            action: 'existing', assignment: expect.objectContaining({ armId: 'claude' }),
        })
        expect(store.committed()).toEqual([])
    })

    it.each([
        [{ claimToken: 'stale' }, 'wrong token'],
        [{ generation: 1 }, 'wrong generation'],
    ])('rejects a stale claim without writing an assignment: %s', async (override) => {
        await expect(resolveOrEnrollModelAssignment(input(override))).resolves.toEqual({ action: 'stale' })
        expect(store.get(LEAD)).toBeUndefined()
        expect(store.committed()).toEqual([])
    })

    it('rejects an expired deadline without writing', async () => {
        store.setNow(10_100)

        await expect(resolveOrEnrollModelAssignment(input())).rejects.toThrow('deadline exhausted')
        expect(store.get(LEAD)).toBeUndefined()
        expect(store.committed()).toEqual([])
    })

    it('does not expose or persist event, claim, or lead identifiers in the assignment', async () => {
        const result = await resolveOrEnrollModelAssignment(input())
        const serialized = JSON.stringify(result.assignment)

        expect(serialized).not.toContain('opaque-lead')
        expect(serialized).not.toContain('model-event')
        expect(serialized).not.toContain('claim-token')
    })
})
