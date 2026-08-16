import { ACTIVE_VARIANT_IDS } from './experiments'

export const MODEL_REGISTRY = Object.freeze([
    { id: 'claude-sonnet-4-5', provider: 'anthropic', label: 'Claude Sonnet 4.5', role: 'primary' },
    { id: 'claude-haiku-4-5', provider: 'anthropic', label: 'Claude Haiku 4.5', role: 'economy' },
    { id: 'gpt-4.1-mini', provider: 'openai', label: 'GPT-4.1 mini', role: 'fallback' },
])

const PROVIDERS = ['auto', 'anthropic', 'openai']
const MODEL_IDS = MODEL_REGISTRY.map(row => row.id)
const FALLBACK_MODEL = 'claude-haiku-4-5'
const MAX_INSTRUCTIONS = 4_000
const MAX_CHANGE_NOTE = 240

export const IMMUTABLE_SALES_POLICY = `אין שיחות טלפון ואין הצעת שיחה. המכירה מתנהלת בהודעות WhatsApp בלבד.
מחירים, חבילות, עובדות וקישורי תשלום מגיעים מהקטלוג בקוד ואינם ניתנים לעריכה כאן.
אסור להמציא מידע, הנחה, זמינות או הבטחה. כשאין תשובה ודאית מעבירים לאדם.
כל הודעה עוברת את כללי הבטיחות, הפרטיות, הסגנון והמסירה של Wedding Tales.`

export const DEFAULT_SALES_SETTINGS = Object.freeze({
    revision: 0,
    enabled: true,
    provider: 'auto',
    model: 'claude-sonnet-4-5',
    fallbackModel: FALLBACK_MODEL,
    businessInstructions: '',
    activeOpeningIds: [...ACTIVE_VARIANT_IDS],
    openingMediaSequence: [],
    updatedAt: null,
    updatedBy: null,
    changeNote: '',
})

const cleanText = (value, max) => String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)

function assertProviderModel(provider, model) {
    if (!PROVIDERS.includes(provider)) throw new Error('INVALID_PROVIDER')
    if (!MODEL_IDS.includes(model)) throw new Error('INVALID_MODEL')
    const entry = MODEL_REGISTRY.find(row => row.id === model)
    if (provider !== 'auto' && entry?.provider !== provider) throw new Error('INVALID_MODEL')
}

export function normalizeSalesSettings(input = {}, { registeredMediaKeys = [] } = {}) {
    const revision = Number(input.revision)
    if (!Number.isInteger(revision) || revision < 0) throw new Error('INVALID_REVISION')
    const provider = String(input.provider || DEFAULT_SALES_SETTINGS.provider)
    const model = String(input.model || DEFAULT_SALES_SETTINGS.model)
    assertProviderModel(provider, model)

    const rawInstructions = String(input.businessInstructions || '')
    if (rawInstructions.length > MAX_INSTRUCTIONS) throw new Error('INSTRUCTIONS_TOO_LONG')
    const mediaKeys = new Set((registeredMediaKeys || []).map(String))
    const activeOpeningIds = [...new Set(Array.isArray(input.activeOpeningIds) ? input.activeOpeningIds : DEFAULT_SALES_SETTINGS.activeOpeningIds)]
        .filter(id => ACTIVE_VARIANT_IDS.includes(id))
    if (!activeOpeningIds.length) throw new Error('NO_ACTIVE_OPENING')
    const openingMediaSequence = [...new Set(Array.isArray(input.openingMediaSequence) ? input.openingMediaSequence.map(String) : [])]
        .filter(key => mediaKeys.has(key))
        .slice(0, 3)

    return {
        revision,
        enabled: input.enabled !== false,
        provider,
        model,
        businessInstructions: cleanText(rawInstructions, MAX_INSTRUCTIONS),
        activeOpeningIds,
        openingMediaSequence,
        changeNote: cleanText(input.changeNote, MAX_CHANGE_NOTE),
    }
}

export function resolveSalesSettings(stored = {}, options = {}) {
    const executableStoredIds = Array.isArray(stored.activeOpeningIds)
        ? stored.activeOpeningIds.filter(id => ACTIVE_VARIANT_IDS.includes(id))
        : []
    const normalized = normalizeSalesSettings({
        ...DEFAULT_SALES_SETTINGS,
        ...stored,
        // A retired experiment may still be present in Firestore after a
        // deploy. Runtime reads migrate it in memory instead of disabling
        // the agent or silently reviving a historical arm.
        activeOpeningIds: executableStoredIds.length ? executableStoredIds : DEFAULT_SALES_SETTINGS.activeOpeningIds,
    }, options)
    return {
        ...DEFAULT_SALES_SETTINGS,
        ...normalized,
        fallbackModel: FALLBACK_MODEL,
        immutablePolicy: IMMUTABLE_SALES_POLICY,
        updatedAt: stored.updatedAt || null,
        updatedBy: typeof stored.updatedBy === 'string' ? stored.updatedBy : null,
    }
}

export function modelProvider(model) {
    return MODEL_REGISTRY.find(row => row.id === model)?.provider || null
}

const salesSettings = { DEFAULT_SALES_SETTINGS, MODEL_REGISTRY, normalizeSalesSettings, resolveSalesSettings, modelProvider }
export default salesSettings
