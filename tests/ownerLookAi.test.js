import { describe, it, expect } from 'vitest'
import {
    LOOK_OPTIONS, LOOK_OPTION_IDS, LOOK_LIMIT_PER_EVENT, API_SIZE, MAX_ART_NAME_CHARS,
    artName, buildLookPrompt, styleRefs, validPhotoUrl, renderAllowed,
} from '@/lib/ownerLookAi'
import { EVENT_TYPE_ORDER } from '@/lib/eventTypes'

describe('the designs we ask for', () => {
    it('are three covers and two signs, each with a name', () => {
        expect(LOOK_OPTIONS.filter(o => o.kind === 'cover')).toHaveLength(3)
        expect(LOOK_OPTIONS.filter(o => o.kind === 'sign')).toHaveLength(2)
        for (const o of LOOK_OPTIONS) expect(o.name.length).toBeGreaterThan(1)
        expect(new Set(LOOK_OPTION_IDS).size).toBe(LOOK_OPTIONS.length)
    })

    it('ask the model for sizes it draws well', () => {
        expect(API_SIZE.cover).toBe('1024x1024')
        expect(API_SIZE.sign).toBe('1024x1536')
    })
})

describe('the name as it is drawn', () => {
    it('keeps a short name whole', () => {
        expect(artName('יואב')).toBe('יואב')
        expect(artName('דניאל ונועם')).toBe('דניאל ונועם')
        expect(artName('  דנה   ויובל ')).toBe('דנה ויובל')
    })

    it('cuts a long name to the words that fit, and never to nothing', () => {
        const long = 'בת-שבע יוחננוף-קורקוס ואבשלום בן-עמי מהמשפחה'
        const out = artName(long)
        expect(out.length).toBeLessThanOrEqual(MAX_ART_NAME_CHARS)
        expect(out.length).toBeGreaterThan(0)
        expect(long.startsWith(out)).toBe(true)
        expect(artName('א'.repeat(60)).length).toBeLessThanOrEqual(MAX_ART_NAME_CHARS)
        expect(artName('')).toBe('')
        expect(artName(undefined)).toBe('')
    })
})

describe('the prompt', () => {
    it('keeps faces and spells the Hebrew out, for every option and every event type', () => {
        for (const type of [...EVENT_TYPE_ORDER, 'brit', undefined]) {
            for (const option of LOOK_OPTION_IDS) {
                const p = buildLookPrompt({ option, eventType: type, names: 'יואב' })
                expect(p, `${type}/${option}`).toContain('accurately recognisable')
                expect(p).toContain('יואב')
                expect(p).toMatch(/ספר הברכות|ברכו את/)
                expect(p).not.toContain('$imagegen')
            }
        }
    })

    it('draws the title and name on a cover, the headline on a sign, and never a QR code', () => {
        expect(buildLookPrompt({ option: 'cover1', eventType: 'bar_mitzvah', names: 'יואב' })).toContain('ספר הברכות')
        const sign = buildLookPrompt({ option: 'sign1', eventType: 'bar_mitzvah', names: 'יואב' })
        expect(sign).toContain('ברכו את יואב')
        expect(sign).toMatch(/lower 42%/)
        expect(sign).toMatch(/no QR code/)
    })

    it('says the couple for a couple and the two brothers for twins', () => {
        expect(buildLookPrompt({ option: 'cover1', eventType: 'wedding', names: 'דנה ויובל', people: 'couple' })).toContain('both people')
        expect(buildLookPrompt({ option: 'cover1', eventType: 'twins_bar_mitzvah', names: 'דניאל ונועם' })).toContain('two brothers')
    })

    it('has no name line when there is no name, and no label for an unknown event', () => {
        const p = buildLookPrompt({ option: 'cover2', eventType: 'brit', names: '' })
        expect(p).toContain('the large title ספר הברכות.')
    })

    it('is empty for an unknown option', () => {
        expect(buildLookPrompt({ option: 'nope', eventType: 'wedding' })).toBe('')
    })

    it('points to our own finished designs as style references', () => {
        expect(styleRefs('cover1', 'bar_mitzvah', 'bar_mitzvah')[0]).toBe('/covers/bar_mitzvah.webp')
        expect(styleRefs('sign1', 'bar_mitzvah', 'bar_mitzvah')[0]).toBe('/look-refs/sign-yoav.webp')
        expect(styleRefs('nope', 'x', 'other')).toEqual([])
    })
})

describe('which photo addresses are accepted', () => {
    const bucket = 'wedding-memories-maker.firebasestorage.app'
    const good = id => `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(`weddings/${id}/owner-photo-1700.jpg`)}?alt=media&token=abc`

    it('takes a photo the owner uploaded into this event', () => {
        expect(validPhotoUrl(good('abc123'), bucket, 'abc123')).toBe(true)
    })

    it('refuses another event, another bucket, another host, another file or anything odd', () => {
        expect(validPhotoUrl(good('other'), bucket, 'abc123')).toBe(false)
        expect(validPhotoUrl(good('abc123'), 'someone-elses-bucket', 'abc123')).toBe(false)
        expect(validPhotoUrl(good('abc123').replace('firebasestorage.googleapis.com', 'evil.example.com'), bucket, 'abc123')).toBe(false)
        expect(validPhotoUrl(good('abc123').replace('owner-photo-', 'photo-'), bucket, 'abc123')).toBe(false)
        expect(validPhotoUrl(good('abc123').replace('https:', 'http:'), bucket, 'abc123')).toBe(false)
        expect(validPhotoUrl(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent('weddings/abc123/sub/owner-photo-1.jpg')}`, bucket, 'abc123')).toBe(false)
        for (const v of [undefined, null, '', 'not a url', 12, 'a'.repeat(2000)]) expect(validPhotoUrl(v, bucket, 'abc123'), String(v)).toBe(false)
        expect(validPhotoUrl(good('abc123'), '', 'abc123')).toBe(false)
    })
})

describe('the ceiling per event', () => {
    it('allows images until the limit and then stops', () => {
        expect(renderAllowed(0)).toBe(true)
        expect(renderAllowed(LOOK_LIMIT_PER_EVENT - 1)).toBe(true)
        expect(renderAllowed(LOOK_LIMIT_PER_EVENT)).toBe(false)
        expect(renderAllowed(undefined)).toBe(true)
    })
})
