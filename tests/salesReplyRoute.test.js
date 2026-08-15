import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INBOUND_HEARTBEAT_BUDGET_MS } from '@/lib/salesAgent/circuitBreaker'

const mocks = vi.hoisted(() => ({
    buildSystemPrompt: vi.fn(),
    addDaysISO: vi.fn(() => '2026-08-17'),
    callClaude: vi.fn(),
    parseAgentJson: vi.fn(),
    normalizePhone: vi.fn(value => String(value || '')),
    resolveFollowUp: vi.fn(),
    getLead: vi.fn(),
    saveExchange: vi.fn(),
    toApiMessages: vi.fn(),
    isPausedForHuman: vi.fn(),
    isOwnEcho: vi.fn(),
    parseOwnerCommand: vi.fn(),
    setHuman: vi.fn(),
    findCustomerByPhone: vi.fn(),
    listLeads: vi.fn(),
    recordSpend: vi.fn(),
    listMedia: vi.fn(),
    recordMediaSent: vi.fn(),
    creditPendingMedia: vi.fn(),
    claimInboundEvent: vi.fn(),
    completeInboundEvent: vi.fn(),
    completeProviderFallback: vi.fn(),
    completeSuccessfulExchange: vi.fn(),
    releaseProviderProbe: vi.fn(),
    compactLeadBestEffort: vi.fn(),
    acquireProviderCircuit: vi.fn(),
    recordProviderFailure: vi.fn(),
    recordProviderSuccess: vi.fn(),
    recordInboundHeartbeat: vi.fn(),
    costOfClaudeUsage: vi.fn(),
    resolveSource: vi.fn(),
    mergeMedia: vi.fn(),
    performanceNote: vi.fn(),
    priceDodged: vi.fn(),
    priceFallbackMessage: vi.fn(),
    mediaGuard: vi.fn(),
    assignVariant: vi.fn(),
    summarizeExperiments: vi.fn(),
    summarizeGaps: vi.fn(),
    deriveLead: vi.fn(),
    sortLeads: vi.fn(),
    isoInIsrael: vi.fn(),
    buildDigest: vi.fn(),
}))

vi.mock('@/lib/salesAgent/prompt', () => ({ buildSystemPrompt: mocks.buildSystemPrompt, addDaysISO: mocks.addDaysISO }))
vi.mock('@/lib/salesAgent/agent', () => ({
    callClaude: mocks.callClaude,
    parseAgentJson: mocks.parseAgentJson,
    normalizePhone: mocks.normalizePhone,
    resolveFollowUp: mocks.resolveFollowUp,
}))
vi.mock('@/lib/salesAgent/leads', () => ({
    getLead: mocks.getLead, saveExchange: mocks.saveExchange, toApiMessages: mocks.toApiMessages,
    isPausedForHuman: mocks.isPausedForHuman, isOwnEcho: mocks.isOwnEcho,
    parseOwnerCommand: mocks.parseOwnerCommand, setHuman: mocks.setHuman,
    findCustomerByPhone: mocks.findCustomerByPhone, listLeads: mocks.listLeads,
    recordSpend: mocks.recordSpend, listMedia: mocks.listMedia,
    recordMediaSent: mocks.recordMediaSent, creditPendingMedia: mocks.creditPendingMedia,
    claimInboundEvent: mocks.claimInboundEvent, completeInboundEvent: mocks.completeInboundEvent,
    completeProviderFallback: mocks.completeProviderFallback,
    completeSuccessfulExchange: mocks.completeSuccessfulExchange,
    releaseProviderProbe: mocks.releaseProviderProbe, compactLeadBestEffort: mocks.compactLeadBestEffort,
    acquireProviderCircuit: mocks.acquireProviderCircuit,
    recordProviderFailure: mocks.recordProviderFailure, recordProviderSuccess: mocks.recordProviderSuccess,
    recordInboundHeartbeat: mocks.recordInboundHeartbeat,
}))
vi.mock('@/lib/salesAgent/pricing', () => ({ costOfClaudeUsage: mocks.costOfClaudeUsage }))
vi.mock('@/lib/salesAgent/attribution', () => ({ resolveSource: mocks.resolveSource }))
vi.mock('@/lib/salesAgent/catalog', () => ({ BUSINESS: { brand: 'Test Brand', ownerName: 'הצוות' }, MEDIA: {} }))
vi.mock('@/lib/salesAgent/mediaLibrary', () => ({ mergeMedia: mocks.mergeMedia, performanceNote: mocks.performanceNote }))
vi.mock('@/lib/salesAgent/selling', () => ({ priceDodged: mocks.priceDodged, priceFallbackMessage: mocks.priceFallbackMessage }))
vi.mock('@/lib/salesAgent/mediaGuard', () => ({ mediaGuard: mocks.mediaGuard }))
vi.mock('@/lib/salesAgent/experiments', () => ({ assignVariant: mocks.assignVariant, summarizeExperiments: mocks.summarizeExperiments, summarizeGaps: mocks.summarizeGaps }))
vi.mock('@/lib/salesAgent/leadsView', () => ({ deriveLead: mocks.deriveLead, sortLeads: mocks.sortLeads, isoInIsrael: mocks.isoInIsrael }))
vi.mock('@/lib/salesAgent/digest', () => ({ buildDigest: mocks.buildDigest }))

const lead = { isNew: false, stage: 'engaged', turns: [], followUpCount: 0, imagesSent: [], mediaSent: [] }
const inbound = overrides => ({ eventId: 'event-token', phone: 'test-phone-token', text: '', messageType: 'text', ...overrides })

let POST

function expectNoProviderWork() {
    expect(mocks.acquireProviderCircuit).not.toHaveBeenCalled()
    expect(mocks.recordProviderFailure).not.toHaveBeenCalled()
    expect(mocks.recordProviderSuccess).not.toHaveBeenCalled()
}

async function post(body) {
    const response = await POST(new Request('http://localhost/api/sales-agent/reply', {
        method: 'POST',
        headers: { 'x-wt-secret': 'route-test-secret', 'content-type': 'application/json' },
        body: JSON.stringify(body),
    }))
    return { status: response.status, body: await response.json() }
}

async function postRaw(raw) {
    const response = await POST(new Request('http://localhost/api/sales-agent/reply', {
        method: 'POST',
        headers: { 'x-wt-secret': 'route-test-secret', 'content-type': 'application/json' },
        body: raw,
    }))
    return { status: response.status, body: await response.json() }
}

beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.SALES_AGENT_SECRET = 'route-test-secret'
    process.env.SALES_AGENT_OWNER_PHONE = 'owner-token'
    mocks.claimInboundEvent.mockResolvedValue({ action: 'process', claimToken: 'claim-token', claimGeneration: 1 })
    mocks.completeInboundEvent.mockResolvedValue({ action: 'completed' })
    mocks.completeProviderFallback.mockResolvedValue({ action: 'completed' })
    mocks.completeSuccessfulExchange.mockResolvedValue({ action: 'completed' })
    mocks.releaseProviderProbe.mockResolvedValue({ action: 'released' })
    mocks.acquireProviderCircuit.mockResolvedValue({ allow: true, mode: 'closed' })
    mocks.recordProviderFailure.mockResolvedValue(undefined)
    mocks.recordProviderSuccess.mockResolvedValue(undefined)
    mocks.recordInboundHeartbeat.mockResolvedValue(undefined)
    mocks.getLead.mockResolvedValue(lead)
    mocks.setHuman.mockResolvedValue(undefined)
    mocks.findCustomerByPhone.mockResolvedValue(null)
    mocks.isPausedForHuman.mockReturnValue(false)
    mocks.isOwnEcho.mockReturnValue(false)
    mocks.parseOwnerCommand.mockReturnValue(null)
    ;({ POST } = await import('@/app/api/sales-agent/reply/route'))
})

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

describe('inbound event duplicate fencing', () => {
    it('records one privacy-safe inbound heartbeat on the existing authenticated request path', async () => {
        mocks.claimInboundEvent.mockResolvedValue({ action: 'cached', outcome: { sendText: '', handoff: false } })

        const result = await post(inbound({ text: 'heartbeat fixture text that must not be stored' }))

        expect(result.status).toBe(200)
        expect(mocks.recordInboundHeartbeat).toHaveBeenCalledTimes(1)
        expect(mocks.recordInboundHeartbeat).toHaveBeenCalledWith({ receivedAtMs: expect.any(Number) })
        expect(JSON.stringify(mocks.recordInboundHeartbeat.mock.calls)).not.toContain('heartbeat fixture text')
    })

    it('bounds a stalled heartbeat and still returns a duplicate without model or send work', async () => {
        vi.useFakeTimers()
        mocks.recordInboundHeartbeat.mockReturnValue(new Promise(() => {}))
        mocks.claimInboundEvent.mockResolvedValue({ action: 'cached', outcome: { sendText: '', handoff: false } })
        const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
        let settled = false

        const pending = post(inbound({ text: 'stalled heartbeat private fixture' })).then(result => {
            settled = true
            return result
        })
        await vi.advanceTimersByTimeAsync(INBOUND_HEARTBEAT_BUDGET_MS - 1)

        expect(settled).toBe(false)
        expect(mocks.claimInboundEvent).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1)

        await expect(pending).resolves.toEqual({
            status: 200,
            body: {
                ok: true, duplicate: true, shouldSend: false,
                cachedOutcome: { sendText: '', handoff: false },
                sendText: '', hasImage: false, hasVideo: false, handoff: false,
            },
        })
        expect(mocks.claimInboundEvent).toHaveBeenCalledTimes(1)
        expect(mocks.completeInboundEvent).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expectNoProviderWork()
        expect(warned).toHaveBeenCalledWith('[sales-agent] inbound heartbeat timed out')
        expect(JSON.stringify(warned.mock.calls)).not.toContain('private fixture')
    })

    it('returns a completed duplicate as a no-send envelope without calling Claude', async () => {
        mocks.claimInboundEvent.mockResolvedValue({ action: 'cached', outcome: { sendText: '', handoff: false, noReply: true, skipped: 'own-echo' } })

        const result = await post(inbound({ text: 'שלום' }))

        expect(result).toEqual({
            status: 200,
            body: {
                ok: true, duplicate: true, shouldSend: false,
                cachedOutcome: { sendText: '', handoff: false, noReply: true, skipped: 'own-echo' },
                sendText: '', hasImage: false, hasVideo: false, handoff: false,
            },
        })
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expect(mocks.recordMediaSent).not.toHaveBeenCalled()
        expect(mocks.compactLeadBestEffort).not.toHaveBeenCalled()
        expectNoProviderWork()
    })

    it('returns an in-flight duplicate as a no-send envelope without calling Claude', async () => {
        mocks.claimInboundEvent.mockResolvedValue({ action: 'busy' })

        const result = await post(inbound({ text: 'שלום' }))

        expect(result).toEqual({ status: 202, body: { ok: true, duplicate: true, processing: true, shouldSend: false } })
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expectNoProviderWork()
    })

    it('keeps a duplicate safe fallback cached but never sends it again', async () => {
        const safeFallback = 'קיבלתי את ההודעה שלך. מישהו מהצוות יחזור אליך בהקדם.'
        mocks.claimInboundEvent.mockResolvedValue({ action: 'cached', outcome: { sendText: safeFallback, handoff: true } })

        const result = await post(inbound({ text: 'שלום' }))

        expect(result.body).toMatchObject({ duplicate: true, shouldSend: false, sendText: '', handoff: false })
        expect(result.body.cachedOutcome).toEqual({ sendText: safeFallback, handoff: true })
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expectNoProviderWork()
    })
})

describe('Anthropic outage handling', () => {
    const safeFallback = 'קיבלתי את ההודעה שלך. מישהו מהצוות יחזור אליך בהקדם.'

    function prepareModelPath() {
        mocks.listMedia.mockResolvedValue([])
        mocks.mergeMedia.mockReturnValue({})
        mocks.performanceNote.mockReturnValue(null)
        mocks.creditPendingMedia.mockResolvedValue(undefined)
        mocks.buildSystemPrompt.mockReturnValue('system')
        mocks.toApiMessages.mockReturnValue([])
        mocks.priceDodged.mockReturnValue(false)
        mocks.mediaGuard.mockReturnValue(null)
        mocks.saveExchange.mockResolvedValue(undefined)
    }

    it('completes a simulated fourth, open-breaker claim with a safe fallback and makes no model call', async () => {
        prepareModelPath()
        mocks.acquireProviderCircuit.mockResolvedValue({ allow: false, mode: 'open' })

        const result = await post(inbound({ text: 'צריך מחיר' }))

        expect(result.body).toMatchObject({ sendText: safeFallback, handoff: true })
        expect(mocks.completeProviderFallback).toHaveBeenCalledWith(expect.objectContaining({
            eventId: 'event-token', claimToken: 'claim-token', claimGeneration: 1,
            phone: 'test-phone-token', reason: 'תקלה בשירות ה-AI',
            recoveryFollowUpAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            outcome: expect.objectContaining({ sendText: safeFallback, handoff: true, stage: 'handoff' }),
        }))
        expect(result.body.notifyOwner).toContain('תקלה בשירות ה-AI')
        expect(mocks.callClaude).not.toHaveBeenCalled()
    })

    it('uses the POST-entry deadline before breaker acquire when preparation consumes the model budget', async () => {
        prepareModelPath()
        let ticks = 0
        vi.spyOn(Date, 'now').mockImplementation(() => ticks++ === 0 ? 0 : 21_000)

        const result = await post(inbound({ text: 'צריך מחיר' }))

        expect(result.body).toMatchObject({ sendText: safeFallback, handoff: true })
        expect(mocks.acquireProviderCircuit).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
    })

    it.each([
        [Object.assign(new Error('timed out'), { name: 'AbortError' }), 'timeout'],
        [new Error('anthropic 429: busy'), 'rate_limit'],
        [new Error('anthropic 400: credit_balance exhausted'), 'low_credit'],
    ])('records a normalized %s provider failure before safely handing off', async (error, code) => {
        prepareModelPath()
        mocks.callClaude.mockRejectedValue(error)
        vi.spyOn(console, 'error').mockImplementation(() => {})

        const result = await post(inbound({ text: 'צריך מחיר' }))

        expect(result.body).toMatchObject({ sendText: safeFallback, handoff: true })
        expect(mocks.recordProviderFailure).toHaveBeenCalledWith(code, null, expect.any(Number))
        expect(console.error).toHaveBeenCalledWith('[sales-agent] model provider failure', code)
        expect(mocks.completeProviderFallback).toHaveBeenCalledWith(expect.objectContaining({ outcome: expect.objectContaining({ sendText: safeFallback, handoff: true }) }))
    })

    it('counts two malformed model responses as one invalid-json failure and safely hands off', async () => {
        prepareModelPath()
        mocks.callClaude.mockResolvedValue({ text: 'not json', usage: null, model: 'test' })
        mocks.parseAgentJson.mockReturnValue({ malformed: true, messages: [], handoff: true })
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})

        const result = await post(inbound({ text: 'צריך מחיר' }))

        expect(result.body).toMatchObject({ sendText: safeFallback, handoff: true })
        expect(mocks.callClaude).toHaveBeenCalledTimes(2)
        const [firstCall, secondCall] = mocks.callClaude.mock.calls
        expect(firstCall[0].deadlineAtMs).toBe(secondCall[0].deadlineAtMs)
        expect(firstCall[0].deadlineAtMs - Date.now()).toBeLessThanOrEqual(20_000)
        expect(mocks.recordProviderFailure).toHaveBeenCalledWith('invalid_json', null, expect.any(Number))
    })

    it('counts a malformed first response when repair expires before fetch and never releases its probe', async () => {
        prepareModelPath()
        const prefetchDeadline = Object.assign(new Error('provider deadline exhausted'), { providerStarted: false })
        mocks.callClaude
            .mockResolvedValueOnce({ text: 'not json', usage: null, model: 'test' })
            .mockRejectedValueOnce(prefetchDeadline)
        mocks.parseAgentJson.mockReturnValue({ malformed: true, messages: [], handoff: true })
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})

        const first = await post(inbound({ text: 'צריך מחיר' }))

        expect(first.body).toMatchObject({ sendText: safeFallback, handoff: true })
        expect(mocks.recordProviderFailure).toHaveBeenCalledTimes(1)
        expect(mocks.recordProviderFailure).toHaveBeenCalledWith('invalid_json', null, expect.any(Number))
        expect(mocks.releaseProviderProbe).not.toHaveBeenCalled()
        expect(mocks.completeProviderFallback).toHaveBeenCalledTimes(1)

        mocks.claimInboundEvent.mockResolvedValueOnce({ action: 'cached', outcome: { sendText: safeFallback, handoff: true } })
        const duplicate = await post(inbound({ text: 'צריך מחיר' }))
        expect(duplicate.body).toMatchObject({ duplicate: true, shouldSend: false, sendText: '', handoff: false })
        expect(mocks.callClaude).toHaveBeenCalledTimes(2)
        expect(mocks.completeProviderFallback).toHaveBeenCalledTimes(1)
    })

    it('counts an unknown-model sequence whose recursive fallback expires before fetch', async () => {
        prepareModelPath()
        const recursiveDeadline = Object.assign(new Error('anthropic timeout: provider deadline exhausted'), { providerStarted: true })
        mocks.callClaude.mockRejectedValue(recursiveDeadline)
        vi.spyOn(console, 'error').mockImplementation(() => {})

        const first = await post(inbound({ text: 'צריך מחיר' }))

        expect(first.body).toMatchObject({ sendText: safeFallback, handoff: true })
        expect(mocks.recordProviderFailure).toHaveBeenCalledTimes(1)
        expect(mocks.recordProviderFailure).toHaveBeenCalledWith('timeout', null, expect.any(Number))
        expect(mocks.releaseProviderProbe).not.toHaveBeenCalled()
        expect(mocks.completeProviderFallback).toHaveBeenCalledTimes(1)

        mocks.claimInboundEvent.mockResolvedValueOnce({ action: 'cached', outcome: { sendText: safeFallback, handoff: true } })
        const duplicate = await post(inbound({ text: 'צריך מחיר' }))
        expect(duplicate.body).toMatchObject({ duplicate: true, shouldSend: false, sendText: '', handoff: false })
        expect(mocks.callClaude).toHaveBeenCalledTimes(1)
        expect(mocks.completeProviderFallback).toHaveBeenCalledTimes(1)
    })

    it('releases a genuinely zero-fetch sequence without incrementing provider failures', async () => {
        prepareModelPath()
        const prefetchDeadline = Object.assign(new Error('provider deadline exhausted'), { providerStarted: false })
        mocks.acquireProviderCircuit.mockResolvedValue({ allow: true, mode: 'half-open', probeId: 'probe-token' })
        mocks.callClaude.mockRejectedValue(prefetchDeadline)

        const first = await post(inbound({ text: 'צריך מחיר' }))

        expect(first.body).toMatchObject({ sendText: safeFallback, handoff: true })
        expect(mocks.releaseProviderProbe).toHaveBeenCalledTimes(1)
        expect(mocks.releaseProviderProbe).toHaveBeenCalledWith('probe-token', expect.any(Number))
        expect(mocks.recordProviderFailure).not.toHaveBeenCalled()
        expect(mocks.completeProviderFallback).toHaveBeenCalledTimes(1)

        mocks.claimInboundEvent.mockResolvedValueOnce({ action: 'cached', outcome: { sendText: safeFallback, handoff: true } })
        const duplicate = await post(inbound({ text: 'צריך מחיר' }))
        expect(duplicate.body).toMatchObject({ duplicate: true, shouldSend: false, sendText: '', handoff: false })
        expect(mocks.callClaude).toHaveBeenCalledTimes(1)
        expect(mocks.completeProviderFallback).toHaveBeenCalledTimes(1)
    })

    it('releases a half-open probe when the API key is missing before fetch, then keeps the duplicate silent', async () => {
        prepareModelPath()
        const missingKey = Object.assign(new Error('anthropic provider unavailable'), {
            providerStarted: false,
            errorCode: 'provider_error',
        })
        mocks.acquireProviderCircuit.mockResolvedValue({ allow: true, mode: 'half-open', probeId: 'missing-key-probe' })
        mocks.callClaude.mockRejectedValue(missingKey)

        const first = await post(inbound({ text: 'צריך מחיר' }))

        expect(first.body).toMatchObject({ sendText: safeFallback, stage: 'handoff', handoff: true })
        expect(mocks.releaseProviderProbe).toHaveBeenCalledTimes(1)
        expect(mocks.releaseProviderProbe).toHaveBeenCalledWith('missing-key-probe', expect.any(Number))
        expect(mocks.recordProviderFailure).not.toHaveBeenCalled()
        expect(mocks.recordProviderSuccess).not.toHaveBeenCalled()
        expect(mocks.completeProviderFallback).toHaveBeenCalledTimes(1)
        expect(mocks.completeProviderFallback).toHaveBeenCalledWith(expect.objectContaining({
            eventId: 'event-token', claimToken: 'claim-token', claimGeneration: 1,
            phone: 'test-phone-token', reason: 'תקלה בשירות ה-AI',
            outcome: expect.objectContaining({ sendText: safeFallback, stage: 'handoff', handoff: true }),
        }))

        mocks.claimInboundEvent.mockResolvedValueOnce({ action: 'cached', outcome: { sendText: safeFallback, handoff: true } })
        const duplicate = await post(inbound({ text: 'צריך מחיר' }))

        expect(duplicate.body).toMatchObject({ duplicate: true, shouldSend: false, sendText: '', handoff: false })
        expect(mocks.callClaude).toHaveBeenCalledTimes(1)
        expect(mocks.releaseProviderProbe).toHaveBeenCalledTimes(1)
        expect(mocks.completeProviderFallback).toHaveBeenCalledTimes(1)
    })

    it('resets the breaker only after a valid model result', async () => {
        prepareModelPath()
        mocks.callClaude.mockResolvedValue({ text: 'valid', usage: null, model: 'test' })
        mocks.parseAgentJson.mockReturnValue({
            malformed: false, messages: ['שלום'], stage: 'engaged', handoff: false,
            image: null, eventType: null, callbackPromised: null, followUpAt: null,
        })

        await post(inbound({ text: 'שלום' }))

        expect(mocks.recordProviderSuccess).toHaveBeenCalledTimes(1)
        expect(mocks.recordProviderFailure).not.toHaveBeenCalled()
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledTimes(1)
        expect(mocks.compactLeadBestEffort).toHaveBeenCalledWith('test-phone-token')
    })

    it('attributes fallback model spend to OpenAI instead of Anthropic', async () => {
        prepareModelPath()
        const usage = { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 20 }
        mocks.costOfClaudeUsage.mockReturnValue({ usd: 0.0001, known: true })
        mocks.recordSpend.mockResolvedValue(undefined)
        mocks.callClaude.mockResolvedValue({
            text: 'valid', usage, model: 'gpt-4.1-mini', provider: 'openai', stopReason: 'stop',
        })
        mocks.parseAgentJson.mockReturnValue({
            malformed: false, messages: ['שלום'], stage: 'engaged', handoff: false,
            image: null, eventType: null, callbackPromised: null, followUpAt: null,
        })

        await post(inbound({ text: 'שלום' }))

        expect(mocks.recordSpend).toHaveBeenCalledWith(expect.objectContaining({
            provider: 'openai', model: 'gpt-4.1-mini', usage,
        }))
    })

    it('runs media analytics and compaction only after the durable exchange completes', async () => {
        prepareModelPath()
        mocks.mergeMedia.mockReturnValue({
            'image-key': { kind: 'image', url: '/test-image.jpg', caption: 'catalog caption' },
        })
        mocks.recordMediaSent.mockResolvedValue(undefined)
        mocks.callClaude.mockResolvedValue({ text: 'valid', usage: null, model: 'test' })
        mocks.parseAgentJson.mockReturnValue({
            malformed: false, messages: ['שלום'], stage: 'engaged', handoff: false,
            image: 'image-key', eventType: null, callbackPromised: null, followUpAt: null,
        })

        const result = await post(inbound({ text: 'שלום' }))

        expect(result.body).toMatchObject({ sendImage: '/test-image.jpg', hasImage: true })
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledTimes(1)
        expect(mocks.recordMediaSent).toHaveBeenCalledWith('image-key')
        expect(mocks.compactLeadBestEffort).toHaveBeenCalledWith('test-phone-token')
        expect(mocks.completeSuccessfulExchange.mock.invocationCallOrder[0]).toBeLessThan(mocks.recordMediaSent.mock.invocationCallOrder[0])
        expect(mocks.completeSuccessfulExchange.mock.invocationCallOrder[0]).toBeLessThan(mocks.compactLeadBestEffort.mock.invocationCallOrder[0])
    })

    it.each([
        ['cached', { action: 'cached', outcome: { sendText: 'already durable', handoff: false } }, 200, ''],
        ['busy', { action: 'busy' }, 503, 'success-commit-stale'],
        ['stale', { action: 'stale' }, 503, 'success-commit-stale'],
        ['deadline', { action: 'deadline' }, 503, 'success-commit-deadline-exhausted'],
    ])('does not run media analytics or compaction for durable %s', async (_name, durable, status, error) => {
        prepareModelPath()
        mocks.mergeMedia.mockReturnValue({
            'image-key': { kind: 'image', url: '/test-image.jpg', caption: 'catalog caption' },
        })
        mocks.callClaude.mockResolvedValue({ text: 'valid', usage: null, model: 'test' })
        mocks.parseAgentJson.mockReturnValue({
            malformed: false, messages: ['שלום'], stage: 'engaged', handoff: false,
            image: 'image-key', eventType: null, callbackPromised: null, followUpAt: null,
        })
        mocks.completeSuccessfulExchange.mockResolvedValue(durable)

        const result = await post(inbound({ text: 'שלום' }))

        expect(result.status).toBe(status)
        if (error) expect(result.body.error).toBe(error)
        else expect(result.body).toMatchObject({ duplicate: true, shouldSend: false, sendText: '' })
        expect(mocks.recordMediaSent).not.toHaveBeenCalled()
        expect(mocks.compactLeadBestEffort).not.toHaveBeenCalled()
    })

    it('does not run media analytics or compaction when the durable exchange rejects', async () => {
        prepareModelPath()
        mocks.callClaude.mockResolvedValue({ text: 'valid', usage: null, model: 'test' })
        mocks.parseAgentJson.mockReturnValue({
            malformed: false, messages: ['שלום'], stage: 'engaged', handoff: false,
            image: null, eventType: null, callbackPromised: null, followUpAt: null,
        })
        mocks.completeSuccessfulExchange.mockRejectedValue(new Error('transaction rejected'))
        vi.spyOn(console, 'error').mockImplementation(() => {})

        const result = await post(inbound({ text: 'שלום' }))

        expect(result).toEqual({ status: 503, body: { error: 'success-commit-failed' } })
        expect(mocks.recordMediaSent).not.toHaveBeenCalled()
        expect(mocks.compactLeadBestEffort).not.toHaveBeenCalled()
    })

    it('does not run success bookkeeping on the provider-fallback path', async () => {
        prepareModelPath()
        mocks.callClaude.mockRejectedValue(Object.assign(new Error('anthropic timeout'), { providerStarted: true }))
        vi.spyOn(console, 'error').mockImplementation(() => {})

        const result = await post(inbound({ text: 'שלום' }))

        expect(result.body).toMatchObject({ sendText: safeFallback, handoff: true })
        expect(mocks.completeSuccessfulExchange).not.toHaveBeenCalled()
        expect(mocks.recordMediaSent).not.toHaveBeenCalled()
        expect(mocks.compactLeadBestEffort).not.toHaveBeenCalled()
    })

    it('returns an honest no-send 503 when the atomic fallback commit fails', async () => {
        prepareModelPath()
        mocks.acquireProviderCircuit.mockResolvedValue({ allow: false, mode: 'open' })
        mocks.completeProviderFallback.mockRejectedValue(new Error('persistence unavailable'))
        vi.spyOn(console, 'error').mockImplementation(() => {})

        const result = await post(inbound({ text: 'צריך מחיר' }))

        expect(result).toEqual({ status: 503, body: { error: 'provider-fallback-commit-failed' } })
        expect(mocks.setHuman).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
    })

    it('returns an honest no-send 503 for a stale fallback claim', async () => {
        prepareModelPath()
        mocks.acquireProviderCircuit.mockResolvedValue({ allow: false, mode: 'open' })
        mocks.completeProviderFallback.mockResolvedValue({ action: 'stale' })

        const result = await post(inbound({ text: 'צריך מחיר' }))

        expect(result).toEqual({ status: 503, body: { error: 'provider-fallback-stale' } })
        expect(mocks.callClaude).not.toHaveBeenCalled()
    })
})

describe('inbound failure logging', () => {
    it('logs only the parse reason, never the raw inbound payload', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})

        const result = await postRaw('raw-customer-transcript-token')

        expect(result).toEqual({ status: 400, body: { error: 'bad-json', reason: 'no-fields' } })
        expect(error).toHaveBeenCalledWith('[sales-agent] unreadable body', 'no-fields')
    })
})

describe('non-text inbound media', () => {
    for (const [requestedType, normalizedType] of [
        ['image', 'image'], ['video', 'video'], ['audio', 'audio'], ['document', 'document'], ['sticker', 'document'],
    ]) {
        it(`hands off ${requestedType} as ${normalizedType} without calling Claude`, async () => {
            const result = await post(inbound({ messageType: requestedType }))
            const reason = normalizedType === 'image' ? 'הלקוח שלח תמונה' : `הלקוח שלח ${normalizedType}`

            expect(result.body).toMatchObject({ ok: true, sendText: '', hasImage: false, hasVideo: false, stage: 'handoff', handoff: true })
            expect(mocks.setHuman).toHaveBeenCalledWith('test-phone-token', true, expect.stringContaining(reason))
            expect(mocks.completeInboundEvent).toHaveBeenCalledWith(expect.objectContaining({
                outcome: expect.objectContaining({ handoff: true, noReply: false, stage: 'handoff' }),
            }))
            expect(mocks.callClaude).not.toHaveBeenCalled()
            expectNoProviderWork()
        })
    }

    it('leaves the claim retriable when media handoff persistence fails', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        mocks.setHuman.mockRejectedValue(new Error('persistence unavailable'))

        const result = await post(inbound({ messageType: 'audio' }))

        expect(result).toEqual({ status: 503, body: { error: 'media-handoff-persist-failed' } })
        expect(mocks.completeInboundEvent).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expectNoProviderWork()
    })
})

describe('silent terminal outcomes keep their real meaning', () => {
    it('records an empty text event as noReply rather than a handoff', async () => {
        const result = await post(inbound())

        expect(result.body).toMatchObject({ ok: true, skipped: 'empty-text', handoff: false, noReply: true })
        expect(mocks.completeInboundEvent).toHaveBeenCalledWith(expect.objectContaining({
            outcome: expect.objectContaining({ handoff: false, noReply: true, skipped: 'empty-text' }),
        }))
        expectNoProviderWork()
    })

    it('records the bot own echo as noReply rather than a handoff', async () => {
        mocks.isOwnEcho.mockReturnValue(true)

        const result = await post(inbound({ text: 'bot echo', from: 'business-token', businessPhone: 'business-token', to: 'test-phone-token' }))

        expect(result.body).toMatchObject({ skipped: 'own-echo', handoff: false, noReply: true })
        expect(mocks.completeInboundEvent).toHaveBeenCalledWith(expect.objectContaining({ outcome: expect.objectContaining({ handoff: false, noReply: true }) }))
        expectNoProviderWork()
    })

    it('keeps a non-command owner message ahead of media handoff', async () => {
        const result = await post(inbound({ phone: 'owner-token', text: 'not-a-command', messageType: 'image' }))

        expect(result.body).toMatchObject({ skipped: 'owner-message', handoff: false, noReply: true })
        expect(mocks.setHuman).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expectNoProviderWork()
    })

    it('keeps an already-paused conversation ahead of media handoff', async () => {
        mocks.isPausedForHuman.mockReturnValue(true)

        const result = await post(inbound({ text: 'image caption', messageType: 'image' }))

        expect(result.body).toMatchObject({ paused: true, handoff: false, noReply: true })
        expect(mocks.setHuman).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expectNoProviderWork()
    })

    it('keeps an existing customer ahead of media handoff', async () => {
        mocks.getLead.mockResolvedValue({ ...lead, isNew: true })
        mocks.findCustomerByPhone.mockResolvedValue({ ownerName: 'לקוח קיים' })

        const result = await post(inbound({ text: 'image caption', messageType: 'image' }))

        expect(result.body).toMatchObject({ customer: true, handoff: true })
        expect(mocks.setHuman).toHaveBeenCalledWith('test-phone-token', true, 'לקוח קיים כתב')
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expectNoProviderWork()
    })
})

describe('owner takeover persistence and transport', () => {
    const ownerEcho = { text: 'owner takeover', from: 'business-token', businessPhone: 'business-token', to: 'test-phone-token' }

    it('stores the owner takeover durably but returns only a no-send response', async () => {
        const result = await post(inbound(ownerEcho))

        expect(mocks.setHuman).toHaveBeenCalledWith('test-phone-token', true, 'ענית בעצמך בשיחה')
        expect(mocks.completeInboundEvent).toHaveBeenCalledWith(expect.objectContaining({
            outcome: expect.objectContaining({ handoff: true, noReply: false }),
        }))
        expect(result).toEqual({
            status: 200,
            body: {
                ok: true, send: [], sendText: '', hasImage: false, hasVideo: false,
                shouldSend: false, handoff: false, noReply: true, paused: true, reason: 'owner-replied',
            },
        })
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expectNoProviderWork()
    })

    it('leaves an owner takeover retriable when the human pause cannot persist', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        mocks.setHuman.mockRejectedValue(new Error('persistence unavailable'))

        const result = await post(inbound(ownerEcho))

        expect(result).toEqual({ status: 503, body: { error: 'owner-takeover-persist-failed' } })
        expect(mocks.completeInboundEvent).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expectNoProviderWork()
    })
})
