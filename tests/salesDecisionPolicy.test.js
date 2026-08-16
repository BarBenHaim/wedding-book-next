import { describe, expect, it } from 'vitest'
import { decideSalesTurn, detectSalesIntent, TURN_LIMITS } from '@/lib/salesAgent/decisionPolicy'

describe('conversation-learned sales decision policy', () => {
    it.each([
        ['price', 'כמה זה עולה?', {}, 'answer'],
        ['demo', 'אפשר לראות דוגמה של הספר?', {}, 'show_proof'],
        ['positive_signal', 'וואו זה נראה אש', { eventType: 'bar_mitzvah' }, 'recommend_package'],
        ['payment_intent', 'אני רוצה להזמין את המודפס', {}, 'send_payment_link'],
        ['payment_intent', 'לא הצלחתי להשלים את התשלום', { paymentLinkSentAt: 1 }, 'diagnose_checkout'],
        ['negative_exit', 'החלטנו לוותר תודה', {}, 'close_lost'],
        ['objection', 'זה קצת יקר לי', {}, 'handle_objection'],
    ])('%s chooses %s', (intent, incomingText, lead, nextBestAction) => {
        expect(decideSalesTurn({ incomingText, lead })).toMatchObject({
            conversationKind: 'sales',
            intent,
            nextBestAction,
            ...TURN_LIMITS,
        })
    })

    it('lets a clean negative exit beat generic human language', () => {
        expect(detectSalesIntent('דיברתי עם בעלי והחלטנו שלא, תודה')).toBe('negative_exit')
    })

    it('lets checkout friction beat a generic price mention', () => {
        expect(detectSalesIntent('המחיר בסדר אבל היתה לי תקלה בתשלום')).toBe('payment_intent')
    })

    it('does not ask for known event facts again', () => {
        const decision = decideSalesTurn({
            incomingText: 'אפשר עוד פרטים?',
            lead: { eventType: 'bar_mitzvah', eventDate: '2026-11-05', celebrantName: 'נועם' },
        })
        expect(decision.knownFacts).toEqual(expect.arrayContaining(['eventType', 'eventDate', 'celebrantName']))
        expect(decision.forbiddenRepeats).toEqual(expect.arrayContaining(['eventType', 'eventDate', 'celebrantName']))
    })

    it('routes existing customers and active handoffs outside the sales model', () => {
        expect(decideSalesTurn({ incomingText: 'צריך עזרה בספר שכבר קניתי', lead: {}, isExistingCustomer: true })).toMatchObject({
            conversationKind: 'customer',
            nextBestAction: 'route_existing_customer',
            modelEligible: false,
        })
        expect(decideSalesTurn({ incomingText: 'יש עדכון?', lead: { human: true } })).toMatchObject({
            conversationKind: 'paused',
            nextBestAction: 'silence',
            modelEligible: false,
        })
    })
})
