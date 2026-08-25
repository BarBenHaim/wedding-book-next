const DEFAULT_BUSINESS_OS_URL = 'https://businessos-control.vercel.app'
const DEFAULT_TIMEOUT_MS = 400
const SAFE_STAGES = new Set([
    'new', 'engaged', 'qualified', 'demo_sent', 'offer_sent', 'objection',
    'commit_later', 'ready_to_pay', 'checkout', 'closed_won', 'closed_lost', 'handoff',
])

const boundedString = (value, max) => typeof value === 'string' && value.trim() && value.trim().length <= max
    ? value.trim()
    : null

function safeDate(value) {
    const text = boundedString(value, 10)
    return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function safeTimestamp(value) {
    const text = boundedString(value, 40)
    return text && Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : null
}

function sanitizeFound(payload) {
    const result = { state: 'found', hasPriorConversation: true }
    const eventType = boundedString(payload.eventType, 80)
    const eventDate = safeDate(payload.eventDate)
    const celebrantName = boundedString(payload.celebrantName, 80)
    const stage = SAFE_STAGES.has(payload.stage) ? payload.stage : null
    const messageCount = Number.isInteger(payload.messageCount) && payload.messageCount > 0 && payload.messageCount <= 100_000
        ? payload.messageCount
        : null
    const lastMessageAt = safeTimestamp(payload.lastMessageAt)
    const summary = boundedString(payload.summary, 500)
    if (eventType) result.eventType = eventType
    if (eventDate) result.eventDate = eventDate
    if (celebrantName) result.celebrantName = celebrantName
    if (stage) result.stage = stage
    if (messageCount) result.messageCount = messageCount
    if (lastMessageAt) result.lastMessageAt = lastMessageAt
    if (summary) result.summary = summary
    return result
}

function endpoint(baseUrl) {
    const url = new URL(baseUrl || DEFAULT_BUSINESS_OS_URL)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
        throw new Error('unsafe BusinessOS URL')
    }
    return new URL('/api/crm/whatsapp-leads/context', url).toString()
}

export async function readPriorConversationContext(phone, {
    fetcher = fetch,
    baseUrl = process.env.BUSINESS_OS_URL || DEFAULT_BUSINESS_OS_URL,
    secret = process.env.SALES_AGENT_SECRET,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    occurredAt = null,
} = {}) {
    const unknown = { state: 'unknown', hasPriorConversation: true }
    if (!String(phone || '').trim() || !String(secret || '').trim()) return unknown
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(Number(timeoutMs) || DEFAULT_TIMEOUT_MS, 1_000)))
    try {
        const eventTimestamp = safeTimestamp(occurredAt)
        const requestBody = { phone: String(phone) }
        if (eventTimestamp) requestBody.occurredAt = eventTimestamp
        const res = await fetcher(endpoint(baseUrl), {
            method: 'POST',
            headers: {
                authorization: `Bearer ${secret}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
            cache: 'no-store',
        })
        if (!res?.ok) return unknown
        const payload = await res.json()
        if (payload?.found === false) return { state: 'none', hasPriorConversation: false }
        if (payload?.found !== true) return unknown
        return sanitizeFound(payload) || unknown
    } catch {
        return unknown
    } finally {
        clearTimeout(timer)
    }
}

export default readPriorConversationContext
