import { describe, it, expect } from 'vitest'
import {
    LIMITS, MIN_SENDS_FOR_RATE, validateUpload, keyFrom,
    mergeMedia, scoreMedia, rankMedia, performanceNote,
} from '@/lib/salesAgent/mediaLibrary'

const MB = 1024 * 1024

describe('validateUpload', () => {
    it('accepts what WhatsApp accepts', () => {
        expect(validateUpload({ kind: 'image', type: 'image/jpeg', size: 2 * MB }).ok).toBe(true)
        expect(validateUpload({ kind: 'video', type: 'video/mp4', size: 12 * MB }).ok).toBe(true)
    })

    it('rejects a video over 16MB and says why in Hebrew', () => {
        // The failure this prevents is silent: the upload looks fine in
        // the admin and the WhatsApp API rejects it days later.
        const r = validateUpload({ kind: 'video', type: 'video/mp4', size: 20 * MB })
        expect(r.ok).toBe(false)
        expect(r.reason).toContain('16MB')
        expect(r.reason).toContain('סרטון')
    })

    it('rejects formats WhatsApp will not take', () => {
        const r = validateUpload({ kind: 'video', type: 'video/quicktime', size: 5 * MB })
        expect(r.ok).toBe(false)
        expect(r.reason).toMatch(/MP4/)
        expect(validateUpload({ kind: 'image', type: 'image/heic', size: MB }).ok).toBe(false)
        expect(validateUpload({ kind: 'image', type: 'image/webp', size: MB }).ok).toBe(false)
    })

    it('is case-insensitive about the mime type', () => {
        expect(validateUpload({ kind: 'image', type: 'IMAGE/JPEG', size: MB }).ok).toBe(true)
    })

    it('rejects an empty file and an unknown kind', () => {
        expect(validateUpload({ kind: 'image', type: 'image/png', size: 0 }).ok).toBe(false)
        expect(validateUpload({ kind: 'pdf', type: 'application/pdf', size: MB }).ok).toBe(false)
        expect(validateUpload({}).ok).toBe(false)
    })

    it('keeps the image ceiling under the video one', () => {
        expect(LIMITS.image.maxBytes).toBeLessThan(LIMITS.video.maxBytes)
    })
})

describe('keyFrom', () => {
    it('makes a readable key from a Latin label', () => {
        expect(keyFrom('Book Flip Video')).toBe('book_flip_video')
    })

    it('numbers Hebrew labels rather than mangling them', () => {
        // A transliterated key is a string the model then tries to read.
        expect(keyFrom('סרטון של הספר')).toBe('media_1')
        expect(keyFrom('סרטון של הספר', ['media_1'])).toBe('media_2')
    })

    it('never collides with a key already in use', () => {
        expect(keyFrom('book flip', ['book_flip'])).toBe('book_flip_2')
        expect(keyFrom('book flip', ['book_flip', 'book_flip_2'])).toBe('book_flip_3')
    })

    it('survives punctuation and empties', () => {
        expect(keyFrom('  Book — Flip!! ')).toBe('book_flip')
        expect(keyFrom('')).toBe('media_1')
        expect(keyFrom(null)).toBe('media_1')
    })
})

describe('mergeMedia', () => {
    const catalog = { book_wedding: { url: 'u1', caption: 'c1', when: 'w1' } }

    it('keeps the built-ins and adds the uploads', () => {
        const m = mergeMedia(catalog, [{ key: 'flip', url: 'u2', kind: 'video', caption: 'c2' }])
        expect(Object.keys(m).sort()).toEqual(['book_wedding', 'flip'])
        expect(m.book_wedding.source).toBe('catalog')
        expect(m.flip.source).toBe('upload')
        expect(m.flip.kind).toBe('video')
    })

    it('treats the built-ins as images', () => {
        expect(mergeMedia(catalog, []).book_wedding.kind).toBe('image')
    })

    it('lets an upload win a name collision', () => {
        // He named it after a built-in on purpose; the new one is the
        // one he wants tried.
        const m = mergeMedia(catalog, [{ key: 'book_wedding', url: 'NEW' }])
        expect(m.book_wedding.url).toBe('NEW')
        expect(m.book_wedding.source).toBe('upload')
    })

    it('skips anything disabled or half-written', () => {
        const m = mergeMedia(catalog, [
            { key: 'off', url: 'u', disabled: true },
            { key: 'nourl' },
            { url: 'nokey' },
            null,
        ])
        expect(Object.keys(m)).toEqual(['book_wedding'])
    })

    it('survives junk', () => {
        expect(mergeMedia()).toEqual({})
        expect(Object.keys(mergeMedia(catalog, null))).toEqual(['book_wedding'])
    })
})

describe('scoreMedia', () => {
    it('refuses to rate something barely sent', () => {
        // A 100% reply rate on two sends is the most misleading number a
        // dashboard can print.
        const s = scoreMedia({ sent: 2, replied: 2, won: 1 })
        expect(s.enough).toBe(false)
        expect(s.score).toBe(-1)
        expect(s.replyRate).toBe(1) // still computed, just not trusted
    })

    it('rates it once there is enough to rate', () => {
        const s = scoreMedia({ sent: MIN_SENDS_FOR_RATE, replied: 4, won: 1 })
        expect(s.enough).toBe(true)
        expect(s.replyRate).toBeCloseTo(0.5)
        expect(s.score).toBeGreaterThan(0)
    })

    it('weights a sale above a reply', () => {
        const replies = scoreMedia({ sent: 20, replied: 10, won: 0 })
        const sales = scoreMedia({ sent: 20, replied: 10, won: 3 })
        expect(sales.score).toBeGreaterThan(replies.score)
    })

    it('does not divide by zero', () => {
        const s = scoreMedia({})
        expect(s.replyRate).toBe(0)
        expect(s.winRate).toBe(0)
    })
})

describe('rankMedia', () => {
    it('puts proven winners first and unproven last', () => {
        const ranked = rankMedia({
            weak: { sent: 20, replied: 2 },
            strong: { sent: 20, replied: 14 },
            untested: { sent: 1, replied: 1 },
        })
        expect(ranked.map(r => r.key)).toEqual(['strong', 'weak', 'untested'])
    })

    it('breaks a tie by how much evidence there is', () => {
        const ranked = rankMedia({ few: { sent: 10, replied: 5 }, many: { sent: 40, replied: 20 } })
        expect(ranked[0].key).toBe('many')
    })
})

describe('performanceNote', () => {
    const media = { a: {}, b: {} }

    it('says nothing until something is proven', () => {
        expect(performanceNote({ a: { sent: 2, replied: 2 } }, media)).toBeNull()
        expect(performanceNote({}, media)).toBeNull()
    })

    it('says nothing when the difference is noise', () => {
        // Telling the model one asset beats another by two points would
        // make it act on a coin flip.
        expect(performanceNote({ a: { sent: 20, replied: 10 }, b: { sent: 20, replied: 11 } }, media)).toBeNull()
    })

    it('reports a real spread with the numbers behind it', () => {
        const note = performanceNote({ a: { sent: 20, replied: 16 }, b: { sent: 20, replied: 2 } }, media)
        expect(note).toContain('a')
        expect(note).toContain('80%')
        expect(note).toContain('20 שליחות')
    })

    it('frames it as evidence, never as an order', () => {
        // A rule that overrides relevance sends a wedding book to a bat
        // mitzvah because the wedding book scores well.
        const note = performanceNote({ a: { sent: 20, replied: 16 }, b: { sent: 20, replied: 2 } }, media)
        expect(note).toMatch(/לא הוראה/)
        expect(note).toMatch(/רלוונטיות/)
    })

    it('ignores assets that no longer exist', () => {
        // Deleted media still has stats. Recommending it would send the
        // model looking for a key it cannot use.
        expect(performanceNote({ gone: { sent: 40, replied: 30 }, a: { sent: 20, replied: 2 } }, media)).toBeNull()
    })
})
