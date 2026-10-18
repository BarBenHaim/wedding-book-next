import { createHash } from 'crypto'
import { eventTypeOf } from './eventType'

const VARIABLE_KEYS = Object.freeze({
    opening: 'birthday_gift_opening_v1',
    explainer: 'birthday_gift_explainer_v1',
    prices: 'birthday_gift_prices_v1',
    timing: 'birthday_gift_timing_v1',
})

export const BIRTHDAY_VARIABLE_KEYS = VARIABLE_KEYS

export const DEFAULT_BIRTHDAY_EXPERIMENT = Object.freeze({
    id: 'birthday_gift',
    revision: 1,
    enabled: false,
    weight: 0,
    sourceAllowlist: Object.freeze([]),
    variables: VARIABLE_KEYS,
    variableVersions: Object.freeze({}),
})

const SOURCE_ID = /^[A-Za-z0-9:_-]{1,160}$/
const VERSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/
const EVENT_OVERRIDES = new Set(['wedding', 'bar_mitzvah', 'bat_mitzvah'])
const OPENING_TEMPLATES = Object.freeze({
    knownDate: '\u05d4\u05d9\u05d9 \u{1f60a} \u05dc\u05de\u05d9 \u05de\u05db\u05d9\u05e0\u05d9\u05dd \u05d0\u05ea \u05d4\u05de\u05ea\u05e0\u05d4?',
})

function normalizedVariables(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : VARIABLE_KEYS
    for (const [slot, key] of Object.entries(VARIABLE_KEYS)) {
        if (String(source[slot] || '') !== key) throw new Error('INVALID_BIRTHDAY_VARIABLE')
    }
    return { ...VARIABLE_KEYS }
}

function normalizedVariableVersions(raw, { required = false } = {}) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    const versions = {}
    for (const slot of Object.keys(VARIABLE_KEYS)) {
        const versionId = String(source[slot] || '').trim()
        if (!versionId) {
            if (required) throw new Error('BIRTHDAY_VARIABLE_VERSION_REQUIRED')
            continue
        }
        if (!VERSION_ID.test(versionId)) throw new Error('INVALID_BIRTHDAY_VARIABLE_VERSION')
        versions[slot] = versionId
    }
    return versions
}

export function normalizeBirthdayExperiment(input = DEFAULT_BIRTHDAY_EXPERIMENT, { requireVariableVersions = true } = {}) {
    const source = input && typeof input === 'object' && !Array.isArray(input)
        ? input
        : DEFAULT_BIRTHDAY_EXPERIMENT
    if (String(source.id || 'birthday_gift') !== 'birthday_gift') throw new Error('INVALID_BIRTHDAY_EXPERIMENT')
    const revision = Number(source.revision ?? 1)
    if (!Number.isInteger(revision) || revision < 1) throw new Error('INVALID_BIRTHDAY_REVISION')
    const weight = Number(source.weight ?? 0)
    if (!Number.isInteger(weight) || weight < 0 || weight > 1_000) throw new Error('INVALID_BIRTHDAY_WEIGHT')
    const enabled = source.enabled === true
    if (enabled && weight <= 0) throw new Error('INVALID_BIRTHDAY_WEIGHT')
    const sourceAllowlist = [...new Set((Array.isArray(source.sourceAllowlist) ? source.sourceAllowlist : [])
        .map(value => String(value || '').trim())
        .filter(Boolean))]
    if (sourceAllowlist.length > 100 || sourceAllowlist.some(value => !SOURCE_ID.test(value))) {
        throw new Error('INVALID_BIRTHDAY_SOURCE')
    }
    const variableVersions = normalizedVariableVersions(source.variableVersions, { required: enabled && requireVariableVersions })
    return {
        id: 'birthday_gift',
        revision,
        enabled,
        weight,
        sourceAllowlist,
        variables: normalizedVariables(source.variables),
        variableVersions,
    }
}

export function bindBirthdayVariableVersions(experiment, variableVersions) {
    const requested = normalizeBirthdayExperiment(experiment, { requireVariableVersions: false })
    return normalizeBirthdayExperiment({ ...requested, variableVersions })
}

function verifiedMetaProvider(provider = {}) {
    return provider?.providerChannel === 'meta_whatsapp'
        && !!String(provider?.providerAccountId || '').trim()
        && !!String(provider?.providerMessageId || '').trim()
}

function explicitAdultBirthday(text) {
    const value = String(text || '')
    if (eventTypeOf(value) !== 'birthday') return false
    const adultRelationship = /(?:\u05d0\u05de\u05d0|\u05d0\u05d1\u05d0|\u05e1\u05d1\u05ea\u05d0|\u05e1\u05d1\u05d0|\u05d4\u05d5\u05e8\u05d9\u05dd|\u05d0\u05e9\u05ea\u05d9|\u05d1\u05e2\u05dc\u05d9|\u05d1\u05df\s*\u05d6\u05d5\u05d2|\u05d1\u05ea\s*\u05d6\u05d5\u05d2)/
    const birthdayAge = /(?:\u05d9\u05d5\u05dd\s*\u05d4\u05d5\u05dc\u05d3\u05ea|\u05d9\u05d5\u05de\u05d5\u05dc\u05d3\u05ea|birthday)[^0-9]{0,20}(?:[2-9]\d|1\d{2})(?!\d)|(?:[2-9]\d|1\d{2})(?!\d)[^\n]{0,20}(?:\u05d9\u05d5\u05dd\s*\u05d4\u05d5\u05dc\u05d3\u05ea|\u05d9\u05d5\u05de\u05d5\u05dc\u05d3\u05ea|birthday)/i
    return adultRelationship.test(value) || birthdayAge.test(value)
}

function minorBirthday(text) {
    const value = String(text || '')
    if (eventTypeOf(value) !== 'birthday') return false
    const childRelationship = /(?:\u05d9\u05dc\u05d3|\u05d9\u05dc\u05d3\u05d4|\u05d4\u05d1\u05df\s+\u05e9\u05dc\u05d9|\u05d4\u05d1\u05ea\s+\u05e9\u05dc\u05d9|\u05d4\u05d1\u05df|\u05d4\u05d1\u05ea|\u05d1\u05df\s+\u05e9\u05dc\u05d9|\u05d1\u05ea\s+\u05e9\u05dc\u05d9)/
    const minorAge = /(?:\u05d9\u05d5\u05dd\s*\u05d4\u05d5\u05dc\u05d3\u05ea|\u05d9\u05d5\u05de\u05d5\u05dc\u05d3\u05ea|birthday)[^0-9]{0,20}(?:[0-9]|1\d)(?!\d)|(?:[0-9]|1\d)(?!\d)[^\n]{0,20}(?:\u05d9\u05d5\u05dd\s*\u05d4\u05d5\u05dc\u05d3\u05ea|\u05d9\u05d5\u05de\u05d5\u05dc\u05d3\u05ea|birthday)/i
    return childRelationship.test(value) || minorAge.test(value)
}

function safetyGuarded(lead = {}) {
    return lead?.human === true
        || lead?.optedOut === true
        || lead?.optOut === true
        || lead?.paymentVerified === true
        || lead?.stage === 'closed_won'
        || !!lead?.callbackPromised
        || !!lead?.callbackAt
        || lead?.stage === 'commit_later'
}

export function resolveBirthdayEligibility({ experiment, lead = {}, inbound = {}, provider = {} } = {}) {
    let normalized
    try {
        normalized = normalizeBirthdayExperiment(experiment)
    } catch {
        return { eligible: false, reason: 'invalid-birthday-experiment' }
    }
    if (!normalized.enabled || normalized.weight <= 0) {
        return { eligible: false, reason: 'birthday-experiment-stopped' }
    }
    if (!verifiedMetaProvider(provider)) return { eligible: false, reason: 'unverified-provider' }
    if (lead?.isNew !== true || lead?.hasPriorConversation === true) return { eligible: false, reason: 'birthday-not-new' }
    if (safetyGuarded(lead)) return { eligible: false, reason: 'birthday-safety-guard' }

    const inboundEventType = eventTypeOf(inbound?.text)
    if (EVENT_OVERRIDES.has(inboundEventType) || EVENT_OVERRIDES.has(lead?.eventType)) {
        return { eligible: false, reason: 'event-override' }
    }
    if (minorBirthday(inbound?.text)) return { eligible: false, reason: 'birthday-minor' }
    if (String(inbound?.referral?.source_id || '').trim()) {
        return { eligible: false, reason: 'unverified-referral-disabled' }
    }
    if (explicitAdultBirthday(inbound?.text)) return { eligible: true, reason: 'explicit-adult-birthday' }
    return { eligible: false, reason: 'birthday-not-explicit' }
}

function flowFromExperiment(experiment) {
    return {
        id: 'birthday_gift',
        revision: experiment.revision,
        variables: { ...experiment.variables },
        variableVersions: { ...experiment.variableVersions },
    }
}

function pinnedFlow(lead) {
    const raw = lead?.birthdayGiftFlow
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    try {
        const normalized = normalizeBirthdayExperiment({
            ...DEFAULT_BIRTHDAY_EXPERIMENT,
            id: raw.id,
            revision: raw.revision,
            enabled: true,
            weight: 1,
            variables: raw.variables,
            variableVersions: raw.variableVersions,
        })
        return flowFromExperiment(normalized)
    } catch {
        return null
    }
}

function responseSlotFor(text) {
    const value = String(text || '')
    if (/\u05de\u05d7\u05d9\u05e8|\u05e2\u05dc\u05d5\u05ea|\u05e2\u05d5\u05dc\u05d4|\u05d7\u05d1\u05d9\u05dc\u05d5\u05ea/.test(value)) return 'prices'
    if (/\u05d0\u05d9\u05da.{0,16}(?:\u05e2\u05d5\u05d1\u05d3|\u05de\u05db\u05d9\u05e0\u05d9\u05dd|\u05d0\u05d5\u05e1\u05e4\u05d9\u05dd)|\u05de\u05d4.{0,16}(?:\u05d6\u05d4|\u05de\u05e7\u05d1\u05dc\u05d9\u05dd)|\u05d0\u05d5\u05e8\u05d7\u05d9\u05dd/.test(value)) return 'explainer'
    if (/\u05d4\u05e4\u05ea\u05e2|\u05de\u05ea\u05d9|\u05d6\u05de\u05df|\u05ea\u05d0\u05e8\u05d9\u05da|\u05de\u05d5\u05db\u05df|\u05d4\u05e4\u05e7\u05d4|\u05de\u05d2\u05d9\u05e2/.test(value)) return 'timing'
    return null
}

function openingTemplateFor(lead) {
    if (!String(lead?.eventDate || '').trim()) return null
    return { id: 'birthday-gift-opening-known-date-v1', text: OPENING_TEMPLATES.knownDate }
}

function resolveTextPart({ flow, slot, variableVersions, eventId, lead }) {
    const key = flow.variables[slot]
    const versionId = flow.variableVersions[slot]
    const version = variableVersions?.[String(key) + ':' + String(versionId)]
    const rawText = typeof version?.value === 'string' ? version.value.trim() : ''
    if (!version || version.id !== versionId || version.kind !== 'text' || version.status !== 'published' || !rawText) {
        throw new Error('BIRTHDAY_VARIABLE_UNAVAILABLE')
    }
    const template = slot === 'opening' ? openingTemplateFor(lead) : null
    const text = template?.text || rawText
    return {
        partId: createHash('sha256').update(['birthday-gift', String(eventId), slot, template?.id || versionId].join(':')).digest('hex').slice(0, 32),
        order: 1,
        kind: 'text',
        text,
        variableKey: key,
        variableVersionId: versionId,
        ...(template ? { templateId: template.id } : {}),
    }
}

export function prepareBirthdayRuntime({
    lead = {},
    experiment,
    inbound = {},
    provider = {},
    variableVersions = {},
    eventId = '',
} = {}) {
    let normalized
    try {
        normalized = normalizeBirthdayExperiment(experiment)
    } catch {
        return { eligible: false, reason: 'invalid-birthday-experiment' }
    }
    if (!normalized.enabled || normalized.weight <= 0) return { eligible: false, reason: 'birthday-experiment-stopped' }

    let flow = pinnedFlow(lead)
    let enrollment = null
    const expectedStateVersion = Number.isInteger(lead?.birthdayGiftStateVersion)
        ? lead.birthdayGiftStateVersion
        : 0
    let responseSlot
    if (flow) {
        responseSlot = responseSlotFor(inbound?.text)
        if (!responseSlot) return { eligible: false, reason: 'birthday-waiting', flow, expectedStateVersion }
    } else {
        const eligibility = resolveBirthdayEligibility({ experiment: normalized, lead, inbound, provider })
        if (!eligibility.eligible) return eligibility
        flow = flowFromExperiment(normalized)
        enrollment = { flow, source: eligibility.reason }
        responseSlot = responseSlotFor(inbound?.text) || 'opening'
    }

    try {
        const part = resolveTextPart({ flow, slot: responseSlot, variableVersions, eventId, lead })
        return {
            eligible: true,
            flow,
            enrollment,
            expectedStateVersion,
            state: { opened: true },
            result: { action: 'wait', responseSlot, parts: [part], completed: false },
        }
    } catch {
        return { eligible: false, reason: 'birthday-variable-unavailable', flow, enrollment, expectedStateVersion }
    }
}

export default {
    DEFAULT_BIRTHDAY_EXPERIMENT,
    BIRTHDAY_VARIABLE_KEYS,
    normalizeBirthdayExperiment,
    bindBirthdayVariableVersions,
    resolveEligibility: resolveBirthdayEligibility,
    prepareRuntime: prepareBirthdayRuntime,
}
