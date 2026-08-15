import { callClaude, providerDeadlineAt } from './agent'
import { STAGES } from './catalog'

const MAX_PROMPT_CHARS = 25_000
const MAX_MESSAGES = 25_000
const EVENT_TYPES = new Set(['bar_mitzvah', 'bat_mitzvah', 'wedding', 'birthday', 'brit', 'other'])
const OUTCOMES = new Set(['paid', 'ready_to_pay', 'qualified', 'engaged', 'unresponsive', 'not_relevant', 'lost', 'unknown'])
const CONFIDENCE = new Set(['explicit', 'derived', 'unknown'])
const DIRECTIONS = new Set(['inbound', 'outbound', 'unknown'])

const FIELD_MAP = {
    event_type: 'eventType',
    event_date: 'eventDate',
    celebrant_name: 'celebrantName',
    stage: 'stage',
    historical_outcome: 'historicalOutcome',
    loss_reason: 'lossReason',
    summary: 'summary',
}

const SYSTEM_PROMPT = `אתה מסווג היסטוריית מכירות ב-WhatsApp עבור Wedding Tales.
קבע עובדות רק על סמך הכתוב בתמליל. אסור לנחש שם, תאריך, סוג אירוע, תשלום, סיבת אובדן או מקור קמפיין.
אם אין ראיה מפורשת או נגזרת סבירה, החזר null או unknown. אין להציע או לבצע שיחות טלפון ואין לנסח הודעה ללקוח.
לכל שדה שאינו null חובה להחזיר ב-evidence_at חותמת זמן שמופיעה בדיוק בתמליל. אל תחזיר מספר טלפון או מזהה שיחה.
החזר JSON בלבד עם המפתחות:
event_type, event_date, celebrant_name, stage, historical_outcome, loss_reason, summary, confidence, evidence_at.
event_type: bar_mitzvah|bat_mitzvah|wedding|birthday|brit|other|null.
stage: ${STAGES.join('|')}|null.
historical_outcome: paid|ready_to_pay|qualified|engaged|unresponsive|not_relevant|lost|unknown|null.
confidence: explicit|derived|unknown.`

class HistoryExtractionError extends Error {
    constructor(code) {
        super(code)
        this.name = 'HistoryExtractionError'
        this.code = code
    }
}

function fail(code) {
    throw new HistoryExtractionError(code)
}

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validIsoTimestamp(value) {
    if (typeof value !== 'string') return false
    const parsed = new Date(value)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value
}

function validIsoDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function boundedText(value, max) {
    if (typeof value !== 'string') return null
    const normalized = value.trim()
    return normalized ? normalized.slice(0, max) : null
}

export function normalizeHistoryExtractionInput(input) {
    if (!isRecord(input)) fail('HISTORY_INVALID_INPUT')
    const conversationKey = typeof input.conversationKey === 'string' ? input.conversationKey.trim() : ''
    if (!conversationKey || conversationKey.length > 200 || !Array.isArray(input.messages) || input.messages.length === 0 || input.messages.length > MAX_MESSAGES) {
        fail('HISTORY_INVALID_INPUT')
    }

    let aggregateChars = 0
    const messages = input.messages.map(message => {
        if (!isRecord(message) || !DIRECTIONS.has(message.direction) || typeof message.text !== 'string') {
            fail('HISTORY_INVALID_INPUT')
        }
        if (message.occurredAt !== null && !validIsoTimestamp(message.occurredAt)) fail('HISTORY_INVALID_INPUT')
        aggregateChars += message.text.length
        if (aggregateChars > MAX_PROMPT_CHARS) fail('HISTORY_INPUT_TOO_LARGE')
        return {
            direction: message.direction,
            occurredAt: message.occurredAt,
            text: message.text,
        }
    })

    messages.sort((left, right) => {
        if (left.occurredAt === null) return right.occurredAt === null ? 0 : 1
        if (right.occurredAt === null) return -1
        return left.occurredAt.localeCompare(right.occurredAt)
    })
    const transcript = messages.map(message => (
        `${message.occurredAt ?? 'unknown-time'} | ${message.direction} | ${message.text}`
    )).join('\n')
    if (SYSTEM_PROMPT.length + transcript.length > MAX_PROMPT_CHARS) fail('HISTORY_INPUT_TOO_LARGE')
    return { conversationKey, messages }
}

export function buildHistoryExtractionPrompt(input) {
    const transcript = input.messages.map(message => (
        `${message.occurredAt ?? 'unknown-time'} | ${message.direction} | ${message.text}`
    )).join('\n')

    return {
        system: SYSTEM_PROMPT,
        user: transcript,
    }
}

function parseJsonObject(raw) {
    if (isRecord(raw)) return raw
    if (typeof raw !== 'string') fail('HISTORY_MODEL_OUTPUT_INVALID')
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start < 0 || end <= start) fail('HISTORY_MODEL_OUTPUT_INVALID')
    try {
        const parsed = JSON.parse(raw.slice(start, end + 1))
        if (!isRecord(parsed)) fail('HISTORY_MODEL_OUTPUT_INVALID')
        return parsed
    } catch (error) {
        if (error instanceof HistoryExtractionError) throw error
        fail('HISTORY_MODEL_OUTPUT_INVALID')
    }
}

export function parseHistoryExtraction(raw, input) {
    const normalized = normalizeHistoryExtractionInput(input)
    const obj = parseJsonObject(raw)
    const transcriptTimes = new Set(normalized.messages.map(message => message.occurredAt).filter(Boolean))
    const rawEvidence = isRecord(obj.evidence_at) ? obj.evidence_at : {}
    const evidenceAt = {}

    const evidenceFor = snakeField => {
        const timestamp = rawEvidence[snakeField]
        return typeof timestamp === 'string' && transcriptTimes.has(timestamp) ? timestamp : null
    }
    const accept = (snakeField, value) => {
        const timestamp = evidenceFor(snakeField)
        if (!timestamp || value === null) return null
        evidenceAt[FIELD_MAP[snakeField]] = timestamp
        return value
    }

    const eventType = EVENT_TYPES.has(obj.event_type) ? obj.event_type : null
    const eventDate = validIsoDate(obj.event_date) ? obj.event_date : null
    const celebrantName = boundedText(obj.celebrant_name, 80)
    const stage = STAGES.includes(obj.stage) ? obj.stage : null
    const historicalOutcome = OUTCOMES.has(obj.historical_outcome) && obj.historical_outcome !== 'unknown'
        ? obj.historical_outcome
        : null
    const lossReason = boundedText(obj.loss_reason, 300)
    const summary = boundedText(obj.summary, 600)

    return {
        eventType: accept('event_type', eventType),
        eventDate: accept('event_date', eventDate),
        celebrantName: accept('celebrant_name', celebrantName),
        stage: accept('stage', stage),
        historicalOutcome: accept('historical_outcome', historicalOutcome),
        lossReason: accept('loss_reason', lossReason),
        summary: accept('summary', summary),
        confidence: Object.keys(evidenceAt).length > 0 && CONFIDENCE.has(obj.confidence) ? obj.confidence : 'unknown',
        evidenceAt,
    }
}

export async function extractHistoricalLead(input, options = {}) {
    const normalized = normalizeHistoryExtractionInput(input)
    const prompt = buildHistoryExtractionPrompt(normalized)
    const callModel = options.callModel ?? callClaude
    const deadlineAtMs = options.deadlineAtMs ?? providerDeadlineAt()

    const first = await callModel({
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
        maxTokens: 900,
        temperature: 0,
        deadlineAtMs,
    })
    try {
        return parseHistoryExtraction(first?.text, normalized)
    } catch (error) {
        if (error?.code !== 'HISTORY_MODEL_OUTPUT_INVALID') throw error
    }

    const repaired = await callModel({
        system: `${prompt.system}\nהפלט הקודם לא היה JSON תקין. החזר עכשיו JSON תקין בלבד לפי הסכימה, בלי הסבר.`,
        messages: [{ role: 'user', content: prompt.user }],
        maxTokens: 900,
        temperature: 0,
        deadlineAtMs,
    })
    return parseHistoryExtraction(repaired?.text, normalized)
}

export default { normalizeHistoryExtractionInput, buildHistoryExtractionPrompt, parseHistoryExtraction, extractHistoricalLead }
