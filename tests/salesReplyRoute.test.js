import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FIXTURE_NOW, syntheticCatalog, syntheticMedia } from './fixtures/salesContractFixtures'
import { INBOUND_HEARTBEAT_BUDGET_MS } from '@/lib/salesAgent/circuitBreaker'

const mocks = vi.hoisted(() => ({
    readActiveOfferCatalog: vi.fn(), readVerifiedCheckout: vi.fn(), recordConversationEvidence: vi.fn(), validateInboundBeforeSend: vi.fn(), prepareInboundMediaFallback: vi.fn(), suppressMarketingFromInbound: vi.fn(),
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
    isOwnMediaEcho: vi.fn(),
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
    resolveOrEnrollModelAssignment: vi.fn(),
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
    readSalesSettings: vi.fn(),
    decideSalesTurn: vi.fn(),
    enforceSalesReply: vi.fn(),
    buildDeterministicSalesReply: vi.fn(),
    buildOpeningPlan: vi.fn(),
    buildOpeningOnlyPlan: vi.fn(),
    prepareOpeningRuntime: vi.fn(),
    loadOpeningVariableVersions: vi.fn(),
    signOpeningVariableDownload: vi.fn(),
    readPriorConversationContext: vi.fn(),
    canSendWhatsApp: vi.fn(),
    sendInboundSequenceDirect: vi.fn(),
}))

vi.mock('@/lib/salesAgent/offerStore', () => ({ readActiveOfferCatalog: mocks.readActiveOfferCatalog }))
vi.mock('@/lib/salesAgent/checkoutQuoteStore', () => ({ readVerifiedCheckout: mocks.readVerifiedCheckout }))
vi.mock('@/lib/salesAgent/salesEvidence', () => ({ recordConversationEvidence: mocks.recordConversationEvidence }))
vi.mock('@/lib/salesAgent/prompt', () => ({ buildSystemPrompt: mocks.buildSystemPrompt, addDaysISO: mocks.addDaysISO }))
vi.mock('@/lib/salesAgent/agent', () => ({
    callClaude: mocks.callClaude,
    parseAgentJson: mocks.parseAgentJson,
    normalizePhone: mocks.normalizePhone,
    resolveFollowUp: mocks.resolveFollowUp,
}))
vi.mock('@/lib/salesAgent/leads', () => ({
    validateInboundBeforeSend: mocks.validateInboundBeforeSend, prepareInboundMediaFallback: mocks.prepareInboundMediaFallback, suppressMarketingFromInbound: mocks.suppressMarketingFromInbound,
    getLead: mocks.getLead, saveExchange: mocks.saveExchange, toApiMessages: mocks.toApiMessages,
    isPausedForHuman: mocks.isPausedForHuman, isOwnEcho: mocks.isOwnEcho, isOwnMediaEcho: mocks.isOwnMediaEcho,
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
    resolveOrEnrollModelAssignment: mocks.resolveOrEnrollModelAssignment,
}))
vi.mock('@/lib/salesAgent/pricing', () => ({ costOfClaudeUsage: mocks.costOfClaudeUsage }))
vi.mock('@/lib/salesAgent/attribution', () => ({ resolveSource: mocks.resolveSource }))
vi.mock('@/lib/salesAgent/catalog', async importOriginal => ({ ...(await importOriginal()), BUSINESS: { brand: 'Test Brand', ownerName: 'הצוות' }, MEDIA: {} }))
vi.mock('@/lib/salesAgent/mediaLibrary', async original => ({ ...(await original()), mergeMedia: mocks.mergeMedia, performanceNote: mocks.performanceNote }))
vi.mock('@/lib/salesAgent/selling', async importOriginal => ({ ...(await importOriginal()), priceDodged: mocks.priceDodged, priceFallbackMessage: mocks.priceFallbackMessage }))
vi.mock('@/lib/salesAgent/mediaGuard', async original => ({ ...(await original()), mediaGuard: mocks.mediaGuard }))
vi.mock('@/lib/salesAgent/experiments', () => ({
    ACTIVE_VARIANT_IDS: ['question_first', 'price_upfront', 'demo_first'],
    assignVariant: mocks.assignVariant,
    summarizeExperiments: mocks.summarizeExperiments,
    summarizeGaps: mocks.summarizeGaps,
}))
vi.mock('@/lib/salesAgent/leadsView', () => ({ deriveLead: mocks.deriveLead, sortLeads: mocks.sortLeads, isoInIsrael: mocks.isoInIsrael }))
vi.mock('@/lib/salesAgent/digest', () => ({ buildDigest: mocks.buildDigest }))
vi.mock('@/lib/salesAgent/settingsStore', () => ({ readSalesSettings: mocks.readSalesSettings }))
vi.mock('@/lib/salesAgent/decisionPolicy', async importOriginal => ({
    ...(await importOriginal()),
    decideSalesTurn: mocks.decideSalesTurn,
    enforceSalesReply: mocks.enforceSalesReply,
    buildDeterministicSalesReply: mocks.buildDeterministicSalesReply,
}))
vi.mock('@/lib/salesAgent/openingPlan', () => ({ buildOpeningPlan: mocks.buildOpeningPlan }))
vi.mock('@/lib/salesAgent/openingOnly', () => ({ buildOpeningOnlyPlan: mocks.buildOpeningOnlyPlan }))
vi.mock('@/lib/salesAgent/openingRuntime', async importOriginal => ({
    ...(await importOriginal()),
    prepareOpeningRuntime: mocks.prepareOpeningRuntime,
}))
vi.mock('@/lib/salesAgent/openingVariableRuntimeStore', () => ({
    loadOpeningVariableVersions: mocks.loadOpeningVariableVersions,
    signOpeningVariableDownload: mocks.signOpeningVariableDownload,
}))
vi.mock('@/lib/salesAgent/priorContext', () => ({ readPriorConversationContext: mocks.readPriorConversationContext }))
vi.mock('@/lib/salesAgent/whatsapp', () => ({ canSendWhatsApp: mocks.canSendWhatsApp }))
vi.mock('@/lib/salesAgent/inboundDirectDelivery', () => ({ sendInboundSequenceDirect: mocks.sendInboundSequenceDirect }))

const lead = { isNew: false, stage: 'engaged', turns: [], followUpCount: 0, imagesSent: [], mediaSent: [] }
const inbound = overrides => ({ eventId: 'event-token', phone: 'test-phone-token', text: '', messageType: 'text', ...(process.env.SALES_CONVERSATIONAL_POLICY_ENABLED === 'true' ? { occurredAt: new Date(Date.now()).toISOString() } : {}), ...overrides })

let POST

function expectNoProviderWork() {
    expect(mocks.resolveOrEnrollModelAssignment).not.toHaveBeenCalled()
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

function prepareDecisionPath() {
    mocks.listMedia.mockResolvedValue([])
    mocks.mergeMedia.mockReturnValue({})
    mocks.performanceNote.mockReturnValue(null)
    mocks.creditPendingMedia.mockResolvedValue(undefined)
    mocks.buildSystemPrompt.mockReturnValue('system')
    mocks.toApiMessages.mockReturnValue([])
    mocks.priceDodged.mockReturnValue(false)
    mocks.mediaGuard.mockReturnValue(null)
    mocks.callClaude.mockResolvedValue({ text: 'valid', usage: null, model: 'test' })
    mocks.parseAgentJson.mockReturnValue({
        malformed: false, messages: ['model draft'], stage: 'engaged', handoff: false,
        image: null, eventType: null, callbackPromised: null, followUpAt: null,
    })
}

beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.SALES_AGENT_SECRET = 'route-test-secret'
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'
    process.env.OPENAI_API_KEY = 'test-openai-key'
    delete process.env.GEMINI_API_KEY
    process.env.SALES_AGENT_OWNER_PHONE = 'owner-token'
    delete process.env.SALES_CONVERSATIONAL_POLICY_ENABLED
    delete process.env.SALES_CONSENT_FOLLOWUPS_ENABLED
    mocks.readActiveOfferCatalog.mockResolvedValue(syntheticCatalog())
    mocks.readVerifiedCheckout.mockResolvedValue({ status: 'blocked', reason: 'checkout_not_verified' })
    mocks.recordConversationEvidence.mockResolvedValue({ recorded: true })
    mocks.validateInboundBeforeSend.mockResolvedValue({ ok: true })
    mocks.suppressMarketingFromInbound.mockResolvedValue({ action: 'completed', marketingSuppressed: true })
    delete process.env.SALES_AGENT_DIRECT_GRAPH
    mocks.claimInboundEvent.mockResolvedValue({ action: 'process', claimToken: 'claim-token', claimGeneration: 1 })
    mocks.completeInboundEvent.mockResolvedValue({ action: 'completed' })
    mocks.completeProviderFallback.mockResolvedValue({ action: 'completed' })
    mocks.completeSuccessfulExchange.mockResolvedValue({ action: 'completed' })
    mocks.releaseProviderProbe.mockResolvedValue({ action: 'released' })
    mocks.acquireProviderCircuit.mockResolvedValue({ allow: true, mode: 'closed' })
    mocks.recordProviderFailure.mockResolvedValue(undefined)
    mocks.recordProviderSuccess.mockResolvedValue(undefined)
    mocks.recordInboundHeartbeat.mockResolvedValue(undefined)
    mocks.resolveOrEnrollModelAssignment.mockResolvedValue({ action: 'existing', assignment: null })
    mocks.recordMediaSent.mockResolvedValue(undefined)
    mocks.getLead.mockResolvedValue(lead)
    mocks.readSalesSettings.mockResolvedValue({
        revision: 1, enabled: true, mode: 'full_sales', provider: 'anthropic', model: 'claude-haiku-4-5',
        fallbackModel: 'claude-haiku-4-5', businessInstructions: 'תשאל שאלה אחת',
        activeOpeningIds: ['question_first'], openingMediaSequence: [],
    })
    mocks.setHuman.mockResolvedValue(undefined)
    mocks.findCustomerByPhone.mockResolvedValue(null)
    mocks.isPausedForHuman.mockReturnValue(false)
    mocks.isOwnEcho.mockReturnValue(false)
    mocks.isOwnMediaEcho.mockReturnValue(false)
    mocks.parseOwnerCommand.mockReturnValue(null)
    mocks.decideSalesTurn.mockReturnValue({
        conversationKind: 'sales', intent: 'general', nextBestAction: 'answer_then_qualify',
        maxMessages: 1, maxChars: 180, maxQuestions: 1, knownFacts: [], forbiddenRepeats: [], modelEligible: true,
    })
    mocks.enforceSalesReply.mockImplementation(({ parsed }) => parsed)
    mocks.buildDeterministicSalesReply.mockReturnValue({
        malformed: false, messages: ['המחירים מתחילים ב-₪690.'], stage: 'engaged',
        handoff: false, image: null, eventType: null, callbackPromised: null, followUpAt: null,
    })
    mocks.buildOpeningPlan.mockReturnValue({
        eligible: false, qualificationTarget: null, closingText: '', mediaParts: [],
    })
    mocks.buildOpeningOnlyPlan.mockReturnValue({
        eligible: false, text: '', mediaParts: [], sequenceParts: [],
    })
    mocks.prepareOpeningRuntime.mockReturnValue({ eligible: false, reason: 'experiment-stopped' })
    mocks.loadOpeningVariableVersions.mockResolvedValue({})
    mocks.signOpeningVariableDownload.mockResolvedValue('https://storage.test/signed')
    mocks.readPriorConversationContext.mockResolvedValue({ state: 'none', hasPriorConversation: false })
    mocks.canSendWhatsApp.mockReturnValue(true)
    mocks.sendInboundSequenceDirect.mockResolvedValue({ status: 'accepted', acceptedParts: 2, totalParts: 2, persistenceDegraded: false })
    ;({ POST } = await import('@/app/api/sales-agent/reply/route'))
})

describe('model revenue experiment runtime', () => {
    const assignment = {
        experimentId: 'sales-models', experimentRevision: 2,
        armId: 'claude', armRevision: 3,
        provider: 'anthropic', model: 'claude-sonnet-4-5',
    }
    const activeExperiment = {
        id: 'sales-models', revision: 2, enabled: true,
        targetVerifiedSalesPerDay: 2, minimumDeliveredPerArm: 30, minimumDays: 7,
        championArmId: 'gemini',
        arms: [
            { id: 'gemini', revision: 1, provider: 'gemini', model: 'gemini-3.6-flash', weight: 80, enabled: true },
            { id: 'claude', revision: 3, provider: 'anthropic', model: 'claude-sonnet-4-5', weight: 20, enabled: true },
        ],
    }

    function prepareExperimentPath() {
        prepareDecisionPath()
        mocks.readSalesSettings.mockResolvedValue({
            revision: 8, enabled: true, mode: 'full_sales',
            provider: 'gemini', model: 'gemini-3.6-flash',
            businessInstructions: '', activeOpeningIds: ['question_first'], openingMediaSequence: [],
            modelExperiment: activeExperiment,
        })
        mocks.resolveOrEnrollModelAssignment.mockResolvedValue({ action: 'existing', assignment })
        mocks.callClaude.mockResolvedValue({
            text: 'valid', usage: { input_tokens: 100, output_tokens: 20 },
            model: assignment.model, provider: assignment.provider, stopReason: 'end_turn',
        })
        mocks.costOfClaudeUsage.mockReturnValue({ usd: 0.001, known: true })
    }

    it('calls only the assigned provider/model and persists actual execution truth', async () => {
        prepareExperimentPath()

        await post(inbound({ text: 'אשמח לפרטים' }))

        expect(mocks.resolveOrEnrollModelAssignment).toHaveBeenCalledWith(expect.objectContaining({
            eventId: 'event-token', leadId: 'test-phone-token', experiment: activeExperiment,
            claimToken: 'claim-token', generation: 1,
        }))
        expect(mocks.callClaude).toHaveBeenCalledWith(expect.objectContaining({
            provider: 'anthropic', model: 'claude-sonnet-4-5',
        }))
        expect(mocks.acquireProviderCircuit).toHaveBeenCalledWith(expect.objectContaining({
            provider: 'anthropic', model: 'claude-sonnet-4-5',
        }))
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledWith(expect.objectContaining({
            modelAssignment: assignment,
            modelExecution: expect.objectContaining({
                provider: 'anthropic', model: 'claude-sonnet-4-5',
                primaryAttempted: true, fallback: false, attempts: 1, costUsd: 0.001,
            }),
        }))
    })

    it('marks deterministic fallback as contaminated after an assigned provider failure', async () => {
        prepareExperimentPath()
        mocks.callClaude.mockRejectedValue(Object.assign(new Error('timeout'), {
            providerStarted: true, errorCode: 'timeout',
        }))
        vi.spyOn(console, 'error').mockImplementation(() => {})

        await post(inbound({ text: 'אשמח לפרטים' }))

        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledWith(expect.objectContaining({
            modelAssignment: assignment,
            modelExecution: expect.objectContaining({
                primaryAttempted: true, fallback: true, failureCode: 'timeout', attempts: 1,
            }),
        }))
    })

    it('does not claim a primary provider attempt when failure happens before fetch', async () => {
        prepareExperimentPath()
        mocks.callClaude.mockRejectedValue(Object.assign(new Error('provider unavailable'), {
            providerStarted: false, errorCode: 'provider_error',
        }))

        await post(inbound({ text: 'אשמח לפרטים' }))

        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledWith(expect.objectContaining({
            modelExecution: expect.objectContaining({
                primaryAttempted: false, fallback: true, failureCode: 'provider_error', attempts: 1,
                latencyMs: null,
            }),
        }))
    })

    it('treats JSON repair as one assigned sample with two attempts', async () => {
        prepareExperimentPath()
        mocks.callClaude
            .mockResolvedValueOnce({ text: 'bad', usage: null, model: assignment.model, provider: assignment.provider })
            .mockResolvedValueOnce({ text: 'good', usage: null, model: assignment.model, provider: assignment.provider })
        mocks.parseAgentJson
            .mockReturnValueOnce({ malformed: true, messages: [], handoff: false })
            .mockReturnValueOnce({
                malformed: false, messages: ['תשובה'], stage: 'engaged', handoff: false,
                image: null, eventType: null, callbackPromised: null, followUpAt: null,
            })
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        await post(inbound({ text: 'אשמח לפרטים' }))

        expect(mocks.resolveOrEnrollModelAssignment).toHaveBeenCalledTimes(1)
        expect(mocks.callClaude).toHaveBeenCalledTimes(2)
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledWith(expect.objectContaining({
            modelExecution: expect.objectContaining({ attempts: 2, primaryAttempted: true, fallback: false }),
        }))
    })
})

describe('deterministic opening experiment runtime', () => {
    it('uses direct Graph delivery for the published journey and tells Make not to resend it', async () => {
        process.env.SALES_AGENT_DIRECT_GRAPH = 'true'
        const parts = [
            { partId: 'a'.repeat(32), blockId: 'a-explain', order: 1, kind: 'text', text: 'כך הספר עובד' },
            { partId: 'b'.repeat(32), blockId: 'a-video', order: 2, kind: 'video', url: 'https://media.test/demo.mp4' },
        ]
        mocks.getLead.mockResolvedValue({ ...lead, isNew: true, stage: 'new' })
        mocks.prepareOpeningRuntime.mockReturnValue({
            eligible: true, expectedStateVersion: 0,
            enrollment: { variantId: 'B', variantRevision: 3, flow: { id: 'B', revision: 3, blocks: [] } },
            result: { action: 'completed', state: { cursor: 2, waitingFor: null }, parts, captures: {}, completed: true },
        })

        const result = await post(inbound({ text: 'אשמח לפרטים' }))

        expect(result.status).toBe(200)
        expect(result.body).toMatchObject({
            shouldSend: false,
            directDelivery: { status: 'accepted', acceptedParts: 2, totalParts: 2, persistenceDegraded: false },
        })
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledWith(expect.objectContaining({ deliveryChannel: 'whatsapp_graph' }))
        expect(mocks.sendInboundSequenceDirect).toHaveBeenCalledWith({ phone: 'test-phone-token', parts })
    })

    it('persists and returns an ordered published journey without model work', async () => {
        const parts = [
            { partId: 'a'.repeat(32), blockId: 'a-explain', order: 1, kind: 'text', text: 'כך הספר עובד' },
            { partId: 'b'.repeat(32), blockId: 'a-photo', order: 2, kind: 'text', text: 'שלחי תמונה של הבן שלך' },
        ]
        mocks.getLead.mockResolvedValue({ ...lead, isNew: true, stage: 'new' })
        mocks.readSalesSettings.mockResolvedValue({
            revision: 8, enabled: true, mode: 'full_sales', openingText: 'legacy',
            openingExperiment: { enabled: true, variants: [] },
        })
        mocks.prepareOpeningRuntime.mockReturnValue({
            eligible: true,
            expectedStateVersion: 0,
            enrollment: { variantId: 'A', variantRevision: 3, flow: { id: 'A', revision: 3, blocks: [] } },
            result: {
                action: 'wait_photo', state: { cursor: 2, waitingFor: 'photo' }, parts,
                captures: {}, approvalRequest: null, completed: false,
            },
        })

        const result = await post(inbound({ text: 'אשמח לפרטים' }))

        expect(result.status).toBe(200)
        expect(result.body).toMatchObject({
            shouldSend: true,
            send: ['כך הספר עובד', 'שלחי תמונה של הבן שלך'],
            sendText: 'כך הספר עובד',
            followUpAt: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }),
            openingSequenceParts: parts,
            openingExperiment: { variantId: 'A', variantRevision: 3, action: 'wait_photo' },
        })
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledWith(expect.objectContaining({
            exchange: expect.objectContaining({
                followUpAt: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }),
                openingRuntime: expect.objectContaining({
                    expectedStateVersion: 0,
                    enrollment: expect.objectContaining({ variantId: 'A', variantRevision: 3 }),
                    state: { cursor: 2, waitingFor: 'photo' },
                }),
            }),
            outcome: expect.objectContaining({ openingSequenceParts: parts }),
        }))
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expectNoProviderWork()
    })

    it('serializes an audio variable as a voice-note media slot with immutable attribution', async () => {
        const parts = [
            {
                partId: 'a'.repeat(32), blockId: 'a-copy', order: 1, kind: 'text', text: 'שלום נועה',
                variableKey: 'opening_copy', variableVersionId: 'v4',
            },
            {
                partId: 'b'.repeat(32), blockId: 'a-audio', order: 2, kind: 'audio',
                url: 'https://storage.test/signed', caption: 'הסבר', voiceNote: true,
                variableKey: 'voice_intro', variableVersionId: 'v2',
            },
        ]
        mocks.getLead.mockResolvedValue({ ...lead, isNew: true, stage: 'new', name: 'נועה' })
        mocks.readSalesSettings.mockResolvedValue({
            revision: 9, enabled: true, mode: 'opening_only', openingText: 'legacy',
            openingExperiment: { enabled: true, variants: [] },
        })
        mocks.loadOpeningVariableVersions.mockResolvedValue({ 'voice_intro:v2': { id: 'v2' } })
        mocks.prepareOpeningRuntime.mockResolvedValue({
            eligible: true,
            expectedStateVersion: 0,
            enrollment: { variantId: 'A', variantRevision: 4, flow: { id: 'A', revision: 4, blocks: [] } },
            result: { action: 'completed', state: { cursor: 3, waitingFor: null }, parts, captures: {}, completed: true },
        })

        const result = await post(inbound({ text: 'אשמח לפרטים', profileName: 'נועה' }))
        expect(result.status).toBe(200)
        expect(result.body).toMatchObject({
            hasAudio: true,
            sendAudio: 'https://storage.test/signed',
            sendAudioCaption: 'הסבר',
            sendAudioVoiceNote: true,
            openingMediaCount: 1,
            openingMedia1Kind: 'audio',
            openingMedia1VoiceNote: true,
        })
        expect(mocks.prepareOpeningRuntime).toHaveBeenCalledWith(expect.objectContaining({
            variableVersions: { 'voice_intro:v2': { id: 'v2' } },
            signDownload: mocks.signOpeningVariableDownload,
            leadContext: expect.objectContaining({ first_name: 'נועה' }),
        }))
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledWith(expect.objectContaining({
            outcome: expect.objectContaining({ openingSequenceParts: parts }),
        }))
    })

    it('collapses later copy and the qualification question into one durable closing message after media', async () => {
        const parts = [
            { partId: 'a'.repeat(32), blockId: 'b-intro', order: 1, kind: 'text', text: 'כך זה עובד' },
            { partId: 'b'.repeat(32), blockId: 'b-video', order: 2, kind: 'video', url: 'https://storage.test/demo.mp4', caption: 'דמו' },
            { partId: 'c'.repeat(32), blockId: 'b-image', order: 3, kind: 'image', url: 'https://storage.test/book.jpg', caption: 'ספר פתוח' },
            { partId: 'd'.repeat(32), blockId: 'b-price', order: 4, kind: 'text', text: 'המחיר 990 ₪' },
            { partId: 'e'.repeat(32), blockId: 'b-event', order: 5, kind: 'text', text: 'לאיזה אירוע ומה התאריך?' },
        ]
        mocks.getLead.mockResolvedValue({ ...lead, isNew: true, stage: 'new' })
        mocks.readSalesSettings.mockResolvedValue({
            revision: 10, enabled: true, mode: 'opening_only', openingExperiment: { enabled: true, variants: [] },
        })
        mocks.prepareOpeningRuntime.mockReturnValue({
            eligible: true, expectedStateVersion: 0,
            enrollment: { variantId: 'B', variantRevision: 2, flow: { id: 'B', revision: 2, blocks: [] } },
            result: { action: 'wait_event', state: { cursor: 5, waitingFor: 'event' }, parts, captures: {}, completed: false },
        })

        const result = await post(inbound({ text: 'אשמח לפרטים' }))

        expect(result.status).toBe(200)
        expect(result.body.openingSequenceParts.map(part => part.kind)).toEqual(['text', 'video', 'image', 'text'])
        expect(result.body.openingSequenceParts.map(part => part.order)).toEqual([1, 2, 3, 4])
        expect(result.body.openingAnswerText).toBe('כך זה עובד')
        expect(result.body.openingClosingText).toBe('המחיר 990 ₪\n\nלאיזה אירוע ומה התאריך?')
        expect(result.body.openingClosingId).toBe('d'.repeat(32))
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledWith(expect.objectContaining({
            outcome: expect.objectContaining({ openingSequenceParts: result.body.openingSequenceParts }),
        }))
    })

    it('accepts the awaited child photo without triggering the generic media handoff', async () => {
        mocks.getLead.mockResolvedValue({
            ...lead,
            openingVariantId: 'A', openingVariantRevision: 3, openingFlow: { id: 'A', blocks: [] },
            openingState: { cursor: 2, waitingFor: 'photo' }, openingStateVersion: 4,
        })
        mocks.readSalesSettings.mockResolvedValue({
            revision: 8, enabled: true, mode: 'opening_only', openingExperiment: { enabled: true, variants: [] },
        })
        mocks.prepareOpeningRuntime.mockReturnValue({
            eligible: true, enrollment: null, expectedStateVersion: 4,
            result: {
                action: 'approval_pending', state: { cursor: 4, waitingFor: 'approval' }, parts: [],
                captures: { childPhotoReceived: true, childPhotoMediaId: 'opaque-media-id' },
                approvalRequest: { templateId: 'bar-mitzvah-v1', mediaId: 'opaque-media-id' }, completed: false,
            },
        })

        const result = await post(inbound({ text: '', messageType: 'image', mediaId: 'opaque-media-id' }))

        expect(result.status).toBe(200)
        expect(result.body).toMatchObject({
            shouldSend: false, noReply: true,
            openingExperiment: { variantId: 'A', action: 'approval_pending' },
        })
        expect(mocks.setHuman).not.toHaveBeenCalled()
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledWith(expect.objectContaining({
            exchange: expect.objectContaining({
                openingRuntime: expect.objectContaining({
                    expectedStateVersion: 4,
                    captures: expect.objectContaining({ childPhotoReceived: true }),
                    approvalRequest: expect.objectContaining({ templateId: 'bar-mitzvah-v1' }),
                }),
            }),
        }))
        expect(mocks.callClaude).not.toHaveBeenCalled()
    })

    it('hands a completed photo journey to the owner after the fixed acknowledgement', async () => {
        const acknowledgement = 'קיבלתי, תודה 😊 אני מכין לך דוגמה אישית ואחזור אלייך כאן.'
        mocks.getLead.mockResolvedValue({
            ...lead,
            openingVariantId: 'A', openingVariantRevision: 3, openingFlow: { id: 'A', blocks: [] },
            openingState: { cursor: 3, waitingFor: 'photo' }, openingStateVersion: 5,
        })
        mocks.readSalesSettings.mockResolvedValue({
            revision: 9, enabled: true, mode: 'opening_only', openingExperiment: { enabled: true, variants: [] },
        })
        mocks.prepareOpeningRuntime.mockReturnValue({
            eligible: true, enrollment: null, expectedStateVersion: 5,
            result: {
                action: 'completed', state: { cursor: 5, waitingFor: null },
                parts: [{
                    partId: 'f'.repeat(32), blockId: 'a-manual-handoff-v3', order: 1,
                    kind: 'text', text: acknowledgement,
                }],
                captures: { childPhotoReceived: true, childPhotoMediaId: 'opaque-media-id' },
                approvalRequest: null, completed: true,
            },
        })

        const result = await post(inbound({ text: '', messageType: 'image', mediaId: 'opaque-media-id' }))

        expect(result.status).toBe(200)
        expect(result.body).toMatchObject({
            shouldSend: true,
            send: [acknowledgement],
            sendText: acknowledgement,
            stage: 'handoff',
            handoff: true,
            noReply: false,
            openingExperiment: { variantId: 'A', variantRevision: 3, action: 'completed' },
        })
        expect(result.body.notifyOwner).toBeTruthy()
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledWith(expect.objectContaining({
            exchange: expect.objectContaining({
                parsed: expect.objectContaining({
                    stage: 'handoff',
                    handoff: true,
                    handoffReason: 'התקבלה תמונת ילד — בר מכין את הדוגמה וממשיך ידנית',
                }),
                openingRuntime: expect.objectContaining({
                    expectedStateVersion: 5,
                    captures: expect.objectContaining({ childPhotoReceived: true }),
                    approvalRequest: null,
                    completed: true,
                }),
            }),
        }))
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expectNoProviderWork()
    })
})

describe('owner-controlled opening-only mode', () => {
    it('sends the exact configured opening once with ordered media and does zero model or breaker work', async () => {
        const exactText = 'היי, כיף שכתבת 😊\nצירפתי דוגמאות. לאיזה אירוע ומתי הוא מתקיים?'
        const sequenceParts = [
            { partId: 'text-part-id', order: 1, kind: 'text', text: exactText, mediaKey: null, demoEvidence: false },
            { partId: 'image-part-id', order: 2, kind: 'image', mediaKey: 'cover', url: 'https://media.test/cover.jpg', caption: 'כריכה', demoEvidence: true },
            { partId: 'video-part-id', order: 3, kind: 'video', mediaKey: 'demo', url: 'https://media.test/demo.mp4', caption: 'דמו', demoEvidence: true },
        ]
        mocks.getLead.mockResolvedValue({ ...lead, isNew: true, stage: 'new' })
        mocks.readSalesSettings.mockResolvedValue({
            revision: 2, enabled: true, mode: 'opening_only', openingText: exactText,
            provider: 'anthropic', model: 'claude-haiku-4-5', fallbackModel: 'claude-haiku-4-5',
            businessInstructions: '', activeOpeningIds: ['question_first'], openingMediaSequence: ['cover', 'demo'],
        })
        mocks.listMedia.mockResolvedValue([])
        mocks.mergeMedia.mockReturnValue({
            cover: { kind: 'image', url: 'https://media.test/cover.jpg', caption: 'כריכה' },
            demo: { kind: 'video', url: 'https://media.test/demo.mp4', caption: 'דמו' },
        })
        mocks.buildOpeningOnlyPlan.mockReturnValue({
            eligible: true,
            text: exactText,
            mediaParts: sequenceParts.slice(1),
            sequenceParts,
        })

        const result = await post(inbound({ text: 'אפשר פרטים?' }))

        expect(result.status).toBe(200)
        expect(result.body).toMatchObject({
            shouldSend: true,
            sendText: exactText,
            send: [exactText],
            openingSequenceParts: sequenceParts,
            openingMediaCount: 2,
            followUpAt: null,
            handoff: false,
        })
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expect(mocks.buildSystemPrompt).not.toHaveBeenCalled()
        expectNoProviderWork()
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledWith(expect.objectContaining({
            exchange: expect.objectContaining({
                parsed: expect.objectContaining({ messages: [exactText], openingMediaKeys: ['cover', 'demo'] }),
            }),
            outcome: expect.objectContaining({ openingSequenceParts: sequenceParts }),
        }))
    })

    it.each([
        ['existing lead', { ...lead, isNew: false }, { state: 'none', hasPriorConversation: false }],
        ['prior conversation', { ...lead, isNew: true }, { state: 'found', hasPriorConversation: true, messageCount: 8 }],
    ])('never answers an %s and completes the inbound event as intentional silence', async (_name, storedLead, prior) => {
        mocks.getLead.mockResolvedValue(storedLead)
        mocks.readPriorConversationContext.mockResolvedValue(prior)
        mocks.readSalesSettings.mockResolvedValue({
            revision: 2, enabled: true, mode: 'opening_only', openingText: 'פתיחה מדויקת',
            provider: 'anthropic', model: 'claude-haiku-4-5', fallbackModel: 'claude-haiku-4-5',
            businessInstructions: '', activeOpeningIds: ['question_first'], openingMediaSequence: [],
        })
        mocks.listMedia.mockResolvedValue([])
        mocks.mergeMedia.mockReturnValue({})

        const result = await post(inbound({ text: 'אפשר להמשיך?' }))

        expect(result.body).toMatchObject({ shouldSend: false, sendText: '', noReply: true, skipped: 'opening-only-existing' })
        expect(mocks.completeInboundEvent).toHaveBeenCalledWith(expect.objectContaining({
            outcome: expect.objectContaining({ noReply: true, handoff: false, skipped: 'opening-only-existing' }),
        }))
        expect(mocks.completeSuccessfulExchange).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expectNoProviderWork()
    })

    it('keeps a previously paying customer silent instead of sending the legacy support reply', async () => {
        mocks.getLead.mockResolvedValue({ ...lead, isNew: true, stage: 'new' })
        mocks.findCustomerByPhone.mockResolvedValue({ weddingId: 'existing-order', ownerName: 'לקוח קיים' })
        mocks.readSalesSettings.mockResolvedValue({
            revision: 2, enabled: true, mode: 'opening_only', openingText: 'פתיחה מדויקת',
            provider: 'anthropic', model: 'claude-haiku-4-5', fallbackModel: 'claude-haiku-4-5',
            businessInstructions: '', activeOpeningIds: ['question_first'], openingMediaSequence: [],
        })
        mocks.listMedia.mockResolvedValue([])
        mocks.mergeMedia.mockReturnValue({})

        const result = await post(inbound({ text: 'שאלה על ההזמנה שלי' }))

        expect(result.body).toMatchObject({
            customer: true, shouldSend: false, sendText: '', noReply: true,
            skipped: 'opening-only-customer',
        })
        expect(result.body.send).toEqual([])
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expectNoProviderWork()
    })

    it('fails silent when lead state is unavailable rather than sending an uncontrolled fallback', async () => {
        mocks.getLead.mockRejectedValue(new Error('private-database-error'))
        mocks.readSalesSettings.mockResolvedValue({
            revision: 2, enabled: true, mode: 'opening_only', openingText: 'פתיחה מדויקת',
            provider: 'anthropic', model: 'claude-haiku-4-5', fallbackModel: 'claude-haiku-4-5',
            businessInstructions: '', activeOpeningIds: ['question_first'], openingMediaSequence: [],
        })
        mocks.listMedia.mockResolvedValue([])
        mocks.mergeMedia.mockReturnValue({})

        const result = await post(inbound({ text: 'אפשר פרטים?' }))

        expect(result.body).toMatchObject({
            shouldSend: false, sendText: '', noReply: true, skipped: 'opening-only-state-unavailable',
        })
        expect(result.body.send).toEqual([])
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expectNoProviderWork()
    })
})

describe('conversation-learned decision contract', () => {
    // 1.10: Make routes media only through the openingMedia{n} slot fields
    // (the hasImage branch is gone since 24.8). A model reply with a
    // picture filled none of them, so 31 pictures in 14 days were dropped
    // at the router while the text said "הנה דוגמה". The picture now goes
    // out through slot 1, under the ledger's own outbound id for that part.
    it('routes a mid-conversation picture through Make slot 1 with the image part id', async () => {
        prepareDecisionPath()
        mocks.mergeMedia.mockReturnValue({
            book_bar_mitzvah: { url: 'https://cdn.test/bar.jpg', caption: 'ספר בר מצווה', kind: 'image' },
        })
        mocks.enforceSalesReply.mockImplementation(({ parsed }) => ({ ...parsed, image: 'book_bar_mitzvah', stage: 'offer_sent' }))

        const result = await post(inbound({ text: 'בר מצווה' }))

        expect(result.status).toBe(200)
        expect(result.body).toMatchObject({
            hasImage: true,
            sendImage: 'https://cdn.test/bar.jpg',
            openingMediaCount: 1,
            openingMedia1Kind: 'image',
            openingMedia1Url: 'https://cdn.test/bar.jpg',
            openingMedia1Caption: 'ספר בר מצווה',
            openingMedia1VoiceNote: false,
            openingSequenceParts: [],
        })
        expect(result.body.openingMedia1Id).toMatch(/^[a-z0-9:_-]{8,}$/i)
        expect(result.body.openingMedia1Id).not.toContain('test-phone-token')
        expect(result.body.openingMedia2Kind).toBeUndefined()
    })

    it('fills no media slot when the reply has no picture', async () => {
        prepareDecisionPath()
        const result = await post(inbound({ text: 'תודה' }))
        expect(result.status).toBe(200)
        expect(result.body.openingMediaCount).toBe(0)
        expect(result.body.openingMedia1Kind).toBeUndefined()
    })

    it('continues a historical conversation from known facts and never builds a new-lead opening', async () => {
        prepareDecisionPath()
        mocks.getLead.mockResolvedValue({ ...lead, isNew: true })
        mocks.readPriorConversationContext.mockResolvedValue({
            state: 'found', hasPriorConversation: true, eventType: 'בר מצווה', eventDate: '2026-10-20',
            celebrantName: 'יואב', stage: 'qualified', messageCount: 8,
        })

        const result = await post(inbound({ text: 'אפשר להמשיך?' }))

        expect(result.status).toBe(200)
        expect(mocks.decideSalesTurn).toHaveBeenCalledWith(expect.objectContaining({
            lead: expect.objectContaining({
                isNew: false, hasPriorConversation: true, eventType: 'בר מצווה', eventDate: '2026-10-20',
            }),
        }))
        expect(mocks.buildOpeningPlan).toHaveBeenCalledWith(expect.objectContaining({
            lead: expect.objectContaining({ isNew: false, hasPriorConversation: true }),
        }))
        expect(result.body.openingSequenceParts).toEqual([])
    })

    it('suppresses the opening bundle on an unavailable history check but still answers once', async () => {
        prepareDecisionPath()
        mocks.getLead.mockResolvedValue({ ...lead, isNew: true })
        mocks.readPriorConversationContext.mockResolvedValue({ state: 'unknown', hasPriorConversation: true })

        const result = await post(inbound({ text: 'כמה עולה?' }))

        expect(result.status).toBe(200)
        expect(result.body.sendText).toBeTruthy()
        expect(result.body.openingSequenceParts).toEqual([])
        expect(mocks.buildOpeningPlan).toHaveBeenCalledWith(expect.objectContaining({
            lead: expect.objectContaining({ hasPriorConversation: true }),
        }))
    })

    it('allows the opening plan only after history proves the phone has no prior conversation', async () => {
        prepareDecisionPath()
        mocks.getLead.mockResolvedValue({ ...lead, isNew: true })
        mocks.readPriorConversationContext.mockResolvedValue({ state: 'none', hasPriorConversation: false })
        const occurredAt = new Date().toISOString()

        await post(inbound({ text: 'שלום', occurredAt }))

        expect(mocks.readPriorConversationContext).toHaveBeenCalledWith('test-phone-token', {
            occurredAt,
        })
        expect(mocks.buildOpeningPlan).toHaveBeenCalledWith(expect.objectContaining({
            lead: expect.objectContaining({ isNew: true, hasPriorConversation: false }),
        }))
    })

    it.each([
        ['price', 'כמה עולה הספר?', 'answer', 'המודפס עולה ₪950'],
        ['known facts', 'אפשר עוד פרטים?', 'answer_then_qualify', 'המודפס כולל כריכה קשה'],
        ['positive signal', 'וואו זה בדיוק מה שחיפשנו', 'recommend_package', 'המודפס הוא הבחירה המתאימה'],
        ['checkout friction', 'לא הצלחתי להשלים את התשלום', 'diagnose_checkout', 'איפה זה נתקע לך?'],
    ])('persists and sends only the enforced %s result', async (_name, text, nextBestAction, message) => {
        prepareDecisionPath()
        const decision = {
            conversationKind: 'sales', intent: _name, nextBestAction,
            maxMessages: 1, maxChars: 180, maxQuestions: 1,
            knownFacts: ['eventType'], forbiddenRepeats: ['eventType'], modelEligible: true,
        }
        const enforced = {
            malformed: false, messages: [message], stage: nextBestAction === 'diagnose_checkout' ? 'ready_to_pay' : 'engaged',
            handoff: false, image: null, eventType: 'bar_mitzvah', callbackPromised: null, followUpAt: null,
        }
        mocks.getLead.mockResolvedValue({ ...lead, eventType: 'bar_mitzvah' })
        mocks.decideSalesTurn.mockReturnValue(decision)
        mocks.enforceSalesReply.mockReturnValue(enforced)

        const result = await post(inbound({ text }))

        expect(mocks.decideSalesTurn).toHaveBeenCalledWith({
            lead: expect.objectContaining({ eventType: 'bar_mitzvah' }), incomingText: text, isExistingCustomer: false, pausedForHuman: false, todayISO: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        })
        expect(mocks.buildSystemPrompt).toHaveBeenCalledWith(expect.any(Object), expect.any(String), expect.objectContaining({ turnDecision: decision }))
        expect(mocks.enforceSalesReply).toHaveBeenCalledWith(expect.objectContaining({
            parsed: expect.objectContaining({ messages: ['model draft'] }), decision,
            lead: expect.objectContaining({ eventType: 'bar_mitzvah' }), incomingText: text,
        }))
        expect(result.body).toMatchObject({ send: [message], sendText: message, stage: enforced.stage, handoff: false })
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledWith(expect.objectContaining({
            exchange: expect.objectContaining({ parsed: enforced }),
            outcome: expect.objectContaining({ sendText: message, stage: enforced.stage, handoff: false }),
        }))
    })

    it('closes a clean no without handoff, owner notice, or pre-guard persistence', async () => {
        prepareDecisionPath()
        const decision = {
            conversationKind: 'sales', intent: 'negative_exit', nextBestAction: 'close_lost',
            maxMessages: 1, maxChars: 180, maxQuestions: 1, knownFacts: [], forbiddenRepeats: [], modelEligible: true,
        }
        const enforced = {
            malformed: false, messages: ['תודה שעדכנת, אנחנו כאן אם זה יחזור להיות רלוונטי.'],
            stage: 'closed_lost', handoff: false, handoffReason: null, image: null,
            eventType: null, callbackPromised: null, followUpAt: null,
        }
        mocks.decideSalesTurn.mockReturnValue(decision)
        mocks.enforceSalesReply.mockReturnValue(enforced)

        const result = await post(inbound({ text: 'החלטנו לוותר תודה' }))

        expect(result.body).toMatchObject({ stage: 'closed_lost', handoff: false, notifyOwner: null })
        expect(mocks.setHuman).not.toHaveBeenCalled()
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledWith(expect.objectContaining({
            exchange: expect.objectContaining({ parsed: enforced }),
            outcome: expect.objectContaining({ stage: 'closed_lost', handoff: false, notifyOwner: null }),
        }))
    })

    it('keeps an active human handoff outside the decision model', async () => {
        mocks.isPausedForHuman.mockReturnValue(true)

        const result = await post(inbound({ text: 'יש עדכון?' }))

        expect(result.body).toMatchObject({ noReply: true, paused: true, handoff: false })
        expect(mocks.decideSalesTurn).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
    })

    it('keeps an existing customer outside the decision model', async () => {
        mocks.getLead.mockResolvedValue({ ...lead, isNew: true })
        mocks.findCustomerByPhone.mockResolvedValue({ weddingId: 'test-wedding', ownerName: 'לקוח בדיקה' })

        const result = await post(inbound({ text: 'צריך עזרה בספר שכבר קניתי' }))

        expect(result.body).toMatchObject({ customer: true, handoff: true })
        expect(mocks.decideSalesTurn).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
    })
})

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

describe('existing customer support lookup', () => {
    beforeEach(() => prepareDecisionPath())
    const matchedOwner = { weddingId: 'synthetic-wedding-token', ownerName: 'לקוח סינתטי' }

    it.each([
        'יש תקלה בעמודים של הספר שלי',
        'אפשר לסדר מחדש את העמודים?',
        'אפשר לתרגם את הספר לאנגלית?',
        'אפשר לקבל את הדפים להדפסה?',
    ])('checks a non-new support request against wedding ownership: %s', async text => {
        const storedLead = { ...lead, paymentVerified: false, verifiedOrderId: null }
        mocks.getLead.mockResolvedValue(storedLead)
        mocks.findCustomerByPhone.mockResolvedValue(matchedOwner)

        const result = await post(inbound({ text }))

        expect(mocks.findCustomerByPhone).toHaveBeenCalledTimes(1)
        expect(mocks.findCustomerByPhone).toHaveBeenCalledWith('test-phone-token')
        expect(result.body).toMatchObject({ customer: true, handoff: true })
        expect(result.body.notifyOwner).toContain('לקוח סינתטי')
        expect(result.body.sendText).not.toMatch(/690|990|checkout|שילמת/)
        expect(mocks.setHuman).toHaveBeenCalledWith('test-phone-token', true, 'לקוח קיים כתב')
        expect(mocks.prepareOpeningRuntime).not.toHaveBeenCalled()
        expect(mocks.decideSalesTurn).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expect(mocks.completeSuccessfulExchange).not.toHaveBeenCalled()
        expect(storedLead).toMatchObject({ stage: 'engaged', paymentVerified: false, verifiedOrderId: null })
        expectNoProviderWork()
    })

    it('does not turn an unmatched support or purchase claim into customer/payment truth', async () => {
        const storedLead = { ...lead, paymentVerified: false, verifiedOrderId: null }
        mocks.getLead.mockResolvedValue(storedLead)

        const result = await post(inbound({ text: 'כבר שילמתי, אפשר לתקן את הספר שלי?' }))

        expect(mocks.findCustomerByPhone).toHaveBeenCalledTimes(1)
        expect(mocks.findCustomerByPhone).toHaveBeenCalledWith('test-phone-token')
        expect(result.body.customer).toBeUndefined()
        expect(mocks.setHuman).not.toHaveBeenCalled()
        expect(mocks.decideSalesTurn).toHaveBeenCalledWith(expect.objectContaining({ isExistingCustomer: false }))
        expect(mocks.callClaude).toHaveBeenCalledTimes(1)
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledTimes(1)
        expect(storedLead.paymentVerified).toBe(false)
        expect(storedLead.verifiedOrderId).toBeNull()
    })

    it('leaves an ordinary non-new buyer on the normal path without an extra lookup', async () => {
        const result = await post(inbound({ text: 'כמה עולה הספר המודפס?' }))

        expect(mocks.findCustomerByPhone).not.toHaveBeenCalled()
        expect(result.body.customer).toBeUndefined()
        expect(mocks.callClaude).toHaveBeenCalledTimes(1)
    })

    it('checks a bare yes that continues the customer’s recent support request', async () => {
        mocks.getLead.mockResolvedValue({ ...lead, turns: [
            { role: 'user', text: 'צריך לתרגם את העמודים לאנגלית' },
            { role: 'assistant', text: 'הכוונה לעמודי הברכות?' },
        ] })
        mocks.findCustomerByPhone.mockResolvedValue(matchedOwner)

        const result = await post(inbound({ text: 'כן' }))

        expect(mocks.findCustomerByPhone).toHaveBeenCalledTimes(1)
        expect(mocks.findCustomerByPhone).toHaveBeenCalledWith('test-phone-token')
        expect(result.body).toMatchObject({ customer: true, handoff: true })
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expectNoProviderWork()
    })

    it.each(['התכוונתי לגרסה באנגלית', 'אני רוצה באנגלית', 'כן'])('checks a support continuation through a language correction: %s', async text => {
        const turns = [
            { role: 'user', text: 'אפשר לקבל את הדפים להדפסה?' },
            { role: 'assistant', text: 'הגרסה בעברית?' },
        ]
        if (text === 'כן') turns.push(
            { role: 'user', text: 'אני רוצה באנגלית' },
            { role: 'assistant', text: 'כל הדפים?' },
            { role: 'user', text: 'כן' },
            { role: 'assistant', text: 'באותו סדר?' },
            { role: 'user', text: 'כן' },
            { role: 'assistant', text: 'הבנתי' },
        )
        mocks.getLead.mockResolvedValue({ ...lead, turns })
        mocks.findCustomerByPhone.mockResolvedValue(matchedOwner)

        const result = await post(inbound({ text }))

        expect(mocks.findCustomerByPhone).toHaveBeenCalledTimes(1)
        expect(result.body).toMatchObject({ customer: true, handoff: true })
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expectNoProviderWork()
    })

    it('does not look up a later buyer topic because old support and a language fragment exist', async () => {
        mocks.getLead.mockResolvedValue({ ...lead, turns: [
            { role: 'user', text: 'אפשר לקבל את הדפים להדפסה?' },
            { role: 'assistant', text: 'אבדוק' },
            { role: 'user', text: 'כמה עולה להזמין ספר חדש?' },
            { role: 'assistant', text: 'בגרסה בעברית?' },
            { role: 'user', text: 'התכוונתי לגרסה באנגלית' },
        ] })

        const result = await post(inbound({ text: 'כן' }))

        expect(mocks.findCustomerByPhone).not.toHaveBeenCalled()
        expect(result.body.customer).toBeUndefined()
        expect(mocks.callClaude).toHaveBeenCalledTimes(1)
    })

    it.each([
        { stage: 'closed_won', paymentVerified: false },
        { stage: 'engaged', paymentVerified: true, verifiedOrderId: 'synthetic-order-token' },
    ])('keeps trusted stored customer truth ahead of stale stage or support wording: %j', async storedTruth => {
        mocks.getLead.mockResolvedValue({ ...lead, ...storedTruth })

        const result = await post(inbound({ text: 'אפשר להמשיך?' }))

        expect(result.body).toMatchObject({ customer: true, handoff: true })
        expect(mocks.findCustomerByPhone).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expect(mocks.completeSuccessfulExchange).not.toHaveBeenCalled()
        expectNoProviderWork()
    })

    it.each([undefined, false, 'true', 1])('does not treat an unverified payment flag %s as customer truth', async paymentVerified => {
        mocks.getLead.mockResolvedValue({ ...lead, paymentVerified, verifiedOrderId: 'synthetic-unverified-order' })

        const result = await post(inbound({ text: 'מה המחיר?' }))

        expect(result.body.customer).toBeUndefined()
        expect(mocks.findCustomerByPhone).not.toHaveBeenCalled()
        expect(mocks.setHuman).not.toHaveBeenCalled()
        expect(mocks.callClaude).toHaveBeenCalledTimes(1)
    })

    it('preserves opening-only silence for a matched non-new support request', async () => {
        mocks.readSalesSettings.mockResolvedValue({
            enabled: true, mode: 'opening_only', provider: 'anthropic', model: 'test-model',
            activeOpeningIds: [], openingMediaSequence: [],
        })
        mocks.findCustomerByPhone.mockResolvedValue(matchedOwner)

        const result = await post(inbound({ text: 'אפשר לשנות את סדר העמודים?' }))

        expect(mocks.findCustomerByPhone).toHaveBeenCalledTimes(1)
        expect(result.body).toMatchObject({
            customer: true, handoff: false, shouldSend: false, sendText: '', noReply: true,
            skipped: 'opening-only-customer',
        })
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expectNoProviderWork()
    })

    it('leaves human pause ahead of support lookup and customer acknowledgment', async () => {
        mocks.getLead.mockResolvedValue({ ...lead, paymentVerified: true })
        mocks.isPausedForHuman.mockReturnValue(true)

        const result = await post(inbound({ text: 'צריך לשנות את הספר שלי' }))

        expect(result.body).toMatchObject({ paused: true, noReply: true, handoff: false, send: [] })
        expect(mocks.findCustomerByPhone).not.toHaveBeenCalled()
        expect(mocks.setHuman).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expectNoProviderWork()
    })

    it('preserves the first-contact lookup even for a message without support wording', async () => {
        mocks.getLead.mockResolvedValue({ ...lead, isNew: true })
        mocks.findCustomerByPhone.mockResolvedValue(matchedOwner)

        const result = await post(inbound({ text: 'שלום' }))

        expect(mocks.findCustomerByPhone).toHaveBeenCalledTimes(1)
        expect(mocks.findCustomerByPhone).toHaveBeenCalledWith('test-phone-token')
        expect(result.body).toMatchObject({ customer: true, handoff: true })
        expect(mocks.callClaude).not.toHaveBeenCalled()
    })
})

describe('inbound event duplicate fencing', () => {
    it('durably suppresses an inbound event older than fifteen minutes before lead or provider work', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'))

        const result = await post(inbound({
            text: 'stale private fixture',
            occurredAt: '2026-08-16T11:44:59.999Z',
        }))

        expect(result).toEqual({
            status: 200,
            body: {
                ok: true,
                shouldSend: false,
                send: [],
                sendText: '',
                handoff: false,
                noReply: true,
                skipped: 'stale-inbound',
            },
        })
        expect(mocks.completeInboundEvent).toHaveBeenCalledWith(expect.objectContaining({
            eventId: 'event-token',
            claimToken: 'claim-token',
            outcome: expect.objectContaining({
                sendText: '', handoff: false, noReply: true, skipped: 'stale-inbound',
            }),
        }))
        expect(mocks.getLead).not.toHaveBeenCalled()
        expect(mocks.listMedia).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expectNoProviderWork()
    })

    it('processes an event exactly fifteen minutes old instead of classifying it as stale', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'))

        const result = await post(inbound({
            text: '',
            messageType: 'image',
            occurredAt: '2026-08-16T11:45:00.000Z',
        }))

        expect(result.status).toBe(200)
        expect(result.body).toMatchObject({ stage: 'handoff', handoff: true })
        expect(result.body.skipped).toBeUndefined()
        expect(mocks.getLead).toHaveBeenCalledTimes(1)
        expect(mocks.setHuman).toHaveBeenCalledTimes(1)
    })

    it('keeps a replay of a completed stale event silent', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'))
        const body = inbound({ text: 'stale replay fixture', occurredAt: '2026-08-16T11:40:00.000Z' })

        const first = await post(body)
        mocks.claimInboundEvent.mockResolvedValueOnce({
            action: 'cached',
            outcome: { sendText: '', handoff: false, noReply: true, skipped: 'stale-inbound' },
        })
        const duplicate = await post(body)

        expect(first.body).toMatchObject({ shouldSend: false, noReply: true, skipped: 'stale-inbound' })
        expect(duplicate.body).toMatchObject({ duplicate: true, shouldSend: false, sendText: '', handoff: false })
        expect(duplicate.body.cachedOutcome).toEqual({
            sendText: '', handoff: false, noReply: true, skipped: 'stale-inbound',
        })
        expect(mocks.completeInboundEvent).toHaveBeenCalledTimes(1)
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expectNoProviderWork()
    })

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
        expect(mocks.loadOpeningVariableVersions).not.toHaveBeenCalled()
        expect(mocks.signOpeningVariableDownload).not.toHaveBeenCalled()
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
    it('uses a durable catalog reply instead of a human handoff when no provider key exists', async () => {
        prepareModelPath()
        delete process.env.ANTHROPIC_API_KEY
        delete process.env.OPENAI_API_KEY

        const result = await post(inbound({ text: 'כמה עולה הספר?' }))

        expect(result.body).toMatchObject({ send: ['המחירים מתחילים ב-₪690.'], handoff: false, stage: 'engaged' })
        expect(mocks.buildDeterministicSalesReply).toHaveBeenCalledWith(expect.objectContaining({
            incomingText: 'כמה עולה הספר?', lead,
        }))
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expect(mocks.acquireProviderCircuit).not.toHaveBeenCalled()
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledTimes(1)
        expect(mocks.completeProviderFallback).not.toHaveBeenCalled()
    })

    const deterministicFallback = 'המחירים מתחילים ב-₪690.'

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

    it('completes an open-breaker claim with a deterministic catalog reply and makes no model call', async () => {
        prepareModelPath()
        mocks.acquireProviderCircuit.mockResolvedValue({ allow: false, mode: 'open' })

        const result = await post(inbound({ text: 'צריך מחיר' }))

        expect(result.body).toMatchObject({ sendText: deterministicFallback, handoff: false, stage: 'engaged' })
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledTimes(1)
        expect(mocks.completeProviderFallback).not.toHaveBeenCalled()
        expect(result.body.notifyOwner).toBeNull()
        expect(mocks.callClaude).not.toHaveBeenCalled()
    })

    it('uses the POST-entry deadline before breaker acquire when preparation consumes the model budget', async () => {
        prepareModelPath()
        let ticks = 0
        vi.spyOn(Date, 'now').mockImplementation(() => ticks++ === 0 ? 0 : 21_000)

        const result = await post(inbound({ text: 'צריך מחיר' }))

        expect(result.body).toMatchObject({ sendText: deterministicFallback, handoff: false })
        expect(mocks.acquireProviderCircuit).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
    })

    it.each([
        [Object.assign(new Error('timed out'), { name: 'AbortError' }), 'timeout'],
        [new Error('anthropic 429: busy'), 'rate_limit'],
        [new Error('anthropic 400: credit_balance exhausted'), 'low_credit'],
    ])('records a normalized %s provider failure before using the catalog reply', async (error, code) => {
        prepareModelPath()
        mocks.callClaude.mockRejectedValue(error)
        vi.spyOn(console, 'error').mockImplementation(() => {})

        const result = await post(inbound({ text: 'צריך מחיר' }))

        expect(result.body).toMatchObject({ sendText: deterministicFallback, handoff: false })
        expect(mocks.recordProviderFailure).toHaveBeenCalledWith(expect.objectContaining({
            provider: 'anthropic', model: 'claude-haiku-4-5', errorCode: code,
            probeId: null, deadlineAtMs: expect.any(Number),
        }))
        expect(console.error).toHaveBeenCalledWith('[sales-agent] model provider failure', code)
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledTimes(1)
        expect(mocks.completeProviderFallback).not.toHaveBeenCalled()
    })

    it('counts two malformed model responses as one invalid-json failure and uses the catalog reply', async () => {
        prepareModelPath()
        mocks.callClaude.mockResolvedValue({ text: 'not json', usage: null, model: 'test' })
        mocks.parseAgentJson.mockReturnValue({ malformed: true, messages: [], handoff: true })
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})

        const result = await post(inbound({ text: 'צריך מחיר' }))

        expect(result.body).toMatchObject({ sendText: deterministicFallback, handoff: false })
        expect(mocks.callClaude).toHaveBeenCalledTimes(2)
        const [firstCall, secondCall] = mocks.callClaude.mock.calls
        expect(firstCall[0].deadlineAtMs).toBe(secondCall[0].deadlineAtMs)
        expect(firstCall[0].deadlineAtMs - Date.now()).toBeLessThanOrEqual(20_000)
        expect(mocks.recordProviderFailure).toHaveBeenCalledWith(expect.objectContaining({
            errorCode: 'invalid_json', probeId: null, deadlineAtMs: expect.any(Number),
        }))
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

        expect(first.body).toMatchObject({ sendText: deterministicFallback, handoff: false })
        expect(mocks.recordProviderFailure).toHaveBeenCalledTimes(1)
        expect(mocks.recordProviderFailure).toHaveBeenCalledWith(expect.objectContaining({
            errorCode: 'invalid_json', probeId: null, deadlineAtMs: expect.any(Number),
        }))
        expect(mocks.releaseProviderProbe).not.toHaveBeenCalled()
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledTimes(1)

        mocks.claimInboundEvent.mockResolvedValueOnce({ action: 'cached', outcome: { sendText: deterministicFallback, handoff: false } })
        const duplicate = await post(inbound({ text: 'צריך מחיר' }))
        expect(duplicate.body).toMatchObject({ duplicate: true, shouldSend: false, sendText: '', handoff: false })
        expect(mocks.callClaude).toHaveBeenCalledTimes(2)
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledTimes(1)
    })

    it('counts an unknown-model sequence whose recursive fallback expires before fetch', async () => {
        prepareModelPath()
        const recursiveDeadline = Object.assign(new Error('anthropic timeout: provider deadline exhausted'), { providerStarted: true })
        mocks.callClaude.mockRejectedValue(recursiveDeadline)
        vi.spyOn(console, 'error').mockImplementation(() => {})

        const first = await post(inbound({ text: 'צריך מחיר' }))

        expect(first.body).toMatchObject({ sendText: deterministicFallback, handoff: false })
        expect(mocks.recordProviderFailure).toHaveBeenCalledTimes(1)
        expect(mocks.recordProviderFailure).toHaveBeenCalledWith(expect.objectContaining({
            errorCode: 'timeout', probeId: null, deadlineAtMs: expect.any(Number),
        }))
        expect(mocks.releaseProviderProbe).not.toHaveBeenCalled()
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledTimes(1)

        mocks.claimInboundEvent.mockResolvedValueOnce({ action: 'cached', outcome: { sendText: deterministicFallback, handoff: false } })
        const duplicate = await post(inbound({ text: 'צריך מחיר' }))
        expect(duplicate.body).toMatchObject({ duplicate: true, shouldSend: false, sendText: '', handoff: false })
        expect(mocks.callClaude).toHaveBeenCalledTimes(1)
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledTimes(1)
    })

    it('releases a genuinely zero-fetch sequence without incrementing provider failures', async () => {
        prepareModelPath()
        const prefetchDeadline = Object.assign(new Error('provider deadline exhausted'), { providerStarted: false })
        mocks.acquireProviderCircuit.mockResolvedValue({ allow: true, mode: 'half-open', probeId: 'probe-token' })
        mocks.callClaude.mockRejectedValue(prefetchDeadline)

        const first = await post(inbound({ text: 'צריך מחיר' }))

        expect(first.body).toMatchObject({ sendText: deterministicFallback, handoff: false })
        expect(mocks.releaseProviderProbe).toHaveBeenCalledTimes(1)
        expect(mocks.releaseProviderProbe).toHaveBeenCalledWith(expect.objectContaining({
            probeId: 'probe-token', deadlineAtMs: expect.any(Number),
        }))
        expect(mocks.recordProviderFailure).not.toHaveBeenCalled()
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledTimes(1)

        mocks.claimInboundEvent.mockResolvedValueOnce({ action: 'cached', outcome: { sendText: deterministicFallback, handoff: false } })
        const duplicate = await post(inbound({ text: 'צריך מחיר' }))
        expect(duplicate.body).toMatchObject({ duplicate: true, shouldSend: false, sendText: '', handoff: false })
        expect(mocks.callClaude).toHaveBeenCalledTimes(1)
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledTimes(1)
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

        expect(first.body).toMatchObject({ sendText: deterministicFallback, stage: 'engaged', handoff: false })
        expect(mocks.releaseProviderProbe).toHaveBeenCalledTimes(1)
        expect(mocks.releaseProviderProbe).toHaveBeenCalledWith(expect.objectContaining({
            probeId: 'missing-key-probe', deadlineAtMs: expect.any(Number),
        }))
        expect(mocks.recordProviderFailure).not.toHaveBeenCalled()
        expect(mocks.recordProviderSuccess).not.toHaveBeenCalled()
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledTimes(1)
        expect(mocks.completeProviderFallback).not.toHaveBeenCalled()

        mocks.claimInboundEvent.mockResolvedValueOnce({ action: 'cached', outcome: { sendText: deterministicFallback, handoff: false } })
        const duplicate = await post(inbound({ text: 'צריך מחיר' }))

        expect(duplicate.body).toMatchObject({ duplicate: true, shouldSend: false, sendText: '', handoff: false })
        expect(mocks.callClaude).toHaveBeenCalledTimes(1)
        expect(mocks.releaseProviderProbe).toHaveBeenCalledTimes(1)
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledTimes(1)
    })

    it('resets the breaker only after a valid model result', async () => {
        prepareModelPath()
        mocks.callClaude.mockResolvedValue({ text: 'valid', usage: null, model: 'test' })
        mocks.parseAgentJson.mockReturnValue({
            malformed: false, messages: ['שלום'], stage: 'engaged', handoff: false,
            image: null, eventType: null, callbackPromised: null, followUpAt: null,
        })

        await post(inbound({ text: 'שלום' }))

        expect(mocks.buildSystemPrompt).toHaveBeenCalledWith(expect.any(Object), expect.any(String), expect.objectContaining({
            businessInstructions: 'תשאל שאלה אחת', activeOpeningIds: ['question_first'],
        }))
        expect(mocks.callClaude).toHaveBeenCalledWith(expect.objectContaining({
            provider: 'anthropic', model: 'claude-haiku-4-5',
        }))
        expect(mocks.recordProviderSuccess).toHaveBeenCalledTimes(1)
        expect(mocks.recordProviderFailure).not.toHaveBeenCalled()
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledTimes(1)
        expect(mocks.compactLeadBestEffort).toHaveBeenCalledWith('test-phone-token')
    })

    it('completes an intentionally silent event while the bot is disabled', async () => {
        prepareModelPath()
        mocks.readSalesSettings.mockResolvedValue({
            revision: 2, enabled: false, provider: 'auto', model: 'claude-sonnet-4-5',
            businessInstructions: '', activeOpeningIds: ['question_first'], openingMediaSequence: [],
        })

        const result = await post(inbound({ text: 'שלום' }))

        expect(result.body).toMatchObject({ ok: true, shouldSend: false, noReply: true, skipped: 'agent-disabled' })
        expect(mocks.completeInboundEvent).toHaveBeenCalledWith(expect.objectContaining({
            outcome: expect.objectContaining({ noReply: true, skipped: 'agent-disabled' }),
        }))
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expectNoProviderWork()
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

    it('uses and attributes the configured Gemini sales model', async () => {
        prepareModelPath()
        process.env.GEMINI_API_KEY = 'test-gemini-key'
        const usage = { input_tokens: 80, output_tokens: 20 }
        mocks.readSalesSettings.mockResolvedValue({
            revision: 2, enabled: true, mode: 'full_sales', provider: 'gemini', model: 'gemini-3.6-flash',
            businessInstructions: '', activeOpeningIds: ['question_first'], openingMediaSequence: [],
        })
        mocks.costOfClaudeUsage.mockReturnValue({ usd: 0.0001, known: true })
        mocks.recordSpend.mockResolvedValue(undefined)
        mocks.callClaude.mockResolvedValue({
            text: 'valid', usage, model: 'gemini-3.6-flash', provider: 'gemini', stopReason: 'STOP',
        })
        mocks.parseAgentJson.mockReturnValue({
            malformed: false, messages: ['שלום'], stage: 'engaged', handoff: false,
            image: null, eventType: null, callbackPromised: null, followUpAt: null,
        })

        await post(inbound({ text: 'שלום' }))

        expect(mocks.callClaude).toHaveBeenCalledWith(expect.objectContaining({
            provider: 'gemini', model: 'gemini-3.6-flash',
        }))
        expect(mocks.recordSpend).toHaveBeenCalledWith(expect.objectContaining({
            provider: 'gemini', model: 'gemini-3.6-flash', usage,
        }))
    })

    it('does not credit media before delivery and compacts only after the durable exchange completes', async () => {
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
        expect(mocks.recordMediaSent).not.toHaveBeenCalled()
        expect(mocks.compactLeadBestEffort).toHaveBeenCalledWith('test-phone-token')
        expect(mocks.completeSuccessfulExchange.mock.invocationCallOrder[0]).toBeLessThan(mocks.compactLeadBestEffort.mock.invocationCallOrder[0])
    })

    it('returns direct answer, two images, then demo qualification as one phone-free ordered sequence', async () => {
        prepareModelPath()
        mocks.getLead.mockResolvedValue({ ...lead, isNew: true })
        mocks.readSalesSettings.mockResolvedValue({
            revision: 3, enabled: true, provider: 'anthropic', model: 'claude-sonnet-4-5',
            businessInstructions: '', activeOpeningIds: ['question_first'],
            openingMediaSequence: ['photo-one', 'photo-two'],
        })
        mocks.mergeMedia.mockReturnValue({
            'photo-one': { kind: 'image', url: 'https://media.test/one.jpg', caption: 'one' },
            'photo-two': { kind: 'image', url: 'https://media.test/two.jpg', caption: 'two' },
        })
        mocks.buildOpeningPlan.mockReturnValue({
            eligible: true,
            qualificationTarget: 'eventTypeAndDate',
            closingText: 'אפשר לנסות דמו: https://app.weddingtales.co.il/wedding/demo/photo\n\nלאיזה אירוע ומתי הוא מתקיים?',
            mediaParts: [
                { partId: '11111111111111111111111111111111', order: 2, key: 'photo-one', mediaKey: 'photo-one', kind: 'image', url: 'https://media.test/one.jpg', caption: 'one', demoEvidence: true },
                { partId: '22222222222222222222222222222222', order: 3, key: 'photo-two', mediaKey: 'photo-two', kind: 'image', url: 'https://media.test/two.jpg', caption: 'two', demoEvidence: true },
            ],
        })
        mocks.callClaude.mockResolvedValue({ text: 'valid', usage: null, model: 'test' })
        mocks.parseAgentJson.mockReturnValue({
            malformed: false, messages: ['הספר המודפס עולה ₪950 כולל משלוח'], stage: 'engaged', handoff: false,
            image: null, eventType: null, callbackPromised: null, followUpAt: null,
        })

        const result = await post(inbound({ text: 'כמה עולה הספר?' }))

        expect(result.body).toMatchObject({
            sendImage: 'https://media.test/one.jpg',
            hasImage: true,
            openingMediaCount: 2,
            openingMediaParts: [
                expect.objectContaining({ key: 'photo-one', kind: 'image', order: 2 }),
                expect.objectContaining({ key: 'photo-two', kind: 'image', order: 3 }),
            ],
            postOpeningText: expect.stringContaining('לאיזה אירוע ומתי'),
        })
        expect(result.body.openingSequenceParts.map(part => part.kind)).toEqual(['text', 'image', 'image', 'text'])
        expect(result.body.openingSequenceParts.map(part => part.order)).toEqual([1, 2, 3, 4])
        expect(result.body.openingSequenceParts[0].text).toContain('₪950')
        expect(result.body.openingSequenceParts[3].text).toContain('/photo')
        expect(result.body.openingSequenceParts[3].text).toContain('לאיזה אירוע ומתי')
        expect(result.body).toMatchObject({
            openingAnswerId: result.body.openingSequenceParts[0].partId,
            openingAnswerText: result.body.openingSequenceParts[0].text,
            openingImage1Id: '11111111111111111111111111111111',
            openingImage1Url: 'https://media.test/one.jpg',
            openingImage2Id: '22222222222222222222222222222222',
            openingImage2Url: 'https://media.test/two.jpg',
            openingClosingId: result.body.openingSequenceParts[3].partId,
            openingClosingText: result.body.openingSequenceParts[3].text,
        })
        const serialized = JSON.stringify(result.body.openingSequenceParts)
        expect(serialized).not.toContain('test-phone-token')
        expect(new Set(result.body.openingSequenceParts.map(part => part.partId)).size).toBe(4)
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledWith(expect.objectContaining({
            outcome: expect.objectContaining({ openingSequenceParts: result.body.openingSequenceParts }),
            exchange: expect.objectContaining({
                parsed: expect.objectContaining({ openingMediaKeys: ['photo-one', 'photo-two'] }),
            }),
        }))
    })

    it('does not attach the configured opening sequence to an existing lead', async () => {
        prepareModelPath()
        mocks.readSalesSettings.mockResolvedValue({
            revision: 3, enabled: true, provider: 'anthropic', model: 'claude-sonnet-4-5',
            businessInstructions: '', activeOpeningIds: ['question_first'], openingMediaSequence: ['photo-one'],
        })
        mocks.mergeMedia.mockReturnValue({ 'photo-one': { kind: 'image', url: 'https://media.test/one.jpg', caption: 'one' } })
        mocks.callClaude.mockResolvedValue({ text: 'valid', usage: null, model: 'test' })
        mocks.parseAgentJson.mockReturnValue({
            malformed: false, messages: ['שלום'], stage: 'engaged', handoff: false,
            image: null, eventType: null, callbackPromised: null, followUpAt: null,
        })

        const result = await post(inbound({ text: 'שלום' }))
        expect(result.body.openingMediaCount).toBe(0)
        expect(result.body.openingMediaParts).toEqual([])
        expect(result.body.hasImage).toBe(false)
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

    it('persists deterministic fallback through the normal durable success path', async () => {
        prepareModelPath()
        mocks.callClaude.mockRejectedValue(Object.assign(new Error('anthropic timeout'), { providerStarted: true }))
        vi.spyOn(console, 'error').mockImplementation(() => {})

        const result = await post(inbound({ text: 'שלום' }))

        expect(result.body).toMatchObject({ sendText: deterministicFallback, handoff: false })
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledTimes(1)
        expect(mocks.recordMediaSent).not.toHaveBeenCalled()
        expect(mocks.compactLeadBestEffort).toHaveBeenCalledTimes(1)
    })

    it('returns an honest no-send 503 when deterministic exchange persistence fails', async () => {
        prepareModelPath()
        mocks.acquireProviderCircuit.mockResolvedValue({ allow: false, mode: 'open' })
        mocks.completeSuccessfulExchange.mockRejectedValue(new Error('persistence unavailable'))
        vi.spyOn(console, 'error').mockImplementation(() => {})

        const result = await post(inbound({ text: 'צריך מחיר' }))

        expect(result).toEqual({ status: 503, body: { error: 'success-commit-failed' } })
        expect(mocks.setHuman).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
    })

    it('returns an honest no-send 503 for a stale deterministic claim', async () => {
        prepareModelPath()
        mocks.acquireProviderCircuit.mockResolvedValue({ allow: false, mode: 'open' })
        mocks.completeSuccessfulExchange.mockResolvedValue({ action: 'stale' })

        const result = await post(inbound({ text: 'צריך מחיר' }))

        expect(result).toEqual({ status: 503, body: { error: 'success-commit-stale' } })
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

            // One warm line goes out (22.9: a customer's document got hours
            // of silence); the human still owns the conversation.
            expect(result.body).toMatchObject({ ok: true, hasImage: false, hasVideo: false, stage: 'handoff', handoff: true })
            expect(result.body.sendText).toMatch(/^קיבלתי/)
            expect(result.body.send).toEqual([result.body.sendText])
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

    // 21-27.9: seven variant-B leads were handed to a human "because the
    // customer sent a document" in the minute the opening's pricing sheet
    // went out. That was Meta echoing our own document. Nobody is handed
    // off over our own message, and the bot stays on the lead.
    it('stays quiet and keeps the bot on an echo of the media it just sent', async () => {
        mocks.isOwnMediaEcho.mockReturnValue(true)
        const result = await post(inbound({ text: '', messageType: 'document', mediaId: 'opaque-media-id' }))
        expect(result.status).toBe(200)
        expect(result.body).toMatchObject({ send: [], sendText: '', noReply: true, handoff: false, skipped: 'own-media-echo' })
        expect(mocks.setHuman).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
    })

    it('answers conflicting text once and keeps the duplicate delivery silent', async () => {
        prepareDecisionPath()
        const body = inbound({
            text: 'שלום! אפשר לקבל מידע נוסף על זה?',
            messageType: 'document',
            mediaId: '',
        })

        const first = await post(body)
        mocks.claimInboundEvent.mockResolvedValueOnce({
            action: 'cached',
            outcome: { sendText: first.body.sendText, handoff: false, stage: first.body.stage },
        })
        const duplicate = await post(body)

        expect(first.body).toMatchObject({
            sendText: 'model draft',
            send: ['model draft'],
            handoff: false,
        })
        expect(duplicate.body).toMatchObject({
            duplicate: true,
            shouldSend: false,
            sendText: '',
            handoff: false,
        })
        expect(mocks.callClaude).toHaveBeenCalledTimes(1)
        expect(mocks.setHuman).not.toHaveBeenCalled()
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

describe('real contextual policy at the transport boundary', () => {
    async function realPolicy() {
        prepareDecisionPath()
        const policy = await vi.importActual('@/lib/salesAgent/decisionPolicy')
        mocks.decideSalesTurn.mockImplementation(policy.decideSalesTurn)
        mocks.enforceSalesReply.mockImplementation(policy.enforceSalesReply)
        mocks.buildDeterministicSalesReply.mockImplementation(policy.buildDeterministicSalesReply)
    }

    it('persists a human-owned unanswered policy question and notifies the owner without checkout', async () => {
        await realPolicy()
        mocks.getLead.mockResolvedValue({ ...lead, eventType: 'bar_mitzvah', stage: 'offer_sent' })
        const result = await post(inbound({ text: 'אני רוצה להזמין אבל לפני כן מה מדיניות הביטול?' }))
        expect(result.status).toBe(200)
        expect(result.body).toMatchObject({ stage: 'handoff', handoff: true, hasImage: false })
        expect(result.body.sendText).not.toContain('checkout')
        expect(result.body.notifyOwner).toBeTruthy()
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledWith(expect.objectContaining({
            exchange: expect.objectContaining({ parsed: expect.objectContaining({ stage: 'handoff', handoff: true }) }),
        }))
        expect(mocks.sendInboundSequenceDirect).not.toHaveBeenCalled()
    })

    it('keeps two-book clarification after the route price guard adds a price list', async () => {
        await realPolicy()
        mocks.getLead.mockResolvedValue({ ...lead, eventType: 'bar_mitzvah', stage: 'offer_sent' })
        mocks.priceDodged.mockReturnValue(true)
        mocks.priceFallbackMessage.mockReturnValue('דיגיטלי 690 שח, מודפס 990 שח')
        const result = await post(inbound({ text: 'כמה יעלו שני ספרים' }))
        expect(result.status).toBe(200)
        expect(result.body.sendText).toContain('ספר נפרד לכל אירוע')
        expect(result.body.sendText).not.toMatch(/690|990|checkout/)
        expect(result.body.stage).toBe('offer_sent')
    })
})

describe('real opening runtime reaches the contextual reply policy', () => {
    async function realOpeningPath() {
        prepareDecisionPath()
        const runtime = await vi.importActual('@/lib/salesAgent/openingRuntime')
        const policy = await vi.importActual('@/lib/salesAgent/decisionPolicy')
        const plan = await vi.importActual('@/lib/salesAgent/openingPlan')
        const { DEFAULT_OPENING_EXPERIMENT } = await vi.importActual('@/lib/salesAgent/openingExperiment')
        mocks.prepareOpeningRuntime.mockImplementation(runtime.prepareOpeningRuntime)
        mocks.decideSalesTurn.mockImplementation(policy.decideSalesTurn)
        mocks.enforceSalesReply.mockImplementation(policy.enforceSalesReply)
        mocks.buildDeterministicSalesReply.mockImplementation(policy.buildDeterministicSalesReply)
        mocks.buildOpeningPlan.mockImplementation(plan.buildOpeningPlan)
        mocks.mergeMedia.mockReturnValue({
            cover_personalised: { kind: 'image', url: 'https://media.test/cover.jpg', caption: 'דוגמת כריכה' },
            book_open_spread: { kind: 'image', url: 'https://media.test/spread.jpg', caption: 'דוגמת עמודים' },
        })
        mocks.readSalesSettings.mockResolvedValue({
            enabled: true, mode: 'full_sales', provider: 'anthropic', model: 'claude-haiku-4-5',
            activeOpeningIds: ['answer_first'], openingMediaSequence: [],
            openingExperiment: { ...DEFAULT_OPENING_EXPERIMENT, enabled: true },
        })
        return DEFAULT_OPENING_EXPERIMENT
    }

    it('answers a first price question instead of running a published child-photo request', async () => {
        await realOpeningPath()
        mocks.getLead.mockResolvedValue({ ...lead, isNew: true, stage: 'new' })

        const result = await post(inbound({ text: 'כמה עולה ספר מודפס?' }))

        expect(result.status).toBe(200)
        expect(mocks.decideSalesTurn).toHaveBeenCalledWith(expect.objectContaining({ incomingText: 'כמה עולה ספר מודפס?' }))
        expect(mocks.callClaude).toHaveBeenCalledTimes(1)
        expect(mocks.buildSystemPrompt).toHaveBeenCalledWith(expect.objectContaining({
            openingNote: expect.stringContaining('תסריט הפתיחה לא נשלח'),
        }), expect.any(String), expect.any(Object))
        expect(result.body.sendText).toMatch(/690/)
        expect(result.body.sendText).toMatch(/990/)
        expect(JSON.stringify(result.body)).not.toMatch(/שלחי תמונה|תמונה של הבן|שם הילד|אכין.*דוגמה|checkout/)
        expect(result.body.openingExperiment).toBeUndefined()
        expect(mocks.completeSuccessfulExchange.mock.calls[0][0].exchange.openingRuntime).toBeUndefined()
        expect(mocks.loadOpeningVariableVersions).not.toHaveBeenCalled()
        expect(mocks.signOpeningVariableDownload).not.toHaveBeenCalled()
    })

    it('captures an event answer from pinned C without emitting its next photo-request block', async () => {
        const experiment = await realOpeningPath()
        const pinned = {
            ...lead, openingVariantId: 'C', openingVariantRevision: 1,
            openingFlow: experiment.variants.find(variant => variant.id === 'C'),
            openingState: { cursor: 1, waitingFor: 'event' }, openingStateVersion: 4,
            openingExposedAt: '2026-09-25T09:00:00.000Z',
        }
        mocks.getLead.mockResolvedValue(pinned)

        const result = await post(inbound({ text: 'בר מצווה בדצמבר' }))

        expect(result.status).toBe(200)
        expect(mocks.decideSalesTurn).toHaveBeenCalledTimes(1)
        expect(mocks.callClaude).toHaveBeenCalledTimes(1)
        expect(JSON.stringify(result.body)).not.toMatch(/שלחי תמונה|תמונה של הבן|שם הילד|אכין.*דוגמה/)
        expect(result.body.openingExperiment).toBeUndefined()
        const saved = mocks.completeSuccessfulExchange.mock.calls[0][0].exchange
        expect(saved.parsed.eventType).toBe('bar_mitzvah')
        expect(saved.openingRuntime).toBeUndefined()
        expect(pinned.openingState).toEqual({ cursor: 1, waitingFor: 'event' })
    })

    it('keeps a human-paused lead silent before either real runtime or model can run', async () => {
        const experiment = await realOpeningPath()
        mocks.getLead.mockResolvedValue({
            ...lead, human: true, stage: 'handoff', openingVariantId: 'C',
            openingFlow: experiment.variants.find(variant => variant.id === 'C'),
            openingState: { cursor: 1, waitingFor: 'event' },
        })
        mocks.isPausedForHuman.mockReturnValue(true)

        const result = await post(inbound({ text: 'בר מצווה, כמה עולה?' }))

        expect(result.status).toBe(200)
        expect(result.body).toMatchObject({ paused: true, noReply: true, send: [] })
        expect(mocks.prepareOpeningRuntime).not.toHaveBeenCalled()
        expect(mocks.decideSalesTurn).not.toHaveBeenCalled()
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expect(mocks.completeSuccessfulExchange).not.toHaveBeenCalled()
    })

    it('routes a new attachment to human review without enrolling it into a photo-request script', async () => {
        await realOpeningPath()
        mocks.getLead.mockResolvedValue({ ...lead, isNew: true, stage: 'new' })
        const result = await post(inbound({ messageType: 'image', mediaId: 'new-image' }))
        expect(result.status).toBe(200)
        expect(result.body).toMatchObject({ handoff: true, noReply: false })
        expect(mocks.setHuman).toHaveBeenCalledTimes(1)
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expect(mocks.completeSuccessfulExchange).not.toHaveBeenCalled()
    })

    it.each([
        ['negative exit', 'לא תודה', 'closed_lost'],
        ['unverified policy', 'מה מדיניות הביטול?', 'handoff'],
        ['customer timing', 'לא עכשיו, אחזור אליכם', 'commit_later'],
        ['package clarification', 'אני רוצה להזמין', 'engaged'],
        ['two-book scope', 'כמה יעלו שני ספרים', 'engaged'],
        ['question before checkout', 'רוצה להזמין אבל מתי הספר מגיע?', 'engaged'],
    ])('does not append an opening bundle after a first-message %s', async (_label, text, stage) => {
        await realOpeningPath()
        mocks.getLead.mockResolvedValue({ ...lead, isNew: true, stage: 'engaged' })

        const result = await post(inbound({ text }))

        expect(result.status).toBe(200)
        expect(result.body.stage).toBe(stage)
        expect(result.body.openingSequenceParts).toEqual([])
        expect(result.body.openingMediaParts).toEqual([])
        expect(result.body.openingMediaCount).toBe(0)
        expect(result.body.postOpeningText).toBe('')
        expect(result.body.sendText).not.toContain('/photo')
        expect(mocks.buildOpeningPlan).not.toHaveBeenCalled()
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledTimes(1)
    })

    it('does not repeat event or date facts captured in the current first message', async () => {
        await realOpeningPath()
        mocks.getLead.mockResolvedValue({ ...lead, isNew: true, stage: 'new' })
        mocks.parseAgentJson.mockReturnValue({
            malformed: false, messages: ['תשובה'], stage: 'engaged', handoff: false,
            image: null, eventType: 'bar_mitzvah', eventDate: '2026-12-15', callbackPromised: null, followUpAt: null,
        })

        const result = await post(inbound({ text: 'בר מצווה ב-15/12/2026, כמה עולה?' }))

        expect(result.status).toBe(200)
        expect(mocks.buildOpeningPlan).toHaveBeenCalledWith(expect.objectContaining({
            lead: expect.objectContaining({ eventType: 'bar_mitzvah', eventDate: '2026-12-15' }),
        }))
        expect(result.body.postOpeningText).toContain('/photo')
        expect(result.body.postOpeningText).not.toMatch(/לאיזה אירוע|מתי האירוע|מתי הוא מתקיים/)
        expect(result.body.openingSequenceParts.map(part => part.kind)).toEqual(['text', 'image', 'image', 'text'])
        expect(result.body.openingSequenceParts.map(part => part.order)).toEqual([1, 2, 3, 4])
    })

    it('does not append evidence when the model hands an otherwise general inquiry to a human', async () => {
        await realOpeningPath()
        mocks.getLead.mockResolvedValue({ ...lead, isNew: true, stage: 'new' })
        mocks.parseAgentJson.mockReturnValue({
            malformed: false, messages: ['נדרשת בדיקה של הצוות.'], stage: 'handoff', handoff: true,
            handoffReason: 'מידע שאינו מופיע בקטלוג', image: null, eventType: null, callbackPromised: null, followUpAt: null,
        })

        const result = await post(inbound({ text: 'האם אפשר לקבל אישור נגישות?' }))

        expect(result.status).toBe(200)
        expect(result.body.handoff).toBe(true)
        expect(result.body.openingSequenceParts).toEqual([])
        expect(result.body.postOpeningText).toBe('')
        expect(mocks.buildOpeningPlan).not.toHaveBeenCalled()
    })

    it('continues a previously promised manual photo handoff through the real runtime', async () => {
        await realOpeningPath()
        mocks.getLead.mockResolvedValue({
            ...lead, openingVariantId: 'A', openingVariantRevision: 1,
            openingFlow: {
                id: 'A', label: 'previous manual promise', revision: 1,
                blocks: [
                    { id: 'photo', type: 'ask_photo', text: 'שלחו תמונה לדוגמה' },
                    { id: 'received', type: 'text', text: 'התמונה התקבלה, הצוות ימשיך כאן בשיחה.' },
                    { id: 'stop', type: 'stop' },
                ],
            },
            openingState: { cursor: 1, waitingFor: 'photo' }, openingStateVersion: 2,
        })

        const result = await post(inbound({ messageType: 'image', mediaId: 'promised-photo' }))

        expect(result.status).toBe(200)
        expect(result.body).toMatchObject({
            stage: 'handoff', handoff: true, followUpAt: null,
            sendText: 'התמונה התקבלה, הצוות ימשיך כאן בשיחה.',
        })
        expect(result.body.notifyOwner).toBeTruthy()
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expect(mocks.loadOpeningVariableVersions).toHaveBeenCalledTimes(1)
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledWith(expect.objectContaining({
            exchange: expect.objectContaining({
                openingRuntime: expect.objectContaining({
                    expectedStateVersion: 2, enrollment: null, completed: true,
                    captures: expect.objectContaining({ childPhotoReceived: true, childPhotoMediaId: 'promised-photo' }),
                }),
            }),
        }))
    })
})


describe('opt-in conversational specification through the real reply boundary', () => {
    beforeEach(async () => {
        process.env.SALES_CONVERSATIONAL_POLICY_ENABLED = 'true'
        vi.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW)
        prepareDecisionPath()
        const policy = await vi.importActual('@/lib/salesAgent/decisionPolicy')
        mocks.decideSalesTurn.mockImplementation(policy.decideSalesTurn)
        mocks.claimInboundEvent.mockResolvedValue({ action: 'process', claimToken: 'claim-token', claimGeneration: 1, conversationRevision: 4 })
        mocks.getLead.mockResolvedValue({ ...lead, conversationRevision: 4, automationDisclosed: false })
    })
    const prepared = () => mocks.completeSuccessfulExchange.mock.calls.at(-1)?.[0]
    const text = () => prepared()?.outcome?.sendText || ''

    it('answers price directly from approved offers, discloses automation, and disables legacy model/script sends', async () => {
        const result = await post(inbound({ text: 'כמה עולה?' }))
        expect(result.status).toBe(200)
        expect(text()).toContain('690')
        expect(text()).toContain('990')
        expect(text()).toContain('העוזרת האוטומטית')
        expect(prepared().exchange.conversationContract.offerSnapshots).toHaveProperty('printed')
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expect(mocks.prepareOpeningRuntime).not.toHaveBeenCalled()
        expect(mocks.buildOpeningPlan).not.toHaveBeenCalled()
        expect(result.body).toMatchObject({ shouldSend: false, sendText: '', directDelivery: { status: 'accepted' } })
        expect(mocks.sendInboundSequenceDirect.mock.calls[0][0].validateBeforePart).toBeTypeOf('function')
        await mocks.sendInboundSequenceDirect.mock.calls[0][0].validateBeforePart()
        expect(mocks.validateInboundBeforeSend).toHaveBeenCalledWith({ phone: 'test-phone-token', eventId: 'event-token' })
    })
    it('preserves supplied event/month and asks only the missing package when buying', async () => {
        await post(inbound({ text: 'חתונה בדצמבר, רוצה להזמין' }))
        expect(prepared().exchange.parsed.eventType).toBe('wedding')
        expect(prepared().exchange.conversationContract.eventDateText).toContain('דצמבר')
        expect(text()).not.toContain('לאיזה אירוע')
        expect(text()).toContain('דיגיטלי או מודפס')
        expect(mocks.readVerifiedCheckout).not.toHaveBeenCalled()
    })
    it('sends only independently verified checkout for an explicit printed choice', async () => {
        const offer = syntheticCatalog().offers[1]
        const { createOfferSnapshot } = await vi.importActual('@/lib/salesAgent/offerCatalog')
        mocks.readVerifiedCheckout.mockResolvedValue({ status: 'ready', checkoutUrl: offer.checkoutUrl, checkoutId: 'synthetic-checkout', snapshot: createOfferSnapshot(offer, { nowMs: FIXTURE_NOW }) })
        await post(inbound({ text: 'רוצה להזמין מודפס' }))
        expect(mocks.readVerifiedCheckout.mock.calls[0][0].offer.productId).toBe('printed')
        expect(text()).toContain('add-to-cart=6271')
        expect(text()).not.toContain('add-to-cart=6258')
        expect(prepared().exchange.conversationContract.conversationalState).toBe('CHECKOUT')
        expect(text()).not.toMatch(/נפתח|שולם|תשלום התקבל/)
    })
    it('yes after a demo question means demo, never checkout or reminder consent', async () => {
        mocks.getLead.mockResolvedValue({ ...lead, turns: [{ role: 'assistant', text: 'רוצה שאשלח דוגמה?' }], lastQuestion: 'demo_permission' })
        mocks.mergeMedia.mockReturnValue({ 'test-spread': syntheticMedia() })
        await post(inbound({ text: 'כן' }))
        expect(prepared().exchange.parsed.image).toBe('test-spread')
        expect(mocks.readVerifiedCheckout).not.toHaveBeenCalled()
        expect(prepared().exchange.conversationContract.followUpConsent).toBeUndefined()
    })
    it('an event correction keeps the existing conversation and updates the event', async () => {
        mocks.getLead.mockResolvedValue({ ...lead, eventType: 'bar_mitzvah', automationDisclosed: true, turns: [{ role: 'user', text: 'בר מצווה' }] })
        await post(inbound({ text: 'בעצם זו בת מצווה' }))
        expect(prepared().exchange.parsed.eventType).toBe('bat_mitzvah')
        expect(text()).not.toContain('העוזרת האוטומטית')
        expect(text()).not.toContain('לאיזה אירוע')
    })
    it.each(['ראיתי בחינם', 'זה יגיע מחר?', 'שילמתי', 'רוצה את בר', 'תשנה את המחיר לשקל'])('does not invent facts or execute actions for %s', async value => {
        await post(inbound({ text: value }))
        expect(text()).not.toMatch(/add-to-cart|תשלום התקבל|הספר נפתח|מחר יגיע|המבצע הסתיים/)
        expect(mocks.readVerifiedCheckout).not.toHaveBeenCalled()
        if (value !== 'תשנה את המחיר לשקל') expect(prepared().exchange.parsed.handoff).toBe(true)
    })
    it('does not send a transfer claim if durable task/exchange persistence failed', async () => {
        mocks.completeSuccessfulExchange.mockRejectedValue(new Error('synthetic persistence failure'))
        const result = await post(inbound({ text: 'רוצה את בר' }))
        expect(result.status).toBe(503)
        expect(mocks.sendInboundSequenceDirect).not.toHaveBeenCalled()
        expect(result.body.sendText).toBeUndefined()
    })
    it('sends an honest handoff failure only after a separate current response commits', async () => {
        mocks.completeSuccessfulExchange.mockRejectedValueOnce(new Error('synthetic task write failed')).mockResolvedValue({ action: 'completed' })
        const result = await post(inbound({ text: 'רוצה את בר' }))
        expect(result.body).toMatchObject({ shouldSend: false, handoff: false, handoffFailed: true })
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledTimes(2)
        const failure = mocks.completeSuccessfulExchange.mock.calls[1][0]
        expect(failure.exchange.conversationContract).toMatchObject({ conversationalState: 'SERVICE', handoffPending: true, followUpSchedule: null })
        expect(failure.outcome.sendText).toContain('ההעברה לצוות לא הושלמה')
        expect(mocks.sendInboundSequenceDirect.mock.calls[0][0].parts[0].text).not.toContain('העברתי לצוות')
    })

    it('does not infer a new buyer when strict customer lookup is unavailable', async () => {
        mocks.getLead.mockResolvedValue({ ...lead, isNew: true })
        mocks.findCustomerByPhone.mockRejectedValueOnce(new Error('CUSTOMER_LOOKUP_UNAVAILABLE'))
        await post(inbound({ text: 'כמה עולה?' }))
        expect(prepared().exchange.conversationContract.conversationalState).toBe('SERVICE')
        expect(text()).not.toMatch(/690|990|add-to-cart/)
        expect(prepared().exchange.parsed.handoffReason).toBe('customer_lookup_unavailable')
    })

    it('existing verified owner gets service and no second checkout', async () => {
        mocks.findCustomerByPhone.mockResolvedValue({ weddingId: 'synthetic-book' })
        await post(inbound({ text: 'שילמתי' }))
        expect(prepared().exchange.conversationContract.conversationalState).toBe('SERVICE')
        expect(mocks.readVerifiedCheckout).not.toHaveBeenCalled()
    })
    it('stop while paused persists suppression before any acknowledgment', async () => {
        mocks.isPausedForHuman.mockReturnValue(true)
        await post(inbound({ text: 'תפסיקו לשלוח' }))
        expect(prepared().exchange.conversationContract).toMatchObject({ marketingSuppressed: true, followUpConsent: null, followUpSchedule: null, conversationalState: 'STOPPED' })
        expect(prepared().outcome.followUpAt).toBeNull()
    })
    it('memorial response has neither congratulations nor festive emoji', async () => {
        await post(inbound({ text: 'ספר הנצחה' }))
        expect(text()).not.toMatch(/מזל טוב|🎉|💍|🥳/)
        expect(prepared().exchange.parsed.eventType).toBe('memorial')
    })
    it('waits for renewed decision after an offer change', async () => {
        mocks.readVerifiedCheckout.mockResolvedValue({ status: 'reconfirm_required', snapshot: { productId: 'printed', version: 'changed' } })
        await post(inbound({ text: 'רוצה להזמין מודפס' }))
        expect(text()).toContain('פרטי ההצעה השתנו')
        expect(text()).not.toContain('add-to-cart')
        expect(prepared().exchange.conversationContract.lastQuestion).toBe('offer_change_confirmation')
    })
    it('no approved catalog produces human review, never the legacy price fallback', async () => {
        mocks.readActiveOfferCatalog.mockResolvedValue({ ok: false, offers: [], reason: 'catalog_missing' })
        await post(inbound({ text: 'כמה עולה?' }))
        expect(text()).not.toMatch(/690|990/)
        expect(prepared().exchange.parsed.handoff).toBe(true)
        expect(mocks.priceFallbackMessage).not.toHaveBeenCalled()
    })
    it.each(['', '2099-10-05T12:00:00Z', '2026-10-03T12:00:00Z'])('does not reset the service window for unknown/future/stale customer time %s', async occurredAt => {
        const result = await post(inbound({ text: 'כמה עולה?', occurredAt }))
        expect(result.body.shouldSend).toBe(false)
        expect(mocks.claimInboundEvent.mock.calls[0][0].outgoing).toBe(true)
        expect(mocks.getLead).not.toHaveBeenCalled()
        expect(mocks.sendInboundSequenceDirect).not.toHaveBeenCalled()
    })

    it.each(['', '2026-10-03T12:00:00Z'])('honors delayed or un-timestamped STOP without reopening the service window or sending an acknowledgment', async occurredAt => {
        const result = await post(inbound({ text: 'תפסיקו לשלוח', occurredAt }))
        expect(mocks.suppressMarketingFromInbound).toHaveBeenCalledWith({ phone: 'test-phone-token', eventId: 'event-token', claimToken: 'claim-token' })
        expect(result.body).toMatchObject({ shouldSend: false, skipped: 'marketing-suppressed-no-ack' })
        expect(mocks.sendInboundSequenceDirect).not.toHaveBeenCalled()
    })

    it('never downgrades a strict conversation to legacy sales when the rollout flag is removed', async () => {
        delete process.env.SALES_CONVERSATIONAL_POLICY_ENABLED
        mocks.getLead.mockResolvedValue({ ...lead, conversationalPolicyVersion: '2026-10-05.v1' })
        const result = await post(inbound({ text: 'כמה עולה?' }))
        expect(result.body).toMatchObject({ shouldSend: false, skipped: 'strict-policy-disabled' })
        expect(mocks.callClaude).not.toHaveBeenCalled()
        expect(mocks.completeSuccessfulExchange).not.toHaveBeenCalled()
    })

    it('will not use the unverified Make send path in strict mode', async () => {
        mocks.canSendWhatsApp.mockReturnValue(false)
        const result = await post(inbound({ text: 'כמה עולה?' }))
        expect(result.status).toBe(503)
        expect(result.body.shouldSend).toBe(false)
        expect(mocks.completeSuccessfulExchange).not.toHaveBeenCalled()
    })
    it('does not send an obsolete or human-superseded prepared response', async () => {
        mocks.completeSuccessfulExchange.mockResolvedValue({ action: 'human-paused' })
        const result = await post(inbound({ text: 'כמה עולה?' }))
        expect(result.body.shouldSend).toBe(false)
        expect(mocks.sendInboundSequenceDirect).not.toHaveBeenCalled()
    })
})
