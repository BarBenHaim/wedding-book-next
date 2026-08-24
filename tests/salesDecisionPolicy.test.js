import { describe, expect, it } from 'vitest'
import { buildDeterministicSalesReply, decideSalesTurn, detectSalesIntent, enforceSalesReply, TURN_LIMITS } from '@/lib/salesAgent/decisionPolicy'

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

    it('diagnoses a broken checkout link after an attempted payment instead of sending it again', () => {
        const text = 'ניסיתי לשלם אבל הקישור לא עובד'
        const lead = { stage: 'new' }
        const decision = decideSalesTurn({ incomingText: text, lead })
        expect(decision).toMatchObject({ intent: 'payment_intent', nextBestAction: 'diagnose_checkout' })
        const reply = buildDeterministicSalesReply({ decision, lead, incomingText: text })
        expect(reply.messages[0]).not.toMatch(/https?:\/\//)
    })

    it('does not ask for known event facts again', () => {
        const decision = decideSalesTurn({
            incomingText: 'אפשר עוד פרטים?',
            lead: { eventType: 'bar_mitzvah', eventDate: '2026-11-05', celebrantName: 'נועם' },
        })
        expect(decision.knownFacts).toEqual(expect.arrayContaining(['eventType', 'eventDate', 'celebrantName']))
        expect(decision.forbiddenRepeats).toEqual(expect.arrayContaining(['eventType', 'eventDate', 'celebrantName']))
    })

    it('requires the opening bundle and identifies exactly which event fact is missing', () => {
        expect(decideSalesTurn({ incomingText: 'אפשר פרטים?', lead: { isNew: true } })).toMatchObject({
            openingBundleRequired: true,
            qualificationTarget: 'eventTypeAndDate',
        })
        expect(decideSalesTurn({ incomingText: 'אפשר פרטים?', lead: { isNew: true, eventType: 'bar_mitzvah' } })).toMatchObject({
            openingBundleRequired: true,
            qualificationTarget: 'eventDate',
        })
        expect(decideSalesTurn({ incomingText: 'אפשר פרטים?', lead: { isNew: true, eventDate: '2026-11-05' } })).toMatchObject({
            openingBundleRequired: true,
            qualificationTarget: 'eventType',
        })
    })

    it('never requires an opening bundle for an existing, paused or terminal lead', () => {
        expect(decideSalesTurn({ incomingText: 'אפשר פרטים?', lead: { isNew: false } }).openingBundleRequired).toBe(false)
        expect(decideSalesTurn({ incomingText: 'חזרתי אליכם', lead: { isNew: true, hasPriorConversation: true } }).openingBundleRequired).toBe(false)
        expect(decideSalesTurn({ incomingText: 'יש עדכון?', lead: { isNew: true, human: true } }).openingBundleRequired).toBe(false)
        expect(decideSalesTurn({ incomingText: 'תודה', lead: { isNew: true, stage: 'closed_won', paymentVerified: true } }).openingBundleRequired).toBe(false)
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

    it('honours an expired handoff pause instead of muting the lead forever', () => {
        const lead = { human: true, stage: 'handoff' }
        expect(decideSalesTurn({ incomingText: 'היי, חזרתם אליי?', lead, pausedForHuman: false })).toMatchObject({
            conversationKind: 'sales',
            modelEligible: true,
        })
        expect(decideSalesTurn({ incomingText: 'היי?', lead, pausedForHuman: true })).toMatchObject({
            conversationKind: 'paused',
            nextBestAction: 'silence',
        })
    })

    it('recognises the full how-much vocabulary as price intent', () => {
        expect(detectSalesIntent('כמה זה יוצא?')).toBe('price')
        expect(detectSalesIntent('כמה כסף זה?')).toBe('price')
        expect(detectSalesIntent('how much is it?')).toBe('price')
    })
})

describe('deterministic WhatsApp reply contract', () => {
    it('builds a catalog-grounded price reply when no model is configured', () => {
        const lead = { stage: 'engaged' }
        const incomingText = 'כמה עולה הספר?'
        const decision = decideSalesTurn({ incomingText, lead })
        const result = buildDeterministicSalesReply({ decision, lead, incomingText })
        expect(result).toMatchObject({ handoff: false, noReply: false })
        expect(result.messages).toHaveLength(1)
        expect(result.messages[0]).toMatch(/690|990|1,?490|₪/)
        expect(result.messages[0].length).toBeLessThanOrEqual(TURN_LIMITS.maxChars)
    })

    it('never lets model output claim a paid sale without payment verification', () => {
        const lead = { stage: 'engaged' }
        const incomingText = 'מעולה נשמע טוב'
        const decision = decideSalesTurn({ incomingText, lead })
        const result = enforceSalesReply({
            parsed: { messages: ['מעולה'], stage: 'closed_won' }, decision, lead, incomingText,
        })
        expect(result.stage).not.toBe('closed_won')
    })

    const decisionFor = (incomingText, lead = {}) => decideSalesTurn({ incomingText, lead })

    it('keeps at most two messages, one question total, within the char limit', () => {
        const decision = decisionFor('אשמח לעוד פרטים')
        const result = enforceSalesReply({
            parsed: {
                messages: [
                    `זה פתרון שמרכז את כל הברכות והתמונות במקום אחד ${'מאוד '.repeat(45)}מה הכי חשוב לכם? ומתי האירוע?`,
                    'ואפשר גם להוסיף עוד פרט קטן על הספר. מה דעתך?',
                    'הודעה שלישית שנחתכת כי המגבלה היא שתיים',
                ],
                stage: 'engaged',
                handoff: false,
            },
            decision,
            lead: {},
            incomingText: 'אשמח לעוד פרטים',
        })
        expect(result.messages).toHaveLength(2)
        for (const m of result.messages) expect(m.length).toBeLessThanOrEqual(TURN_LIMITS.maxChars)
        const questions = result.messages.join(' ').match(/\?/g) || []
        expect(questions).toHaveLength(1)
    })

    it('lets a price answered in the second message stand instead of forcing the fallback', () => {
        const incomingText = 'כמה זה יוצא?'
        const result = enforceSalesReply({
            parsed: {
                messages: ['שאלה מצוינת, יש שלוש חבילות', 'המודפסת שרוב המשפחות בוחרות עולה ₪990 כולל משלוח'],
                stage: 'engaged',
                handoff: false,
            },
            decision: decisionFor(incomingText),
            lead: {},
            incomingText,
        })
        expect(result.messages).toHaveLength(2)
        expect(result.messages.join(' ')).toContain('₪990')
    })

    it('replaces a stale model price with the current catalog price', () => {
        const incomingText = 'כמה זה יוצא?'
        const result = enforceSalesReply({
            parsed: {
                messages: ['המודפסת עולה ₪950 כולל משלוח'],
                stage: 'engaged',
                handoff: false,
            },
            decision: decisionFor(incomingText),
            lead: {},
            incomingText,
        })
        expect(result.messages.join(' ')).toContain('₪990')
        expect(result.messages.join(' ')).not.toContain('₪950')
    })

    it('drops a second message with phone-call language but keeps the first', () => {
        const incomingText = 'אפשר עוד פרטים?'
        const result = enforceSalesReply({
            parsed: {
                messages: ['בשמחה, הספר מרכז את כל הברכות מהאירוע', 'ואם נוח לך, אתקשר אליך בטלפון'],
                stage: 'engaged',
                handoff: false,
            },
            decision: decisionFor(incomingText),
            lead: {},
            incomingText,
        })
        expect(result.messages).toHaveLength(1)
        expect(result.messages[0]).not.toMatch(/אתקשר|טלפון/)
    })

    it('answers a price question from the catalog when the model dodges it', () => {
        const incomingText = 'כמה עולה הספר?'
        const result = enforceSalesReply({
            parsed: { messages: ['זה משתנה לפי החבילה, אשמח להסביר'], stage: 'engaged', handoff: false },
            decision: decisionFor(incomingText),
            lead: {},
            incomingText,
        })
        expect(result.messages).toHaveLength(1)
        expect(result.messages[0]).toContain('₪990')
        expect(result.messages[0].length).toBeLessThanOrEqual(TURN_LIMITS.maxChars)
    })

    it('does not repeat questions about facts already known', () => {
        const lead = { eventType: 'bar_mitzvah', eventDate: '2026-11-05' }
        const result = enforceSalesReply({
            parsed: { messages: ['בשמחה, לאיזה אירוע זה ומתי האירוע?'], stage: 'engaged', handoff: false },
            decision: decisionFor('אפשר עוד פרטים?', lead),
            lead,
            incomingText: 'אפשר עוד פרטים?',
        })
        expect(result.messages[0]).not.toMatch(/איזה אירוע|לאיזה אירוע|מתי האירוע/)
        expect(result.messages[0]).toBeTruthy()
    })

    it('diagnoses checkout friction without resending a known payment link', () => {
        const lead = { paymentLinkSentAt: 1, packageInterest: 'printed' }
        const incomingText = 'לא הצלחתי להשלים את ההזמנה'
        const result = enforceSalesReply({
            parsed: { messages: ['הנה שוב https://weddingtales.co.il/checkout/?add-to-cart=6271'], stage: 'ready_to_pay', handoff: false },
            decision: decisionFor(incomingText, lead),
            lead,
            incomingText,
        })
        expect(result.messages[0]).not.toContain('https://')
        expect(result.messages[0]).toMatch(/איפה|באיזה שלב/)
        expect(result.messages[0].match(/\?/g) || []).toHaveLength(1)
    })

    it('uses the exact catalog checkout link once for a first payment intent', () => {
        const incomingText = 'אני רוצה להזמין את המודפס'
        const result = enforceSalesReply({
            parsed: { messages: ['מעולה, הנה קישור'], stage: 'engaged', packageInterest: 'printed', handoff: false },
            decision: decisionFor(incomingText),
            lead: {},
            incomingText,
        })
        expect(result.messages[0]).toContain('https://weddingtales.co.il/checkout/?add-to-cart=6271')
        expect(result.messages[0].match(/https:\/\//g)).toHaveLength(1)
        expect(result.stage).toBe('ready_to_pay')
    })

    it('closes a clean negative exit without handoff or owner escalation', () => {
        const incomingText = 'החלטנו לוותר תודה'
        const result = enforceSalesReply({
            parsed: { messages: ['אעביר אותך לנציג'], stage: 'handoff', handoff: true },
            decision: decisionFor(incomingText),
            lead: {},
            incomingText,
        })
        expect(result).toMatchObject({ stage: 'closed_lost', handoff: false, noReply: false })
        expect(result.messages).toHaveLength(1)
        expect(result.notifyOwner).toBeUndefined()
    })

    it('keeps an active handoff silent and never calls the model through this contract', () => {
        const lead = { human: true, stage: 'handoff' }
        const result = enforceSalesReply({
            parsed: { messages: ['אני עדיין כאן'], stage: 'engaged', handoff: false },
            decision: decisionFor('יש עדכון?', lead),
            lead,
            incomingText: 'יש עדכון?',
        })
        expect(result).toMatchObject({ messages: [], noReply: true, handoff: false, stage: 'handoff' })
    })

    it('replaces phone-call language because this funnel is WhatsApp only', () => {
        const incomingText = 'אפשר עוד פרטים?'
        const result = enforceSalesReply({
            parsed: { messages: ['בשמחה, מתי נוח שאתקשר אליך בטלפון?'], stage: 'engaged', handoff: false },
            decision: decisionFor(incomingText),
            lead: {},
            incomingText,
        })
        expect(result.messages[0]).not.toMatch(/אתקשר|טלפון|שיחת טלפון/)
    })
})
