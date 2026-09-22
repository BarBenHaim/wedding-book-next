import { describe, expect, it } from 'vitest'
import { buildDeterministicSalesReply, decideSalesTurn, detectSalesIntent, enforceSalesReply, warmPaymentOpener, liftInlineImageMarkers, resolveOfferToSend, isAdCta, TURN_LIMITS } from '@/lib/salesAgent/decisionPolicy'

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
        // The model's short warm line goes first; the link line is still
        // ours, word for word, and the only place a URL appears.
        expect(result.messages).toHaveLength(2)
        expect(result.messages[0]).toBe('מעולה, הנה קישור')
        expect(result.messages[1]).toContain('https://weddingtales.co.il/checkout/?add-to-cart=6271')
        expect(result.messages.join(' ').match(/https:\/\//g)).toHaveLength(1)
        expect(result.stage).toBe('ready_to_pay')
    })

    it('drops the model opener before the payment line when it carries a number, link or question', () => {
        const incomingText = 'אני רוצה להזמין את המודפס'
        const decision = decisionFor(incomingText)
        for (const opener of [
            'ספר מודפס עולה 1490 שח',
            'הנה: https://example.com/pay',
            'איזו חבילה תרצי?',
            'אחזור אליך בטלפון',
            'א'.repeat(141),
        ]) {
            const result = enforceSalesReply({
                parsed: { messages: [opener], stage: 'engaged', packageInterest: 'printed', handoff: false },
                decision,
                lead: {},
                incomingText,
            })
            expect(result.messages, opener).toHaveLength(1)
            expect(result.messages[0]).toContain('add-to-cart=6271')
        }
        expect(warmPaymentOpener('יאללה, הולכים על המודפס לבר מצווה של יונתן', decision)).toBe('יאללה, הולכים על המודפס לבר מצווה של יונתן')
        expect(warmPaymentOpener('', decision)).toBeNull()
    })

    it('does not let the model close a lead the customer did not close', () => {
        // "הבנתי, תודה" after a price list closed a February bar mitzvah as
        // closed_lost on 20.9 - terminal, never chased again.
        const incomingText = 'הבנתי, תודה'
        const result = enforceSalesReply({
            parsed: { messages: ['שמחתי לעזור, אם תחליט תגיד לי'], stage: 'closed_lost', handoff: false },
            decision: decisionFor(incomingText),
            lead: { stage: 'offer_sent', eventType: 'bar_mitzvah', eventDate: '2027-02-01' },
            incomingText,
        })
        expect(result.stage).toBe('offer_sent')
        const fresh = enforceSalesReply({
            parsed: { messages: ['בסדר גמור'], stage: 'closed_lost', handoff: false },
            decision: decisionFor(incomingText),
            lead: { stage: 'opening_completed' },
            incomingText,
        })
        expect(fresh.stage).toBe('engaged')
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

// 19.9: a customer explained "חשבתי שהצעת מחיר הנחה" right after the bot had
// listed the prices, and the enforcer replaced the model's warm reply with
// the bare price line. Mentioning price is not asking for it.
describe('price mentions after the prices were just given', () => {
    const priced = { turns: [
        { role: 'user', text: 'מה המחיר?' },
        { role: 'assistant', text: 'המחירים: ספר דיגיטלי ₪690 · ספר מודפס ₪990. הכל כולל מע״מ.' },
    ] }

    it('does not treat a passing mention as a price question when prices were just stated', () => {
        expect(detectSalesIntent('כנראה שנוצר לי בלבול כי חשבתי שהצעת מחיר הנחה. תודה על המידע', priced)).not.toBe('price')
    })

    it('still answers an explicit how-much, even right after the prices', () => {
        expect(detectSalesIntent('רגע, כמה עולה המודפס?', priced)).toBe('price')
    })

    it('treats a topic word as a price question when no prices were given yet', () => {
        expect(detectSalesIntent('ומה לגבי מחיר?', { turns: [] })).toBe('price')
    })

    it('keeps the model reply instead of the price line for such a mention', () => {
        const lead = { ...priced, stage: 'engaged', eventDate: '2026-12-03' }
        const decision = decideSalesTurn({ lead, incomingText: 'התבלבלתי, חשבתי שהצעת מחיר הנחה. מקווה לשבת על זה בהקדם' })
        const result = enforceSalesReply({
            parsed: { messages: ['הבנתי לגמרי, אין לחץ. כשתרצי לשבת על זה אני כאן, ובינתיים שמרתי לך את התאריך בראש.'], stage: 'engaged', handoff: false },
            decision, lead, incomingText: 'התבלבלתי, חשבתי שהצעת מחיר הנחה. מקווה לשבת על זה בהקדם',
        })
        expect(result.messages[0]).toMatch(/הבנתי לגמרי/)
        expect(result.messages[0]).not.toMatch(/המחירים:/)
    })
})


describe('what the 21-22.9 transcripts taught the enforcer', () => {
    const decisionFor = (incomingText, lead = {}) => decideSalesTurn({ incomingText, lead })
    const DEMO_URL = 'https://app.weddingtales.co.il/wedding/0oeixSvNuY9uKEmZ0GVg/photo'

    it('never turns the question mark inside a URL into a full stop', () => {
        // 21.9: "checkout/?add-to-cart=6271" went out as "checkout/.add-to-cart=6271".
        const incomingText = 'כן, אשמח'
        const result = enforceSalesReply({
            parsed: { messages: ['מוכן להתחיל? הקישור כאן: https://weddingtales.co.il/checkout/?add-to-cart=6271 ומה התאריך?'], stage: 'engaged', handoff: false },
            decision: decisionFor(incomingText),
            lead: {},
            incomingText,
        })
        expect(result.messages[0]).toContain('https://weddingtales.co.il/checkout/?add-to-cart=6271')
        expect(result.messages[0].match(/\?/g)).toHaveLength(2)
        expect(result.messages[0].endsWith('ומה התאריך.')).toBe(true)
    })

    it('lifts "[image: key]" out of the words and attaches the picture', () => {
        expect(liftInlineImageMarkers(['הנה דוגמה לספר מודפס כדי שתראי איך זה יוצא:\n\n[image: book_open_spread]'])).toEqual({
            messages: ['הנה דוגמה לספר מודפס כדי שתראי איך זה יוצא.'],
            image: 'book_open_spread',
        })
        expect(liftInlineImageMarkers(['בלי תמונה'])).toEqual({ messages: ['בלי תמונה'], image: null })
        const incomingText = 'אפשר לראות דוגמה?'
        const result = enforceSalesReply({
            parsed: { messages: ['בטח, תראי: [image: cover_personalised]'], stage: 'engaged', handoff: false, image: null },
            decision: decisionFor(incomingText),
            lead: {},
            incomingText,
        })
        expect(result.messages[0]).not.toContain('[image')
    })

    it('lets the model add up a package and an extra copy', () => {
        // 21.9: "כמה יעלה לי 2 ספרים" twice, the price list twice.
        const incomingText = 'כמה יעלה לי 2 ספרים'
        const result = enforceSalesReply({
            parsed: { messages: ['ספר מודפס 990 שח ועותק נוסף 290 שח, ביחד 1280 שח. לסבא וסבתא?'], stage: 'offer_sent', handoff: false },
            decision: decisionFor(incomingText),
            lead: {},
            incomingText,
        })
        expect(result.messages[0]).toContain('1280')
        const invented = enforceSalesReply({
            parsed: { messages: ['שני ספרים 1400 שח'], stage: 'offer_sent', handoff: false },
            decision: decisionFor(incomingText),
            lead: {},
            incomingText,
        })
        expect(invented.messages[0]).not.toContain('1400')
    })

    it('answers a second ad click with the demo, not the opening again', () => {
        const text = 'שלום! אפשר לקבל מידע נוסף על זה?'
        expect(isAdCta(text)).toBe(true)
        expect(isAdCta('مرحبًا! هل يمكنني الحصول على مزيد من المعلومات حول هذا؟')).toBe(true)
        expect(detectSalesIntent(text, { isNew: true })).not.toBe('ad_cta_repeat')
        const lead = { isNew: false, stage: 'opening_completed', turns: [{ role: 'user', text }, { role: 'assistant', text: 'היי, כיף שפנית' }] }
        const decision = decisionFor(text, lead)
        expect(decision).toMatchObject({ intent: 'ad_cta_repeat', nextBestAction: 'send_demo' })
        const result = enforceSalesReply({
            parsed: { messages: ['היי, כיף שפנית! ב-Wedding Tales האורחים סורקים QR...'], stage: 'engaged', handoff: false },
            decision, lead, incomingText: text,
        })
        expect(result.messages).toHaveLength(1)
        expect(result.messages[0]).toContain(DEMO_URL)
        expect(result.stage).toBe('demo_sent')
        // Demo already sent: a short pointer, no second demo link.
        const seen = { ...lead, turns: [...lead.turns, { role: 'assistant', text: `הנה: ${DEMO_URL}` }] }
        const again = enforceSalesReply({ parsed: { messages: ['x'], stage: 'engaged' }, decision: decisionFor(text, seen), lead: seen, incomingText: text })
        expect(again.messages[0]).not.toContain(DEMO_URL)
        expect(again.messages[0]).toContain('שלחתי למעלה')
    })

    it('hands a print-only request to a human instead of quoting the package', () => {
        // 22.9: "אם אני מביאה קובץ רק רוצה להדפיס, כמה יעלה לי?" → "990 ש״ח".
        const incomingText = 'אם אני מביאה קובץ רק רוצה להדפיס, כמה יעלה לי?'
        const decision = decisionFor(incomingText)
        expect(decision).toMatchObject({ intent: 'print_only', nextBestAction: 'handoff_print' })
        const result = enforceSalesReply({
            parsed: { messages: ['עלות הדפסת ספר מודפס אצלנו היא 990 ש״ח'], stage: 'engaged', handoff: false },
            decision, lead: {}, incomingText,
        })
        expect(result.messages[0]).not.toContain('990')
        expect(result.messages[0]).toContain('מישהו מהצוות')
        expect(result.handoff).toBe(true)
    })

    it('sends the thing instead of asking whether to send it', () => {
        const spread = resolveOfferToSend('ספר דיגיטלי 690 שח, ספר מודפס 990 שח. רוצה שאשלח לך דוגמה של הספר המודפס?', { lead: {} })
        expect(spread).toEqual({ message: 'ספר דיגיטלי 690 שח, ספר מודפס 990 שח.', image: 'book_open_spread', append: null })
        // Already showed the spread: the next unseen picture.
        expect(resolveOfferToSend('רוצה שאשלח לך תמונה?', { lead: { imagesSent: ['book_open_spread'] } }).image).toBe('cover_personalised')
        // An image is already attached: just drop the question.
        expect(resolveOfferToSend('יפה. רוצה שאשלח לך דוגמה?', { lead: {}, hasImage: true })).toMatchObject({ message: 'יפה.', image: null })
        // The demo offer becomes the demo link.
        const demo = resolveOfferToSend('נשמע מתאים. רוצה שאשלח לך את הדמו?', { lead: {} })
        expect(demo.message).toBe('נשמע מתאים.')
        expect(demo.append).toContain(DEMO_URL)
        // Payment links keep their own path.
        expect(resolveOfferToSend('רוצה שאשלח לך את הקישור לתשלום?', { lead: {} }).image).toBeNull()
        // Through the enforcer: the image lands on the result.
        const incomingText = 'כמה זה עולה?'
        const result = enforceSalesReply({
            parsed: { messages: ['ספר דיגיטלי 690 שח, ספר מודפס 990 שח. רוצה שאשלח לך דוגמה של הספר המודפס?'], stage: 'offer_sent', handoff: false, image: null },
            decision: decisionFor(incomingText), lead: {}, incomingText,
        })
        expect(result.messages[0]).not.toContain('רוצה שאשלח')
        expect(result.image).toBe('book_open_spread')
    })
})
