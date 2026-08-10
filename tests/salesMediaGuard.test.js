import { describe, it, expect } from 'vitest'
import { wantsToSee, offeredToShow, pickMediaFor, mediaGuard } from '@/lib/salesAgent/mediaGuard'
import { MEDIA } from '@/lib/salesAgent/catalog'

const LIB = Object.fromEntries(Object.entries(MEDIA).map(([k, m]) => [k, { ...m, kind: 'image' }]))

describe('wantsToSee', () => {
    it('catches the ways people ask to see', () => {
        for (const q of [
            'אפשר לראות דוגמה?',
            'איך זה נראה?',
            'יש תמונות של הספר?',
            'שלחי לי את הסרטון שהיה בפייסבוק',
            'תראה לי דוגמאות',
        ]) {
            expect(wantsToSee(q), q).toBe(true)
        }
    })

    it('stays quiet on questions that are not visual', () => {
        for (const q of ['כמה זה עולה', 'מתי זה מגיע', 'היי', '', null]) {
            expect(wantsToSee(q), String(q)).toBe(false)
        }
    })
})

describe('offeredToShow', () => {
    it('catches the exact sentence from the שירלי transcript', () => {
        // "יש לי תמונות של ספרים מוכנים אמיתיים, אשמח להראות לך" — sent
        // with image: null. The customer was left waiting for a picture
        // that was never coming.
        expect(offeredToShow(['יש לי תמונות של ספרים מוכנים אמיתיים, אשמח להראות לך איך זה נראה בפועל.'])).toBe(true)
    })

    it('catches a promise split across bubbles', () => {
        expect(offeredToShow(['רגע', 'מצרף תמונה של ספר אמיתי'])).toBe(true)
    })

    it('does not fire on a normal reply', () => {
        expect(offeredToShow(['המחיר ₪950 כולל הכל'])).toBe(false)
        expect(offeredToShow([])).toBe(false)
    })
})

describe('pickMediaFor', () => {
    it('answers "how does it work" with the guest screen', () => {
        expect(pickMediaFor({ incomingText: 'איך זה עובד לאורחים?', library: LIB })).toBe('upload_screen')
    })

    it('answers "from inside" with the pages of their event', () => {
        expect(pickMediaFor({ incomingText: 'איך זה נראה מבפנים', eventType: 'bar_mitzvah', library: LIB }))
            .toBe('pages_bar_mitzvah')
    })

    it('matches the book to the event type', () => {
        expect(pickMediaFor({ incomingText: 'אפשר לראות דוגמה', eventType: 'wedding', library: LIB })).toBe('book_wedding')
        expect(pickMediaFor({ incomingText: 'אפשר לראות דוגמה', eventType: 'birthday', library: LIB })).toBe('book_birthday')
    })

    it('still has an answer when the event type is unknown', () => {
        const pick = pickMediaFor({ incomingText: 'יש תמונות?', library: LIB })
        expect(pick).toBeTruthy()
    })

    it('never repeats what this lead already saw', () => {
        const pick = pickMediaFor({
            incomingText: 'אפשר לראות עוד?',
            eventType: 'bar_mitzvah',
            seen: ['book_bar_mitzvah'],
            library: LIB,
        })
        expect(pick).toBeTruthy()
        expect(pick).not.toBe('book_bar_mitzvah')
    })

    it('never auto-picks a video', () => {
        // The guard exists to fix a dropped promise; promising a video
        // the transport cannot send yet is the same mistake elsewhere.
        const lib = { flip: { url: 'u', kind: 'video' } }
        expect(pickMediaFor({ incomingText: 'יש סרטון?', library: lib })).toBeNull()
    })

    it('returns null when the lead has seen everything', () => {
        expect(pickMediaFor({ incomingText: 'עוד תמונות', seen: Object.keys(LIB), library: LIB })).toBeNull()
    })
})

describe('mediaGuard', () => {
    it('repairs the שירלי failure end to end', () => {
        const pick = mediaGuard({
            incomingText: 'שלחי לי את הסרטון שהיה בפייסבוק',
            messages: ['אין לי סרטון, אבל יש לי תמונות של ספרים אמיתיים, אשמח להראות לך'],
            eventType: null,
            seen: [],
            library: LIB,
        })
        expect(pick).toBeTruthy()
    })

    it('leaves an ordinary reply completely alone', () => {
        expect(mediaGuard({
            incomingText: 'כמה זה עולה?',
            messages: ['שלוש חבילות: 690, 950, 1490'],
            library: LIB,
        })).toBeNull()
    })
})
