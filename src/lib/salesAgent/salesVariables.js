import { normalizeOpeningExperiment } from './openingExperiment'

export const VARIABLE_KINDS = Object.freeze(['text', 'image', 'video', 'audio'])
export const SYSTEM_VARIABLE_KEYS = Object.freeze([
    'first_name', 'event_type', 'event_date', 'child_name', 'days_to_event', 'payment_link',
])

const VARIABLE_KIND_SET = new Set(VARIABLE_KINDS)
const SYSTEM_VARIABLE_KEY_SET = new Set(SYSTEM_VARIABLE_KEYS)
const VARIABLE_KEY_PATTERN = /^[a-z][a-z0-9_]{0,79}$/
const VERSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/
const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/i
const MAX_TEXT_BYTES = 1_500
const MEDIA_LIMITS = Object.freeze({
    image: { bytes: 5 * 1024 * 1024, contentTypes: new Set(['image/jpeg', 'image/png']) },
    video: { bytes: 16 * 1024 * 1024, contentTypes: new Set(['video/mp4', 'video/3gpp']) },
    audio: {
        bytes: 16 * 1024 * 1024,
        contentTypes: new Set(['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg', 'audio/opus']),
    },
})

const cleanBoundedText = (value, { required = false, max = MAX_TEXT_BYTES, code = 'INVALID_VARIABLE_VALUE' } = {}) => {
    const text = String(value ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
        .trim()
    if ((required && !text) || text.length > max) throw new Error(code)
    return text
}

function safeVersionId(value) {
    const id = String(value ?? '').trim()
    if (!VERSION_ID_PATTERN.test(id)) throw new Error('INVALID_VARIABLE_VERSION_ID')
    return id
}

function safeStatus(value) {
    if (value !== 'draft' && value !== 'published') throw new Error('INVALID_VARIABLE_VERSION_STATUS')
    return value
}

function safeCreatedAtMs(value) {
    const createdAtMs = Number(value)
    if (!Number.isSafeInteger(createdAtMs) || createdAtMs < 0) throw new Error('INVALID_VARIABLE_VERSION_TIME')
    return createdAtMs
}

function tokenNames(template) {
    const tokens = []
    const expression = /{{\s*([a-zA-Z0-9_]+)\s*}}/g
    let match
    while ((match = expression.exec(template)) !== null) tokens.push(match[1])
    if (/{{|}}/.test(template.replace(expression, ''))) throw new Error('INVALID_SYSTEM_VARIABLE_TEMPLATE')
    return tokens
}

function assertKnownTokens(template) {
    for (const token of tokenNames(template)) {
        if (!SYSTEM_VARIABLE_KEY_SET.has(token)) throw new Error('UNKNOWN_SYSTEM_VARIABLE')
    }
}

export function normalizeVariableKey(value) {
    const key = String(value ?? '').trim().toLowerCase()
    if (!VARIABLE_KEY_PATTERN.test(key) || key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw new Error('INVALID_VARIABLE_KEY')
    }
    return key
}

export function normalizeSalesVariableVersion(input = {}) {
    const kind = String(input?.kind ?? '')
    if (!VARIABLE_KIND_SET.has(kind)) throw new Error('INVALID_VARIABLE_KIND')
    const base = {
        id: safeVersionId(input.id),
        kind,
        status: safeStatus(input.status),
        createdAtMs: safeCreatedAtMs(input.createdAtMs),
    }

    if (kind === 'text') {
        const value = cleanBoundedText(input.value, { required: true })
        assertKnownTokens(value)
        return { ...base, value }
    }

    const objectPath = String(input.objectPath ?? '').trim()
    if (!objectPath.startsWith('sales-variable-media/') || objectPath.includes('..') || objectPath.length > 500) {
        throw new Error('INVALID_VARIABLE_OBJECT_PATH')
    }
    const contentType = String(input.contentType ?? '').trim().toLowerCase()
    const mediaPolicy = MEDIA_LIMITS[kind]
    if (!mediaPolicy.contentTypes.has(contentType)) throw new Error('INVALID_VARIABLE_CONTENT_TYPE')
    const bytes = Number(input.bytes)
    if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > mediaPolicy.bytes) throw new Error('INVALID_VARIABLE_BYTES')
    const checksum = String(input.checksum ?? '').trim().toLowerCase()
    if (!CHECKSUM_PATTERN.test(checksum)) throw new Error('INVALID_VARIABLE_CHECKSUM')
    const caption = cleanBoundedText(input.caption, { max: 500, code: 'INVALID_VARIABLE_CAPTION' })
    const when = cleanBoundedText(input.when, { max: 160, code: 'INVALID_VARIABLE_WHEN' })
    const voiceNote = kind === 'audio' && input.voiceNote === true
    return { ...base, objectPath, contentType, bytes, checksum, caption, when, voiceNote }
}

export function normalizeSalesVariable(input = {}) {
    const key = normalizeVariableKey(input.key)
    const kind = String(input.kind ?? '')
    if (!VARIABLE_KIND_SET.has(kind)) throw new Error('INVALID_VARIABLE_KIND')
    const label = cleanBoundedText(input.label, { required: true, max: 120, code: 'INVALID_VARIABLE_LABEL' })
    const publishedVersion = input.publishedVersion == null ? null : normalizeSalesVariableVersion(input.publishedVersion)
    if (publishedVersion && publishedVersion.kind !== kind) throw new Error('PUBLISHED_VARIABLE_KIND_IMMUTABLE')
    if (publishedVersion && publishedVersion.status !== 'published') throw new Error('INVALID_PUBLISHED_VARIABLE_VERSION')
    const draftVersion = input.draftVersion == null ? null : normalizeSalesVariableVersion(input.draftVersion)
    if (draftVersion && draftVersion.kind !== kind) throw new Error('INVALID_VARIABLE_VERSION_KIND')
    return {
        ...(input.id == null ? {} : { id: String(input.id).trim().slice(0, 120) }),
        key,
        label,
        kind,
        draftVersion,
        publishedVersion,
        archived: input.archived === true,
    }
}

export function renderSalesTemplate(template, context = {}) {
    const normalized = cleanBoundedText(template, { required: true })
    assertKnownTokens(normalized)
    return normalized.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_whole, token) => {
        const raw = context?.[token]
        if (raw == null || String(raw).trim() === '') throw new Error('REQUIRED_SYSTEM_VARIABLE_MISSING')
        return cleanBoundedText(raw, { required: true, max: 500, code: 'INVALID_SYSTEM_VARIABLE_VALUE' })
    })
}

function registryOf(variables) {
    if (Array.isArray(variables)) return new Map(variables.map(variable => [normalizeVariableKey(variable?.key), variable]))
    if (!variables || typeof variables !== 'object') return new Map()
    return new Map(Object.entries(variables).map(([key, variable]) => [normalizeVariableKey(key), variable]))
}

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
    Object.freeze(value)
    Object.values(value).forEach(deepFreeze)
    return value
}

export function bindOpeningVariables(experiment, variables = {}) {
    const registry = registryOf(variables)
    const referencedKeys = (Array.isArray(experiment?.variants) ? experiment.variants : [])
        .flatMap(variant => Array.isArray(variant?.blocks) ? variant.blocks : [])
        .map(block => String(block?.variableKey ?? '').trim().toLowerCase())
        .filter(Boolean)
    const normalized = normalizeOpeningExperiment(experiment, {
        registeredVariables: [...new Set([...registry.keys(), ...referencedKeys])],
    })
    const variants = normalized.variants.map(variant => ({
        ...variant,
        blocks: variant.blocks.map(block => {
            if (!block.variableKey) return { ...block }
            const rawVariable = registry.get(block.variableKey)
            if (!rawVariable) throw new Error('OPENING_VARIABLE_NOT_FOUND')
            if (rawVariable.archived === true) throw new Error('OPENING_VARIABLE_ARCHIVED')
            const variable = normalizeSalesVariable(rawVariable)
            const version = variable.publishedVersion
            if (!version) throw new Error('OPENING_VARIABLE_UNPUBLISHED')
            const compatible = block.type === 'media' ? version.kind !== 'text' : version.kind === 'text'
            if (!compatible) throw new Error('OPENING_VARIABLE_KIND_MISMATCH')
            return { ...block, variableVersionId: version.id }
        }),
    }))
    return deepFreeze({ ...normalized, variants })
}

const salesVariables = {
    VARIABLE_KINDS,
    SYSTEM_VARIABLE_KEYS,
    normalizeVariableKey,
    normalizeSalesVariable,
    normalizeSalesVariableVersion,
    renderSalesTemplate,
    bindOpeningVariables,
}

export default salesVariables
