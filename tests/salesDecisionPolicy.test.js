import { describe, expect, it } from 'vitest'
import { buildDeterministicSalesReply, decideSalesTurn, detectSalesIntent, enforceSalesReply, warmPaymentOpener, liftInlineImageMarkers, resolveOfferToSend, isAdCta, hasMixedScript, TURN_LIMITS } from '@/lib/salesAgent/decisionPolicy'

describe('conversation-learned sales decision policy', () => {
    it.each([
        ['price', 'כמה זה עולה?', {}, 'quote_price'],
        ['price', 'כמה יעלו לי 2 ספרים?', {}, 'answer'],
        ['demo', 'אפשר לראות דוגמה של הספר?', {}, 'show_proof'],
        ['positive_signal', 'וואו זה נראה אש', { eventType: 'bar_mitzvah' }, 'present_offer'],
        ['positive_signal', 'וואו זה נראה אש', { eventType: 'bar_mitzvah', stage: 'offer_sent' }, 'send_payment_link'],
        ['event_answer', 'בר מצווה של הבן', {}, 'present_offer'],
        ['affirmative', 'כן', { eventType: 'wedding', stage: 'offer_sent' }, 'send_payment_link'],
        ['affirmative', 'סבבה', { eventType: 'wedding' }, 'present_offer'],
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

    // 29.9: seven of ten follow-up drafts ended "לאיזה אירוע זה אצلكם?" —
    // Hebrew finished in Arabic letters. Never sent.
    it('drops a Hebrew message with Arabic letters in it and answers deterministically', () => {
        expect(hasMixedScript('לאיזה אירוע זה אצلكם?')).toBe(true)
        expect(hasMixedScript('לאיזה אירוע זה אצלכם?')).toBe(false)
        expect(hasMixedScript('هل يمكنني الحصول على مزيد من المعلومات؟')).toBe(false)
        const lead = { stage: 'engaged', eventType: 'bar_mitzvah' }
        const incomingText = 'מה כלול?'
        const decision = decideSalesTurn({ incomingText, lead })
        const result = enforceSalesReply({
            parsed: { messages: ['האורחים סורקים QR וכותבים ברכה. לאיזה אירוע זה אצلكם?'], stage: 'engaged', handoff: false },
            decision, lead, incomingText,
        })
        expect(result.messages.length).toBeGreaterThan(0)
        for (const m of result.messages) expect(hasMixedScript(m)).toBe(false)
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

    it('keeps one message, one question, within the char limit', () => {
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
        expect(result.messages).toHaveLength(1)
        for (const m of result.messages) expect(m.length).toBeLessThanOrEqual(TURN_LIMITS.maxChars)
        const questions = result.messages.join(' ').match(/\?/g) || []
        expect(questions).toHaveLength(1)
    })

    it('still delivers the price when the model buried it in a second bubble', () => {
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
        // One bubble since 24.9: the second is dropped and the price guard
        // supplies the catalog line instead.
        expect(result.messages).toHaveLength(1)
        expect(result.messages.join(' ')).toContain('990')
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
        expect(result.messages.join(' ')).toContain('990')
        expect(result.messages.join(' ')).not.toContain('950')
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
        expect(result.messages[0]).toContain('990')
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

    it('lets the model quote the upgrade price and the digital-plus-upgrade total', () => {
        const incomingText = 'כמה עולה השדרוג למודפס?'
        const result = enforceSalesReply({
            parsed: { messages: ['דיגיטלי 690 שח, ואחרי האירוע שדרוג למודפס ב-300 שח, סך הכל 990 שח. לאיזה אירוע?'], stage: 'offer_sent', handoff: false },
            decision: decisionFor(incomingText), lead: {}, incomingText,
        })
        expect(result.messages[0]).toContain('300')
    })

    it('answers a second ad click with one question, not the opening again', () => {
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
        expect(result.messages[0]).toBe('הכל למעלה, איך זה עובד והמחירים. לאיזה אירוע זה אצלכם?')
        expect(result.messages[0]).not.toContain('http')
        expect(result.stage).toBe('engaged')
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
        // The demo offer is dropped and nothing replaces it (24.9: the demo
        // goes out only when the customer asks to try it).
        const demo = resolveOfferToSend('נשמע מתאים. רוצה שאשלח לך את הדמו?', { lead: {} })
        expect(demo).toEqual({ message: 'נשמע מתאים.', image: null, append: null })
        // Payment links keep their own path.
        expect(resolveOfferToSend('רוצה שאשלח לך את הקישור לתשלום?', { lead: {} }).image).toBeNull()
        // Through the enforcer: the image lands on the result.
        const incomingText = 'ספרי לי עוד על המודפס'
        const result = enforceSalesReply({
            parsed: { messages: ['המודפס מגיע בכריכה קשה עד הבית. רוצה שאשלח לך דוגמה של הספר המודפס?'], stage: 'offer_sent', handoff: false, image: null },
            decision: decisionFor(incomingText), lead: {}, incomingText,
        })
        expect(result.messages[0]).not.toContain('רוצה שאשלח')
        expect(result.image).toBe('book_open_spread')
    })
})

// 29.9. Eight days, 86 leads, 34 conversations, zero times the bot asked
// for the order. The funnel is now a mechanism: the event answer gets
// the offer, the price gets the close, "כן" gets the link, "יקר" gets a
// page and then the two doors, and the one concession has a date.
describe('the funnel mechanism', () => {
    const turn = (incomingText, lead = {}, parsed = {}) => {
        const decision = decideSalesTurn({ incomingText, lead, todayISO: '2026-09-29' })
        return { decision, result: enforceSalesReply({ parsed: { messages: ['טיוטה של המודל'], stage: lead.stage || 'engaged', handoff: false, ...parsed }, decision, lead, incomingText }) }
    }

    it('answers the event with the offer: their event, both prices, one close, the book from their event', () => {
        const { decision, result } = turn('בר מצווה', { isNew: false, stage: 'opening_completed' })
        expect(decision).toMatchObject({ intent: 'event_answer', nextBestAction: 'present_offer' })
        expect(result.messages).toHaveLength(1)
        expect(result.messages[0]).toMatch(/בר מצווה/)
        expect(result.messages[0]).toContain('690')
        expect(result.messages[0]).toContain('990')
        expect(result.messages[0]).toMatch(/רוצה שאפתח/)
        expect(result.messages[0].length).toBeLessThanOrEqual(TURN_LIMITS.maxChars)
        expect(result.image).toBe('book_bar_mitzvah')
        expect(result.stage).toBe('offer_sent')
        expect(result.eventType).toBe('bar_mitzvah')
    })

    it('uses the celebrant name in the close and never repeats a picture', () => {
        const { result } = turn('חתונה בפברואר', { isNew: false, imagesSent: ['book_wedding'] }, { celebrantName: 'נועה ודן' })
        expect(result.messages[0]).toContain('הספר של נועה ודן')
        expect(result.image).toBe('pages_wedding')
    })

    it('makes the offer when the event is already known and the customer only states something', () => {
        const { decision } = turn('הבנתי', { isNew: false, eventType: 'bat_mitzvah', stage: 'engaged' })
        expect(decision.nextBestAction).toBe('present_offer')
        // A question still goes to the model first.
        expect(turn('ומה עם אורחים מבוגרים?', { isNew: false, eventType: 'bat_mitzvah', stage: 'engaged' }).decision.nextBestAction).toBe('answer_then_qualify')
        // Once the prices went out, a statement is no longer an opening for the offer.
        expect(turn('הבנתי', { isNew: false, eventType: 'bat_mitzvah', stage: 'offer_sent' }).decision.nextBestAction).toBe('answer_then_qualify')
    })

    it('does not repeat the prices when the event arrives after "כמה עולה"', () => {
        const lead = { isNew: false, stage: 'offer_sent', turns: [{ role: 'assistant', text: 'דיגיטלי 690 שח, מודפס בכריכה קשה 990 שח כולל משלוח. לאיזה אירוע זה אצלכם?' }] }
        const { decision, result } = turn('בת מצווה', lead)
        expect(decision.nextBestAction).toBe('present_offer')
        expect(result.messages[0]).not.toContain('690')
        expect(result.messages[0]).toMatch(/בת מצווה.*רוצה שאפתח/)
    })

    it('answers a plain price question from the catalog and closes when the event is known', () => {
        const known = turn('כמה זה עולה?', { isNew: false, eventType: 'wedding' })
        expect(known.decision.nextBestAction).toBe('quote_price')
        expect(known.result.messages[0]).toMatch(/690.*990.*רוצה שאפתח/)
        expect(known.result.image).toBe('book_wedding')
        const unknown = turn('מה המחיר?', { isNew: false })
        expect(unknown.result.messages[0]).toMatch(/690.*990.*לאיזה אירוע/)
    })

    it('turns "כן" after a close into the payment link with the after-payment line', () => {
        const lead = { isNew: false, eventType: 'bar_mitzvah', stage: 'offer_sent', turns: [{ role: 'assistant', text: 'בר מצווה זה בדיוק האירוע לזה. דיגיטלי 690 שח, מודפס 990 שח. רוצה שאפתח לכם את הספר? שולח קישור.' }] }
        const { decision, result } = turn('כן', lead)
        expect(decision).toMatchObject({ intent: 'affirmative', nextBestAction: 'send_payment_link' })
        expect(result.messages.at(-1)).toContain('add-to-cart=6271')
        expect(result.messages.at(-1)).toMatch(/48 שעות/)
        expect(result.stage).toBe('ready_to_pay')
        expect(result.packageInterest).toBe('printed')
    })

    it('reads "כן" before any prices as a wish to hear more, not as an order', () => {
        expect(turn('כן', { isNew: false }).decision.nextBestAction).toBe('answer_then_qualify')
        expect(turn('יאללה', { isNew: false, eventType: 'brit' }).decision.nextBestAction).toBe('present_offer')
        expect(detectSalesIntent('כן אבל יש לי שאלה על המשלוח')).not.toBe('affirmative')
    })

    it('answers "יקר" with a real page and the digital-then-upgrade door, and only then the one concession', () => {
        const first = turn('זה יקר לי', { isNew: false, eventType: 'bar_mitzvah', stage: 'offer_sent' })
        expect(first.decision.nextBestAction).toBe('handle_objection')
        expect(first.result.image).toBe('book_open_spread')
        expect(first.result.messages[0]).toMatch(/690.*300/)
        expect(first.result.messages[0]).not.toContain('במתנה')
        expect(first.result).toMatchObject({ stage: 'objection', objectionRaised: true })

        const second = turn('עדיין יקר', { isNew: false, eventType: 'bar_mitzvah', stage: 'objection', objectionCount: 1, imagesSent: ['book_open_spread'] })
        expect(second.result.image).toBeNull()
        expect(second.result.messages[0]).toContain('במתנה')
        expect(second.result.messages[0]).toMatch(/עד \d+ ב/)
        expect(second.result.messages[0]).toMatch(/רוצה שאפתח/)

        const third = turn('יקר', { isNew: false, stage: 'objection', objectionCount: 2, turns: [{ role: 'assistant', text: 'עותק מודפס נוסף במתנה (שווי ₪290) בסגירה עד 2 באוקטובר' }] })
        expect(third.result.messages[0]).not.toContain('במתנה')
        expect(third.result.messages[0]).toMatch(/רוצה שאפתח/)
    })

    it('puts a date on "אחשוב" and asks when to come back, once', () => {
        const { result } = turn('אני אחשוב על זה', { isNew: false, stage: 'offer_sent' })
        expect(result.messages[0]).toContain('במתנה')
        expect(result.messages[0]).toMatch(/מתי נוח שאחזור\?$/)
        expect(result.image).toBeNull()
        const again = turn('אחשוב', { isNew: false, stage: 'objection', turns: [{ role: 'assistant', text: 'שמרתי לכם עותק מודפס נוסף במתנה' }] })
        expect(again.result.messages[0]).not.toContain('במתנה')
    })

    it('answers a far date with the reason to open now', () => {
        const { result } = turn('האירוע עוד רחוק', { isNew: false, stage: 'offer_sent' })
        expect(result.messages[0]).toMatch(/מוכנים מראש/)
        expect(result.messages[0]).toContain('במתנה')
        expect(result.messages[0].length).toBeLessThanOrEqual(TURN_LIMITS.maxChars)
    })

    it('never lets a deterministic line run past the bubble limit', () => {
        for (const text of ['בר מצווה', 'בת מצווה', 'חתונה', 'ברית', 'יום הולדת', 'כמה זה עולה?', 'זה יקר', 'אחשוב', 'רחוק', 'כן']) {
            for (const lead of [{ isNew: false }, { isNew: false, eventType: 'bar_mitzvah', stage: 'offer_sent', celebrantName: 'יהונתן אליהו' }, { isNew: false, stage: 'objection', objectionCount: 1 }]) {
                const { result } = turn(text, lead)
                for (const m of result.messages) expect(m.length).toBeLessThanOrEqual(TURN_LIMITS.maxChars)
            }
        }
    })
})

describe('the funnel mechanism, questions first', () => {
    it('answers a question that came with the event before making the offer', () => {
        const d = decideSalesTurn({ incomingText: 'בר מצווה בעוד חודש, יש מצב להספיק?', lead: { isNew: false } })
        expect(d).toMatchObject({ intent: 'general', nextBestAction: 'answer_then_qualify' })
        const r = enforceSalesReply({ parsed: { messages: ['בטח, הפוסטר מוכן תוך 48 שעות. רוצה שאפתח לכם את הספר?'], stage: 'engaged', handoff: false }, decision: d, lead: { isNew: false }, incomingText: 'בר מצווה בעוד חודש, יש מצב להספיק?' })
        expect(r.eventType).toBe('bar_mitzvah')
        expect(r.messages[0]).toContain('48')
    })
})

// 30.9-1.10, read from the first conversations under the mechanism.
describe('what the first two days of the mechanism showed', () => {
    it('lets go of someone who wants a handwritten guest book, once, and stops closing', () => {
        const text = 'זה לא מה שאני מחפשת אני צריכה רק את הספר שהאורחים ייכתבו לה בכתב יד'
        const decision = decideSalesTurn({ incomingText: text, lead: { stage: 'offer_sent' } })
        expect(decision.nextBestAction).toBe('close_lost')
        const r = enforceSalesReply({ parsed: { messages: ['רוצה שאפתח לכם את הספר?'], stage: 'offer_sent', handoff: false }, decision, lead: { stage: 'offer_sent' }, incomingText: text })
        expect(r.stage).toBe('closed_lost')
        expect(r.messages[0]).not.toMatch(/אפתח/)
        expect(detectSalesIntent('לא תודה')).toBe('negative_exit')
    })

    it('answers "תודה לך" after a close with silence, not the generic fallback', () => {
        const decision = decideSalesTurn({ incomingText: 'תודה לך', lead: { stage: 'closed_lost' } })
        expect(decision).toMatchObject({ nextBestAction: 'silence', modelEligible: false })
        const r = enforceSalesReply({ parsed: { messages: ['רגע, אני בודק'], stage: 'closed_lost', handoff: false }, decision, lead: { stage: 'closed_lost' }, incomingText: 'תודה לך' })
        expect(r).toMatchObject({ noReply: true, messages: [] })
        // A real question after a close still gets an answer.
        expect(decideSalesTurn({ incomingText: 'בעצם כמה זה עולה?', lead: { stage: 'closed_lost' } }).nextBestAction).toBe('quote_price')
    })

    it('reads a bare "כמה" as the price question it is', () => {
        expect(decideSalesTurn({ incomingText: 'כמה', lead: {} }).nextBestAction).toBe('quote_price')
        expect(decideSalesTurn({ incomingText: 'כמה?', lead: {} }).nextBestAction).toBe('quote_price')
    })

    // 1.10: the phone is how parents in Israel close a 990 ₪ decision.
    it('hands a request for a call to the owner with a time question, and offers the call on the two hesitation lines', () => {
        for (const text of ['אפשר שתתקשרו אליי?', 'אני מעדיפה לדבר עם בן אדם', 'יש מספר טלפון?']) {
            const decision = decideSalesTurn({ incomingText: text, lead: { stage: 'offer_sent' }, todayISO: '2026-10-01' })
            expect(decision.nextBestAction).toBe('offer_call')
            const r = enforceSalesReply({ parsed: { messages: ['טיוטה'], stage: 'offer_sent', handoff: false }, decision, lead: { stage: 'offer_sent' }, incomingText: text })
            expect(r).toMatchObject({ handoff: true, stage: 'handoff' })
            expect(r.messages[0]).toMatch(/יתקשר אלייך היום\. באיזו שעה נוח\?$/)
        }
        const second = enforceSalesReply({ parsed: { messages: ['טיוטה'], stage: 'objection', handoff: false }, decision: decideSalesTurn({ incomingText: 'עדיין יקר', lead: { stage: 'objection', objectionCount: 1 }, todayISO: '2026-10-01' }), lead: { stage: 'objection', objectionCount: 1 }, incomingText: 'עדיין יקר' })
        expect(second.messages[0]).toMatch(/בטלפון/)
        expect(second.messages[0].length).toBeLessThanOrEqual(TURN_LIMITS.maxChars)
        const think = enforceSalesReply({ parsed: { messages: ['טיוטה'], stage: 'offer_sent', handoff: false }, decision: decideSalesTurn({ incomingText: 'אחשוב', lead: { stage: 'offer_sent' }, todayISO: '2026-10-01' }), lead: { stage: 'offer_sent' }, incomingText: 'אחשוב' })
        expect(think.messages[0]).toMatch(/בטלפון.*מתי נוח שאחזור\?$/)
        expect(think.messages[0].length).toBeLessThanOrEqual(TURN_LIMITS.maxChars)
    })

    it('puts a customer\'s words next to the real page on the first price objection', () => {
        const r = enforceSalesReply({ parsed: { messages: ['טיוטה'], stage: 'offer_sent', handoff: false }, decision: decideSalesTurn({ incomingText: 'יקר לי', lead: { stage: 'offer_sent' }, todayISO: '2026-10-01' }), lead: { stage: 'offer_sent' }, incomingText: 'יקר לי' })
        expect(r.messages[0]).toContain('«')
        expect(r.messages[0].length).toBeLessThanOrEqual(TURN_LIMITS.maxChars)
    })
})
