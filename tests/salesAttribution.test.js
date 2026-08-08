import { describe, it, expect } from 'vitest'
import { detectSource, resolveSource, sourceLabel, SOURCE_LABELS } from '@/lib/salesAgent/attribution'

// Attribution decides where ad money goes, so a wrong answer costs more
// than no answer. These cases are mostly about the ways it could be
// confidently wrong.

describe('the openers we wrote ourselves', () => {
    it('recognises the Instagram prefill', () => {
        expect(detectSource('היי, הגעתי מהאינסטגרם ואשמח לפרטים')).toBe('instagram_ad')
    })

    it('recognises the Facebook prefill', () => {
        expect(detectSource('היי, הגעתי מפייסבוק ואשמח לפרטים')).toBe('facebook_ad')
    })

    it('still works when somebody retypes it in their own words', () => {
        // The whole reason for a sentence rather than a tracking code.
        expect(detectSource('היי ראיתי אתכם באינסטה, כמה עולה?')).toBe('instagram_ad')
        expect(detectSource('שלום, הגעתי דרך פייסבוק')).toBe('facebook_ad')
    })
})

describe('what it refuses to guess', () => {
    it('says nothing for an ordinary enquiry', () => {
        // The common case. Inventing a source here is the failure that
        // matters, because nobody would ever catch it.
        expect(detectSource('היי כמה עולה ספר ברכות')).toBeNull()
        expect(detectSource('שלום')).toBeNull()
    })

    it('says nothing for an empty message', () => {
        expect(detectSource('')).toBeNull()
        expect(detectSource(null)).toBeNull()
        expect(detectSource('   ')).toBeNull()
    })
})

describe('precedence', () => {
    it('prefers the named platform over the generic word "ad"', () => {
        expect(detectSource('ראיתי את המודעה שלכם באינסטגרם')).toBe('instagram_ad')
    })

    it('falls back to a generic ad when no platform is named', () => {
        expect(detectSource('ראיתי את המודעה ואשמח לפרטים')).toBe('meta_ad')
        expect(detectSource('ראיתי סרטון שלכם')).toBe('meta_ad')
    })

    it('recognises a recommendation, which is not an ad at all', () => {
        expect(detectSource('חברה שלי המליצה עליכם')).toBe('referral')
    })
})

describe('resolveSource', () => {
    it('sets the source from the first message', () => {
        const s = resolveSource({ isNew: true, text: 'היי, הגעתי מהאינסטגרם', existing: null, fallback: 'whatsapp' })
        expect(s).toBe('instagram_ad')
    })

    it('falls back to what the transport reported when the text says nothing', () => {
        const s = resolveSource({ isNew: true, text: 'היי כמה עולה', existing: null, fallback: 'whatsapp' })
        expect(s).toBe('whatsapp')
    })

    it('never lets a later message rewrite the source', () => {
        // "I also saw your Instagram ad" three messages into a
        // conversation that started from a friend's recommendation does
        // not make this an Instagram lead.
        const s = resolveSource({
            isNew: false,
            text: 'אגב ראיתי אתכם גם באינסטגרם',
            existing: 'referral',
            fallback: 'whatsapp',
        })
        expect(s).toBe('referral')
    })

    it('does not re-detect on a later message even with no source stored', () => {
        const s = resolveSource({ isNew: false, text: 'ראיתי אתכם באינסטגרם', existing: null, fallback: 'whatsapp' })
        expect(s).toBe('whatsapp')
    })

    it('returns null rather than a made-up value when it has nothing', () => {
        expect(resolveSource({ isNew: true, text: 'היי', existing: null, fallback: null })).toBeNull()
    })
})

describe('labels', () => {
    it('names every source it can detect', () => {
        // A channel that cannot be named on screen shows up as a raw
        // slug in the table, which is how "meta_ad" ends up in front of
        // a customer-facing report.
        const detectable = ['instagram_ad', 'facebook_ad', 'tiktok', 'meta_ad', 'google', 'referral']
        for (const s of detectable) expect(SOURCE_LABELS[s], s).toBeTruthy()
    })

    it('passes an unknown source through rather than hiding it', () => {
        expect(sourceLabel('some_new_channel')).toBe('some_new_channel')
        expect(sourceLabel(null)).toBeNull()
    })
})
