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

    const expectedStateVersion = Number.isInteger(lead?.openingStateVersion)
        ? lead.openingStateVersion
        : 0
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
    const replyToExposure = !!lead?.openingExposedAt && !lead?.openingFirstReplyAt

    // The opening is a script, and a script has two silent outcomes: it
    // has already run to its stop block, or it is waiting for a photo /
    // an event date and the customer sent words instead. Until 18.9 both
    // ended the request with an empty parts list, which the route turned
    // into no reply at all. Every enrolled lead who asked a question after
    // the opening got silence (Shay Cohen, 17.9: two questions, nothing).
    // In full-sales mode the opening now yields those turns to the sales
    // agent. The opening state is left untouched, so a photo that arrives
    // later still resumes the design flow exactly where it waited.
    // Only a text turn is yielded. A photo, an owner approval or a media
    // message that produced no parts still advanced the state machine and
    // must be committed by the opening branch, not handed to the agent.
    const silentTextTurn = inbound?.kind === 'text'
        && result.parts.length === 0
        && !result.approvalRequest
        && (result.completed || result.action === 'wait_photo' || result.action === 'wait_event')
    if (yieldWhenSilent && silentTextTurn && enrollment === null) {
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
    const said = (Array.isArray(runtime.flow?.blocks) ? runtime.flow.blocks : [])
        .filter(block => block.type === 'text' && String(block.text || '').trim())
        .map(block => String(block.text).replace(/\s+/g, ' ').trim())
        .join(' | ')
        .slice(0, 420)
    const quoted = said ? ` מה שכבר נאמר לו בפתיחה: «${said}».` : ''
    if (runtime.reason === 'opening-wait_photo-yielded') {
        return `הפתיחה האוטומטית ביקשה מהלקוח תמונה של הילד/ה כדי להכין דוגמה אישית, והוא ענה במילים במקום.${quoted} ענה לעניין על מה שכתב; את הדוגמה אפשר להזכיר בעדינות פעם אחת, לא לחזור על הבקשה.`
    }
    if (runtime.reason === 'opening-wait_event-yielded') {
        return `הפתיחה האוטומטית שאלה על סוג האירוע והתאריך, והתשובה לא הייתה חד-משמעית.${quoted} ענה לעניין, ואם זה טבעי ברר את התאריך בשאלה אחת פשוטה.`
    }
    if (lead?.childPhotoReceived === true) {
        return `הפתיחה האוטומטית כבר הוצגה, והלקוח שלח תמונה שבן אדם מכין ממנה דוגמה.${quoted} אל תציג את המוצר מחדש ואל תבטיח מועד לדוגמה; ענה לעניין.`
    }
    return `הפתיחה האוטומטית כבר נשלחה ללקוח.${quoted} אל תציג את המוצר מחדש ואל תברך שוב לשלום; המשך את השיחה מהנקודה הזו.`
}

const openingRuntime = { prepareOpeningRuntime, resolveOpeningSnapshotParts, openingNoteFor }

export default openingRuntime
