import {
    assignOpeningVariant,
    normalizeOpeningExperiment,
    runOpeningFlow,
} from './openingExperiment'
import { normalizeSalesVariableVersion, renderSalesTemplate } from './salesVariables'

function pinnedFlow(lead) {
    const flow = lead?.openingFlow
    if (!flow || !Array.isArray(flow.blocks) || !flow.blocks.length) return null
    return {
        id: String(flow.id || lead.openingVariantId || ''),
        label: String(flow.label || ''),
        revision: Number(flow.revision || lead.openingVariantRevision || 0),
        blocks: flow.blocks.map(block => ({ ...block })),
    }
}

const boundKeys = experiment => [...new Set((Array.isArray(experiment?.variants) ? experiment.variants : [])
    .flatMap(variant => Array.isArray(variant?.blocks) ? variant.blocks : [])
    .map(block => String(block?.variableKey || ''))
    .filter(Boolean))]

function normalizedVariableLibrary(variableVersions, leadContext) {
    const library = {}
    for (const [identity, raw] of Object.entries(variableVersions || {})) {
        const version = normalizeSalesVariableVersion(raw)
        if (version.status !== 'published') throw new Error('OPENING_VARIABLE_UNPUBLISHED')
        library[identity] = version.kind === 'text'
            ? { ...version, resolveText: () => renderSalesTemplate(version.value, leadContext) }
            : version
    }
    return library
}

export async function resolveOpeningSnapshotParts({
    flow,
    state = { cursor: 0, waitingFor: null },
    inbound = null,
    variableVersions = {},
    leadContext = {},
    eventId = '',
    signDownload = null,
    legacyLibrary = {},
} = {}) {
    const library = { ...legacyLibrary, ...normalizedVariableLibrary(variableVersions, leadContext) }
    const result = runOpeningFlow({ flow, state, inbound, library, eventId })
    const parts = await Promise.all(result.parts.map(async part => {
        if (!part.variableKey || part.kind === 'text') return part
        const version = library[`${part.variableKey}:${part.variableVersionId}`]
        if (!version) throw new Error('OPENING_VARIABLE_VERSION_MISSING')
        if (version.kind !== part.kind) throw new Error('OPENING_VARIABLE_KIND_MISMATCH')
        if (typeof signDownload !== 'function') throw new Error('OPENING_VARIABLE_SIGNER_MISSING')
        const url = await signDownload(version)
        if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error('OPENING_VARIABLE_SIGNING_FAILED')
        const { objectPath: _privatePath, ...safePart } = part
        return { ...safePart, url }
    }))
    return { ...result, parts }
}

export async function prepareOpeningRuntime({
    lead = {},
    experiment,
    leadKey,
    inbound,
    library = {},
    variableVersions = {},
    leadContext = {},
    signDownload = null,
    eventId,
    yieldWhenSilent = false,
} = {}) {
    let normalized
    try {
        normalized = normalizeOpeningExperiment(experiment, {
            registeredMedia: Object.keys(library),
            registeredVariables: boundKeys(experiment),
        })
    } catch {
        return { eligible: false, reason: 'invalid-experiment' }
    }
    if (!normalized.enabled) return { eligible: false, reason: 'experiment-stopped' }

    let flow = pinnedFlow(lead)
    let enrollment = null
    if (flow) {
        const executable = normalized.variants.find(item => item.id === lead.openingVariantId)
        if (executable && !executable.enabled) return { eligible: false, reason: 'variant-stopped' }
    } else {
        if (lead?.isNew !== true || lead?.hasPriorConversation === true) {
            return { eligible: false, reason: 'not-enrolled' }
        }
    }

    const expectedStateVersion = Number.isInteger(lead?.openingStateVersion)
        ? lead.openingStateVersion
        : 0
    const replyToExposure = !!lead?.openingExposedAt && !lead?.openingFirstReplyAt

    // Full-sales text belongs to the contextual reply path, even when an
    // older published/pinned script has something to send. Waiting for an
    // event used to consume "בר מצווה, כמה עולה?" and emit a child-photo
    // request before the decision policy ever saw the question. Checking
    // only for silence cannot protect that path (or variable-backed copy).
    // Do not execute or enroll a replacement script, and do not advance
    // existing state: a photo/owner approval for a previously promised
    // design must still resume its original flow. The route's existing
    // human/customer guards run before this, and opening_only opts out.
    if (yieldWhenSilent && inbound?.kind === 'text') {
        const state = { ...(lead?.openingState || { cursor: 0, waitingFor: null }) }
        const completed = !!flow && !state.waitingFor && state.cursor >= flow.blocks.length
        const action = completed ? 'completed'
            : state.waitingFor === 'photo' ? 'wait_photo'
                : state.waitingFor === 'event' ? 'wait_event'
                    : state.waitingFor === 'approval' ? 'approval_pending' : 'contextual_reply'
        const reason = !flow ? 'opening-question-first'
            : completed ? 'opening-finished'
                : state.waitingFor ? `opening-${action}-yielded` : 'opening-contextual-turn'
        return {
            eligible: false, reason, flow, expectedStateVersion, replyToExposure,
            result: { action, state, parts: [], captures: {}, approvalRequest: null, completed },
        }
    }
    if (yieldWhenSilent && !flow) {
        // An unsolicited attachment on a new conversation needs the
        // route's ordinary human review, not a cold scripted photo ask.
        return { eligible: false, reason: 'opening-customer-media' }
    }

    if (!flow) {
        const assignment = assignOpeningVariant({
            leadKey,
            experiment: normalized,
            registeredMedia: Object.keys(library),
            registeredVariables: boundKeys(normalized),
        })
        const selected = normalized.variants.find(item => item.id === assignment.variantId)
        if (!selected) return { eligible: false, reason: 'variant-unavailable' }
        flow = {
            id: selected.id,
            label: selected.label,
            revision: selected.revision,
            blocks: selected.blocks.map(block => ({ ...block })),
        }
        enrollment = { ...assignment, flow }
    }

    const result = await resolveOpeningSnapshotParts({
        flow,
        state: lead?.openingState || { cursor: 0, waitingFor: null },
        inbound,
        legacyLibrary: library,
        variableVersions,
        leadContext,
        signDownload,
        eventId,
    })
    // A photo or document AFTER the opening finished advances nothing
    // either - the flow is past its stop block - and until 19.9 it was
    // swallowed the same way (Sharona, 19.9: opening, then a document,
    // then nothing). Yielded, it reaches the route's media branch, which
    // hands the chat to a human and pings the owner.
    const silentMediaAfterStop = inbound?.kind !== 'text'
        && result.completed
        && result.parts.length === 0
        && !result.approvalRequest
    if (yieldWhenSilent && silentMediaAfterStop && enrollment === null) {
        const reason = result.completed ? 'opening-finished' : `opening-${result.action}-yielded`
        return { eligible: false, reason, flow, expectedStateVersion, replyToExposure, result }
    }
    return { eligible: true, flow, enrollment, expectedStateVersion, replyToExposure, result }
}

// One line for the system prompt when the opening yielded the turn. The
// agent otherwise greets a lead who was greeted an hour ago, or asks for
// the photo the opening already asked for. Pure; see the runtime tests.
export function openingNoteFor(runtime, lead = {}) {
    if (!runtime || runtime.eligible || !String(runtime.reason || '').startsWith('opening-')) return null
    const answerFirst = 'ענה קודם על מה שהלקוח שאל. אין לבקש שם או תמונה של ילד/ה או להציע דוגמה אישית ביוזמתך. אפשר להשתמש בדמו ובמדיה הקיימים בלי לטעון שהם צילום של מוצר אמיתי או של לקוח ללא אימות.'
    if (runtime.reason === 'opening-question-first') {
        return `תסריט הפתיחה לא נשלח ולא הובטחה דוגמה אישית. ${answerFirst}`
    }
    // Only quote already-traversed literal text blocks. Later blocks in
    // a pinned script may contain a promise that was never made. Treat
    // recorded copy as conversation context, never verified product facts.
    const cursor = Number.isInteger(lead?.openingState?.cursor) ? lead.openingState.cursor : 0
    const said = (Array.isArray(runtime.flow?.blocks) ? runtime.flow.blocks : [])
        .slice(0, cursor)
        .filter(block => block.type === 'text' && String(block.text || '').trim())
        .map(block => String(block.text).replace(/\s+/g, ' ').trim())
        .join(' | ')
        .slice(0, 420)
    const quoted = said ? ` טקסט פתיחה קודם שתועד, לא מקור לעובדות מוצר או להבטחות חדשות: «${said}».` : ''
    if (runtime.reason === 'opening-wait_photo-yielded') {
        return `הפתיחה הישנה כבר ביקשה תמונה לצורך דוגמה אישית, והלקוח ענה במילים במקום.${quoted} לא לחזור על הבקשה ולא להבטיח מועד או לטעון שהדוגמה מוכנה. ${answerFirst}`
    }
    if (runtime.reason === 'opening-wait_event-yielded') {
        return `הפתיחה הקודמת שאלה על האירוע. אל תניח שהתשובה עמומה ואל תשאל שוב פרט שהלקוח כבר נתן.${quoted} ${answerFirst}`
    }
    if (runtime.reason === 'opening-approval_pending-yielded' || lead?.openingApprovalRequest?.status === 'pending') {
        return `דוגמה אישית שכבר הובטחה עדיין ממתינה לאישור אנושי. אין לטעון שהיא מוכנה, נשלחה או תגיע במועד מסוים, ואין לבקש שוב פרטים.${quoted} ${answerFirst}`
    }
    if (lead?.childPhotoReceived === true) {
        return `כבר התקבלה תמונה בשיחה; אין בכך הוכחה שדוגמה הוכנה או נשלחה.${quoted} אל תציג את המוצר מחדש ואל תבטיח מועד לדוגמה. ${answerFirst}`
    }
    return `לשיחה יש תסריט פתיחה קודם; אל תתחיל אותו מחדש.${quoted} אל תציג את המוצר מחדש ואל תברך שוב לשלום. ${answerFirst}`
}

const openingRuntime = { prepareOpeningRuntime, resolveOpeningSnapshotParts, openingNoteFor }

export default openingRuntime
