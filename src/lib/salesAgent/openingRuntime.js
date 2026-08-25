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
        if (!executable?.enabled) return { eligible: false, reason: 'variant-stopped' }
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
    return { eligible: true, flow, enrollment, expectedStateVersion, replyToExposure, result }
}

const openingRuntime = { prepareOpeningRuntime, resolveOpeningSnapshotParts }

export default openingRuntime
