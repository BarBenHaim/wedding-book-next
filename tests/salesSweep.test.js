import { describe, it, expect } from 'vitest'
import { findOrphans, findStaleHandoffs, handoffAlert, ORPHAN_AFTER_HOURS } from '@/lib/salesAgent/sweep'

const NOW = Date.parse('2026-08-08T09:00:00Z')
const hoursAgo = h => NOW - h * 3600 * 1000

const lead = (over = {}) => ({
    phone: '972501234567',
    stage: 'qualifying',
    lastInboundAt: hoursAgo(72),
    ...over,
})

describe('findOrphans', () => {
    it('finds a live lead nobody scheduled anything for', () => {
        expect(findOrphans([lead()], { nowMs: NOW })).toHaveLength(1)
    })

    it('leaves alone a lead that already has a next step', () => {
        // The ladder owns these. Touching them here would double-chase.
        expect(findOrphans([lead({ followUpAt: '2026-08-10' })], { nowMs: NOW })).toHaveLength(0)
    })

    it('never touches a conversation still in motion', () => {
        // Somebody who wrote this morning is thinking, not lost.
        expect(findOrphans([lead({ lastInboundAt: hoursAgo(4) })], { nowMs: NOW })).toHaveLength(0)
        expect(findOrphans([lead({ lastInboundAt: hoursAgo(ORPHAN_AFTER_HOURS - 1) })], { nowMs: NOW })).toHaveLength(0)
        expect(findOrphans([lead({ lastInboundAt: hoursAgo(ORPHAN_AFTER_HOURS + 1) })], { nowMs: NOW })).toHaveLength(1)
    })

    it('refuses to resume a handoff', () => {
        // This is the whole reason orphans and handoffs are separate
        // functions. A bot that waits out the pause and then picks the
        // thread back up is worse than one that never handed over.
        expect(findOrphans([lead({ human: true, humanSince: hoursAgo(200) })], { nowMs: NOW })).toHaveLength(0)
    })

    it('stops at closed leads, won or lost', () => {
        expect(findOrphans([lead({ stage: 'closed_won' }), lead({ stage: 'closed_lost' })], { nowMs: NOW })).toHaveLength(0)
    })

    it('respects the three-attempt ceiling', () => {
        expect(findOrphans([lead({ followUpCount: 2 })], { nowMs: NOW })).toHaveLength(1)
        expect(findOrphans([lead({ followUpCount: 3 })], { nowMs: NOW })).toHaveLength(0)
        expect(findOrphans([lead({ followUpCount: 9 })], { nowMs: NOW })).toHaveLength(0)
    })

    it('falls back through the timestamp fields it might have', () => {
        expect(findOrphans([lead({ lastInboundAt: null, lastMessageAt: hoursAgo(72) })], { nowMs: NOW })).toHaveLength(1)
        expect(findOrphans([lead({ lastInboundAt: null, lastMessageAt: null, updatedAt: hoursAgo(72) })], { nowMs: NOW })).toHaveLength(1)
    })

    it('reads Firestore timestamps in every shape they arrive in', () => {
        const ms = hoursAgo(72)
        const shapes = [
            ms,
            { toMillis: () => ms },
            { seconds: Math.floor(ms / 1000) },
            new Date(ms).toISOString(),
        ]
        for (const at of shapes) {
            expect(findOrphans([lead({ lastInboundAt: at })], { nowMs: NOW }), String(typeof at)).toHaveLength(1)
        }
    })

    it('will not message a lead with no evidence it ever wrote to us', () => {
        // A half-written document is not a customer, and this is the one
        // mistake in this file with a real-world cost.
        expect(findOrphans([lead({ lastInboundAt: null })], { nowMs: NOW })).toHaveLength(0)
    })

    it('survives junk', () => {
        expect(findOrphans(null)).toEqual([])
        expect(findOrphans([null, undefined, {}, lead({ phone: null })], { nowMs: NOW })).toEqual([])
    })
})

describe('findStaleHandoffs', () => {
    it('reports a handoff that sat past the pause', () => {
        expect(findStaleHandoffs([lead({ human: true, humanSince: hoursAgo(60) })], { nowMs: NOW })).toHaveLength(1)
    })

    it('leaves a fresh handoff alone', () => {
        // Lord has 48 hours before this is a problem worth a message.
        expect(findStaleHandoffs([lead({ human: true, humanSince: hoursAgo(3) })], { nowMs: NOW })).toHaveLength(0)
    })

    it('reports a handoff with no timestamp rather than hiding it', () => {
        // An unknown age is not a young age, and the cost of reporting
        // it is one line in a message to the owner.
        expect(findStaleHandoffs([lead({ human: true })], { nowMs: NOW })).toHaveLength(1)
    })

    it('ignores leads the bot is still handling', () => {
        expect(findStaleHandoffs([lead()], { nowMs: NOW })).toHaveLength(0)
    })

    it('stops once the lead is closed', () => {
        // A handoff that ended in a sale is not waiting for anybody.
        expect(findStaleHandoffs([lead({ human: true, humanSince: hoursAgo(300), stage: 'closed_won' })], { nowMs: NOW })).toHaveLength(0)
    })
})

describe('handoffAlert', () => {
    it('says nothing when there is nothing waiting', () => {
        // An alert that arrives every morning saying "0" is one you stop
        // reading, and then you miss the morning it said 3.
        expect(handoffAlert([])).toBeNull()
        expect(handoffAlert(null)).toBeNull()
    })

    it('names the person, the number and how long they have waited', () => {
        const text = handoffAlert([lead({ name: 'נועה', human: true, humanSince: hoursAgo(50) })], { nowMs: NOW })
        expect(text).toContain('נועה')
        expect(text).toContain('972501234567')
        expect(text).toContain('2 ימים')
    })

    it('counts in hours while it is still hours', () => {
        const text = handoffAlert([lead({ human: true, humanSince: hoursAgo(30) })], { nowMs: NOW })
        expect(text).toContain('30 שעות')
    })

    it('puts the longest wait first', () => {
        const text = handoffAlert([
            lead({ phone: '111', name: 'חדש', human: true, humanSince: hoursAgo(50) }),
            lead({ phone: '222', name: 'ותיק', human: true, humanSince: hoursAgo(400) }),
        ], { nowMs: NOW })
        expect(text.indexOf('ותיק')).toBeLessThan(text.indexOf('חדש'))
    })

    it('carries the reason the handoff happened when there is one', () => {
        const text = handoffAlert([lead({ human: true, humanSince: hoursAgo(60), humanReason: 'ביקש לדבר עם מישהו' })], { nowMs: NOW })
        expect(text).toContain('ביקש לדבר עם מישהו')
    })

    it('caps the list and says how many it left out', () => {
        const many = Array.from({ length: 14 }, (_, i) => lead({ phone: `97250000000${i}`, human: true, humanSince: hoursAgo(60 + i) }))
        const text = handoffAlert(many, { nowMs: NOW })
        expect(text).toContain('14 שיחות')
        expect(text).toContain('+4 נוספים')
    })

    it('states plainly that the bot is not going to handle these', () => {
        const text = handoffAlert([lead({ human: true, humanSince: hoursAgo(60) })], { nowMs: NOW })
        expect(text).toMatch(/לא ימשיך/)
    })
})
