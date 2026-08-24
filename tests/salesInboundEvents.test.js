import { describe, expect, it } from 'vitest'
import {
    assertCompletableInboundOutcome,
    assertInboundClaimToken,
    decideInboundClaim,
    decideInboundCompletion,
    sanitizeInboundOutcome,
    startInboundClaim,
} from '../src/lib/salesAgent/inboundEventsCore'

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
            notifyOwner: 'טלפון: test-phone-token',
            phone: 'test-phone-token',
            openingSequenceParts: [],
        })).toEqual({
            sendText: 'שלום',
            sendImage: 'https://cdn.example/book.jpg',
            sendImageCaption: 'כריכה',
            sendVideo: 'https://cdn.example/demo.mp4',
            sendVideoCaption: 'דפדוף',
            handoff: false,
            noReply: false,
            skipped: null,
            stage: 'demo_sent',
            followUpAt: '2026-08-15',
            notifyOwner: 'טלפון: [redacted]',
            openingSequenceParts: [],
        })
    })

    it('keeps only bounded operational metadata for an ordered opening sequence', () => {
        const result = sanitizeInboundOutcome({
            sendText: 'תשובה',
            handoff: false,
            openingSequenceParts: [
                {
                    partId: 'a'.repeat(32), order: 1, kind: 'text', text: 'private answer',
                    url: 'https://private.invalid/a', demoEvidence: false,
                    variableKey: 'opening_copy', variableVersionId: 'v4',
                },
                {
                    partId: 'b'.repeat(32), order: 2, kind: 'audio', mediaKey: null,
                    caption: 'private caption', url: 'https://private.invalid/b', demoEvidence: true,
                    variableKey: 'voice_intro', variableVersionId: 'v2', voiceNote: true,
                },
            ],
        })

        expect(result.openingSequenceParts).toEqual([
            {
                partId: 'a'.repeat(32), order: 1, kind: 'text', mediaKey: null, demoEvidence: false,
                variableKey: 'opening_copy', variableVersionId: 'v4', voiceNote: false,
            },
            {
                partId: 'b'.repeat(32), order: 2, kind: 'audio', mediaKey: null, demoEvidence: true,
                variableKey: 'voice_intro', variableVersionId: 'v2', voiceNote: true,
            },
        ])
        expect(JSON.stringify(result.openingSequenceParts)).not.toContain('private')
    })

    it('keeps a truthful terminal noReply outcome without granting handoff', () => {
        expect(sanitizeInboundOutcome({ sendText: '', handoff: false, noReply: true, skipped: 'own-echo' }))
            .toMatchObject({ sendText: '', handoff: false, noReply: true, skipped: 'own-echo' })
    })
})

describe('assertCompletableInboundOutcome', () => {
    it('rejects a completed event that has neither a reply nor a handoff', () => {
        expect(() => assertCompletableInboundOutcome({ sendText: '   ', handoff: false }))
            .toThrow('inbound outcome needs sendText, handoff, or noReply')
    })

    it('allows a handoff that deliberately has no customer text', () => {
        expect(() => assertCompletableInboundOutcome({ sendText: '', handoff: true })).not.toThrow()
    })

    it('allows a terminal noReply outcome that has no customer text', () => {
        expect(() => assertCompletableInboundOutcome({ sendText: '', handoff: false, noReply: true })).not.toThrow()
    })
})

describe('inbound claim ownership', () => {
    it('rejects a stale worker after a reclaimed event receives a new claim', () => {
        const first = startInboundClaim(null, 1_000, 'claim-a')
        const second = startInboundClaim({
            status: 'processing',
            leaseUntilMs: 1_000,
            claimToken: first.claimToken,
            claimGeneration: first.claimGeneration,
        }, 2_000, 'claim-b')

        expect(second).toEqual({ action: 'process', claimToken: 'claim-b', claimGeneration: 2 })
        expect(decideInboundCompletion({
            status: 'processing',
            leaseUntilMs: 32_000,
            claimToken: second.claimToken,
            claimGeneration: second.claimGeneration,
        }, first.claimToken, 2_001)).toEqual({ action: 'busy' })
        expect(decideInboundCompletion({
            status: 'processing',
            leaseUntilMs: 32_000,
            claimToken: second.claimToken,
            claimGeneration: second.claimGeneration,
        }, second.claimToken, 2_001)).toEqual({ action: 'complete' })
    })

    it('rejects a missing completion ownership token', () => {
        expect(() => assertInboundClaimToken()).toThrow('inbound completion needs claimToken')
    })
})
