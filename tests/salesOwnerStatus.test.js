import { describe, expect, it } from 'vitest'
import {
    buildOwnerStatusPayload,
    claimOwnerStatusNotification,
    decideOwnerStatus,
    finishOwnerStatusNotification,
} from '@/lib/salesAgent/ownerStatus'

const noon = Date.UTC(2026, 8, 15, 9)
const healthy = {
    verifiedPaidToday: 1, targetVerifiedSalesPerDay: 2,
    health: { inbound: 'green', whatsapp: 'green', followups: 'amber' },
    recommendation: { action: 'insufficient_evidence' }, pausedArms: [],
}

describe('owner sales status decisions', () => {
    it('emits one routine digest per Israel day and immediate material transitions only', () => {
        expect(decideOwnerStatus(null, healthy, noon).kind).toBe('daily_digest')
        const previous = { snapshot: healthy, lastDailyDay: '2026-09-15' }
        expect(decideOwnerStatus(previous, healthy, noon + 60_000)).toBeNull()
        expect(decideOwnerStatus(previous, { ...healthy, health: { ...healthy.health, whatsapp: 'red' } }, noon + 120_000).kind)
            .toBe('transport_outage')
    })

    it('reports recovery, target reached, arm pause, and a new winner once', () => {
        expect(decideOwnerStatus({ snapshot: { ...healthy, health: { ...healthy.health, inbound: 'red' } }, lastDailyDay: '2026-09-15' }, healthy, noon).kind)
            .toBe('critical_recovered')
        expect(decideOwnerStatus({ snapshot: healthy, lastDailyDay: '2026-09-15' }, { ...healthy, verifiedPaidToday: 2 }, noon).kind)
            .toBe('target_reached')
        expect(decideOwnerStatus({ snapshot: healthy, lastDailyDay: '2026-09-15' }, { ...healthy, pausedArms: ['claude'] }, noon).kind)
            .toBe('arm_paused')
        expect(decideOwnerStatus({ snapshot: healthy, lastDailyDay: '2026-09-15' }, { ...healthy, recommendation: { action: 'promote', winnerArmId: 'claude' } }, noon).kind)
            .toBe('winner_recommended')
    })

    it('builds exactly four bounded template lines without private inputs', () => {
        const payload = buildOwnerStatusPayload({
            kind: 'daily_digest', current: healthy,
            phone: 'non-dialable-private-phone', transcript: 'customer private text', queueId: 'queue-private', token: 'token-private',
        })

        expect(payload).toHaveLength(4)
        expect(payload.every(line => typeof line === 'string' && line.length > 0 && line.length <= 1024 && !line.includes('\n'))).toBe(true)
        expect(JSON.stringify(payload)).not.toMatch(/non-dialable-private-phone|customer private text|queue-private|token-private/)
    })

    it('claims a status event transactionally so concurrent runs cannot both send', async () => {
        const db = transactionalDb()
        const [first, second] = await Promise.all([
            claimOwnerStatusNotification(db, healthy, noon),
            claimOwnerStatusNotification(db, healthy, noon),
        ])

        expect([first.action, second.action].sort()).toEqual(['claimed', 'none'])
        const claimed = first.action === 'claimed' ? first : second
        await finishOwnerStatusNotification(db, claimed.eventKey, { status: 'accepted', nowMs: noon + 1000 })
        expect(db.dump().events[claimed.eventKey].status).toBe('accepted')
        expect(JSON.stringify(db.dump())).not.toMatch(/phone|transcript|queue|token/i)
    })
})

function transactionalDb() {
    const store = { runtime: null, events: {} }
    let tail = Promise.resolve()
    const ref = (kind, id) => ({ kind, id })
    const database = {
        collection(name) {
            return { doc(id) { return ref(name === 'sales_owner_status' ? 'runtime' : 'events', id) } }
        },
        runTransaction(work) {
            const run = tail.then(async () => {
                const tx = {
                    async get(target) {
                        const value = target.kind === 'runtime' ? store.runtime : store.events[target.id]
                        return { exists: Boolean(value), data: () => structuredClone(value) }
                    },
                    set(target, value) {
                        if (target.kind === 'runtime') store.runtime = structuredClone(value)
                        else store.events[target.id] = structuredClone(value)
                    },
                }
                return work(tx)
            })
            tail = run.catch(() => undefined)
            return run
        },
        dump: () => structuredClone(store),
    }
    return database
}
