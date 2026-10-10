// Referral metadata is evidence of a source, never proof of payment, consent,
// offer eligibility, or a verified Meta signature. The current route authenticates
// Make's shared secret; it does not receive the original signed Meta request.
// Meta reference (checked 2026-10-06; main developer endpoint rate-limited):
// https://www.postman.com/meta/whatsapp-business-platform/folder/1dtuocp/messages-object
// https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages
// Customers can remove referral metadata. Absence therefore means unknown.

const VERSION = 1
const MAX_EVENTS = 8
const SOURCES = new Set(['unknown', 'meta_ad', 'meta_post', 'instagram_ad', 'facebook_ad', 'tiktok', 'google', 'referral'])
const EVIDENCE = new Set(['unknown', 'meta_referral', 'transport_mapping', 'transport_source', 'legacy_unverified'])
const CONFIDENCE = new Set(['unknown', 'authenticated_transport', 'provider_signature_verified', 'unverified_transport', 'legacy_unverified'])
const REASONS = new Set(['no_referral', 'repaired_transport_payload', 'unverified_transport_serialization', 'ambiguous_message', 'missing_event_id', 'missing_occurrence_time', 'future_occurrence_time'])
const ID_FIELDS = ['sourceId', 'adId', 'campaignId', 'adsetId']
const plain = value => value != null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
const own = (value, key) => plain(value) && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined
// Do not truncate an ID or convert unsafe numbers: either action invents an ID.
const token = (value, max = 160) => typeof value === 'string' && value.length <= max
    && /^[A-Za-z0-9._:+=/-]+$/.test(value) ? value : null
const identifier = value => typeof value === 'string' && value.length <= 160 && /^[A-Za-z0-9_-]+$/.test(value) ? value : null
const millis = value => Number.isSafeInteger(value) && value > 0 && value <= 8640000000000000 ? value : null
const sourceOf = value => SOURCES.has(value) ? value : 'unknown'
const evidenceOf = value => EVIDENCE.has(value) ? value : 'unknown'

function sourceOrigin(value) {
    if (typeof value !== 'string' || value.length > 2048) return null
    try {
        const url = new URL(value)
        const hosts = ['fb.me', 'facebook.com', 'www.facebook.com', 'm.facebook.com', 'instagram.com', 'www.instagram.com']
        if (url.protocol !== 'https:' || url.username || url.password || url.port || !hosts.includes(url.hostname)) return null
        // Paths can also carry customer information, not only query parameters.
        return url.origin
    } catch { return null }
}

function timestamp(value) {
    if (typeof value === 'number') return millis(value < 1e12 ? value * 1000 : value)
    if (typeof value !== 'string' || value.length > 40) return null
    if (/^\d{10,13}$/.test(value)) return timestamp(Number(value))
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null
    return millis(Date.parse(value))
}

function transportOf(value) {
    const provider = ['make', 'meta'].includes(value?.provider) ? value.provider : 'unknown'
    return {
        provider,
        authenticated: value?.authenticated === true,
        // An intermediary's authentication does not verify Meta's signature.
        providerSignatureVerified: provider === 'meta' && value?.providerSignatureVerified === true,
        payloadRepaired: value?.payloadRepaired === true,
        // Parsing JSON successfully does not prove interpolated customer text
        // could not inject another field into a legacy raw Make template.
        structuredPayloadVerified: value?.structuredPayloadVerified === true,
    }
}

function selectMessage(body, eventId) {
    const messages = []
    if ((Array.isArray(body.messages) && body.messages.length > 100) || (Array.isArray(body.entry) && body.entry.length > 20)) return { message: {}, ambiguous: true }
    if (Array.isArray(body.messages)) messages.push(...body.messages.slice(0, 100).filter(plain))
    for (const entry of Array.isArray(body.entry) ? body.entry.slice(0, 20) : []) {
        if (Array.isArray(entry?.changes) && entry.changes.length > 20) return { message: {}, ambiguous: true }
        for (const change of Array.isArray(entry?.changes) ? entry.changes.slice(0, 20) : []) {
            if (change?.field !== 'messages') continue
            if (Array.isArray(change?.value?.messages) && change.value.messages.length > 100) return { message: {}, ambiguous: true }
            if (Array.isArray(change?.value?.messages)) messages.push(...change.value.messages.slice(0, 100).filter(plain))
        }
    }
    if (!messages.length) return { message: body, ambiguous: false }
    const matches = eventId ? messages.filter(message => message.id === eventId) : messages
    return matches.length === 1 ? { message: matches[0], ambiguous: false } : { message: {}, ambiguous: true }
}

function normalizeTouch(value, includeOperationalIds = true) {
    if (!plain(value)) return null
    const transport = transportOf(value.transport)
    const source = sourceOf(value.source)
    const fieldEvidence = {}
    for (const key of ID_FIELDS) {
        const evidence = evidenceOf(value.fieldEvidence?.[key])
        if (identifier(value[key]) && evidence !== 'unknown') fieldEvidence[key] = evidence
    }
    const result = {
        source, sourceType: ['ad', 'post'].includes(value.sourceType) ? value.sourceType : null,
        ...Object.fromEntries(ID_FIELDS.map(key => [key, identifier(value[key])])),
        evidence: evidenceOf(value.evidence),
        confidence: CONFIDENCE.has(value.confidence) ? value.confidence : 'unknown',
        fieldEvidence,
        occurredAtMs: millis(value.occurredAtMs), receivedAtMs: millis(value.receivedAtMs),
        timeEvidence: ['provider_message', 'transport_occurrence', 'unknown'].includes(value.timeEvidence) ? value.timeEvidence : 'unknown',
        transport,
        reason: REASONS.has(value.reason) ? value.reason : null,
    }
    if (result.confidence === 'provider_signature_verified' && !transport.providerSignatureVerified) result.confidence = 'unverified_transport'
    if (result.confidence === 'authenticated_transport' && !transport.authenticated) result.confidence = 'unverified_transport'
    if (includeOperationalIds) Object.assign(result, {
        eventId: token(value.eventId, 300), ctwaClid: token(value.ctwaClid, 512), sourceUrlOrigin: sourceOrigin(value.sourceUrlOrigin),
    })
    const blocked = transport.payloadRepaired ? 'repaired_transport_payload'
        : !transport.structuredPayloadVerified ? 'unverified_transport_serialization' : null
    if (blocked) {
        Object.assign(result, {
            source: 'unknown', sourceType: null,
            ...Object.fromEntries(ID_FIELDS.map(key => [key, null])),
            evidence: 'unknown', confidence: 'unknown', fieldEvidence: {}, reason: blocked,
        })
        if (includeOperationalIds) Object.assign(result, { ctwaClid: null, sourceUrlOrigin: null })
    }
    return result
}

/**
 * Normalize one customer event. Options are SERVER-OWNED, not copied from body.
 * The caller must authenticate the route and identify customer vs business echo.
 * structuredPayloadVerified requires a server-owned release gate after verifying
 * the upstream serializer keeps customer content separate from metadata. It
 * must never come from a request-body flag or merely a successful JSON parse.
 * Native batched envelopes require a matching eventId; do not attach another
 * customer's referral by taking the first message of a batch.
 */
export function extractReferralTouch(input = {}, options = {}) {
    const body = plain(input) ? input : {}
    const routeEventId = token(options.eventId, 300) || token(body.eventId, 300)
    const { message, ambiguous } = selectMessage(body, routeEventId)
    const eventId = routeEventId || token(message.id, 300)
    const transport = transportOf(options.transport)
    const receivedAtMs = millis(options.receivedAtMs)
    const providerTime = timestamp(message.timestamp)
    let occurredAtMs = millis(options.occurredAtMs) || providerTime || timestamp(body.occurredAt)
    let reason = ambiguous ? 'ambiguous_message' : transport.payloadRepaired ? 'repaired_transport_payload' : null
    if (receivedAtMs && occurredAtMs > receivedAtMs + 300000) {
        occurredAtMs = null
        reason ||= 'future_occurrence_time'
    }
    reason ||= !eventId ? 'missing_event_id' : !occurredAtMs ? 'missing_occurrence_time' : null
    const usable = !ambiguous && !transport.payloadRepaired && transport.structuredPayloadVerified
    const referral = usable && plain(message.referral) ? message.referral : {}
    // Native snake_case fields take precedence over connector aliases. Do not
    // fuse an adId alias into a native post or a source with unspecified type.
    const native = ['source_id', 'source_type', 'source_url', 'ctwa_clid'].some(key => own(referral, key) !== undefined)
    const get = (snake, camel) => usable ? own(referral, snake) ?? own(referral, camel) ?? (message === body ? own(body, snake) ?? own(body, camel) : undefined) : undefined
    const sourceTypeValue = get('source_type', 'sourceType')
    const sourceType = ['ad', 'post'].includes(sourceTypeValue) ? sourceTypeValue : null
    const sourceId = identifier(get('source_id', 'sourceId'))
    const aliasAdId = usable && !native && !sourceId && !sourceType ? identifier(own(referral, 'adId') ?? (message === body ? own(body, 'adId') : undefined)) : null
    const adId = sourceType === 'ad' ? sourceId : aliasAdId
    const campaignId = usable ? identifier(own(referral, 'campaignId') ?? (message === body ? own(body, 'campaignId') : undefined)) : null
    const adsetId = usable ? identifier(own(referral, 'adsetId') ?? (message === body ? own(body, 'adsetId') : undefined)) : null
    const ctwaClid = token(get('ctwa_clid', 'ctwaClid'), 512)
    const sourceUrlOrigin = sourceOrigin(get('source_url', 'sourceUrl'))
    const hasReferral = Boolean(sourceType || sourceId || ctwaClid || sourceUrlOrigin)
    const mappedSource = usable && message === body ? sourceOf(body.source) : 'unknown'
    const source = sourceType === 'post' ? 'meta_post' : sourceType === 'ad' || ctwaClid || aliasAdId ? 'meta_ad' : mappedSource
    const evidence = hasReferral ? 'meta_referral' : aliasAdId || campaignId || adsetId ? 'transport_mapping' : source !== 'unknown' ? 'transport_source' : 'unknown'
    const confidence = evidence === 'unknown' ? 'unknown' : transport.providerSignatureVerified ? 'provider_signature_verified'
        : transport.authenticated ? 'authenticated_transport' : 'unverified_transport'
    const fieldEvidence = {}
    if (sourceId) fieldEvidence.sourceId = 'meta_referral'
    if (adId) fieldEvidence.adId = aliasAdId ? 'transport_mapping' : 'meta_referral'
    if (campaignId) fieldEvidence.campaignId = 'transport_mapping'
    if (adsetId) fieldEvidence.adsetId = 'transport_mapping'
    return normalizeTouch({
        eventId, source, sourceType, sourceId, adId, campaignId, adsetId, ctwaClid, sourceUrlOrigin,
        evidence, confidence, fieldEvidence, occurredAtMs, receivedAtMs,
        timeEvidence: occurredAtMs ? providerTime === occurredAtMs ? 'provider_message' : 'transport_occurrence' : 'unknown',
        transport, reason: reason || (evidence === 'unknown' ? 'no_referral' : null),
    })
}

function snapshot(firstTouch, latestTouch, processedEventIds, updatedAtMs, includeOperationalIds) {
    const first = normalizeTouch(firstTouch, includeOperationalIds)
    const latest = normalizeTouch(latestTouch, includeOperationalIds)
    return {
        version: VERSION, coverage: 'observed_since_tracking_v1',
        source: first?.source || 'unknown', campaignId: first?.campaignId || null,
        adsetId: first?.adsetId || null, adId: first?.adId || null,
        evidence: first?.evidence || 'unknown', confidence: first?.confidence || 'unknown',
        firstTouch: first, latestTouch: latest,
        ...(includeOperationalIds ? { processedEventIds: [...new Set(processedEventIds.filter(id => token(id, 300)))].slice(-MAX_EVENTS) } : {}),
        updatedAtMs: millis(updatedAtMs),
    }
}

/**
 * Allowlisted, idempotent read boundary for protected checkout snapshots.
 * includeOperationalIds=false removes event/click IDs and URL origins at every
 * depth. It does not upgrade legacy observations or source confidence.
 */
export function sanitizeAttributionSnapshot(value, { includeOperationalIds = true } = {}) {
    const existing = plain(value) ? value : {}
    const first = existing.version === VERSION ? normalizeTouch(existing.firstTouch) : null
    const latest = existing.version === VERSION ? normalizeTouch(existing.latestTouch) : first
    return snapshot(first, latest, existing.version === VERSION && Array.isArray(existing.processedEventIds) ? existing.processedEventIds.slice(-MAX_EVENTS) : [], existing.version === VERSION ? existing.updatedAtMs : null, includeOperationalIds)
}

/**
 * First observed customer touch is immutable, including an unknown source.
 * Later explicit referrals retain their own occurrence time as latestTouch.
 * Receipt/retry time never makes a stale event newer. With missing event/time
 * identity the attribution cannot be merged; the caller's inbound claim remains
 * the durable idempotency authority beyond this bounded recent-event cache.
 */
export function mergeAttribution(existing, value) {
    const state = sanitizeAttributionSnapshot(existing)
    const touch = normalizeTouch(value)
    if (!touch?.eventId || !touch.occurredAtMs) return state
    if (state.processedEventIds.includes(touch.eventId)
        || state.firstTouch?.eventId === touch.eventId || state.latestTouch?.eventId === touch.eventId) return state
    const first = state.firstTouch || touch
    const latestTime = state.latestTouch?.occurredAtMs ?? state.firstTouch?.occurredAtMs
    const advances = !state.latestTouch || (touch.evidence !== 'unknown' && latestTime != null && touch.occurredAtMs > latestTime)
    // Unknown later messages do not erase known referral evidence. Stale events
    // do not change timestamps, source or the dedupe history.
    if (state.firstTouch && !advances) return state
    return snapshot(first, advances ? touch : state.latestTouch,
        [...state.processedEventIds, touch.eventId], touch.receivedAtMs, true)
}
