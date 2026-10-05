// Server-owned rollout boundary. Enabling this policy is a separate release
// decision after commercial, consent, media and checkout data are approved.
export const CONVERSATIONAL_POLICY_VERSION = '2026-10-05.v1'
export const CONVERSATIONAL_STATES = Object.freeze([
    'NEW', 'DISCOVERY', 'DEMO', 'OFFER', 'OBJECTION', 'CHECKOUT', 'PAID',
    'ONBOARDING', 'FREE_ACTIVATION', 'FOLLOWUP_SCHEDULED', 'HUMAN', 'SERVICE',
    'STOPPED', 'OFFER_MISMATCH',
])

export function isConversationalPolicyEnabled(env = process.env) {
    return env?.SALES_CONVERSATIONAL_POLICY_ENABLED === 'true'
}

export const isMarketingStopRequest = text => /תפסיק|הסירו|תסיר|אל\s+תשלח|לא\s+לשלוח|לא\s+לפנות|לא\s+מעוניי|^לא\s+תודה[.!\s]*$|\b(?:stop|unsubscribe|do not contact)\b/i.test(String(text))
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

export function sourceAttributionFromInbound(body = {}, existing = null, nowMs = Date.now()) {
    if (existing && plain(existing)) return boundedJson(existing)
    const referral = plain(body.referral) ? body.referral : {}
    const sourceId = text(referral.source_id || body.adId, 160)
    const campaignId = text(body.campaignId, 160)
    const source = text(body.source, 60)
    return {
        source: source || 'unknown',
        campaignId: campaignId || null,
        adId: sourceId || null,
        // Transport context identifies attribution, never offer validity or consent.
        evidence: sourceId ? 'transport_referral' : source ? 'transport_source' : 'unknown',
        recordedAtMs: nowMs,
    }
}

export function extractSuppliedTiming(incomingText = '') {
    const value = String(incomingText)
    const exact = value.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
    if (exact && !Number.isNaN(Date.parse(exact[1]))) return { eventDate: exact[1], eventDateText: exact[1], eventDatePrecision: 'day' }
    const approximate = value.match(/(?:בעוד\s+(?:\d+|חודשיים|שבועיים|חודש|שבוע)(?:\s+(?:חודשים|שבועות|ימים))?|ב?(?:ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)(?:\s+20\d{2})?)/)
    return approximate ? { eventDateText: approximate[0], eventDatePrecision: 'approximate' } : {}
}
