import { createHash } from 'crypto'

const MAX_BLOCKS = 20
const MAX_TEXT = 1_500
const VARIANT_IDS = new Set(['A', 'B', 'C'])
const TEXT_BLOCKS = new Set(['text', 'ask_event', 'ask_photo'])
const BLOCK_TYPES = new Set([
    'text', 'media', 'ask_event', 'ask_photo', 'generate_design',
    'wait_owner_approval', 'send_approved_design', 'stop',
])
const BUILT_IN_MEDIA = new Set(['cover_personalised', 'book_open_spread'])

const A_EXPLANATION = `Wedding Tales הוא ספר ברכות מודפס ואישי לבר המצווה.
האורחים מעלים ברכה ותמונה בקלות מהטלפון, ובסוף נשארת מזכרת אמיתית למשפחה.`
const PHOTO_QUESTION = 'רוצה שאכין לך דוגמה אישית? שלחי תמונה של הבן שלך ואכין עיצוב לדוגמה.'
const EVENT_QUESTION = 'לאיזה סוג אירוע זה ומה התאריך שלו?'
const B_EXPLANATION = 'הנה כמה דוגמאות קצרות שמראות איך הספר נראה ואיך הוא עובד.'

const personalBlocks = prefix => [
    { id: `${prefix}-explain`, type: 'text', text: A_EXPLANATION },
    { id: `${prefix}-photo`, type: 'ask_photo', text: PHOTO_QUESTION },
    { id: `${prefix}-generate`, type: 'generate_design', templateId: 'bar-mitzvah-v1' },
    { id: `${prefix}-approval`, type: 'wait_owner_approval' },
    { id: `${prefix}-send-design`, type: 'send_approved_design' },
    { id: `${prefix}-stop`, type: 'stop' },
]

export const DEFAULT_OPENING_EXPERIMENT = Object.freeze({
    enabled: false,
    minSamplePerVariant: 30,
    variants: Object.freeze([
        Object.freeze({ id: 'A', label: 'דוגמה אישית', enabled: true, weight: 34, revision: 1, blocks: Object.freeze(personalBlocks('a')) }),
        Object.freeze({
            id: 'B', label: 'מדיה והסבר', enabled: true, weight: 33, revision: 1,
            blocks: Object.freeze([
                { id: 'b-explain', type: 'text', text: B_EXPLANATION },
                { id: 'b-cover', type: 'media', mediaKey: 'cover_personalised' },
                { id: 'b-spread', type: 'media', mediaKey: 'book_open_spread' },
                { id: 'b-event', type: 'ask_event', text: EVENT_QUESTION },
                { id: 'b-stop', type: 'stop' },
            ]),
        }),
        Object.freeze({
            id: 'C', label: 'אירוע קודם', enabled: true, weight: 33, revision: 1,
            blocks: Object.freeze([
                { id: 'c-event', type: 'ask_event', text: EVENT_QUESTION },
                ...personalBlocks('c'),
            ]),
        }),
    ]),
})

const cleanText = (value, errorCode = 'INVALID_OPENING_TEXT') => {
    const raw = String(value ?? '')
    if (!raw.trim() || raw.length > MAX_TEXT) throw new Error(errorCode)
    return raw
        .replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
        .split('\n')
        .map(line => line.replace(/[\t ]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

function registeredKeys(value) {
    const keys = new Set(BUILT_IN_MEDIA)
    if (Array.isArray(value)) value.forEach(key => keys.add(String(key)))
    else if (value && typeof value === 'object') Object.keys(value).forEach(key => keys.add(String(key)))
    return keys
}

function registeredVariableKeys(value) {
    const keys = new Set()
    if (Array.isArray(value)) value.forEach(key => keys.add(String(key)))
    else if (value && typeof value === 'object') Object.keys(value).forEach(key => keys.add(String(key)))
    return keys
}

function variableReference(raw, variableKeys) {
    const variableKey = String(raw?.variableKey || '').trim().toLowerCase()
    if (!variableKey || !variableKeys.has(variableKey)) throw new Error('INVALID_OPENING_VARIABLE')
    return variableKey
}

function variableVersionReference(raw) {
    const value = String(raw?.variableVersionId || '').trim()
    if (!value) return null
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value)) throw new Error('INVALID_OPENING_VARIABLE_VERSION')
    return value
}

function normalizeBlock(raw, mediaKeys, variableKeys) {
    const id = String(raw?.id || '').trim().slice(0, 80)
    const type = String(raw?.type || '')
    if (!id || !BLOCK_TYPES.has(type)) throw new Error('INVALID_OPENING_BLOCK')
    if (TEXT_BLOCKS.has(type)) {
        const hasText = raw?.text != null && String(raw.text).trim() !== ''
        const hasVariable = raw?.variableKey != null && String(raw.variableKey).trim() !== ''
        if (hasText && hasVariable) throw new Error('AMBIGUOUS_OPENING_VARIABLE')
        if (hasVariable) {
            const variableKey = variableReference(raw, variableKeys)
            const variableVersionId = variableVersionReference(raw)
            return { id, type, variableKey, ...(variableVersionId ? { variableVersionId } : {}) }
        }
        return { id, type, text: cleanText(raw.text) }
    }
    if (type === 'media') {
        const hasMedia = raw?.mediaKey != null && String(raw.mediaKey).trim() !== ''
        const hasVariable = raw?.variableKey != null && String(raw.variableKey).trim() !== ''
        if (hasMedia && hasVariable) throw new Error('AMBIGUOUS_OPENING_VARIABLE')
        if (hasVariable) {
            const variableKey = variableReference(raw, variableKeys)
            const variableVersionId = variableVersionReference(raw)
            return { id, type, variableKey, ...(variableVersionId ? { variableVersionId } : {}) }
        }
        const mediaKey = String(raw?.mediaKey || '').trim()
        if (!mediaKey || !mediaKeys.has(mediaKey)) throw new Error('INVALID_OPENING_MEDIA')
        return { id, type, mediaKey }
    }
    if (type === 'generate_design') {
        if (raw?.templateId !== 'bar-mitzvah-v1') throw new Error('INVALID_OPENING_TEMPLATE')
        return { id, type, templateId: 'bar-mitzvah-v1' }
    }
    return { id, type }
}

function validateDesignOrder(blocks) {
    const photo = blocks.findIndex(block => block.type === 'ask_photo')
    const generate = blocks.findIndex(block => block.type === 'generate_design')
    const approval = blocks.findIndex(block => block.type === 'wait_owner_approval')
    const send = blocks.findIndex(block => block.type === 'send_approved_design')
    const anyDesign = [generate, approval, send].some(index => index >= 0)
    if (!anyDesign) return
    if (!(photo >= 0 && photo < generate && generate < approval && approval < send)) {
        throw new Error('INVALID_OPENING_DESIGN_ORDER')
    }
}

function normalizeVariant(raw, mediaKeys, variableKeys) {
    const id = String(raw?.id || '')
    if (!VARIANT_IDS.has(id)) throw new Error('INVALID_OPENING_VARIANT')
    const label = String(raw?.label || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 60)
    if (!label) throw new Error('INVALID_OPENING_VARIANT')
    const weight = Number(raw?.weight)
    if (!Number.isInteger(weight) || weight < 0 || weight > 1_000) throw new Error('INVALID_OPENING_WEIGHT')
    const enabled = raw?.enabled !== false
    if (enabled && weight <= 0) throw new Error('INVALID_OPENING_WEIGHT')
    const revision = Number(raw?.revision)
    if (!Number.isInteger(revision) || revision < 1) throw new Error('INVALID_OPENING_REVISION')
    if (!Array.isArray(raw?.blocks) || raw.blocks.length < 1) throw new Error('INVALID_OPENING_BLOCK')
    if (raw.blocks.length > MAX_BLOCKS) throw new Error('TOO_MANY_OPENING_BLOCKS')
    const blocks = raw.blocks.map(block => normalizeBlock(block, mediaKeys, variableKeys))
    const ids = new Set()
    for (const block of blocks) {
        if (ids.has(block.id)) throw new Error('DUPLICATE_OPENING_BLOCK')
        ids.add(block.id)
    }
    if (blocks.at(-1)?.type !== 'stop' || blocks.filter(block => block.type === 'stop').length !== 1) {
        throw new Error('INVALID_OPENING_TERMINAL')
    }
    validateDesignOrder(blocks)
    return { id, label, enabled, weight, revision, blocks }
}

export function normalizeOpeningExperiment(input = DEFAULT_OPENING_EXPERIMENT, { registeredMedia = [], registeredVariables = [] } = {}) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : DEFAULT_OPENING_EXPERIMENT
    const minSample = Number(source.minSamplePerVariant ?? 30)
    if (!Number.isInteger(minSample) || minSample < 10 || minSample > 1_000) throw new Error('INVALID_OPENING_SAMPLE')
    if (!Array.isArray(source.variants) || source.variants.length < 1 || source.variants.length > 3) {
        throw new Error('INVALID_OPENING_VARIANT')
    }
    const mediaKeys = registeredKeys(registeredMedia)
    const variableKeys = registeredVariableKeys(registeredVariables)
    const variants = source.variants.map(variant => normalizeVariant(variant, mediaKeys, variableKeys))
    if (new Set(variants.map(variant => variant.id)).size !== variants.length) throw new Error('INVALID_OPENING_VARIANT')
    if (!variants.some(variant => variant.enabled && variant.weight > 0)) throw new Error('NO_ACTIVE_OPENING_VARIANT')
    return {
        enabled: source.enabled === true,
        minSamplePerVariant: minSample,
        variants,
    }
}

export function assignOpeningVariant({ leadKey, experiment }) {
    const normalized = normalizeOpeningExperiment(experiment)
    const variants = normalized.variants.filter(variant => variant.enabled && variant.weight > 0)
    const total = variants.reduce((sum, variant) => sum + variant.weight, 0)
    if (!total) throw new Error('NO_ACTIVE_OPENING_VARIANT')
    const digest = createHash('sha256').update(`opening-assignment:${String(leadKey)}`).digest()
    const bucket = digest.readUInt32BE(0) % total
    let cursor = 0
    const selected = variants.find(variant => {
        cursor += variant.weight
        return bucket < cursor
    }) || variants.at(-1)
    return { variantId: selected.id, variantRevision: selected.revision }
}

function partId(eventId, blockId) {
    return createHash('sha256')
        .update(`opening-experiment:${String(eventId)}:${String(blockId)}`)
        .digest('hex')
        .slice(0, 32)
}

function eventTypeOf(text) {
    if (/בר\s*מצו[וה]/i.test(text)) return 'bar_mitzvah'
    if (/בת\s*מצו[וה]/i.test(text)) return 'bat_mitzvah'
    if (/חתונ|חופה/i.test(text)) return 'wedding'
    if (/ברית|בריתה/i.test(text)) return 'brit'
    return null
}

function eventDateOf(text) {
    const match = String(text).match(/(?:^|\D)(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\D|$)/)
    if (!match) return null
    const day = Number(match[1])
    const month = Number(match[2])
    const year = Number(match[3])
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function qualification(text) {
    const clean = String(text || '').trim().slice(0, 500)
    const eventType = eventTypeOf(clean)
    const eventDate = eventDateOf(clean)
    if (!eventType || !eventDate) {
        return { eventType, eventDate, qualificationNeedsReview: true, qualificationNote: clean }
    }
    return { eventType, eventDate, qualificationNeedsReview: false }
}

function waitResult(action, state, captures = {}) {
    return { action, state, parts: [], captures, approvalRequest: null, completed: false }
}

export function runOpeningFlow({ flow, state = { cursor: 0, waitingFor: null }, inbound = null, library = {}, eventId = '' } = {}) {
    if (!flow || !Array.isArray(flow.blocks)) throw new Error('INVALID_OPENING_FLOW')
    let cursor = Number.isInteger(state?.cursor) ? state.cursor : 0
    let waitingFor = state?.waitingFor || null
    const parts = []
    const captures = {}
    let approvalRequest = null
    let approvedAssetKey = null

    if (waitingFor === 'event') {
        if (inbound?.kind !== 'text' || !String(inbound.text || '').trim()) return waitResult('wait_event', { cursor, waitingFor })
        Object.assign(captures, qualification(inbound.text))
        if (captures.qualificationNeedsReview) return waitResult('wait_event', { cursor, waitingFor }, captures)
        waitingFor = null
    } else if (waitingFor === 'photo') {
        const mediaId = String(inbound?.mediaId || '').trim().slice(0, 500)
        if (inbound?.kind !== 'image' || !mediaId) return waitResult('wait_photo', { cursor, waitingFor })
        captures.childPhotoReceived = true
        captures.childPhotoMediaId = mediaId
        waitingFor = null
    } else if (waitingFor === 'approval') {
        const approvalId = String(inbound?.approvalId || '').trim().slice(0, 160)
        approvedAssetKey = String(inbound?.assetKey || '').trim().slice(0, 500)
        if (inbound?.kind !== 'owner_approval' || !approvalId || !approvedAssetKey) {
            return waitResult('approval_pending', { cursor, waitingFor })
        }
        captures.designApproved = true
        captures.approvalId = approvalId
        waitingFor = null
    }

    while (cursor < flow.blocks.length) {
        const block = flow.blocks[cursor]
        if (block.type === 'text') {
            const variable = block.variableKey ? library?.[`${block.variableKey}:${block.variableVersionId}`] : null
            if (block.variableKey && (!variable || variable.kind !== 'text' || typeof variable.resolveText !== 'function')) {
                throw new Error('OPENING_VARIABLE_VERSION_MISSING')
            }
            parts.push({
                partId: partId(eventId, block.id),
                blockId: block.id,
                order: parts.length + 1,
                kind: 'text',
                text: variable ? variable.resolveText() : block.text,
                ...(variable ? { variableKey: block.variableKey, variableVersionId: block.variableVersionId } : {}),
            })
            cursor += 1
            continue
        }
        if (block.type === 'media') {
            const media = block.variableKey
                ? library?.[`${block.variableKey}:${block.variableVersionId}`]
                : library?.[block.mediaKey]
            if (!media) throw new Error('OPENING_MEDIA_UNAVAILABLE')
            if (block.variableKey && media.kind === 'text') throw new Error('OPENING_VARIABLE_KIND_MISMATCH')
            parts.push({
                partId: partId(eventId, block.id), blockId: block.id, order: parts.length + 1,
                kind: media.kind,
                ...(block.mediaKey ? { mediaKey: block.mediaKey } : {}),
                ...(block.variableKey ? {
                    variableKey: block.variableKey,
                    variableVersionId: block.variableVersionId,
                    objectPath: media.objectPath,
                    voiceNote: media.kind === 'audio' && media.voiceNote === true,
                } : { url: media.url || null }),
                caption: media.caption || '',
            })
            cursor += 1
            continue
        }
        if (block.type === 'ask_event') {
            parts.push({ partId: partId(eventId, block.id), blockId: block.id, order: parts.length + 1, kind: 'text', text: block.text })
            cursor += 1
            return { action: 'wait_event', state: { cursor, waitingFor: 'event' }, parts, captures, approvalRequest, completed: false }
        }
        if (block.type === 'ask_photo') {
            parts.push({ partId: partId(eventId, block.id), blockId: block.id, order: parts.length + 1, kind: 'text', text: block.text })
            cursor += 1
            return { action: 'wait_photo', state: { cursor, waitingFor: 'photo' }, parts, captures, approvalRequest, completed: false }
        }
        if (block.type === 'generate_design') {
            const mediaId = captures.childPhotoMediaId
            if (!mediaId) throw new Error('OPENING_PHOTO_REQUIRED')
            approvalRequest = { templateId: block.templateId, mediaId }
            cursor += 1
            continue
        }
        if (block.type === 'wait_owner_approval') {
            cursor += 1
            return { action: 'approval_pending', state: { cursor, waitingFor: 'approval' }, parts, captures, approvalRequest, completed: false }
        }
        if (block.type === 'send_approved_design') {
            if (!approvedAssetKey) throw new Error('OPENING_APPROVAL_REQUIRED')
            parts.push({
                partId: partId(eventId, block.id), blockId: block.id, order: parts.length + 1,
                kind: 'approved_design', assetKey: approvedAssetKey,
            })
            cursor += 1
            continue
        }
        if (block.type === 'stop') {
            return { action: 'completed', state: { cursor: cursor + 1, waitingFor: null }, parts, captures, approvalRequest, completed: true }
        }
        throw new Error('INVALID_OPENING_BLOCK')
    }
    return { action: 'completed', state: { cursor, waitingFor: null }, parts, captures, approvalRequest, completed: true }
}

const DISQUALIFIED = new Set(['wrong_number', 'spam', 'unsupported_event', 'event_cancelled', 'not_interested'])

export function classifyOpeningLead(lead = {}, nowMs = Date.now()) {
    const disqualification = String(lead.disqualificationReason || '')
    if (DISQUALIFIED.has(disqualification)) return { state: 'not_relevant', reason: disqualification }
    if (lead.childPhotoReceived === true) return { state: 'relevant', reason: 'photo_received' }
    if (lead.paymentLinkSentAt || lead.paymentVerified === true) return { state: 'relevant', reason: 'payment_intent' }
    if (lead.eventDate) {
        const date = Date.parse(`${String(lead.eventDate).slice(0, 10)}T23:59:59.999Z`)
        if (Number.isFinite(date) && date < nowMs) return { state: 'not_relevant', reason: 'event_passed' }
        if (Number.isFinite(date) && lead.eventType) return { state: 'relevant', reason: 'supported_future_event' }
    }
    return { state: 'unknown', reason: 'insufficient_evidence' }
}

const openingExperiment = {
    DEFAULT_OPENING_EXPERIMENT,
    normalizeOpeningExperiment,
    assignOpeningVariant,
    runOpeningFlow,
    classifyOpeningLead,
}

export default openingExperiment
