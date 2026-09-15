import crypto from 'node:crypto'
import { normalizeProviderError } from './circuitBreaker'
import { costOfTextUsage } from './pricing'

export const BENCHMARK_CANDIDATES = Object.freeze([
    Object.freeze({ id: 'gemini', provider: 'gemini', model: 'gemini-3.6-flash' }),
    Object.freeze({ id: 'claude', provider: 'anthropic', model: 'claude-sonnet-4-5' }),
    Object.freeze({ id: 'openai', provider: 'openai', model: 'gpt-4.1-mini' }),
])

const MAX_CASES = 100
const MAX_CANDIDATES = 3
const MAX_TURNS = 4
const MAX_TURN_CHARS = 320
const MAX_CONCURRENCY = 6
const DEFAULT_BENCHMARK_BUDGET_MS = 45_000
const ALLOWED_PRICES = new Set([690, 990])
const STAGES = new Set(['new', 'engaged', 'opening_completed', 'qualified', 'demo_sent', 'offer_sent', 'objection', 'ready_to_pay', 'closed_won', 'closed_lost', 'handoff'])
const INTENTS = new Set(['general', 'price', 'demo', 'positive_signal', 'objection', 'process', 'payment_intent', 'negative_exit', 'support', 'handoff_active'])
const OUTCOMES = new Set(['open', 'won', 'lost', 'unresponsive'])
const ACTIONS = new Set(['answer_then_qualify', 'answer', 'show_proof', 'recommend_package', 'handle_objection', 'send_payment_link', 'diagnose_checkout', 'close_lost', 'route_existing_customer', 'silence'])

const bounded = (value, max = MAX_TURN_CHARS) => String(value || '').slice(0, max)
const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function privateValues(input = {}) {
    const values = [
        input.name, input.customerName, input.profileName, input.celebrantName,
        input.phone, input.email, input.orderId, input.verifiedOrderId, input.weddingId,
    ].map(value => String(value || '').trim()).filter(value => value.length >= 3)
    const nameParts = [input.name, input.customerName, input.profileName, input.celebrantName]
        .flatMap(value => String(value || '').split(/\s+/))
        .filter(value => value.length >= 3)
    return [...new Set([...values, ...nameParts])]
}

const safeEnum = (value, allowed, fallback) => allowed.has(String(value || '')) ? String(value) : fallback

function redactText(value, identifiers) {
    let text = bounded(value)
    for (const identifier of identifiers) {
        text = text.replace(new RegExp(escapeRegExp(identifier), 'gi'), '[private]')
    }
    return text
        .replace(/https?:\/\/[^\s]+/gi, '[url]')
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
        .replace(/(?:\+?972|0)(?:[\s()\-]*\d){8,}/g, '[phone]')
        .replace(/\border[-_:a-z0-9]+\b/gi, '[order]')
}

export function redactBenchmarkCase(input = {}) {
    const identifiers = privateValues(input)
    const turns = (Array.isArray(input.turns) ? input.turns : [])
        .slice(-MAX_TURNS)
        .map(turn => ({
            role: turn?.role === 'assistant' ? 'assistant' : 'user',
            text: redactText(turn?.text, identifiers),
        }))
    return {
        intent: safeEnum(input.intent, INTENTS, 'unknown'),
        stage: safeEnum(input.stage, STAGES, 'new'),
        outcome: safeEnum(input.outcome || (input.paymentVerified ? 'won' : 'open'), OUTCOMES, 'open'),
        expectedAction: safeEnum(input.expectedAction, ACTIONS, 'answer_then_qualify'),
        incomingText: redactText(input.incomingText || input.lastText || '', identifiers),
        turns,
    }
}

export function selectBenchmarkCases(cases = [], limit = MAX_CASES) {
    const safeLimit = Math.min(MAX_CASES, Math.max(1, Number(limit) || MAX_CASES))
    const groups = new Map()
    for (const row of Array.isArray(cases) ? cases : []) {
        const key = `${row?.intent || 'unknown'}:${row?.stage || 'new'}:${row?.outcome || (row?.paymentVerified ? 'won' : 'open')}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(row)
    }
    const queues = [...groups.values()]
    const selected = []
    while (selected.length < safeLimit && queues.some(queue => queue.length)) {
        for (const queue of queues) {
            if (selected.length >= safeLimit) break
            if (queue.length) selected.push(queue.shift())
        }
    }
    return selected
}

function parseCandidate(raw) {
    try {
        const value = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (!value || typeof value !== 'object' || !Array.isArray(value.messages)
            || !value.messages.length || value.messages.length > 3
            || value.messages.some(message => typeof message !== 'string' || !message.trim())
            || typeof value.stage !== 'string' || typeof value.handoff !== 'boolean') return null
        return value
    } catch {
        return null
    }
}

function priceCompliant(text) {
    const prices = [...String(text || '').matchAll(/(?:₪\s*([\d,.]+)|([\d,.]+)\s*₪)/g)]
        .map(match => Number(String(match[1] || match[2]).replace(/,/g, '')))
        .filter(Number.isFinite)
    return prices.every(price => ALLOWED_PRICES.has(price))
}

export function scoreBenchmarkCandidate({ raw, benchmarkCase = {} } = {}) {
    const parsed = parseCandidate(raw)
    const text = parsed ? parsed.messages.join('\n') : ''
    const schemaValid = !!parsed
    const noCallCompliant = schemaValid && !/(?:שיחת\s*טלפון|להתקשר|אתקשר|נחזור\s+אלי[ךכ]\s+בטלפון|אפשר\s+לדבר)/i.test(text)
    const nextActionFit = schemaValid && (benchmarkCase.expectedAction === 'answer_then_qualify'
        ? /\?|מתי|איזה\s+אירוע|לאיזה\s+אירוע/.test(text)
        : text.trim().length > 0)
    const brevityCompliant = schemaValid && text.length <= 500 && parsed.messages.length <= 2
    const catalogCompliant = schemaValid && priceCompliant(text)
    return {
        schemaValid,
        noCallCompliant,
        nextActionFit,
        brevityCompliant,
        catalogCompliant,
        totalScore: [schemaValid, noCallCompliant, nextActionFit, brevityCompliant, catalogCompliant]
            .filter(Boolean).length,
    }
}

function aggregateScores(scores, revision, caseCount) {
    const groups = new Map()
    for (const score of scores) {
        if (!groups.has(score.armId)) groups.set(score.armId, [])
        groups.get(score.armId).push(score)
    }
    const rows = [...groups.entries()].map(([armId, items]) => {
        const sortedLatency = items.map(item => item.latencyMs).filter(Number.isFinite).sort((a, b) => a - b)
        const latencyP50Ms = sortedLatency.length ? sortedLatency[Math.ceil(sortedLatency.length / 2) - 1] : null
        return {
            armId,
            provider: items[0].provider,
            model: items[0].model,
            cases: items.length,
            scoreRate: items.reduce((sum, item) => sum + item.totalScore, 0) / (items.length * 5),
            errorRate: items.filter(item => item.errorCode).length / items.length,
            costUsd: items.reduce((sum, item) => sum + item.costUsd, 0),
            latencyP50Ms,
        }
    })
    return { revision, caseCount, callCount: scores.length, rows }
}

export async function runModelBenchmark(input = {}, deps = {}) {
    const revision = Number(input.revision)
    if (!Number.isInteger(revision) || revision < 1) throw new Error('INVALID_BENCHMARK_REVISION')
    const candidates = (Array.isArray(input.candidates) ? input.candidates : []).slice(0, MAX_CANDIDATES)
    if (!candidates.length) throw new Error('INVALID_BENCHMARK_CANDIDATES')
    const cases = selectBenchmarkCases(input.cases, Math.min(MAX_CASES, Number(input.maxCases) || MAX_CASES))
    const callModel = deps.callModel
    const saveScore = deps.saveScore || (async () => {})
    const randomId = deps.randomId || (() => crypto.randomUUID())
    const now = deps.now || Date.now
    const deadlineNow = deps.deadlineNow || Date.now
    const requestedDeadline = Number(input.deadlineAtMs)
    const deadlineAtMs = Number.isFinite(requestedDeadline) && requestedDeadline > deadlineNow()
        ? requestedDeadline
        : deadlineNow() + DEFAULT_BENCHMARK_BUDGET_MS
    if (typeof callModel !== 'function') throw new Error('BENCHMARK_MODEL_REQUIRED')
    const scores = []

    const jobs = cases.flatMap(sourceCase => {
        const benchmarkCase = redactBenchmarkCase(sourceCase)
        const caseId = String(randomId())
        return candidates.map(candidate => ({ benchmarkCase, caseId, candidate }))
    })
    let cursor = 0
    const worker = async () => {
        while (cursor < jobs.length) {
            const job = jobs[cursor]
            cursor += 1
            const { benchmarkCase, caseId, candidate } = job
            const startedAt = now()
            let safeScore
            try {
                if (deadlineNow() >= deadlineAtMs) throw Object.assign(new Error('benchmark deadline'), { errorCode: 'timeout' })
                const result = await callModel({
                    provider: candidate.provider,
                    model: candidate.model,
                    system: 'מבחן מכירה יבש בלבד. החזר JSON עם messages, stage, handoff. אין להציע שיחת טלפון. מחירים תקינים: 690 או 990 ש״ח.',
                    messages: [{ role: 'user', content: JSON.stringify(benchmarkCase) }],
                    temperature: 0.3,
                    deadlineAtMs,
                })
                const scored = scoreBenchmarkCandidate({ raw: result?.text, benchmarkCase })
                const priced = costOfTextUsage(result?.usage, candidate.model)
                safeScore = {
                    caseId,
                    armId: String(candidate.id),
                    provider: String(candidate.provider),
                    model: String(candidate.model),
                    ...scored,
                    errorCode: null,
                    latencyMs: Math.max(0, now() - startedAt),
                    costUsd: priced.known ? priced.usd : 0,
                }
            } catch (error) {
                safeScore = {
                    caseId,
                    armId: String(candidate.id),
                    provider: String(candidate.provider),
                    model: String(candidate.model),
                    schemaValid: false,
                    noCallCompliant: false,
                    nextActionFit: false,
                    brevityCompliant: false,
                    catalogCompliant: false,
                    totalScore: 0,
                    errorCode: normalizeProviderError(error),
                    latencyMs: Math.max(0, now() - startedAt),
                    costUsd: 0,
                }
            }
            scores.push(safeScore)
            await saveScore(safeScore)
        }
    }
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, jobs.length) }, () => worker()))
    return aggregateScores(scores, revision, cases.length)
}

const modelBenchmark = {
    BENCHMARK_CANDIDATES,
    redactBenchmarkCase,
    selectBenchmarkCases,
    scoreBenchmarkCandidate,
    runModelBenchmark,
}
export default modelBenchmark
