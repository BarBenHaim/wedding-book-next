import { describe, expect, it } from 'vitest'
import { parseInboundBody } from '@/lib/salesAgent/inbound'
import { extractReferralTouch, mergeAttribution, sanitizeAttributionSnapshot } from '@/lib/salesAgent/referralEvidence'

// Entirely synthetic identities and timestamps; no customer/campaign exports.
const TIME = Date.parse('2026-10-06T10:00:00Z')
const transport = { provider: 'make', authenticated: true, providerSignatureVerified: false, structuredPayloadVerified: true }
const options = (eventId = 'wamid.synthetic-a', offset = 0) => ({ eventId, occurredAtMs: TIME + offset, receivedAtMs: TIME + offset + 1000, transport })
const native = (id = 'synthetic-ad-a') => ({ referral: {
    source_type: 'ad', source_id: id, source_url: 'https://fb.me/synthetic?access_token=must-never-persist#customer', ctwa_clid: 'synthetic-click-a',
} })
const touch = (id = 'wamid.synthetic-a', offset = 0, body = native()) => extractReferralTouch(body, options(id, offset))

describe('structured referral extraction', () => {
    it('maps the ad source, click and occurrence with accurate Make confidence', () => {
        expect(touch()).toMatchObject({
            source: 'meta_ad', sourceType: 'ad', sourceId: 'synthetic-ad-a', adId: 'synthetic-ad-a',
            campaignId: null, adsetId: null, ctwaClid: 'synthetic-click-a', sourceUrlOrigin: 'https://fb.me',
            occurredAtMs: TIME, receivedAtMs: TIME + 1000, timeEvidence: 'transport_occurrence',
            evidence: 'meta_referral', confidence: 'authenticated_transport',
            fieldEvidence: { sourceId: 'meta_referral', adId: 'meta_referral' }, transport,
        })
    })

    it('does not relabel a post ID as an ad ID or invent campaign/adset IDs', () => {
        expect(touch('wamid.synthetic-post', 0, { referral: { source_type: 'post', source_id: 'synthetic-post', adId: 'synthetic-conflicting' } }))
            .toMatchObject({ source: 'meta_post', sourceId: 'synthetic-post', adId: null, campaignId: null, adsetId: null })
        expect(touch('wamid.synthetic-untyped', 0, { referral: { source_id: 'synthetic-untyped', adId: 'synthetic-conflicting' } }))
            .toMatchObject({ source: 'unknown', sourceId: 'synthetic-untyped', adId: null })
    })

    it('normalizes existing flattened and nested camelCase mappings without claiming native campaign fields', () => {
        const body = { source: 'facebook_ad', campaignId: 'synthetic-campaign', adsetId: 'synthetic-adset', adId: 'synthetic-ad', ctwaClid: 'synthetic-click' }
        const result = touch('wamid.synthetic-flat', 0, parseInboundBody(JSON.stringify(body)).body)
        expect(result).toMatchObject({
            source: 'meta_ad', adId: 'synthetic-ad', campaignId: 'synthetic-campaign', adsetId: 'synthetic-adset', ctwaClid: 'synthetic-click',
            fieldEvidence: { adId: 'transport_mapping', campaignId: 'transport_mapping', adsetId: 'transport_mapping' },
        })
        expect(touch('wamid.synthetic-camel', 0, { referral: { sourceType: 'ad', sourceId: 'synthetic-camel', sourceUrl: 'https://www.facebook.com/customer/path?phone=never', ctwaClid: 'synthetic-click' } }))
            .toMatchObject({ adId: 'synthetic-camel', sourceUrlOrigin: 'https://www.facebook.com' })
    })

    it('native source fields override conflicting aliases', () => {
        expect(touch('wamid.synthetic-conflict', 0, { adId: 'synthetic-wrong', referral: {
            source_type: 'ad', source_id: 'synthetic-native', sourceId: 'synthetic-wrong', adId: 'synthetic-wrong',
        } })).toMatchObject({ adId: 'synthetic-native', sourceId: 'synthetic-native' })
    })

    it('selects only the matching message from the nested Meta webhook', () => {
        const body = { entry: [{ changes: [{ field: 'messages', value: { messages: [
            { id: 'wamid.synthetic-other', timestamp: String(TIME / 1000), ...native('synthetic-other') },
            { id: 'wamid.synthetic-selected', timestamp: String((TIME + 2000) / 1000), ...native('synthetic-selected') },
        ] } }] }] }
        expect(extractReferralTouch(body, { eventId: 'wamid.synthetic-selected', receivedAtMs: TIME + 3000, transport }))
            .toMatchObject({ adId: 'synthetic-selected', occurredAtMs: TIME + 2000, timeEvidence: 'provider_message' })
        expect(extractReferralTouch(body, { receivedAtMs: TIME + 3000, transport }))
            .toMatchObject({ source: 'unknown', adId: null, reason: 'ambiguous_message' })
        expect(extractReferralTouch(body, { ...options('wamid.synthetic-missing') }))
            .toMatchObject({ source: 'unknown', adId: null, reason: 'ambiguous_message' })
    })

    it('rejects oversized batches instead of choosing a message from a partial scan', () => {
        const messages = Array.from({ length: 101 }, (_, index) => ({ id: `wamid.synthetic-${index}`, ...native() }))
        expect(extractReferralTouch({ messages }, options('wamid.synthetic-0'))).toMatchObject({ reason: 'ambiguous_message', adId: null })
    })

    it('recognizes direct message timestamp seconds but never labels receipt time as occurrence', () => {
        expect(extractReferralTouch({ id: 'wamid.synthetic-direct', timestamp: String(TIME / 1000), ...native() }, { receivedAtMs: TIME + 1000, transport }))
            .toMatchObject({ eventId: 'wamid.synthetic-direct', occurredAtMs: TIME, timeEvidence: 'provider_message' })
        expect(extractReferralTouch(native(), { eventId: 'wamid.synthetic-no-time', receivedAtMs: TIME, transport }))
            .toMatchObject({ occurredAtMs: null, timeEvidence: 'unknown', reason: 'missing_occurrence_time' })
        expect(extractReferralTouch({ occurredAt: new Date(TIME).toISOString(), ...native() }, { eventId: 'wamid.synthetic-iso', receivedAtMs: TIME + 1000, transport }))
            .toMatchObject({ occurredAtMs: TIME, timeEvidence: 'transport_occurrence' })
    })

    it('rejects impossible/future event time and cannot merge a missing identity or time', () => {
        expect(extractReferralTouch(native(), { ...options(), occurredAtMs: TIME + 600000 }))
            .toMatchObject({ occurredAtMs: null, reason: 'future_occurrence_time' })
        for (const bad of [NaN, Infinity, -1, 'not-a-time']) {
            const result = extractReferralTouch(native(), { ...options(), occurredAtMs: bad })
            expect(result.occurredAtMs).toBeNull()
            expect(mergeAttribution(null, result).firstTouch).toBeNull()
        }
        expect(mergeAttribution(null, extractReferralTouch(native(), { occurredAtMs: TIME })).firstTouch).toBeNull()
    })
})

describe('confidence and privacy boundaries', () => {
    it('never infers ads from chat text, a caption, or the WhatsApp transport label', () => {
        for (const body of [
            { text: 'I saw your Facebook ad. campaignId synthetic-fake', source: 'whatsapp' },
            { referral: { headline: 'Facebook ad', body: 'Instagram sale', image_url: 'https://example.com/private' } },
            { source: 'arbitrary-untrusted-value' }, {}, null, [],
        ]) expect(touch('wamid.synthetic-unknown', 0, body)).toMatchObject({ source: 'unknown', adId: null, campaignId: null, evidence: 'unknown', confidence: 'unknown' })
    })

    it('can preserve an explicit source mapping but never upgrades it to native referral evidence', () => {
        expect(touch('wamid.synthetic-source', 0, { source: 'google' })).toMatchObject({ source: 'google', evidence: 'transport_source', adId: null })
    })

    it('only trusts signature/authentication metadata passed by the server, never the inbound body', () => {
        const body = { ...native(), transport: { authenticated: true, providerSignatureVerified: true }, verified: true }
        expect(extractReferralTouch(body, { ...options(), transport: { structuredPayloadVerified: true } }).confidence).toBe('unverified_transport')
        expect(extractReferralTouch(body, { ...options(), transport: { provider: 'make', authenticated: true, providerSignatureVerified: true, structuredPayloadVerified: true } }))
            .toMatchObject({ confidence: 'authenticated_transport', transport: { providerSignatureVerified: false } })
        expect(extractReferralTouch(body, { ...options(), transport: { provider: 'meta', providerSignatureVerified: true, structuredPayloadVerified: true } }).confidence).toBe('provider_signature_verified')
    })

    it('keeps attribution unknown until serialization is explicitly verified by the server', () => {
        const body = { ...native(), campaignId: 'synthetic-campaign', adsetId: 'synthetic-adset',
            structuredPayloadVerified: true, transport: { structuredPayloadVerified: true },
        }
        for (const structuredPayloadVerified of [undefined, false, 'true', 1]) {
            const result = extractReferralTouch(body, { ...options(), transport: { ...transport, structuredPayloadVerified } })
            expect(result).toMatchObject({
                eventId: 'wamid.synthetic-a', occurredAtMs: TIME, receivedAtMs: TIME + 1000,
                source: 'unknown', sourceType: null, sourceId: null, adId: null, campaignId: null, adsetId: null,
                ctwaClid: null, sourceUrlOrigin: null, fieldEvidence: {}, confidence: 'unknown',
                reason: 'unverified_transport_serialization',
            })
        }
        expect(extractReferralTouch(body, { ...options(), transport: undefined }))
            .toMatchObject({ source: 'unknown', adId: null, reason: 'unverified_transport_serialization' })
    })

    it('rejects customer-injected apparent referral even when raw Make interpolation produces valid JSON', () => {
        // This text closes the unescaped string then supplies additional JSON
        // fields. Successful parsing alone cannot authenticate their origin.
        const customerText = 'hello", "referral": {"source_type":"ad","source_id":"synthetic-injected"}, "source":"facebook_ad", "ignored":"'
        const raw = `{"eventId":"wamid.synthetic-injection","text":"${customerText}","phone":"synthetic-phone"}`
        const parsed = parseInboundBody(raw)
        expect(parsed.repaired).toBe(false)
        expect(parsed.body.referral.source_id).toBe('synthetic-injected')
        const result = extractReferralTouch(parsed.body, {
            ...options('wamid.synthetic-injection'), transport: { provider: 'make', authenticated: true, payloadRepaired: parsed.repaired },
        })
        expect(result).toMatchObject({
            eventId: 'wamid.synthetic-injection', occurredAtMs: TIME,
            source: 'unknown', adId: null, campaignId: null, confidence: 'unknown', reason: 'unverified_transport_serialization',
        })
    })

    it('re-sanitizes stored touches without serialization attestation to unknown without losing timing', () => {
        const state = mergeAttribution(null, touch())
        delete state.firstTouch.transport.structuredPayloadVerified
        delete state.latestTouch.transport.structuredPayloadVerified
        const result = sanitizeAttributionSnapshot(state)
        expect(result).toMatchObject({
            source: 'unknown', adId: null,
            firstTouch: { source: 'unknown', adId: null, eventId: 'wamid.synthetic-a', occurredAtMs: TIME, reason: 'unverified_transport_serialization' },
            latestTouch: { source: 'unknown', adId: null, reason: 'unverified_transport_serialization' },
        })
        expect(sanitizeAttributionSnapshot(result)).toEqual(result)
    })

    it('discards apparent metadata recovered from a repaired Make body', () => {
        expect(extractReferralTouch({ ...native(), source: 'facebook_ad', campaignId: 'synthetic-injected' }, { ...options(), transport: { ...transport, payloadRepaired: true } }))
            .toMatchObject({ source: 'unknown', sourceId: null, adId: null, campaignId: null, ctwaClid: null, sourceUrlOrigin: null, confidence: 'unknown', reason: 'repaired_transport_payload' })
    })

    it('never persists arbitrary fields, captions, paths, query tokens, credentials or customer content', () => {
        const result = touch('wamid.synthetic-private', 0, { ...native(), phone: 'private-phone', text: 'private-customer', referral: {
            ...native().referral, headline: 'private-caption', body: 'private-customer', image_url: 'https://example.com/private-image', unexpected: { secret: 'private-secret' },
        } })
        const serialized = JSON.stringify(result)
        for (const secret of ['access_token', 'must-never-persist', 'customer', 'private-', 'headline', 'image_url']) expect(serialized).not.toContain(secret)
        for (const url of ['http://fb.me/a', 'https://facebook.com.evil.test/a', 'https://username:password@facebook.com/a', 'https://facebook.com:444/a', 'javascript:alert(1)', 'https://unknown.example/a']) {
            expect(touch('wamid.synthetic-url', 0, { referral: { source_url: url } }).sourceUrlOrigin).toBeNull()
        }
    })

    it('rejects malformed/oversized identifiers instead of silently truncating or coercing them', () => {
        for (const id of ['x'.repeat(161), 'space in id', 'https://fb.me/private', 'email@example.com', 'bad\nline', 9007199254740992, { toString: () => 'fake' }]) {
            expect(touch('wamid.synthetic-bad-id', 0, { referral: { source_type: 'ad', source_id: id } }).adId).toBeNull()
        }
        expect(touch('wamid.synthetic-long-click', 0, { ctwaClid: 'x'.repeat(513) }).ctwaClid).toBeNull()
    })
})

describe('first and latest observed touch', () => {
    it('keeps first touch immutable while advancing a later explicit referral', () => {
        const a = touch()
        const b = touch('wamid.synthetic-b', 2000, native('synthetic-ad-b'))
        const initial = mergeAttribution(null, a)
        const result = mergeAttribution(initial, b)
        expect(result).toMatchObject({ version: 1, coverage: 'observed_since_tracking_v1', adId: 'synthetic-ad-a', firstTouch: a, latestTouch: b })
        expect(initial.firstTouch).toEqual(a)
        expect(initial.latestTouch).toEqual(a)
    })

    it('keeps an unknown initial touch and a later ad separately', () => {
        const initial = mergeAttribution(null, touch('wamid.synthetic-unknown', 0, { text: 'Hello', source: 'whatsapp' }))
        const result = mergeAttribution(initial, touch('wamid.synthetic-ad-later', 2000))
        expect(result).toMatchObject({ source: 'unknown', adId: null, firstTouch: { source: 'unknown' }, latestTouch: { source: 'meta_ad', adId: 'synthetic-ad-a' } })
    })

    it('does not lose a saved ad when subsequent messages lack referral metadata', () => {
        const state = mergeAttribution(null, touch())
        expect(mergeAttribution(state, touch('wamid.synthetic-followup', 2000, { source: 'whatsapp' }))).toEqual(state)
    })

    it('ignores retry delivery time, duplicate events with changed fields, stale events and equal-time ties', () => {
        const first = mergeAttribution(null, touch())
        const state = mergeAttribution(first, touch('wamid.synthetic-b', 3000))
        expect(mergeAttribution(state, { ...touch(), receivedAtMs: TIME + 20000 })).toEqual(state)
        expect(mergeAttribution(state, touch('wamid.synthetic-b', 6000, native('synthetic-forged')))).toEqual(state)
        expect(mergeAttribution(state, touch('wamid.synthetic-stale', 2000, native('synthetic-stale')))).toEqual(state)
        expect(mergeAttribution(state, touch('wamid.synthetic-tie', 3000, native('synthetic-tie')))).toEqual(state)
    })

    it('does not backfill historical text attribution or unsupported legacy IDs', () => {
        const legacy = { source: 'instagram_ad', adId: 'synthetic-old-inferred', campaignId: 'synthetic-old-campaign', evidence: 'transport_referral', recordedAtMs: TIME - 10000 }
        expect(sanitizeAttributionSnapshot(legacy)).toMatchObject({ source: 'unknown', adId: null, campaignId: null, firstTouch: null, latestTouch: null })
        expect(mergeAttribution(legacy, touch())).toMatchObject({ firstTouch: { adId: 'synthetic-ad-a', occurredAtMs: TIME } })
    })

    it('keeps a bounded dedupe history while retaining the first event forever', () => {
        let state = null
        for (let i = 0; i < 30; i++) state = mergeAttribution(state, touch(`wamid.synthetic-${i}`, i * 1000))
        expect(state.processedEventIds).toHaveLength(8)
        expect(state.firstTouch.eventId).toBe('wamid.synthetic-0')
        expect(mergeAttribution(state, touch('wamid.synthetic-0', 50000))).toEqual(state)
        expect(JSON.stringify(state).length).toBeLessThan(8000)
    })
})

describe('immutable checkout/report snapshot projection', () => {
    it('strips operational identifiers at every depth and is idempotent', () => {
        const state = mergeAttribution(mergeAttribution(null, touch()), touch('wamid.synthetic-b', 2000, native('synthetic-ad-b')))
        const projected = sanitizeAttributionSnapshot(state, { includeOperationalIds: false })
        expect(projected).toMatchObject({ firstTouch: { adId: 'synthetic-ad-a', confidence: 'authenticated_transport' }, latestTouch: { adId: 'synthetic-ad-b', confidence: 'authenticated_transport' } })
        for (const key of ['ctwaClid', 'eventId', 'processedEventIds', 'sourceUrlOrigin']) expect(JSON.stringify(projected)).not.toContain(key)
        expect(sanitizeAttributionSnapshot(projected, { includeOperationalIds: false })).toEqual(projected)
        expect(state.firstTouch.ctwaClid).toBe('synthetic-click-a')
    })

    it('fits the stored contract budget even at all identifier length limits', () => {
        let state = null
        for (let i = 0; i < 10; i++) {
            state = mergeAttribution(state, touch(`wamid.${'x'.repeat(292)}${i}`, i * 1000, {
                ...native('a'.repeat(160)), campaignId: 'c'.repeat(160), adsetId: 's'.repeat(160),
                referral: { ...native('a'.repeat(160)).referral, ctwa_clid: 'x'.repeat(512) },
            }))
        }
        expect(JSON.stringify(state).length).toBeLessThan(8000)
    })

    it('never silently upgrades source confidence on read', () => {
        const state = mergeAttribution(null, extractReferralTouch(native(), { ...options(), transport: { structuredPayloadVerified: true } }))
        expect(sanitizeAttributionSnapshot(state, { includeOperationalIds: false }).firstTouch.confidence).toBe('unverified_transport')
        const inconsistent = { ...state, firstTouch: { ...state.firstTouch, confidence: 'provider_signature_verified' } }
        expect(sanitizeAttributionSnapshot(inconsistent).firstTouch.confidence).toBe('unverified_transport')
    })
})
