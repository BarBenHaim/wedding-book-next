import { describe, expect, it } from 'vitest'
import { assertCompletableInboundOutcome, decideInboundClaim, sanitizeInboundOutcome } from '../src/lib/salesAgent/inboundEventsCore'

describe('decideInboundClaim', () => {
    it('processes a new event', () => {
        expect(decideInboundClaim(null, 1_000)).toEqual({ action: 'process' })
    })

    it('returns the stored outcome for a completed duplicate', () => {
        const outcome = { ok: true, sendText: 'שלום', handoff: false }
        expect(decideInboundClaim({ status: 'completed', outcome }, 2_000))
            .toEqual({ action: 'cached', outcome })
    })

    it('does not process an in-flight duplicate before the 30 second lease expires', () => {
        expect(decideInboundClaim({ status: 'processing', leaseUntilMs: 31_000 }, 2_000))
            .toEqual({ action: 'busy' })
    })

    it('reclaims an abandoned processing event after the lease', () => {
        expect(decideInboundClaim({ status: 'processing', leaseUntilMs: 1_000 }, 2_000))
            .toEqual({ action: 'process' })
    })
})

describe('sanitizeInboundOutcome', () => {
    it('keeps only reply data needed to describe a completed event', () => {
        expect(sanitizeInboundOutcome({
            ok: true,
            send: ['שלום'],
            sendText: 'שלום',
            sendImage: 'https://cdn.example/book.jpg',
            sendImageCaption: 'כריכה',
            sendVideo: 'https://cdn.example/demo.mp4',
            sendVideoCaption: 'דפדוף',
            hasImage: true,
            hasVideo: true,
            handoff: false,
            stage: 'demo_sent',
            followUpAt: '2026-08-15',
            notifyOwner: 'טלפון: 972501234567',
            phone: '972501234567',
        })).toEqual({
            sendText: 'שלום',
            sendImage: 'https://cdn.example/book.jpg',
            sendImageCaption: 'כריכה',
            sendVideo: 'https://cdn.example/demo.mp4',
            sendVideoCaption: 'דפדוף',
            handoff: false,
            stage: 'demo_sent',
            followUpAt: '2026-08-15',
            notifyOwner: 'טלפון: [redacted]',
        })
    })
})

describe('assertCompletableInboundOutcome', () => {
    it('rejects a completed event that has neither a reply nor a handoff', () => {
        expect(() => assertCompletableInboundOutcome({ sendText: '   ', handoff: false }))
            .toThrow('inbound outcome needs sendText or handoff')
    })

    it('allows a handoff that deliberately has no customer text', () => {
        expect(() => assertCompletableInboundOutcome({ sendText: '', handoff: true })).not.toThrow()
    })
})
