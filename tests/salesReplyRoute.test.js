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
vi.mock('@/lib/salesAgent/experiments', () => ({
    ACTIVE_VARIANT_IDS: ['question_first', 'price_upfront', 'demo_first'],
    assignVariant: mocks.assignVariant,
    summarizeExperiments: mocks.summarizeExperiments,
    summarizeGaps: mocks.summarizeGaps,
}))
vi.mock('@/lib/salesAgent/leadsView', () => ({ deriveLead: mocks.deriveLead, sortLeads: mocks.sortLeads, isoInIsrael: mocks.isoInIsrael }))
vi.mock('@/lib/salesAgent/digest', () => ({ buildDigest: mocks.buildDigest }))
vi.mock('@/lib/salesAgent/settingsStore', () => ({ readSalesSettings: mocks.readSalesSettings }))
vi.mock('@/lib/salesAgent/decisionPolicy', () => ({
    decideSalesTurn: mocks.decideSalesTurn,
    enforceSalesReply: mocks.enforceSalesReply,
    buildDeterministicSalesReply: mocks.buildDeterministicSalesReply,
}))
vi.mock('@/lib/salesAgent/openingPlan', () => ({ buildOpeningPlan: mocks.buildOpeningPlan }))
vi.mock('@/lib/salesAgent/openingOnly', () => ({ buildOpeningOnlyPlan: mocks.buildOpeningOnlyPlan }))
vi.mock('@/lib/salesAgent/openingRuntime', () => ({ prepareOpeningRuntime: mocks.prepareOpeningRuntime }))
vi.mock('@/lib/salesAgent/openingVariableRuntimeStore', () => ({
    loadOpeningVariableVersions: mocks.loadOpeningVariableVersions,
    signOpeningVariableDownload: mocks.signOpeningVariableDownload,
}))
vi.mock('@/lib/salesAgent/priorContext', () => ({ readPriorConversationContext: mocks.readPriorConversationContext }))

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
    mocks.recordMediaSent.mockResolvedValue(undefined)
    mocks.getLead.mockResolvedValue(lead)
    mocks.readSalesSettings.mockResolvedValue({
        revision: 1, enabled: true, provider: 'anthropic', model: 'claude-haiku-4-5',
        fallbackModel: 'claude-haiku-4-5', businessInstructions: 'תשאל שאלה אחת',
        activeOpeningIds: ['question_first'], openingMediaSequence: [],
    })
    mocks.setHuman.mockResolvedValue(undefined)
    mocks.findCustomerByPhone.mockResolvedValue(null)
    mocks.isPausedForHuman.mockReturnValue(false)
    mocks.isOwnEcho.mockReturnValue(false)
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
    ;({ POST } = await import('@/app/api/sales-agent/reply/route'))
})

describe('deterministic opening experiment runtime', () => {
    it('persists and returns an ordered published journey without model work', async () => {
        const parts = [
            { partId: 'a'.repeat(32), blockId: 'a-explain', order: 1, kind: 'text', text: 'כך הספר עובד' },
            { partId: 'b'.repeat(32), blockId: 'a-photo', order: 2, kind: 'text', text: 'שלחי תמונה של הבן שלך' },
        ]
        mocks.getLead.mockResolvedValue({ ...lead, isNew: true, stage: 'new' })
        mocks.readSalesSettings.mockResolvedValue({
            revision: 8, enabled: true, mode: 'opening_only', openingText: 'legacy',
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
            openingSequenceParts: parts,
            openingExperiment: { variantId: 'A', variantRevision: 3, action: 'wait_photo' },
        })
        expect(mocks.completeSuccessfulExchange).toHaveBeenCalledWith(expect.objectContaining({
            exchange: expect.objectContaining({
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
            lead: expect.objectContaining({ eventType: 'bar_mitzvah' }), incomingText: text, isExistingCustomer: false, pausedForHuman: false,
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
        expect(mocks.recordProviderFailure).toHaveBeenCalledWith(code, null, expect.any(Number))
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

        expect(first.body).toMatchObject({ sendText: deterministicFallback, handoff: false })
        expect(mocks.recordProviderFailure).toHaveBeenCalledTimes(1)
        expect(mocks.recordProviderFailure).toHaveBeenCalledWith('invalid_json', null, expect.any(Number))
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
        expect(mocks.recordProviderFailure).toHaveBeenCalledWith('timeout', null, expect.any(Number))
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
        expect(mocks.releaseProviderProbe).toHaveBeenCalledWith('probe-token', expect.any(Number))
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
        expect(mocks.releaseProviderProbe).toHaveBeenCalledWith('missing-key-probe', expect.any(Number))
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
