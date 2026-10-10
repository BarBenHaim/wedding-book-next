// Server-owned rollout boundary. Enabling this policy is a separate release
// decision after commercial, consent, media and checkout data are approved.
import { extractReferralTouch, mergeAttribution } from './referralEvidence'
export const CONVERSATIONAL_POLICY_VERSION = '2026-10-05.v1'
export const CONVERSATIONAL_STATES = Object.freeze([
    'NEW', 'DISCOVERY', 'DEMO', 'OFFER', 'OBJECTION', 'CHECKOUT', 'PAID',
    'ONBOARDING', 'FREE_ACTIVATION', 'FOLLOWUP_SCHEDULED', 'HUMAN', 'SERVICE',
    'STOPPED', 'OFFER_MISMATCH',
])

export function isConversationalPolicyEnabled(env = process.env) {
    return env?.SALES_CONVERSATIONAL_POLICY_ENABLED === 'true'
}

const scopedRejection = /לא\s+מעוניי(?:ן|נת|נים|נות)\s+ב(?:ספר\s+)?(?:ה?מודפס|ה?דיגיטלי)/g
export function isProductAlternativeRequest(value) {
    const text = String(value)
    const request = product => new RegExp(`(?:יש|אפשר)\\s+(?:גם\\s+|רק\\s+|לקבל\\s+)?(?:ספר\\s+)?${product}|אבל\\s+(?:אני\\s+)?רוצה\\s+(?:ספר\\s+)?${product}`).test(text)
    return (/לא\s+מעוניי(?:ן|נת|נים|נות)\s+ב(?:ספר\s+)?ה?מודפס/.test(text) && request('דיגיטלי'))
        || (/לא\s+מעוניי(?:ן|נת|נים|נות)\s+ב(?:ספר\s+)?ה?דיגיטלי/.test(text) && request('מודפס'))
}
export function isMarketingStopRequest(value) {
    const text = String(value)
    // A specific format refusal plus a request for the other format is not a
    // global opt-out. Remove only that phrase; explicit stop/contact language
    // and any separate unscoped refusal still take precedence in the remainder.
    const alternative = isProductAlternativeRequest(text)
    const remainder = alternative ? text.replace(scopedRejection, '') : text
    // Keep the intent policy's separate withdrawal vocabulary authoritative
    // after removing the product-scoped phrase, even in a mixed message.
    if (alternative && /ויתר|לוותר|מוותר|החלטנו\s+שלא|לא\s+רלוונט|לא\s+מתאים\s+לנו|ירדנו\s+מזה|לא\s+תודה|לא\s+מה\s+ש(?:אני|אנחנו)\s+מחפש/.test(remainder)) return true
    return /תפסיק|הסירו|תסיר|אל\s+תשלח|לא\s+לשלוח|לא\s+לפנות|לא\s+מעוניי|^לא\s+תודה[.!\s]*$|\b(?:stop|unsubscribe|do not contact)\b/i.test(remainder)
}
export const isHumanServiceRequest = text => /נציג|בן\s+אדם|רוצה\s+את\s+בר|לדבר\s+עם\s+בר|תלונה|פרטיות|מחיקת\s+מידע|לבטל\s+(?:הזמנה|עסקה)|החזר\s+כספי|תתקשר/i.test(String(text))

const plain = value => value != null && typeof value === 'object'
    && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : null

function boundedJson(value, depth = 0) {
    if (depth > 5) return null
    if (value === null || typeof value === 'boolean') return value
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (typeof value === 'string') return value.slice(0, 1500)
    if (Array.isArray(value)) return value.slice(0, 30).map(item => boundedJson(item, depth + 1))
    if (!plain(value)) return null
    return Object.fromEntries(Object.entries(value).slice(0, 40)
        .filter(([key]) => !['__proto__', 'constructor', 'prototype', 'password', 'accessToken', 'creditCard', 'guestContent'].includes(key))
        .map(([key, item]) => [key.slice(0, 80), boundedJson(item, depth + 1)]))
}

// This argument is produced by deterministic server code, never by parsed model
// output or the request body. Payment, ownership and book truth are intentionally
// absent: a conversation patch cannot assert any of them.
export function sanitizeConversationContract(value) {
    if (!plain(value) || value.conversationalPolicyVersion !== CONVERSATIONAL_POLICY_VERSION) return {}
    const result = { conversationalPolicyVersion: CONVERSATIONAL_POLICY_VERSION }
    if (CONVERSATIONAL_STATES.includes(value.conversationalState)) result.conversationalState = value.conversationalState
    for (const field of ['automationDisclosed', 'marketingSuppressed', 'handoffPending']) {
        if (typeof value[field] === 'boolean') result[field] = value[field]
    }
    for (const field of ['conversationRevision', 'misunderstandingCount']) {
        if (Number.isSafeInteger(value[field]) && value[field] >= 0) result[field] = value[field]
    }
    for (const [field, max] of [['lastQuestion', 120], ['eventDateText', 160], ['eventDatePrecision', 20], ['lastObjection', 400], ['language', 20]]) {
        if (value[field] === null) result[field] = null
        else if (text(value[field], max)) result[field] = text(value[field], max)
    }
    for (const field of ['offerSnapshots', 'offerSnapshot', 'pendingOfferSnapshot', 'checkoutSnapshot', 'offerMismatch', 'sourceAttribution', 'followUpConsent', 'followUpSchedule']) {
        if (value[field] === null) result[field] = null
        else if (plain(value[field])) {
            const clean = boundedJson(value[field])
            if (JSON.stringify(clean).length <= (field === 'offerSnapshots' ? 16000 : 8000)) result[field] = clean
        }
    }
    return result
}

export function sourceAttributionFromInbound(body = {}, existing = null, nowMs = Date.now(), context = {}) {
    // Authentication is a server-owned context, never inferred from body IDs.
    return mergeAttribution(existing, extractReferralTouch(body, {
        eventId: context.eventId, occurredAtMs: context.occurredAtMs, receivedAtMs: nowMs, transport: context.transport,
    }))
}

export function extractSuppliedTiming(incomingText = '') {
    const value = String(incomingText)
    const exact = value.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
    if (exact && !Number.isNaN(Date.parse(exact[1]))) return { eventDate: exact[1], eventDateText: exact[1], eventDatePrecision: 'day' }
    const approximate = value.match(/(?:בעוד\s+(?:\d+|חודשיים|שבועיים|חודש|שבוע)(?:\s+(?:חודשים|שבועות|ימים))?|ב?(?:ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)(?:\s+20\d{2})?)/)
    return approximate ? { eventDateText: approximate[0], eventDatePrecision: 'approximate' } : {}
}
