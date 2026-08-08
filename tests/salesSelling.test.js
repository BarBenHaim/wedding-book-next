import { describe, it, expect } from 'vitest'
import { SELLING_CRAFT, asksPrice, hasPrice, priceDodged, priceFallbackMessage } from '@/lib/salesAgent/selling'
import { PACKAGES } from '@/lib/salesAgent/catalog'

describe('the selling guide', () => {
    it('makes the price rule unmissable', () => {
        // This is the thing Lord actually complained about, so it is the
        // thing the guide has to say loudest.
        expect(SELLING_CRAFT).toMatch(/תגיד לו כמה זה עולה/)
        expect(SELLING_CRAFT).toMatch(/לא "תלוי"/)
    })

    it('forbids the qualify-before-answering move by name', () => {
        expect(SELLING_CRAFT).toMatch(/קודם תשובה/)
    })

    it('teaches it to read what the person is actually buying', () => {
        expect(SELLING_CRAFT).toMatch(/מה הוא באמת רוצה לשמוע/)
    })

    it('names the moment agents most often blow a warm lead', () => {
        // Customer says "sounds great" and the bot answers with features.
        expect(SELLING_CRAFT).toMatch(/נשמע מעולה/)
    })

    it('describes closing as offering a next step, not applying pressure', () => {
        expect(SELLING_CRAFT).toMatch(/סגירה זה לא לחץ/)
    })

    it('still refuses to buy a deal with a promise or a discount', () => {
        expect(SELLING_CRAFT).toMatch(/הבטחה שקרית/)
        expect(SELLING_CRAFT).toMatch(/לא לתת הנחה/)
    })
})

describe('asksPrice', () => {
    it('catches the ways people actually ask', () => {
        for (const q of [
            'כמה זה עולה?',
            'היי כמה עולה הספר',
            'מה המחיר',
            'אשמח לקבל מחירון',
            'כמה זה יוצא בסוף',
            'באיזה מחיר אתם',
            'מה העלות של המודפס',
            'How much is it?',
        ]) {
            expect(asksPrice(q), q).toBe(true)
        }
    })

    it('does not fire on questions that are not about money', () => {
        for (const q of [
            'כמה זמן לוקח להכין',
            'כמה אורחים אפשר',
            'מתי זה מגיע',
            'אפשר גם באנגלית?',
            'היי',
            '',
            null,
        ]) {
            expect(asksPrice(q), String(q)).toBe(false)
        }
    })

    it('survives the punctuation people actually type', () => {
        expect(asksPrice('כמה זה עולה???')).toBe(true)
        expect(asksPrice('  מה המחיר  ')).toBe(true)
    })
})

describe('hasPrice', () => {
    it('accepts a shekel sign, the word, or a three-digit number', () => {
        expect(hasPrice('₪950')).toBe(true)
        expect(hasPrice('950 שקל')).toBe(true)
        expect(hasPrice('החבילה הבסיסית 950')).toBe(true)
        expect(hasPrice('בערך 1200')).toBe(true)
    })

    it('accepts a range and an approximation, because those are answers', () => {
        // "starts at 950" is a real answer to "how much". Treating it as
        // a dodge would append a second price list under a fine reply.
        expect(hasPrice('מתחיל מ-950')).toBe(true)
        expect(hasPrice('בין 950 ל-1990')).toBe(true)
    })

    it('rejects a reply with no number in it', () => {
        expect(hasPrice('תלוי בסוג האירוע, ספר לי קצת')).toBe(false)
        expect(hasPrice('יש לנו כמה אפשרויות')).toBe(false)
    })

    it('is not fooled by a small number that is not a price', () => {
        expect(hasPrice('יש 3 חבילות')).toBe(false)
    })
})

describe('priceDodged', () => {
    it('flags the exact failure: asked for a price, answered with a question', () => {
        expect(priceDodged('כמה זה עולה?', ['תלוי בסוג האירוע, מה חוגגים?'])).toBe(true)
    })

    it('is quiet when the price was given', () => {
        expect(priceDodged('כמה זה עולה?', ['החבילות הן 950, 1450 ו-1990'])).toBe(false)
    })

    it('reads the whole batch, not just the first message', () => {
        // A short line then the numbers is good writing, not a dodge.
        expect(priceDodged('כמה עולה', ['רגע, שולח', 'דיגיטלי ₪950, מודפס ₪1450'])).toBe(false)
    })

    it('stays out of the way when nobody asked about money', () => {
        expect(priceDodged('כמה זמן לוקח', ['שבועיים מרגע סגירת הספר'])).toBe(false)
        expect(priceDodged('היי', ['היי! על איזה אירוע מדובר?'])).toBe(false)
    })

    it('survives junk', () => {
        expect(priceDodged(null, null)).toBe(false)
        expect(priceDodged('כמה עולה', [])).toBe(true)
        expect(priceDodged('כמה עולה', 'תלוי')).toBe(true)
    })
})

describe('priceFallbackMessage', () => {
    it('names every package with its real price', () => {
        const msg = priceFallbackMessage()
        for (const p of PACKAGES) {
            expect(msg, p.name).toContain(p.name)
            expect(msg, String(p.price)).toContain(p.price.toLocaleString('he-IL'))
        }
    })

    it('says VAT is included, because that is the next question', () => {
        expect(priceFallbackMessage()).toMatch(/מע/)
    })

    it('is short enough to sit under another message', () => {
        // It is a repair, not a pitch. Four lines of catalogue under a
        // reply reads worse than the dodge it is fixing.
        expect(priceFallbackMessage().split('\n').length).toBe(1)
        expect(priceFallbackMessage().length).toBeLessThan(200)
    })

    it('answers its own trigger', () => {
        // The whole point: whatever the model did, this passes the check.
        expect(priceDodged('כמה זה עולה', [priceFallbackMessage()])).toBe(false)
    })
})
