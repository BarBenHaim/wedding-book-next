import { describe, it, expect } from 'vitest'
import {
    buildImagePrompt, checkText, textContract, testBatch, SIZES, MAX_TEXT_CHARS, IMAGE_MODEL,
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

    it('in edit mode points at the real photograph and forbids replacing it', () => {
        const r = buildImagePrompt(plan, { mode: 'edit', text: 'ככה זה נראה בסוף' })
        expect(r.sourceImage).toBe(plan.photo)
        expect(r.sourceImage).toMatch(/^https:\/\//)
        expect(r.prompt).toMatch(/Do not redraw, restyle or replace/)
    })

    it('in generate mode has no source image and states the product facts', () => {
        const r = buildImagePrompt({ ...plan, sceneId: 'flatlay' }, { mode: 'generate', text: 'ככה זה נראה בסוף' })
        expect(r.sourceImage).toBeNull()
        // The square shape is the fact the first version of these
        // prompts never said, and the one people recognise it by.
        expect(r.prompt).toMatch(/SQUARE/)
    })

    it('hands over composition on a free brief but never the product facts', () => {
        const r = buildImagePrompt({ ...plan, sceneId: 'free' }, { mode: 'generate' })
        expect(r.prompt).toMatch(/art-directing this image/)
        expect(r.prompt).toMatch(/avoid the obvious answer/)
        expect(r.prompt).toMatch(/SQUARE/)
        expect(r.prompt).toMatch(/No human faces/)
    })

    it('falls back to a wordless image instead of asking for bad Hebrew', () => {
        // A rejected caption must not silently become a rendered caption.
        const r = buildImagePrompt(plan, { text: 'הכל כולל הכל רק ב 950 שקלים בלבד' })
        expect(r.text).toBeNull()
        expect(r.textRejected).toBeTruthy()
        expect(r.prompt).toMatch(/no text, no lettering/)
        expect(r.prompt).not.toContain('character for character')
    })

    it('treats an explicit empty string as a request for no text', () => {
        // Not the same as omitting it. Falsy fallback would turn this
        // into the plan's headline and quietly put words on the one
        // picture meant to be judged without any.
        const r = buildImagePrompt(plan, { mode: 'generate', text: '' })
        expect(r.text).toBeNull()
        expect(r.prompt).toMatch(/no text, no lettering/)
    })

    it('falls back to the plan headline only when text is omitted', () => {
        const r = buildImagePrompt(plan, { mode: 'generate' })
        expect(r.text).toBe(plan.headline)
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

    it('asks for a current image model, not the superseded one', () => {
        // gpt-image-1 was the first choice and is no longer current;
        // gpt-image-2 is better at text inside the image, which is the
        // only reason this approach exists at all.
        const r = buildImagePrompt(plan, { text: 'הספר שנשאר' })
        expect(r.model).not.toBe('gpt-image-1')
        expect(r.model).toBe(IMAGE_MODEL)
    })

    it('falls back to the post format for an unknown size', () => {
        const r = buildImagePrompt(plan, { size: 'billboard', text: 'הספר שנשאר' })
        expect(r.crop).toEqual(SIZES.post.crop)
    })
})

describe('testBatch', () => {
    const batch = testBatch(ISO)

    it('is five renders', () => {
        // Grew by one when the reference brief arrived: that render is
        // the one that decides whether the directed scenes earn their
        // place at all, so it belongs in the batch that gets looked at.
        expect(batch).toHaveLength(5)
    })

    it('includes a reference brief carrying the brand posters as inputs', () => {
        const ref = batch.find(b => b.mode === 'reference')
        expect(ref).toBeTruthy()
        expect(ref.sourceImages.length).toBeGreaterThanOrEqual(2)
        for (const u of ref.sourceImages) expect(u).toMatch(/\/imgs\/social\/refs\//)
        // No baked caption: the poster's own design supplies the words,
        // and a second line of text fights it.
        expect(ref.text).toBeNull()
        expect(ref.prompt).toMatch(/house style/)
        expect(ref.prompt).toMatch(/never of a child/)
    })

    it('disagrees with itself on purpose', () => {
        // A batch where every render is the easy case tells us nothing.
        expect(new Set(batch.map(b => b.mode)).size).toBe(3)
        expect(new Set(batch.map(b => b.size)).size).toBe(2)
        expect(new Set(batch.map(b => b.sceneId)).size).toBeGreaterThanOrEqual(3)
        expect(batch.some(b => b.text === null)).toBe(true)
    })

    it('keeps every requested caption inside the safe envelope', () => {
        for (const b of batch) {
            if (b.text) expect(checkText(b.text).ok, b.text).toBe(true)
        }
    })

    it('gives every edit render a real image from our own origin', () => {
        // Either a photo of a book we printed, or the screenshot of the
        // live guest page. Both are ours; neither is invented.
        for (const b of batch.filter(b => b.mode === 'edit')) {
            expect(b.sourceImage).toMatch(/^https:\/\/app\.weddingtales\.co\.il\/imgs\/(portfolio|social)\//)
        }
    })

    it('spreads the batch across event stylings so one look cannot pass for all', () => {
        expect(new Set(batch.map(b => b.eventType)).size).toBeGreaterThanOrEqual(3)
    })
})
