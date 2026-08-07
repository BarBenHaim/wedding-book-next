import { describe, it, expect } from 'vitest'
import {
    ANGLES, ANGLE_IDS, PHOTOS, EVENT_TYPES,
    planForDate, planRange, hashtagsFor, findAngle,
} from '@/lib/social/contentPlan'

// The plan runs unattended for months. Its failure mode is not a crash,
// it is a feed that quietly repeats itself, or a post pointing at an
// image that does not exist. Both are invisible in code review.

describe('angles', () => {
    it('has enough angles that a daily rotation takes over a working week', () => {
        expect(ANGLES.length).toBeGreaterThanOrEqual(6)
        expect(new Set(ANGLE_IDS).size).toBe(ANGLES.length)
    })

    it('gives every angle a job, a brief and a photo kind', () => {
        for (const a of ANGLES) {
            expect(a.job, a.id).toBeTruthy()
            expect(a.brief.length, a.id).toBeGreaterThan(40)
            expect(['cover', 'spread'], a.id).toContain(a.photo)
        }
    })

    it('includes at least one angle that asks for nothing', () => {
        // A feed that sells in every post is a feed nobody follows.
        const giving = ANGLES.find(a => a.id === 'participation_tip')
        expect(giving).toBeTruthy()
        expect(giving.brief).toContain('אל תמכור')
    })

    it('resolves a known angle and refuses an unknown one', () => {
        expect(findAngle('moment').id).toBe('moment')
        expect(findAngle('nope')).toBeNull()
    })
})

describe('photos are real files on our own origin', () => {
    it('points every asset at a jpg we actually printed', () => {
        for (const type of EVENT_TYPES) {
            const set = PHOTOS[type]
            expect(set.label, type).toBeTruthy()
            expect(set.cover).toMatch(/^https:\/\/app\.weddingtales\.co\.il\/imgs\/portfolio\/.+\.jpg$/)
            expect(set.spreads.length, type).toBeGreaterThan(0)
            for (const s of set.spreads) {
                expect(s, type).toMatch(/^https:\/\/app\.weddingtales\.co\.il\/imgs\/portfolio\/.+\.jpg$/)
            }
        }
    })

    it('never produces a photo outside the whitelist', () => {
        const allowed = new Set(EVENT_TYPES.flatMap(t => [PHOTOS[t].cover, ...PHOTOS[t].spreads]))
        for (let i = 0; i < 200; i++) {
            const iso = new Date(Date.parse('2026-01-01T12:00:00Z') + i * 86400000).toISOString().slice(0, 10)
            expect(allowed.has(planForDate(iso).photo), iso).toBe(true)
        }
    })
})

describe('rotation', () => {
    it('is deterministic for a given date', () => {
        const a = planForDate('2026-08-08')
        const b = planForDate('2026-08-08')
        expect(a).toEqual(b)
    })

    it('never repeats an angle on consecutive days', () => {
        let prev = null
        for (let i = 0; i < 60; i++) {
            const iso = new Date(Date.parse('2026-03-01T12:00:00Z') + i * 86400000).toISOString().slice(0, 10)
            const p = planForDate(iso)
            expect(p.angleId, iso).not.toBe(prev)
            prev = p.angleId
        }
    })

    it('uses every angle and every event type over three weeks', () => {
        // The bug this catches: a picker that technically varies but
        // leaves the strongest angle unused for a fortnight.
        const angles = new Set()
        const types = new Set()
        for (let i = 0; i < 21; i++) {
            const iso = new Date(Date.parse('2026-05-04T12:00:00Z') + i * 86400000).toISOString().slice(0, 10)
            const p = planForDate(iso)
            angles.add(p.angleId)
            types.add(p.eventType)
        }
        expect(angles.size).toBe(ANGLES.length)
        expect(types.size).toBe(EVENT_TYPES.length)
    })

    it('spreads angle and event type on different cycles', () => {
        // 6 angles and 3 types: the same PAIR should not come back for
        // 18 days, which is what keeps the feed from looking like a loop.
        const pairs = []
        for (let i = 0; i < 18; i++) {
            const iso = new Date(Date.parse('2026-05-04T12:00:00Z') + i * 86400000).toISOString().slice(0, 10)
            const p = planForDate(iso)
            pairs.push(`${p.angleId}|${p.eventType}`)
        }
        expect(new Set(pairs).size).toBe(18)
    })

    it('gives a different post for a second slot on the same day', () => {
        // The story is not a copy of the post.
        const post = planForDate('2026-08-08', { slot: 0 })
        const story = planForDate('2026-08-08', { slot: 1 })
        expect(story.angleId).not.toBe(post.angleId)
    })

    it('survives a malformed date instead of throwing', () => {
        const p = planForDate('not-a-date')
        expect(ANGLE_IDS).toContain(p.angleId)
        expect(p.photo).toBeTruthy()
    })
})

describe('planRange', () => {
    it('returns one entry per day, in order, across a month boundary', () => {
        const r = planRange('2026-07-30', 4)
        expect(r.map(x => x.date)).toEqual(['2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'])
    })

    it('matches planForDate for each day', () => {
        for (const p of planRange('2026-09-10', 5)) {
            expect(p).toEqual(planForDate(p.date))
        }
    })
})

describe('hashtags', () => {
    it('stays short enough not to look desperate', () => {
        for (const t of EVENT_TYPES) {
            const tags = hashtagsFor(t)
            expect(tags.length).toBeLessThanOrEqual(6)
            expect(tags.length).toBeGreaterThanOrEqual(4)
        }
    })

    it('always carries the brand and adapts to the event', () => {
        expect(hashtagsFor('wedding')).toContain('#WeddingTales')
        expect(hashtagsFor('wedding')).toContain('#חתונה')
        expect(hashtagsFor('bar_mitzvah')).toContain('#בר_מצווה')
    })

    it('degrades to the core set for an unknown type', () => {
        expect(hashtagsFor('brit')).toContain('#WeddingTales')
    })
})
