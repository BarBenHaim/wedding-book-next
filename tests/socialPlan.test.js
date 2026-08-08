import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
    ANGLES, ANGLE_IDS, PHOTOS, EVENT_TYPES,
    planForDate, planRange, hashtagsFor, findAngle, GUEST_SCREEN,
} from '@/lib/social/contentPlan'
import { EVENT_TYPES as STYLED_EVENT_TYPES } from '@/lib/social/scenes'

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
        // GUEST_SCREEN joined the whitelist when the phone scene arrived:
        // it is a real screenshot of our own live page, served from the
        // same origin, and it is the source the phone scene edits.
        const allowed = new Set([
            ...EVENT_TYPES.flatMap(t => [PHOTOS[t].cover, ...PHOTOS[t].spreads]),
            GUEST_SCREEN,
        ])
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

    it('uses every angle and every styling over a full cycle', () => {
        // The bug this catches: a picker that technically varies but
        // leaves the strongest angle unused for a fortnight. The cycle is
        // 24 days — six angles against four event stylings — so three
        // weeks is no longer long enough to see it all.
        const angles = new Set()
        const styles = new Set()
        const photoTypes = new Set()
        for (const p of planRange('2026-05-04', 24)) {
            angles.add(p.angleId)
            styles.add(p.eventType)
            photoTypes.add(p.photoEventType)
        }
        expect(angles.size).toBe(ANGLES.length)
        expect(styles.size).toBe(STYLED_EVENT_TYPES.length)
        expect(photoTypes.size).toBe(EVENT_TYPES.length)
    })

    it('hands the model an open brief regularly, without letting it take over', () => {
        // Lord wants the model directing its own pictures. Alternating
        // rather than always is what keeps the grid recognisable as one
        // brand — a feed where every post is a fresh idea reads as stock.
        const plans = planRange('2026-05-04', 24)
        const free = plans.filter(p => p.sceneId === 'free')
        expect(free.length).toBeGreaterThan(0)
        expect(free.length).toBeLessThan(plans.length)
    })

    it('never hands away the two scenes that must use a real photograph', () => {
        // The open brief is for pictures the model invents. A spread from
        // a book we printed, and the actual guest screen, are claims
        // about reality — a synthesised version of either is a lie.
        for (const p of planRange('2026-05-04', 48)) {
            if (p.angleId === 'real_spread') expect(p.sceneId, p.date).toBe('spread_open')
            if (p.angleId === 'how_it_works') expect(p.sceneId, p.date).toBe('phone_screen')
        }
    })

    it('pairs each directed caption angle with a scene that argues for it', () => {
        // A "how it works" caption over a photo of a book on a shelf is
        // two posts fighting each other. The pairing is fixed for that
        // reason, so a change to it should be deliberate.
        const seen = new Map()
        for (const p of planRange('2026-05-04', 24)) {
            if (p.sceneId === 'free') continue
            if (seen.has(p.angleId)) expect(seen.get(p.angleId), p.angleId).toBe(p.sceneId)
            seen.set(p.angleId, p.sceneId)
        }
        expect(seen.get('how_it_works')).toBe('phone_screen')
        expect(seen.get('real_spread')).toBe('spread_open')
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

// ─── the photos have to actually be there ─────────────────────────────
//
// wedding/spread-4.jpg was in the rotation for weeks and does not exist:
// the site ships spreads 3 to 5 only as .webp, and the list here assumed
// the .jpg set matched. Nothing noticed until an image generation ran
// against a 404 and came back as an unreadable gateway error.
//
// A unit test cannot check a URL, but it can check the file the URL
// resolves to, and every one of these is served straight out of /public.
describe('every photo in the plan exists on disk', () => {
    const ROOT = path.join(process.cwd(), 'public')
    const toDisk = url => path.join(ROOT, url.replace(/^https?:\/\/[^/]+/, ''))

    it('has a real file behind every cover and every spread', () => {
        const missing = []
        for (const [type, set] of Object.entries(PHOTOS)) {
            for (const url of [set.cover, ...set.spreads]) {
                if (!fs.existsSync(toDisk(url))) missing.push(`${type}: ${url}`)
            }
        }
        expect(missing).toEqual([])
    })

    it('covers every day of a long rotation without hitting a missing file', () => {
        // The bug only surfaced on the days the rotation happened to
        // land on spread-4, so checking one day would not have caught it.
        const missing = []
        for (const plan of planRange('2026-01-01', 90)) {
            if (!fs.existsSync(toDisk(plan.photo))) missing.push(`${plan.date}: ${plan.photo}`)
        }
        expect(missing).toEqual([])
    })
})
