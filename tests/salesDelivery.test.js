import { describe, expect, it } from 'vitest'
import {
    createOutboundId,
    decideDeliveryTransition,
    isDeliveryPending,
    validateDeliveryEvent,
} from '../src/lib/salesAgent/delivery'

const accepted = (overrides = {}) => ({
    eventId: 'status-event-a',
    outboundId: 'followup-hash-a:template',
    channel: 'whatsapp_graph',
    status: 'accepted',
    providerMessageId: 'wamid-provider-a',
    occurredAt: '2026-08-14T10:00:00.000Z',
    ...overrides,
})

describe('delivery event validation', () => {
    it('accepts provider acceptance only with stable provider evidence', () => {
        expect(validateDeliveryEvent(accepted())).toEqual({
            ok: true,
            event: accepted(),
        })
    })

    it('rejects accepted, delivered, and read events without a provider message ID', () => {
        for (const status of ['accepted', 'delivered', 'read']) {
            expect(validateDeliveryEvent(accepted({ status, providerMessageId: undefined })))
                .toEqual({ ok: false, error: 'PROVIDER_MESSAGE_ID_REQUIRED' })
        }
    })

    it('requires an allowlisted stable error code for failures', () => {
        expect(validateDeliveryEvent(accepted({ status: 'failed', providerMessageId: undefined, errorCode: undefined })))
            .toEqual({ ok: false, error: 'ERROR_CODE_REQUIRED' })
        expect(validateDeliveryEvent(accepted({ status: 'failed', providerMessageId: undefined, errorCode: 'raw provider body' })))
            .toEqual({ ok: false, error: 'INVALID_ERROR_CODE' })
        expect(validateDeliveryEvent(accepted({ status: 'failed', providerMessageId: undefined, errorCode: 'GRAPH_TIMEOUT' })))
            .toMatchObject({ ok: true, event: { errorCode: 'GRAPH_TIMEOUT' } })
    })

    it('accepts provider-only status callbacks but never provider-only acceptance', () => {
        const delivered = accepted({ status: 'delivered', outboundId: undefined })
        const expected = { ...delivered }
        delete expected.outboundId
        expect(validateDeliveryEvent(delivered)).toEqual({ ok: true, event: expected })
        expect(validateDeliveryEvent(accepted({ outboundId: undefined })))
            .toEqual({ ok: false, error: 'OUTBOUND_ID_REQUIRED_FOR_ACCEPTANCE' })
    })

    it('rejects unknown channels, statuses, invalid dates, and oversized identifiers', () => {
        expect(validateDeliveryEvent(accepted({ channel: 'sms' }))).toEqual({ ok: false, error: 'INVALID_CHANNEL' })
        expect(validateDeliveryEvent(accepted({ status: 'queued' }))).toEqual({ ok: false, error: 'INVALID_STATUS' })
        expect(validateDeliveryEvent(accepted({ occurredAt: 'not-a-date' }))).toEqual({ ok: false, error: 'INVALID_OCCURRED_AT' })
        expect(validateDeliveryEvent(accepted({ eventId: 'x'.repeat(501) }))).toEqual({ ok: false, error: 'INVALID_EVENT_ID' })
        expect(validateDeliveryEvent(accepted({ outboundId: 'unsafe/document/path' }))).toEqual({ ok: false, error: 'INVALID_OUTBOUND_ID' })
    })
})

describe('delivery state transitions', () => {
    const requested = {
        status: 'requested',
        outboundId: 'followup-hash-a:template',
        eventId: 'request-event-a',
        channel: 'whatsapp_graph',
    }

    it('turns provider acceptance into a 30-minute pending state without advancing', () => {
        expect(decideDeliveryTransition(requested, accepted(), Date.parse('2026-08-14T10:00:01Z'))).toEqual({
            action: 'apply',
            nextStatus: 'accepted',
            advanceFollowUp: false,
            clearPending: false,
            pendingUntilMs: Date.parse('2026-08-14T10:30:00Z'),
        })
    })

    it('suppresses a retry only while the accepted pending window is active', () => {
        const pending = { status: 'accepted', deliveryPendingUntilMs: Date.parse('2026-08-14T10:30:00Z') }
        expect(isDeliveryPending(pending, Date.parse('2026-08-14T10:29:59.999Z'))).toBe(true)
        expect(isDeliveryPending(pending, Date.parse('2026-08-14T10:30:00Z'))).toBe(false)
        expect(isDeliveryPending({ status: 'failed', deliveryPendingUntilMs: Date.parse('2026-08-14T10:30:00Z') }, Date.parse('2026-08-14T10:10:00Z'))).toBe(false)
    })

    it('advances once on delivered and never again on read or replay', () => {
        const storedAccepted = { ...requested, status: 'accepted', providerMessageId: 'wamid-provider-a' }
        expect(decideDeliveryTransition(storedAccepted, accepted({ status: 'delivered', eventId: 'status-event-b' })))
            .toMatchObject({ action: 'apply', nextStatus: 'delivered', advanceFollowUp: true, clearPending: true })

        const storedDelivered = { ...storedAccepted, status: 'delivered', followUpAdvanced: true }
        expect(decideDeliveryTransition(storedDelivered, accepted({ status: 'read', eventId: 'status-event-c' })))
            .toMatchObject({ action: 'apply', nextStatus: 'read', advanceFollowUp: false, clearPending: true })
        expect(decideDeliveryTransition({ ...storedDelivered, status: 'read' }, accepted({ status: 'read', eventId: 'status-event-c' })))
            .toEqual({ action: 'noop', reason: 'DUPLICATE_STATUS' })
    })

    it('clears pending on failure, leaves the follow-up due, and makes failure terminal', () => {
        const storedAccepted = { ...requested, status: 'accepted', providerMessageId: 'wamid-provider-a' }
        expect(decideDeliveryTransition(storedAccepted, accepted({ status: 'failed', eventId: 'status-event-f', errorCode: 'GRAPH_REJECTED' })))
            .toMatchObject({ action: 'apply', nextStatus: 'failed', advanceFollowUp: false, clearPending: true })
        expect(decideDeliveryTransition({ ...storedAccepted, status: 'failed' }, accepted({ status: 'delivered' })))
            .toEqual({ action: 'reject', error: 'TERMINAL_DELIVERY_STATE' })
    })

    it('rejects provider/channel mismatches and out-of-order or regressive callbacks', () => {
        const storedAccepted = { ...requested, status: 'accepted', providerMessageId: 'wamid-provider-a' }
        expect(decideDeliveryTransition(storedAccepted, accepted({ providerMessageId: 'wamid-provider-b' })))
            .toEqual({ action: 'reject', error: 'PROVIDER_MESSAGE_ID_MISMATCH' })
        expect(decideDeliveryTransition(storedAccepted, accepted({ channel: 'make' })))
            .toEqual({ action: 'reject', error: 'CHANNEL_MISMATCH' })
        expect(decideDeliveryTransition(requested, accepted({ status: 'delivered' })))
            .toMatchObject({ action: 'apply', nextStatus: 'delivered', advanceFollowUp: true })
        expect(decideDeliveryTransition({ ...storedAccepted, status: 'read' }, accepted({ status: 'delivered' })))
            .toEqual({ action: 'noop', reason: 'STALE_STATUS' })
    })

    it.each([
        ['requested', 'delivered'],
        ['requested', 'read'],
        ['accepted', 'delivered'],
        ['accepted', 'read'],
    ])('advances on the first verified %s to %s success', (from, status) => {
        const current = {
            ...requested,
            status: from,
            ...(from === 'accepted' ? { providerMessageId: 'wamid-provider-a' } : {}),
        }
        expect(decideDeliveryTransition(current, accepted({ status, eventId: `first-${status}` })))
            .toMatchObject({ action: 'apply', nextStatus: status, advanceFollowUp: true, clearPending: true })
    })

    it('treats delivered after a read-first success as a stale no-op', () => {
        expect(decideDeliveryTransition({
            ...requested,
            status: 'read',
            providerMessageId: 'wamid-provider-a',
            followUpAdvanced: true,
        }, accepted({ status: 'delivered', eventId: 'late-delivered-event' })))
            .toEqual({ action: 'noop', reason: 'STALE_STATUS' })
    })
})

describe('stable outbound IDs', () => {
    it('distinguishes parts and never embeds the raw lead identifier', () => {
        const rawLeadId = 'non-dialable-private-lead-sentinel'
        const text = createOutboundId({ scope: 'followup', subject: rawLeadId, attempt: 1, part: 'text' })
        const image = createOutboundId({ scope: 'followup', subject: rawLeadId, attempt: 1, part: 'image' })

        expect(text).not.toContain(rawLeadId)
        expect(image).not.toContain(rawLeadId)
        expect(text).not.toBe(image)
        expect(createOutboundId({ scope: 'followup', subject: rawLeadId, attempt: 1, part: 'text' })).toBe(text)
    })
})
