import {
    assignOpeningVariant,
    normalizeOpeningExperiment,
    runOpeningFlow,
} from './openingExperiment'

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

export function prepareOpeningRuntime({ lead = {}, experiment, leadKey, inbound, library = {}, eventId } = {}) {
    let normalized
    try {
        normalized = normalizeOpeningExperiment(experiment, { registeredMedia: Object.keys(library) })
    } catch {
        return { eligible: false, reason: 'invalid-experiment' }
    }
    if (!normalized.enabled) return { eligible: false, reason: 'experiment-stopped' }

    let flow = pinnedFlow(lead)
    let enrollment = null
    if (flow) {
        const executable = normalized.variants.find(item => item.id === lead.openingVariantId)
        if (!executable?.enabled) return { eligible: false, reason: 'variant-stopped' }
    } else {
        if (lead?.isNew !== true || lead?.hasPriorConversation === true) {
            return { eligible: false, reason: 'not-enrolled' }
        }
        const assignment = assignOpeningVariant({ leadKey, experiment: normalized })
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
    const result = runOpeningFlow({
        flow,
        state: lead?.openingState || { cursor: 0, waitingFor: null },
        inbound,
        library,
        eventId,
    })
    const replyToExposure = !!lead?.openingExposedAt && !lead?.openingFirstReplyAt
    return { eligible: true, flow, enrollment, expectedStateVersion, replyToExposure, result }
}

const openingRuntime = { prepareOpeningRuntime }

export default openingRuntime
