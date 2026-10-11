import { describe, expect, it } from 'vitest'
import { shouldLookupCustomerByPhone } from '@/lib/salesAgent/customerContext'

describe('customer ownership lookup gate', () => {
    it('preserves the first-contact ownership check', () => {
        expect(shouldLookupCustomerByPhone({ lead: { isNew: true }, incomingText: 'שלום' })).toBe(true)
    })

    it.each([
        'איפה הספר שלי?',
        'אפשר לסדר את העמודים?',
        'צריך להוסיף עוד ברכה לספר שלנו',
        'אפשר לתרגם את הספר לאנגלית?',
        'בקשה לתרגום העמודים לאנגלית',
        'אפשר לקבל את הדפים להדפסה?',
        'צריך להוריד את העמודים',
        'אפשר לשלוח את העמודים?',
        'Please export the pages',
        'כבר רכשנו ויש שאלה',
        'Can you fix my book?',
        'Please translate the pages into English',
        'We have already ordered',
    ])('requests verification for a support-like statement without declaring a customer: %s', incomingText => {
        expect(shouldLookupCustomerByPhone({ lead: { isNew: false }, incomingText })).toBe(true)
    })

    it.each([
        'כמה עולה ספר?',
        'כמה עמודים יש בספר?',
        'אפשר דוגמה?',
        'אפשר לקבל דוגמה של הספר?',
        'התכוונתי לגרסה באנגלית',
        'אני רוצה באנגלית',
        'הספר מתאים גם לאורחים דוברי אנגלית?',
        'רוצה להזמין ספר מודפס',
        'לא הצלחתי לשלם בקישור',
        'האם חייבים לשלם מראש?',
        'כן',
        'yes',
        '',
    ])('does not query an ordinary non-new sales turn: %s', incomingText => {
        expect(shouldLookupCustomerByPhone({ lead: { isNew: false }, incomingText })).toBe(false)
    })

    it('uses recent user support context for a short affirmative continuation', () => {
        const lead = { turns: [
            { role: 'user', text: 'אפשר לערוך את העמודים?' },
            { role: 'assistant', text: 'צריך לשנות את הסדר?' },
            { role: 'user', text: 'כן' },
            { role: 'assistant', text: 'את כל העמודים?' },
        ] }
        expect(shouldLookupCustomerByPhone({ lead, incomingText: 'כן בבקשה' })).toBe(true)
    })

    it('does not use the assistant’s own support claims as customer evidence', () => {
        const lead = { turns: [{ role: 'assistant', text: 'צריך לערוך את הספר שלי?' }] }
        expect(shouldLookupCustomerByPhone({ lead, incomingText: 'כן' })).toBe(false)
    })

    it.each([
        'התכוונתי לגרסה באנגלית', 'באנגלית', 'I meant the English version',
        'רציתי באנגלית', 'אני רוצה באנגלית', 'צריך באנגלית', 'אני צריכה באנגלית',
    ])('continues support through a neutral language correction: %s', incomingText => {
        const lead = { turns: [
            { role: 'user', text: 'צריך להוריד את העמודים להדפסה' },
            { role: 'assistant', text: 'הגרסה בעברית?' },
        ] }
        expect(shouldLookupCustomerByPhone({ lead, incomingText })).toBe(true)
    })

    it('continues a yes after a bounded language preference without accepting broader buyer sentences', () => {
        const support = { role: 'user', text: 'צריך להוריד את העמודים להדפסה' }
        const lead = { turns: [support, { role: 'user', text: 'אני רוצה באנגלית' }] }
        expect(shouldLookupCustomerByPhone({ lead, incomingText: 'כן' })).toBe(true)
        expect(shouldLookupCustomerByPhone({ lead, incomingText: 'אני רוצה באנגלית, כמה יעלה ספר חדש?' })).toBe(false)
        const changedTopic = { turns: [support, { role: 'user', text: 'אני רוצה להזמין ספר באנגלית' }] }
        expect(shouldLookupCustomerByPhone({ lead: changedTopic, incomingText: 'כן' })).toBe(false)
    })

    it('keeps repeated yes replies tied to support across a language correction', () => {
        const lead = { turns: [
            { role: 'user', text: 'אפשר לקבל את הדפים להדפסה?' },
            { role: 'assistant', text: 'הגרסה בעברית?' },
            { role: 'user', text: 'התכוונתי לגרסה באנגלית' },
            { role: 'assistant', text: 'לכל הדפים?' },
            { role: 'user', text: 'כן' },
            { role: 'assistant', text: 'ובאותו סדר?' },
            { role: 'user', text: 'כן בבקשה' },
            { role: 'assistant', text: 'הבנתי' },
        ] }
        expect(shouldLookupCustomerByPhone({ lead, incomingText: 'כן' })).toBe(true)
    })

    it('does not bridge a language correction across a new buyer question', () => {
        const lead = { turns: [
            { role: 'user', text: 'אפשר לקבל את הדפים להדפסה?' },
            { role: 'assistant', text: 'אבדוק' },
            { role: 'user', text: 'כמה יעלה להזמין ספר חדש?' },
            { role: 'assistant', text: 'רוצים גרסה בעברית?' },
            { role: 'user', text: 'התכוונתי לגרסה באנגלית' },
        ] }
        expect(shouldLookupCustomerByPhone({ lead, incomingText: 'כן' })).toBe(false)
    })

    it('stops at a newer substantive user topic', () => {
        const lead = { turns: [
            { role: 'user', text: 'אפשר לתקן את הספר שלי?' },
            { role: 'assistant', text: 'אעביר לצוות' },
            { role: 'user', text: 'אני שואל עכשיו על מחיר של ספר נוסף' },
            { role: 'assistant', text: 'הספר המודפס?' },
        ] }
        expect(shouldLookupCustomerByPhone({ lead, incomingText: 'כן' })).toBe(false)
    })

    it('does not carry support context into an unrelated new message', () => {
        const lead = { turns: [{ role: 'user', text: 'צריך לתקן את הספר שלי' }] }
        expect(shouldLookupCustomerByPhone({ lead, incomingText: 'כמה עולה ספר נוסף?' })).toBe(false)
    })

    it('bounds how far back support context can affect a bare yes', () => {
        const lead = { turns: [
            { role: 'user', text: 'אפשר לתקן את הספר שלי?' },
            ...Array.from({ length: 12 }, () => ({ role: 'assistant', text: 'synthetic context' })),
        ] }
        expect(shouldLookupCustomerByPhone({ lead, incomingText: 'כן' })).toBe(false)
    })

    it('bounds the inspected text and tolerates missing or malformed turns', () => {
        expect(shouldLookupCustomerByPhone()).toBe(false)
        expect(shouldLookupCustomerByPhone({ lead: null, incomingText: null })).toBe(false)
        expect(shouldLookupCustomerByPhone({ lead: { turns: {} }, incomingText: 'כן' })).toBe(false)
        expect(shouldLookupCustomerByPhone({ lead: { turns: [null, { role: 'user', text: {} }] }, incomingText: 'כן' })).toBe(false)
        expect(shouldLookupCustomerByPhone({ incomingText: `${'x'.repeat(1_200)} הספר שלי` })).toBe(false)
    })
})
