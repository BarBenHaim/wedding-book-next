import { describe, it, expect } from 'vitest'
import {
    buildImagePrompt, checkText, textContract, testBatch, SIZES, MAX_TEXT_CHARS,
} from '@/lib/social/imagePrompt'
import { planForDate } from '@/lib/social/contentPlan'

// The thing being defended here is narrow and specific: a post going out
// with Hebrew the model invented. Nothing in this file can prove the
// model renders correctly — only looking at a render can do that. What it
// can prove is that we never ASK for a render we already know is likely
// to fail, and that when we do ask, the request says exactly what it
// should say.

const ISO = '2026-08-10'

describe('checkText', () => {
    it('accepts an ordinary short Hebrew line', () => {
        expect(checkText('ככה זה נראה בסוף').ok).toBe(true)
    })

    it('rejects an empty or whitespace string', () => {
        expect(checkText('').reason).toBe('empty')
        expect(checkText('   ').reason).toBe('empty')
    })

    it('rejects anything past the character ceiling', () => {
        const long = 'א'.repeat(MAX_TEXT_CHARS + 1)
        expect(checkText(long).reason).toBe('too-long')
        expect(checkText('א'.repeat(MAX_TEXT_CHARS)).ok).toBe(true)
    })

    it('rejects multi-line text', () => {
        // Two lines means two chances to fail and no way to fix one
        // without re-rolling the other.
        expect(checkText('שורה\nשנייה').reason).toBe('multiline')
    })

    it('rejects Latin mixed into Hebrew', () => {
        // The direction switch mid-line is where renders scramble.
        expect(checkText('ספר Wedding Tales').reason).toBe('mixed-script')
    })

    it('rejects digits inside the line', () => {
        expect(checkText('רק ב 950 שקלים').reason).toBe('contains-digits')
    })

    it('rejects a line with no Hebrew at all', () => {
        expect(checkText('Wedding Tales').reason).toBe('not-hebrew')
    })
})

describe('textContract', () => {
    const c = textContract('שלום')

    it('quotes the string verbatim', () => {
        expect(c).toContain('"שלום"')
    })

    it('spells it out letter by letter', () => {
        // Given only the word, models substitute a more common
        // lookalike. Given the letters, they copy.
        expect(c).toContain('ש ל ו ם')
    })

    it('states the direction explicitly', () => {
        expect(c).toMatch(/right to left/i)
        expect(c).toMatch(/RIGHT edge/)
    })

    it('forbids the model inventing extra content', () => {
        for (const banned of ['translate', 'watermark', 'logo', 'hashtag']) {
            expect(c.toLowerCase(), banned).toContain(banned)
        }
    })

    it('prefers no text over approximate text', () => {
        // The single most important line in the file: a blank image is
        // recoverable, a wrong one has to be caught by a human.
        expect(c).toMatch(/no text at all rather than approximate/)
    })

    it('drops spaces from the letter list rather than listing them', () => {
        const two = textContract('א ב')
        expect(two).toContain('א ב')
        expect(two).not.toContain('א   ב')
    })
})

describe('buildImagePrompt', () => {
    const plan = planForDate(ISO)

    it('returns null for a missing plan', () => {
        expect(buildImagePrompt(null)).toBeNull()
    })

    it('in edit mode points at the real photograph and forbids changing it', () => {
        const r = buildImagePrompt(plan, { mode: 'edit', text: 'ככה זה נראה בסוף' })
        expect(r.sourceImage).toBe(plan.photo)
        expect(r.sourceImage).toMatch(/^https:\/\//)
        expect(r.prompt).toMatch(/Do not alter the book/)
    })

    it('in generate mode has no source image and describes a subject', () => {
        const r = buildImagePrompt(plan, { mode: 'generate', text: 'ככה זה נראה בסוף' })
        expect(r.sourceImage).toBeNull()
        expect(r.prompt).toMatch(/guest book/)
    })

    it('falls back to a wordless image instead of asking for bad Hebrew', () => {
        // A rejected caption must not silently become a rendered caption.
        const r = buildImagePrompt(plan, { text: 'הכל כולל הכל רק ב 950 שקלים בלבד' })
        expect(r.text).toBeNull()
        expect(r.textRejected).toBeTruthy()
        expect(r.prompt).toMatch(/no text, no lettering/)
        expect(r.prompt).not.toContain('character for character')
    })

    it('asks for no text at all when the plan carries no headline', () => {
        const r = buildImagePrompt({ ...plan, headline: '' }, { mode: 'generate' })
        expect(r.textRejected).toBe('empty')
        expect(r.prompt).toMatch(/no text/)
    })

    it('keeps the story safe areas out of the way of the app UI', () => {
        const post = buildImagePrompt(plan, { size: 'post', text: 'הספר שנשאר' })
        const story = buildImagePrompt(plan, { size: 'story', text: 'הספר שנשאר' })
        expect(post.prompt).toMatch(/lower third/)
        expect(story.prompt).toMatch(/top 15%/)
        expect(story.crop).toEqual(SIZES.story.crop)
    })

    it('never asks the model for a size it does not support', () => {
        for (const key of Object.keys(SIZES)) {
            const r = buildImagePrompt(plan, { size: key, text: 'הספר שנשאר' })
            expect(['1024x1024', '1024x1536', '1536x1024']).toContain(r.apiSize)
        }
    })

    it('falls back to the post format for an unknown size', () => {
        const r = buildImagePrompt(plan, { size: 'billboard', text: 'הספר שנשאר' })
        expect(r.crop).toEqual(SIZES.post.crop)
    })
})

describe('testBatch', () => {
    const batch = testBatch(ISO)

    it('is four renders', () => {
        expect(batch).toHaveLength(4)
    })

    it('disagrees with itself on purpose', () => {
        // A batch where every render is the easy case tells us nothing.
        expect(new Set(batch.map(b => b.mode)).size).toBe(2)
        expect(new Set(batch.map(b => b.size)).size).toBe(2)
        expect(batch.some(b => b.text === null)).toBe(true)
    })

    it('keeps every requested caption inside the safe envelope', () => {
        for (const b of batch) {
            if (b.text) expect(checkText(b.text).ok, b.text).toBe(true)
        }
    })

    it('gives every edit render a real portfolio URL', () => {
        for (const b of batch.filter(b => b.mode === 'edit')) {
            expect(b.sourceImage).toMatch(/^https:\/\/app\.weddingtales\.co\.il\/imgs\/portfolio\//)
        }
    })
})
