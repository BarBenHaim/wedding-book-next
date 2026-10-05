import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => {
    const docs = new Map()
    let queue = Promise.resolve(), fail = false, lookupFailure = false, lookupResult = null
    const snapshot = key => ({ exists: docs.has(key), data: () => docs.get(key) })
    const reference = key => ({ key, get: async () => snapshot(key) })
    const materialize = (old, values) => Object.fromEntries(Object.entries(values).map(([key, value]) => {
        if (value?.op === 'increment') return [key, (Number(old[key]) || 0) + value.value]
        if (value?.op === 'arrayUnion') return [key, [...(old[key] || []), ...value.items]]
        return [key, value]
    }))
    const db = {
        collection: name => ({ doc: id => reference(`${name}/${id}`), where: () => ({ limit: () => ({ get: async () => { if (lookupFailure) throw new Error('synthetic customer query failure'); return lookupResult || { empty: true, docs: [] } } }) }) }),
        runTransaction(work) {
            const run = queue.then(async () => {
                const writes = []
                let wrote = false
                const result = await work({
                    get: async r => { if (wrote) throw new Error('read after write'); return snapshot(r.key) },
                    set: (r, value, options) => { wrote = true; writes.push({ key: r.key, value, options }) },
                })
                if (fail) { fail = false; throw new Error('synthetic commit failure') }
                for (const w of writes) {
                    const old = docs.get(w.key) || {}
                    docs.set(w.key, { ...(w.options?.merge ? old : {}), ...materialize(old, w.value) })
                }
                return result
            })
            queue = run.catch(() => {})
            return run
        },
    }
    return { db, get: key => docs.get(key), set: (key, value) => docs.set(key, value), entries: () => [...docs], fail: () => { fail = true }, lookup: value => { lookupResult = value }, failLookup: () => { lookupFailure = true }, reset: () => { docs.clear(); queue = Promise.resolve(); fail = false; lookupResult = null; lookupFailure = false } }
})
vi.mock('@/lib/firebaseAdmin', () => ({ adminDb: store.db }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => Date.now(), increment: value => ({ op: 'increment', value }), arrayUnion: (...items) => ({ op: 'arrayUnion', items }) } }))

import { buildHumanSummary, transitionHumanTask } from '@/lib/salesAgent/humanHandoff'
import { isPausedForHuman } from '@/lib/salesAgent/leadsCore'
import { requestHumanHandoff, updateHumanHandoff, completeSuccessfulExchange, claimInboundEvent, validateInboundBeforeSend, prepareFollowUpDelivery, validateFollowUpBeforeSend, reviveOrphans, recordDeliveryEvent, prepareInboundMediaFallback, closeLeadOnPurchase, suppressMarketingFromInbound, getLead, findCustomerByPhone } from '@/lib/salesAgent/leads'
import { CONVERSATIONAL_POLICY_VERSION } from '@/lib/salesAgent/salesContract'
import { createStrictFollowUpSchedule, strictFollowUpStopReason } from '@/lib/salesAgent/followupPolicy'
import { createOutboundId } from '@/lib/salesAgent/delivery'
import { shouldLookupCustomerByPhone } from '@/lib/salesAgent/customerContext'
import { buildConversationalTurn } from '@/lib/salesAgent/conversationRuntime'

const NOW = Date.parse('2026-10-05T12:00:00Z')
const PHONE = 'fixture-phone-41'
const LEAD = 'sales_leads/41'
const eventKey = 'sales_inbound_events/synthetic-event'
const contract = (extra = {}) => ({ conversationalPolicyVersion: CONVERSATIONAL_POLICY_VERSION, conversationRevision: 1, ...extra })
const exchange = (extra = {}) => ({ phone: PHONE, incomingText: 'Please connect me to service', parsed: { messages: ['Service task recorded'], handoff: true, handoffReason: 'Customer requested service', stage: 'handoff' }, ...extra })
const complete = (extra = {}) => ({ eventId: 'synthetic-event', claimToken: 'fixture-token', claimGeneration: 1, exchange: exchange(), outcome: { sendText: 'Service task recorded', handoff: true }, ...extra })

beforeEach(() => {
    store.reset()
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    vi.stubEnv('SALES_CONVERSATIONAL_POLICY_ENABLED', 'false')
    store.set(LEAD, { stage: 'engaged', followUpAt: '2026-10-05', pendingDeliveryMessages: { pending: 'old reply' } })
    store.set(eventKey, { status: 'processing', claimToken: 'fixture-token', claimGeneration: 1, leaseUntilMs: NOW + 30000 })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('durable human service lifecycle', () => {
    it('commits the task, paused lead, cleared pending work, and inbound success atomically', async () => {
        const result = await completeSuccessfulExchange(complete())
        expect(result.humanHandoff).toMatchObject({ ok: true, status: 'requested' })
        const task = store.get(`sales_human_tasks/${result.humanHandoff.taskId}`)
        expect(task).toMatchObject({ leadId: '41', status: 'requested', summary: { reason: 'Customer requested service' } })
        expect(store.get(LEAD)).toMatchObject({ human: true, humanTakeover: true, followUpAt: null, followUpSchedule: null, pendingDeliveryMessages: {} })
        expect(store.get(eventKey).status).toBe('completed')
        expect(await validateInboundBeforeSend({ phone: PHONE, eventId: 'synthetic-event' })).toEqual({ ok: true, reason: null })
    })
    it('does not claim transfer or write a partial exchange on commit failure', async () => {
        store.fail()
        await expect(completeSuccessfulExchange(complete())).rejects.toThrow('synthetic commit failure')
        expect(store.entries().filter(([key]) => key.startsWith('sales_human_tasks/'))).toHaveLength(0)
        expect(store.get(LEAD).human).toBeUndefined()
        expect(store.get(eventKey).status).toBe('processing')
    })
    it('makes concurrent duplicate requests one stable task and preserves acknowledgment', async () => {
        const results = await Promise.all([requestHumanHandoff({ phone: PHONE }), requestHumanHandoff({ phone: PHONE })])
        expect(results[0].taskId).toBe(results[1].taskId)
        await updateHumanHandoff({ phone: PHONE, taskId: results[0].taskId, action: 'acknowledge', actor: 'admin:test' })
        expect((await requestHumanHandoff({ phone: PHONE })).status).toBe('acknowledged')
        expect(store.entries().filter(([key]) => key.startsWith('sales_human_tasks/'))).toHaveLength(1)
    })
    it('resolution and elapsed days keep takeover active; only authenticated explicit release clears it', async () => {
        const { taskId } = await requestHumanHandoff({ phone: PHONE })
        await updateHumanHandoff({ phone: PHONE, taskId, action: 'resolve', actor: 'admin:test' })
        expect(isPausedForHuman(store.get(LEAD), NOW + 30 * 86400000)).toBe(true)
        await expect(updateHumanHandoff({ phone: PHONE, taskId, action: 'release' })).rejects.toMatchObject({ code: 'ACTOR_REQUIRED' })
        await updateHumanHandoff({ phone: PHONE, taskId, action: 'release', actor: 'admin:test' })
        expect(isPausedForHuman(store.get(LEAD))).toBe(false)
        expect(store.get(LEAD).followUpAt).toBeNull()
        const again = await requestHumanHandoff({ phone: PHONE })
        expect(again.taskId).not.toBe(taskId)
        expect(store.get(LEAD).humanTaskGeneration).toBe(2)
    })
    it('rejects the wrong lead/task pair and never regresses lifecycle state', async () => {
        const { taskId } = await requestHumanHandoff({ phone: PHONE })
        await expect(updateHumanHandoff({ phone: 'fixture-42', taskId, action: 'release', actor: 'admin:test' })).rejects.toMatchObject({ code: 'TASK_MISMATCH' })
        expect(() => transitionHumanTask({ status: 'released' }, 'acknowledge', 'admin:test')).toThrow()
    })
    it('blocks a previously computed sales response after takeover and a prepared response before dispatch', async () => {
        await requestHumanHandoff({ phone: PHONE })
        expect(await completeSuccessfulExchange(complete({ exchange: exchange({ parsed: { messages: ['Buy now'], handoff: false, stage: 'offer_sent' } }), outcome: { sendText: 'Buy now' } }))).toEqual({ action: 'human-paused' })
        store.set(eventKey, { status: 'completed', outcome: { sendText: 'Old offer' } })
        expect(await validateInboundBeforeSend({ phone: PHONE, eventId: 'synthetic-event' })).toEqual({ ok: false, reason: 'human-ownership-changed' })
    })
    it('explicit release never revives a response prepared before human takeover', async () => {
        store.set(eventKey, { status: 'completed', responseHumanGeneration: 0, outcome: { sendText: 'Old offer' } })
        const { taskId } = await requestHumanHandoff({ phone: PHONE })
        await updateHumanHandoff({ phone: PHONE, taskId, action: 'release', actor: 'admin:test' })
        expect(await validateInboundBeforeSend({ phone: PHONE, eventId: 'synthetic-event' })).toEqual({ ok: false, reason: 'human-ownership-changed' })
    })
    it('suppresses already prepared followups after takeover, including retry of identical outbound', async () => {
        const input = { phone: PHONE, outboundId: 'synthetic-followup', channel: 'whatsapp_graph', text: 'fixture', requestedAt: new Date(NOW).toISOString() }
        await prepareFollowUpDelivery(input)
        expect((await validateFollowUpBeforeSend({ phone: PHONE, outboundId: input.outboundId })).ok).toBe(true)
        await requestHumanHandoff({ phone: PHONE })
        expect((await validateFollowUpBeforeSend({ phone: PHONE, outboundId: input.outboundId })).ok).toBe(false)
        expect((await prepareFollowUpDelivery(input)).action).toBe('blocked')
    })
    it('copies only minimal service context, not guest data or the full transcript', () => {
        const summary = buildHumanSummary({ name: 'Fixture', eventDateText: 'December', turns: [{ text: 'PRIVATE_TRANSCRIPT' }], guestContent: 'PRIVATE_GUEST', ownerUrl: 'PRIVATE_OWNER', offerSnapshot: { offerId: 'offer-a', price: { totalMinor: 99000, currency: 'ILS' }, scope: { includes: ['Book'] } }, followUpConsent: { status: 'granted', source: 'customer_message' } })
        expect(summary).toMatchObject({ customerName: 'Fixture', eventDate: 'December', offer: { id: 'offer-a', totalMinor: 99000, currency: 'ILS' } })
        expect(JSON.stringify(summary)).not.toContain('PRIVATE_')
    })
})

describe('strict conversation revision fencing', () => {
    beforeEach(() => vi.stubEnv('SALES_CONVERSATIONAL_POLICY_ENABLED', 'true'))
    it('anchors a delayed valid inbound to provider time through successful completion', async () => {
        const providerAt = NOW - 10 * 60 * 1000
        const claim = await claimInboundEvent({ eventId: 'delayed-valid', phone: PHONE, occurredAt: new Date(providerAt).toISOString() })
        expect(claim).toMatchObject({ action: 'process', occurredAtMs: providerAt, receivedAtMs: NOW })
        expect(store.get(LEAD)).toMatchObject({ lastInboundAtMs: providerAt, lastInboundAt: providerAt, lastInboundReceivedAtMs: NOW })
        await completeSuccessfulExchange(complete({ eventId: 'delayed-valid', claimToken: claim.claimToken, claimGeneration: claim.claimGeneration, exchange: exchange({ parsed: { messages: ['current reply'], stage: 'engaged' }, conversationContract: contract() }), outcome: { sendText: 'current reply' } }))
        expect(store.get(LEAD)).toMatchObject({ lastInboundAtMs: providerAt, lastInboundAt: providerAt })
    })
    it('does not let an older distinct inbound supersede current revision, window, or lease', async () => {
        await claimInboundEvent({ eventId: 'newer-first', phone: PHONE, occurredAt: new Date(NOW - 1000).toISOString() })
        const before = { ...store.get(LEAD) }
        const result = await claimInboundEvent({ eventId: 'delayed-older', phone: PHONE, occurredAt: new Date(NOW - 60000).toISOString() })
        expect(result).toEqual({ action: 'rejected', noReply: true, reason: 'out-of-order-inbound' })
        expect(store.get(LEAD)).toEqual(before)
        expect(store.get('sales_inbound_events/delayed-older')).toBeUndefined()
    })
    it.each([undefined, null, '', 'not-a-date', '2026-10-05T11:59:00', new Date(NOW + 1000).toISOString()])('fails closed without lead mutation for missing, ambiguous or future provider time: %s', async occurredAt => {
        const before = { ...store.get(LEAD) }
        expect(await claimInboundEvent({ eventId: 'invalid-time', phone: PHONE, occurredAt })).toEqual({ action: 'rejected', noReply: true, reason: 'customer-timestamp-unverified' })
        expect(store.get(LEAD)).toEqual(before)
    })
    it('does not renew the service window for an inbound delayed past the live processing limit', async () => {
        const before = { ...store.get(LEAD) }
        expect(await claimInboundEvent({ eventId: 'stale-time', phone: PHONE, occurredAt: new Date(NOW - 25 * 3600000).toISOString() })).toEqual({ action: 'rejected', noReply: true, reason: 'stale-inbound' })
        expect(store.get(LEAD)).toEqual(before)
    })
    it('supersedes a slow worker immediately without relying on an external retry driver', async () => {
        store.set(LEAD, { conversationRevision: 0, followUpSchedule: { old: true }, followUpAt: '2026-10-05' })
        const first = await claimInboundEvent({ occurredAt: new Date(NOW).toISOString(), eventId: 'first', phone: PHONE })
        expect(first.conversationRevision).toBe(1)
        const second = await claimInboundEvent({ occurredAt: new Date(NOW).toISOString(), eventId: 'second', phone: PHONE })
        expect(second).toMatchObject({ action: 'process', conversationRevision: 2 })
        expect(store.get(LEAD)).toMatchObject({ conversationRevision: 2, followUpSchedule: null, followUpAt: null })
        const stale = await completeSuccessfulExchange(complete({ eventId: 'first', claimToken: first.claimToken, claimGeneration: first.claimGeneration, exchange: exchange({ parsed: { messages: ['old reply'], stage: 'engaged' }, conversationContract: contract() }), outcome: { sendText: 'old reply' } }))
        expect(stale.action).toBe('stale')
        expect(store.get(LEAD).activeInboundEventId).toBe('second')
        const duplicate = await claimInboundEvent({ occurredAt: new Date(NOW).toISOString(), eventId: 'second', phone: PHONE })
        expect(duplicate).toEqual({ action: 'busy' })
    })
    it('keeps customer turns from an interrupted and waiting event without counting them twice', async () => {
        store.set(LEAD, { conversationRevision: 0, turns: [], userTurns: 0 })
        const first = await claimInboundEvent({ occurredAt: new Date(NOW).toISOString(), eventId: 'first', phone: PHONE, incomingText: 'first request' })
        const second = await claimInboundEvent({ occurredAt: new Date(NOW).toISOString(), eventId: 'second', phone: PHONE, incomingText: 'important correction' })
        expect(store.get(LEAD).turns.map(turn => turn.text)).toEqual(['first request', 'important correction'])
        expect(store.get(LEAD).userTurns).toBe(2)
        await completeSuccessfulExchange(complete({ eventId: 'first', claimToken: first.claimToken, claimGeneration: first.claimGeneration, exchange: exchange({ parsed: { messages: ['old reply'], stage: 'engaged' }, conversationContract: contract() }), outcome: { sendText: 'old reply' } }))
        await completeSuccessfulExchange(complete({ eventId: 'second', claimToken: second.claimToken, claimGeneration: second.claimGeneration, exchange: exchange({ incomingText: 'important correction', parsed: { messages: ['current reply'], stage: 'engaged' }, conversationContract: contract({ conversationRevision: 2 }) }), outcome: { sendText: 'current reply' } }))
        expect(store.get(LEAD).turns.map(turn => turn.text)).toEqual(['first request', 'important correction', 'current reply'])
        expect(store.get(LEAD).userTurns).toBe(2)
    })
    it('a superseded expired event with equal provider timestamp cannot touch the new active worker', async () => {
        const occurredAt = new Date(NOW).toISOString()
        await claimInboundEvent({ eventId: 'expired-first', phone: PHONE, occurredAt, incomingText: 'first' })
        Date.now.mockReturnValue(NOW + 31000)
        await claimInboundEvent({ eventId: 'current-second', phone: PHONE, occurredAt, incomingText: 'second' })
        const current = { ...store.get('sales_inbound_events/current-second') }
        const lead = { ...store.get(LEAD) }
        Date.now.mockReturnValue(NOW + 32000)
        const replay = await claimInboundEvent({ eventId: 'expired-first', phone: PHONE, occurredAt, incomingText: 'first' })
        expect(replay).toMatchObject({ action: 'cached', outcome: { noReply: true, skipped: 'superseded-inbound' } })
        expect(store.get('sales_inbound_events/current-second')).toEqual(current)
        expect(store.get(LEAD)).toEqual(lead)
    })
    it('rechecks the actual customer 24-hour window at final dispatch', async () => {
        const claim = await claimInboundEvent({ eventId: 'dispatch-window', phone: PHONE, occurredAt: new Date(NOW - 60000).toISOString() })
        await completeSuccessfulExchange(complete({ eventId: 'dispatch-window', claimToken: claim.claimToken, claimGeneration: claim.claimGeneration, exchange: exchange({ parsed: { messages: ['response'], stage: 'engaged' }, conversationContract: contract() }), outcome: { sendText: 'response' } }))
        const customerAt = NOW - 60000
        expect(await validateInboundBeforeSend({ phone: PHONE, eventId: 'dispatch-window', nowMs: customerAt + 86400000 - 1 })).toEqual({ ok: true, reason: null })
        expect(await validateInboundBeforeSend({ phone: PHONE, eventId: 'dispatch-window', nowMs: customerAt + 86400000 })).toEqual({ ok: false, reason: 'whatsapp-window-closed' })
        for (const unverified of [null, undefined, NOW + 1000]) {
            store.set(LEAD, { ...store.get(LEAD), lastInboundAtMs: unverified })
            expect(await validateInboundBeforeSend({ phone: PHONE, eventId: 'dispatch-window', nowMs: NOW })).toEqual({ ok: false, reason: 'whatsapp-window-closed' })
        }
    })
    it('does not advance conversation state for an outgoing echo', async () => {
        await claimInboundEvent({ occurredAt: new Date(NOW).toISOString(), eventId: 'outgoing', phone: PHONE, outgoing: true })
        expect(store.get(LEAD).conversationRevision).toBeUndefined()
    })
    it('does not revive old leads under strict mode', async () => {
        expect(await reviveOrphans([PHONE], '2026-10-05')).toEqual({ revived: 0, ids: [] })
    })
})

describe('strict followup durable dispatch boundary', () => {
    let schedule
    const outboundId = 'strict-synthetic-followup'
    const input = () => ({ phone: PHONE, outboundId, channel: 'whatsapp_graph', part: 'text', text: 'Fixture reminder', expectedSchedule: schedule, requestedAt: new Date(NOW).toISOString() })
    beforeEach(() => {
        vi.stubEnv('SALES_CONVERSATIONAL_POLICY_ENABLED', 'true')
        vi.stubEnv('SALES_CONSENT_FOLLOWUPS_ENABLED', 'true')
        vi.stubEnv('SALES_CONSENT_FOLLOWUPS_ACTIVATED_AT', '2026-10-01T00:00:00Z')
        vi.stubEnv('SALES_CONSENT_FOLLOWUP_DELAYS_HOURS', '[3,48]')
        vi.stubEnv('SALES_CONSENT_FOLLOWUP_HOURS_JSON', JSON.stringify({ timeZone: 'Asia/Jerusalem', weekly: { 1: [['09:00', '21:00']] } }))
        const inboundAt = NOW - 4 * 3600000
        const lead = { stage: 'offer_sent', conversationRevision: 1, lastInboundAtMs: inboundAt, lastInboundAt: inboundAt, userTurns: 1, followUpCount: 0, unansweredSalesReminders: 0, followUpConsent: { status: 'granted', scope: 'sales_reminders', source: 'customer_message', sourceMessageId: 'consent-fixture', recordedAtMs: inboundAt, maxReminders: 2, usedReminders: 0 } }
        schedule = createStrictFollowUpSchedule(lead, { nowMs: inboundAt })
        store.set(LEAD, { ...lead, followUpSchedule: schedule, followUpAt: '2026-10-05' })
    })
    it('claims one permitted reminder atomically and permits only its current owned final dispatch', async () => {
        expect(schedule).not.toBeNull()
        expect(await prepareFollowUpDelivery(input())).toMatchObject({ action: 'requested' })
        expect(store.get(LEAD)).toMatchObject({ unansweredSalesReminders: 1, followUpConsent: { usedReminders: 1 } })
        expect((await validateFollowUpBeforeSend({ phone: PHONE, outboundId })).ok).toBe(true)
        expect((await prepareFollowUpDelivery(input())).action).toBe('existing')
        expect(store.get(LEAD).followUpConsent.usedReminders).toBe(1)
        await claimInboundEvent({ occurredAt: new Date(NOW).toISOString(), eventId: 'new-customer-message', phone: PHONE })
        expect((await validateFollowUpBeforeSend({ phone: PHONE, outboundId })).ok).toBe(false)
    })
    it('blocks stale scanned generations before claiming and consumes no consent', async () => {
        store.set(LEAD, { ...store.get(LEAD), conversationRevision: 2 })
        expect((await prepareFollowUpDelivery(input())).action).toBe('blocked')
        expect(store.get(LEAD).followUpConsent.usedReminders).toBe(0)
    })
    it('uses only still-current strict evidence to schedule the second allowed touch after delivery', async () => {
        await prepareFollowUpDelivery(input())
        await recordDeliveryEvent({ eventId: 'strict-delivered', outboundId, channel: 'whatsapp_graph', status: 'delivered', providerMessageId: 'synthetic-provider', occurredAt: new Date(NOW).toISOString() })
        expect(store.get(LEAD).followUpSchedule).toMatchObject({ attemptNumber: 2, generation: 1, dueAtMs: NOW + 48 * 3600000 })
    })
    it('does not replace a fresh inbound schedule with the old delivered reminder schedule', async () => {
        await prepareFollowUpDelivery(input())
        await claimInboundEvent({ occurredAt: new Date(NOW).toISOString(), eventId: 'customer-replied', phone: PHONE })
        await recordDeliveryEvent({ eventId: 'late-delivered', outboundId, channel: 'whatsapp_graph', status: 'delivered', providerMessageId: 'synthetic-provider', occurredAt: new Date(NOW).toISOString() })
        expect(store.get(LEAD)).toMatchObject({ conversationRevision: 2, followUpSchedule: null, followUpAt: null })
    })
})


describe('transactional media failure alternative', () => {
    const failedPartId = 'synthetic-failed-image'
    const input = { phone: PHONE, eventId: 'synthetic-event', failedPartId, text: 'The example could not be sent. Here is the approved alternative.' }
    beforeEach(() => {
        store.set(eventKey, { status: 'completed', responseHumanGeneration: 0, outcome: { sendText: 'Original reply' } })
        store.set(`sales_delivery_events/${failedPartId}`, { status: 'failed', leadId: '41', part: 'image', channel: 'whatsapp_graph', logicalAttemptId: createOutboundId({ scope: 'inbound', subject: 'synthetic-event', attempt: 0, part: 'reply' }) })
    })
    it('registers one text part and never credits the failed image or repeats the fallback', async () => {
        const result = await prepareInboundMediaFallback(input)
        expect(result).toMatchObject({ action: 'requested', part: { kind: 'text', text: input.text } })
        expect(store.get(`sales_delivery_events/${result.outboundId}`)).toMatchObject({ status: 'requested', part: 'text', demoEvidence: false, advanceOnDelivery: false, mediaFallbackFor: failedPartId })
        expect(await prepareInboundMediaFallback(input)).toMatchObject({ action: 'existing', part: null })
        expect(store.get(`sales_delivery_events/${failedPartId}`).status).toBe('failed')
        expect(store.get(LEAD).mediaSent).toBeUndefined()
    })
    it('requires confirmed persisted failure, not unknown provider acceptance', async () => {
        store.set(`sales_delivery_events/${failedPartId}`, { ...store.get(`sales_delivery_events/${failedPartId}`), status: 'requested' })
        expect(await prepareInboundMediaFallback(input)).toMatchObject({ action: 'blocked', reason: 'media-failure-not-confirmed', part: null })
    })
    it('suppresses fallback if a human takes over after the original response', async () => {
        await requestHumanHandoff({ phone: PHONE })
        expect(await prepareInboundMediaFallback(input)).toMatchObject({ action: 'blocked', reason: 'conversation-changed', part: null })
    })
    it('does not return a sendable fallback when its registration fails', async () => {
        store.fail()
        await expect(prepareInboundMediaFallback(input)).rejects.toThrow('synthetic commit failure')
        expect(store.entries().filter(([, value]) => value.mediaFallbackFor)).toHaveLength(0)
    })
})


describe('verified purchase closes pending sales without releasing a human', () => {
    const purchase = { phone: PHONE, orderId: 'synthetic-order', amount: 990, packageId: 'printed' }
    it('clears both reminder and pending transport state, then attaches only the actually-created book', async () => {
        const { taskId } = await requestHumanHandoff({ phone: PHONE })
        store.set(LEAD, { ...store.get(LEAD), followUpSchedule: { old: true }, followUpAt: '2026-10-05', deliveryRequestOutboundId: 'old-request', deliveryRequestAttemptId: 'old-attempt', deliveryRequestUntilMs: NOW + 30000, deliveryPendingOutboundId: 'old-pending', deliveryPendingAttemptId: 'old-pending-attempt', deliveryPendingUntilMs: NOW + 60000, pendingDeliveryMessages: { old: 'old sales text' } })
        await closeLeadOnPurchase({ ...purchase, weddingId: null })
        expect(store.get(LEAD)).toMatchObject({ paymentVerified: true, stage: 'closed_won', followUpSchedule: null, followUpAt: null, deliveryRequestOutboundId: null, deliveryRequestAttemptId: null, deliveryRequestUntilMs: null, deliveryPendingOutboundId: null, deliveryPendingAttemptId: null, deliveryPendingUntilMs: null, pendingDeliveryMessages: {}, human: true, humanTaskId: taskId, humanTaskStatus: 'requested' })
        expect(store.get(LEAD).weddingId).toBeUndefined()
        const firstVerifiedAt = store.get(LEAD).paymentVerifiedAt
        await closeLeadOnPurchase({ ...purchase, weddingId: 'synthetic-created-book' })
        await closeLeadOnPurchase({ ...purchase, weddingId: 'synthetic-created-book' })
        expect(store.get(LEAD)).toMatchObject({ weddingId: 'synthetic-created-book', paymentVerifiedAt: firstVerifiedAt, humanTaskId: taskId, human: true })
        expect(store.entries().filter(([key]) => key.startsWith('sales_verified_orders/'))).toHaveLength(1)
        expect(store.get(`sales_human_tasks/${taskId}`).status).toBe('requested')
    })
    it('rejects sales computed while a payment concurrently becomes verified', async () => {
        vi.stubEnv('SALES_CONVERSATIONAL_POLICY_ENABLED', 'true')
        const claim = await claimInboundEvent({ occurredAt: new Date(NOW).toISOString(), eventId: 'payment-race', phone: PHONE, incomingText: 'buy' })
        await closeLeadOnPurchase({ ...purchase, weddingId: null })
        const result = await completeSuccessfulExchange(complete({ eventId: 'payment-race', claimToken: claim.claimToken, claimGeneration: claim.claimGeneration, exchange: exchange({ parsed: { messages: ['Old offer'], stage: 'offer_sent' }, conversationContract: contract() }), outcome: { sendText: 'Old offer' } }))
        expect(result.action).toBe('payment-changed')
    })
    it('revokes a sales response already prepared before verified payment', async () => {
        store.set(eventKey, { status: 'completed', responsePaymentVerified: false, outcome: { sendText: 'Old sales offer' } })
        await closeLeadOnPurchase({ ...purchase, weddingId: null })
        expect(await validateInboundBeforeSend({ phone: PHONE, eventId: 'synthetic-event' })).toEqual({ ok: false, reason: 'payment-state-changed' })
        store.set(eventKey, { status: 'completed', responsePaymentVerified: true, outcome: { sendText: 'Verified payment service reply' } })
        expect(await validateInboundBeforeSend({ phone: PHONE, eventId: 'synthetic-event' })).toEqual({ ok: true, reason: null })
    })
})


describe('invalid-time STOP still revokes marketing', () => {
    const stop = async (eventId = 'stale-stop') => {
        const claim = await claimInboundEvent({ eventId, phone: PHONE, outgoing: true, occurredAt: 'unknown', incomingText: 'stop' })
        return suppressMarketingFromInbound({ phone: PHONE, eventId, claimToken: claim.claimToken })
    }
    beforeEach(() => {
        vi.stubEnv('SALES_CONVERSATIONAL_POLICY_ENABLED', 'true')
        store.set(LEAD, { conversationRevision: 4, lastInboundAtMs: NOW - 25 * 3600000, lastInboundAt: NOW - 25 * 3600000, lastInboundReceivedAtMs: NOW - 24 * 3600000, stage: 'closed_won', paymentVerified: true, weddingId: 'created-fixture', human: true, humanTaskId: 'fixture-task', humanTaskStatus: 'acknowledged', followUpAt: '2026-10-05', followUpSchedule: { old: true }, deliveryRequestOutboundId: 'pending', deliveryRequestAttemptId: 'pending-attempt', deliveryRequestUntilMs: NOW + 10000, pendingDeliveryMessages: { pending: 'old sale' } })
    })
    it('cancels reminders and pending work without extending the service window or releasing human/payment state', async () => {
        const beforeTime = store.get(LEAD).lastInboundAtMs
        expect(await stop()).toMatchObject({ action: 'completed', marketingSuppressed: true, outcome: { noReply: true, sendText: '', skipped: 'marketing-suppressed-no-ack' } })
        expect(store.get(LEAD)).toMatchObject({ marketingSuppressed: true, conversationRevision: 5, lastInboundAtMs: beforeTime, lastInboundAt: beforeTime, followUpAt: null, followUpSchedule: null, deliveryRequestOutboundId: null, deliveryRequestUntilMs: null, pendingDeliveryMessages: {}, paymentVerified: true, weddingId: 'created-fixture', stage: 'closed_won', human: true, humanTaskId: 'fixture-task', humanTaskStatus: 'acknowledged', followUpConsent: { status: 'revoked' } })
        expect(store.get(LEAD).lastInboundReceivedAtMs).toBe(NOW - 24 * 3600000)
        expect((await validateInboundBeforeSend({ phone: PHONE, eventId: 'stale-stop' })).ok).toBe(false)
    })
    it('invalidates a previously committed reply using revision without touching customer time', async () => {
        store.set(LEAD, { conversationRevision: 4, lastInboundAtMs: NOW - 60000, lastInboundAt: NOW - 60000 })
        store.set('sales_inbound_events/old-prepared', { status: 'completed', conversationRevision: 4, outcome: { sendText: 'Prepared reply' }, responseHumanGeneration: 0 })
        expect((await validateInboundBeforeSend({ phone: PHONE, eventId: 'old-prepared' })).ok).toBe(true)
        await stop()
        expect(await validateInboundBeforeSend({ phone: PHONE, eventId: 'old-prepared' })).toEqual({ ok: false, reason: 'superseded-inbound' })
        expect(store.get(LEAD).lastInboundAtMs).toBe(NOW - 60000)
    })
    it('is idempotent and never permits an old claim token to suppress an unrelated active event', async () => {
        await stop()
        expect(await suppressMarketingFromInbound({ phone: PHONE, eventId: 'stale-stop', claimToken: 'old-token' })).toMatchObject({ action: 'cached', marketingSuppressed: true })
        expect(store.get(LEAD).conversationRevision).toBe(5)
        const fresh = await claimInboundEvent({ phone: PHONE, eventId: 'fresh-owned', outgoing: true })
        expect(fresh.action).toBe('process')
        expect(await suppressMarketingFromInbound({ phone: PHONE, eventId: 'fresh-owned', claimToken: 'wrong-token' })).toEqual({ action: 'busy' })
        expect(store.get(LEAD).conversationRevision).toBe(5)
    })
    it('cannot apply an owned STOP event to a different contact', async () => {
        const claim = await claimInboundEvent({ phone: PHONE, eventId: 'stop-target', outgoing: true })
        expect(await suppressMarketingFromInbound({ phone: 'fixture-42', eventId: 'stop-target', claimToken: claim.claimToken })).toEqual({ action: 'rejected', noReply: true, reason: 'inbound-phone-mismatch' })
        expect(store.get('sales_leads/42')).toBeUndefined()
    })
    it('does not claim suppression if the atomic write fails', async () => {
        const claim = await claimInboundEvent({ phone: PHONE, eventId: 'failed-stop', outgoing: true })
        store.fail()
        await expect(suppressMarketingFromInbound({ phone: PHONE, eventId: 'failed-stop', claimToken: claim.claimToken })).rejects.toThrow('synthetic commit failure')
        expect(store.get(LEAD).marketingSuppressed).toBeUndefined()
        expect(store.get('sales_inbound_events/failed-stop').status).toBe('processing')
    })
})


describe('first-contact reservation is not an initialized conversation', () => {
    const customerPhone = '972500000941'
    beforeEach(() => vi.stubEnv('SALES_CONVERSATIONAL_POLICY_ENABLED', 'true'))
    it('real claim -> getLead still checks existing ownership; completed service exchange initializes createdAt once', async () => {
        const providerAt = NOW - 60000
        const claim = await claimInboundEvent({ phone: customerPhone, eventId: 'first-contact', occurredAt: new Date(providerAt).toISOString(), incomingText: 'כמה עולה?' })
        const lead = await getLead(customerPhone)
        expect(lead).toMatchObject({ isNew: true, conversationInitialized: false, stage: 'new', firstContactAtMs: providerAt })
        expect(shouldLookupCustomerByPhone({ lead, incomingText: 'כמה עולה?' })).toBe(true)
        store.lookup({ empty: false, docs: [{ id: 'synthetic-existing-book', data: () => ({ ownerName: 'Fixture owner' }) }] })
        const customer = await findCustomerByPhone(customerPhone, { strict: true })
        expect(customer.weddingId).toBe('synthetic-existing-book')
        await completeSuccessfulExchange(complete({ eventId: 'first-contact', claimToken: claim.claimToken, claimGeneration: claim.claimGeneration, exchange: exchange({ phone: customerPhone, isNew: false, conversationContract: contract() }) }))
        // Historical-context enrichment may set isNew false on the in-memory
        // lead; the durable first-contact marker still owns its creation time.
        expect(await getLead(customerPhone)).toMatchObject({ isNew: false, conversationInitialized: true, createdAt: providerAt })
        const storedAt = store.get(`sales_leads/${customerPhone}`).createdAt
        await claimInboundEvent({ phone: customerPhone, eventId: 'second-contact', occurredAt: new Date(NOW).toISOString() })
        expect(await getLead(customerPhone)).toMatchObject({ isNew: false, createdAt: storedAt })
    })
    it('queued user text from superseding claims does not bypass initial history/owner checks', async () => {
        await claimInboundEvent({ phone: customerPhone, eventId: 'queued-first', occurredAt: new Date(NOW).toISOString(), incomingText: 'first' })
        await claimInboundEvent({ phone: customerPhone, eventId: 'queued-second', occurredAt: new Date(NOW).toISOString(), incomingText: 'second' })
        const lead = await getLead(customerPhone)
        expect(lead.turns).toHaveLength(2)
        expect(lead.isNew).toBe(true)
        expect(shouldLookupCustomerByPhone({ lead, incomingText: 'hello' })).toBe(true)
    })
    it('keeps real pre-existing legacy conversations initialized even without createdAt', async () => {
        store.set(`sales_leads/${customerPhone}`, { stage: 'engaged', turns: [{ role: 'assistant', text: 'Earlier response' }] })
        await claimInboundEvent({ phone: customerPhone, eventId: 'legacy-existing', occurredAt: new Date(NOW).toISOString() })
        expect((await getLead(customerPhone)).isNew).toBe(false)
    })
    it('distinguishes failed strict ownership lookup from a successful empty result and preserves legacy fallback', async () => {
        expect(await findCustomerByPhone(customerPhone, { strict: true })).toBeNull()
        store.failLookup()
        await expect(findCustomerByPhone(customerPhone, { strict: true })).rejects.toMatchObject({ code: 'CUSTOMER_LOOKUP_UNAVAILABLE' })
        expect(await findCustomerByPhone(customerPhone)).toBeNull()
    })
})


describe('safety intent survives a newer superseding inbound', () => {
    beforeEach(() => vi.stubEnv('SALES_CONVERSATIONAL_POLICY_ENABLED', 'true'))
    it('STOP A revokes consent before B supersedes A and cannot recreate a sales reminder', async () => {
        store.set(LEAD, { stage: 'offer_sent', conversationRevision: 0, followUpConsent: { status: 'granted', scope: 'sales_reminders', source: 'customer_message', sourceMessageId: 'old-grant', recordedAtMs: NOW - 3600000, maxReminders: 2, usedReminders: 0 }, followUpSchedule: { old: true }, deliveryRequestOutboundId: 'old-request', pendingDeliveryMessages: { old: 'sale' } })
        const a = await claimInboundEvent({ phone: PHONE, eventId: 'stop-a', incomingText: 'תפסיקו לשלוח', occurredAt: new Date(NOW).toISOString() })
        expect(store.get(LEAD)).toMatchObject({ marketingSuppressed: true, followUpConsent: { status: 'revoked' }, followUpSchedule: null, deliveryRequestOutboundId: null, pendingDeliveryMessages: {} })
        const b = await claimInboundEvent({ phone: PHONE, eventId: 'normal-b', incomingText: 'תודה', occurredAt: new Date(NOW).toISOString() })
        expect((await completeSuccessfulExchange(complete({ eventId: 'stop-a', claimToken: a.claimToken, claimGeneration: a.claimGeneration, exchange: exchange({ parsed: { stage: 'closed_lost', messages: ['Stopped'] }, conversationContract: contract({ marketingSuppressed: true }) }), outcome: { sendText: 'Stopped' } }))).action).toBe('stale')
        const lead = await getLead(PHONE)
        expect(strictFollowUpStopReason(lead)).toBe('marketing-suppressed')
        const turn = await buildConversationalTurn({ lead, incomingText: 'תודה', eventId: 'normal-b', revision: b.conversationRevision, decision: { intent: 'general' }, catalogResult: { ok: false }, nowMs: NOW })
        expect(turn.contract.followUpSchedule).toBeNull()
        await completeSuccessfulExchange(complete({ eventId: 'normal-b', claimToken: b.claimToken, claimGeneration: b.claimGeneration, exchange: exchange({ parsed: turn.parsed, conversationContract: turn.contract, incomingText: 'תודה' }), outcome: { sendText: turn.parsed.messages.join('\n'), handoff: turn.parsed.handoff } }))
        expect(store.get(LEAD)).toMatchObject({ marketingSuppressed: true, followUpConsent: { status: 'revoked' }, followUpSchedule: null })
    })
    it('human-request A survives B and becomes a durable task before any transfer success', async () => {
        const a = await claimInboundEvent({ phone: PHONE, eventId: 'human-a', incomingText: 'רוצה נציג', occurredAt: new Date(NOW).toISOString() })
        expect(store.get(LEAD)).toMatchObject({ handoffPending: true, followUpAt: null })
        expect(store.get(LEAD).humanTaskId).toBeUndefined()
        const b = await claimInboundEvent({ phone: PHONE, eventId: 'human-b', incomingText: 'תודה', occurredAt: new Date(NOW).toISOString() })
        expect((await completeSuccessfulExchange(complete({ eventId: 'human-a', claimToken: a.claimToken, claimGeneration: a.claimGeneration, exchange: exchange({ conversationContract: contract() }) }))).action).toBe('stale')
        const lead = await getLead(PHONE)
        const turn = await buildConversationalTurn({ lead, incomingText: 'תודה', eventId: 'human-b', revision: b.conversationRevision, decision: { intent: 'general' }, catalogResult: { ok: false }, nowMs: NOW })
        expect(turn.parsed.handoff).toBe(true)
        const result = await completeSuccessfulExchange(complete({ eventId: 'human-b', claimToken: b.claimToken, claimGeneration: b.claimGeneration, exchange: exchange({ parsed: turn.parsed, conversationContract: turn.contract, incomingText: 'תודה' }), outcome: { sendText: turn.parsed.messages.join('\n'), handoff: true } }))
        expect(result.humanHandoff).toMatchObject({ ok: true, status: 'requested' })
        expect(store.get(LEAD)).toMatchObject({ handoffPending: false, human: true, humanTaskStatus: 'requested' })
        expect(store.get(`sales_human_tasks/${result.humanHandoff.taskId}`).summary.objection).toBe('רוצה נציג')
    })
})
