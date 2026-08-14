import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => {
    const docs = new Map()
    let queue = Promise.resolve()
    let failCommit = false
    const doc = key => ({ key })
    const db = {
        collection: name => ({ doc: id => doc(`${name}/${id}`) }),
        runTransaction: work => {
            const run = queue.then(async () => {
                const writes = []
                const tx = {
                    get: async ref => ({ exists: docs.has(ref.key), data: () => docs.get(ref.key) }),
                    set: (ref, value, options) => writes.push({ ref, value, options }),
                }
                const result = await work(tx)
                if (failCommit) throw new Error('injected commit failure')
                for (const write of writes) {
                    const old = docs.get(write.ref.key) || {}
                    docs.set(write.ref.key, write.options?.merge ? { ...old, ...write.value } : write.value)
                }
                return result
            })
            queue = run.catch(() => {})
            return run
        },
    }
    return {
        db,
        reset() { docs.clear(); queue = Promise.resolve(); failCommit = false },
        set(key, value) { docs.set(key, value) },
        get(key) { return docs.get(key) },
        values() { return [...docs.entries()] },
        fail() { failCommit = true },
    }
})

vi.mock('@/lib/firebaseAdmin', () => ({ adminDb: store.db }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'SERVER_TIME', increment: n => ({ increment: n }), arrayUnion: (...items) => ({ arrayUnion: items }) } }))

import { acquireProviderCircuit, buildExchangePatch, completeProviderFallback, completeSuccessfulExchange, releaseProviderProbe } from '@/lib/salesAgent/leads'

describe('Firestore provider circuit and fallback fences', () => {
    beforeEach(() => {
        store.reset()
        vi.spyOn(Date, 'now').mockReturnValue(10_000)
    })

    it('allows exactly one concurrent half-open acquire', async () => {
        store.set('sales_runtime/anthropic', { consecutiveFailures: 3, openUntilMs: 9_999 })

        const results = await Promise.all([acquireProviderCircuit(), acquireProviderCircuit()])

        expect(results.filter(result => result.allow)).toHaveLength(1)
        expect(results.filter(result => result.mode === 'half-open-busy')).toHaveLength(1)
    })

    it('atomically commits the fallback event and human state', async () => {
        store.set('sales_inbound_events/event-token', { status: 'processing', leaseUntilMs: 20_000, claimToken: 'claim-token', claimGeneration: 1 })

        const result = await completeProviderFallback({
            eventId: 'event-token', claimToken: 'claim-token', claimGeneration: 1, phone: 'test-phone-token',
            reason: 'תקלה בשירות ה-AI', outcome: { sendText: 'קיבלתי את ההודעה שלך. מישהו מהצוות יחזור אליך בהקדם.', handoff: true },
        })

        expect(result.action).toBe('completed')
        expect(store.values().find(([key]) => key.startsWith('sales_leads/'))?.[1]).toMatchObject({ human: true, handoffReason: 'תקלה בשירות ה-AI' })
        expect(store.get('sales_inbound_events/event-token')).toMatchObject({ status: 'completed', outcome: { handoff: true } })
    })

    it('rolls back the human pause when fallback commit fails', async () => {
        store.set('sales_inbound_events/event-token', { status: 'processing', leaseUntilMs: 20_000, claimToken: 'claim-token', claimGeneration: 1 })
        store.fail()

        await expect(completeProviderFallback({
            eventId: 'event-token', claimToken: 'claim-token', claimGeneration: 1, phone: 'test-phone-token',
            reason: 'תקלה בשירות ה-AI', outcome: { sendText: 'קיבלתי את ההודעה שלך. מישהו מהצוות יחזור אליך בהקדם.', handoff: true },
        })).rejects.toThrow('injected commit failure')

        expect(store.values().find(([key]) => key.startsWith('sales_leads/'))).toBeUndefined()
        expect(store.get('sales_inbound_events/event-token').status).toBe('processing')
    })

    it('does not pause a lead for a stale reclaimed claim', async () => {
        store.set('sales_inbound_events/event-token', { status: 'processing', leaseUntilMs: 20_000, claimToken: 'new-token', claimGeneration: 2 })

        const result = await completeProviderFallback({
            eventId: 'event-token', claimToken: 'old-token', claimGeneration: 1, phone: 'test-phone-token',
            reason: 'תקלה בשירות ה-AI', outcome: { sendText: 'קיבלתי את ההודעה שלך. מישהו מהצוות יחזור אליך בהקדם.', handoff: true },
        })

        expect(result.action).toBe('busy')
        expect(store.values().find(([key]) => key.startsWith('sales_leads/'))).toBeUndefined()
    })

    it('uses the same rich exchange patch for the atomic success commit', async () => {
        const parsed = { messages: ['assistant one', 'assistant two'], stage: 'offer_sent', customerName: 'Name', eventType: 'wedding', eventDate: '2026-12-12', celebrantName: 'Celebrant', packageInterest: 'premium', notes: 'note', callbackPromised: '2026-11-11', objectionRaised: true, image: 'book_wedding', handoff: true, handoffReason: 'human' }
        const exchange = { phone: 'test123', incomingText: 'customer', parsed, followUpAt: null, profileName: 'Profile', source: 'instagram', variant: 'warm', isNew: true }
        const expected = buildExchangePatch(exchange)
        store.set('sales_inbound_events/event-token', { status: 'processing', leaseUntilMs: 20_000, claimToken: 'claim-token', claimGeneration: 1 })

        const result = await completeSuccessfulExchange({ eventId: 'event-token', claimToken: 'claim-token', claimGeneration: 1, exchange, outcome: { sendText: 'answer', handoff: true } })

        expect(result.action).toBe('completed')
        expect(store.values().find(([key]) => key === `sales_leads/${expected.id}`)?.[1]).toEqual(expected.patch)
        expect(store.get('sales_inbound_events/event-token')).toMatchObject({ status: 'completed', outcome: { sendText: 'answer', handoff: true } })
    })

    it('rolls back atomic success when commit rejects', async () => {
        store.set('sales_inbound_events/event-token', { status: 'processing', leaseUntilMs: 20_000, claimToken: 'claim-token', claimGeneration: 1 })
        store.fail()
        await expect(completeSuccessfulExchange({ eventId: 'event-token', claimToken: 'claim-token', claimGeneration: 1, exchange: { phone: 'test123', incomingText: 'customer', parsed: { messages: ['answer'], stage: 'engaged' }, followUpAt: null, isNew: false }, outcome: { sendText: 'answer' } })).rejects.toThrow('injected commit failure')
        expect(store.get('sales_inbound_events/event-token').status).toBe('processing')
    })

    it('releases only its matching half-open probe without changing failures', async () => {
        store.set('sales_runtime/anthropic', { consecutiveFailures: 3, openUntilMs: null, halfOpenProbeId: 'probe-a', halfOpenLeaseUntilMs: 20_000 })
        expect(await releaseProviderProbe('probe-a')).toEqual({ action: 'released' })
        expect(store.get('sales_runtime/anthropic')).toMatchObject({ consecutiveFailures: 3, halfOpenProbeId: null })
        expect(await releaseProviderProbe('probe-old')).toEqual({ action: 'stale' })
    })
})
