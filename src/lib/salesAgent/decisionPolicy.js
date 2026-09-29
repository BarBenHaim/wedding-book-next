// A model may phrase a sales response, but it must not invent the next
// move. This policy turns the current message and durable lead facts into
// one small, testable instruction before any provider is called.

import { PACKAGES, ADDONS, UPGRADE, CONCESSION } from './catalog'
import { asksPrice } from './selling'
import { eventTypeOf, EVENT_HE } from './eventType'

// One bubble, two sentences, and a hard ceiling the model cannot talk
// past. 24.9, Lord: "הוא מספים, כותב ישר המון טקסט, יורה מידע". 420 chars
// let the model write a paragraph and call it a message; 260 is two
// real sentences plus a short question. The payment turn is the one
// place two bubbles are still built (a warm line, then the link).
export const TURN_LIMITS = Object.freeze({
    maxMessages: 1,
    maxChars: 260,
    maxQuestions: 1,
})

const KNOWN_FACT_FIELDS = Object.freeze([
    'name',
    'eventType',
    'eventDate',
    'celebrantName',
    'packageInterest',
])

function normalizedText(text) {
    return String(text || '').trim().toLowerCase()
}

function hasCheckoutFriction(text) {
    const value = normalizedText(text)
    return /(לא\s+הצלח|לא\s+עובד|נתקע|בעיה|תקלה).{0,30}(תשלום|לשלם|קישור|הזמנה)|(תשלום|לשלם|קישור).{0,30}(לא\s+עובד|בעיה|תקלה|נתקע)/.test(value)
}

// Did the bot already state the catalog prices in its last two turns? A
// customer who then merely MENTIONS price ("חשבתי שהצעת מחיר הנחה") is
// not asking for the list again. On 19.9 the enforcer replaced a warm
// model reply with the bare price line twice in a row for exactly that
// sentence, and the customer answered "כן כן אני רואה".
export function pricesRecentlyStated(lead = {}) {
    const turns = Array.isArray(lead?.turns) ? lead.turns : []
    const recent = turns.filter(t => t?.role === 'assistant').slice(-2)
    return recent.some(t => hasOnlyCurrentCatalogPrices(String(t?.text || '')))
}

export function detectSalesIntent(text = '', lead = null) {
    const value = normalizedText(text)

    // Terminal intent comes before generic phrases such as "דיברתי עם בן
    // אדם". A polite no is a closed loop, not a human-handoff request.
    if (/ויתר|לוותר|מוותר|החלטנו\s+שלא|לא\s+רלוונט|לא\s+מעוניינ|לא\s+מתאים\s+לנו|ירדנו\s+מזה/.test(value)) return 'negative_exit'

    // Checkout trouble has to beat both the word "מחיר" and a second
    // payment-link send. The useful move is diagnosis, not another pitch.
    if (hasCheckoutFriction(value)) return 'payment_intent'
    if (/רוצה\s+להזמין|רוצ[הים]\s+לסגור|איך\s+משלמ|אפשר\s+לשלם|קישור.{0,12}תשלום|אקח\s+את|נלך\s+על|אפשר\s+להזמין/.test(value)) return 'payment_intent'

    // The button text of the Facebook/Instagram ad. It is not a question,
    // it is a click. On a lead who already got the opening it means "I
    // pressed the button again" (21.9: two clicks, four minutes apart, and
    // the bot re-sent the opening in its own words). The deterministic
    // answer is the one thing the opening did not give: the live demo.
    if (isAdCta(value) && lead && lead.isNew !== true && (lead.turnCount > 0 || (Array.isArray(lead.turns) && lead.turns.length > 0))) return 'ad_cta_repeat'

    // "I have a file, just print it" is not a product we sell, and on 22.9
    // the model quoted the full package price for it as if it were. A
    // person from the team has to price that, so it is a handoff.
    if (/רק\s+(?:רוצה\s+)?להדפיס|יש\s+ל[ינ]ו?\s+(?:כבר\s+)?קובץ|קובץ\s+מוכן|להדפיס\s+(?:לי\s+)?קובץ|הדפסה\s+בלבד|רק\s+הדפסה/.test(value)) return 'print_only'

    // asksPrice carries the full "how much" vocabulary ("כמה זה יוצא",
    // "כמה כסף", "how much"); the regex keeps the broader topic words.
    // The two must agree or the dodge-guard repairs a reply the enforcer
    // then throws away.
    // An explicit "how much" is always a price question. A bare topic word
    // ("מחיר", "חבילות") counts only while the prices have not just been
    // given - otherwise it is conversation about the price, not a request.
    if (asksPrice(value)) return 'price'
    if (/מחיר|כמה.{0,12}עולה|עלות|חבילות|טווח\s+מחירים/.test(value) && !pricesRecentlyStated(lead)) return 'price'
    if (/דוגמ|תמונה|תמונות|סרטון|וידאו|לראות.{0,18}(ספר|איך|מוצר)|איך\s+זה\s+נראה/.test(value)) return 'demo'
    if (/יקר|להתייעץ|לחשוב|אחשוב|נדבר\s+על\s+זה|רחוק|לא\s+בטוח|מתלבט|תקציב/.test(value)) return 'objection'
    if (/וואו|מדהים|אהבתי|נראה.{0,8}אש|מושלם|יפה\s+ממש|זה\s+בדיוק|נשמע\s+(?:טוב|מעולה|מצוין)/.test(value)) return 'positive_signal'
    // "כן", "סבבה", "יאללה" on its own. What it means depends on what we
    // asked last; nextAction reads the previous bot line for that.
    if (isAffirmative(value)) return 'affirmative'
    if (/איך\s+זה\s+עובד|מה\s+מקבלים|איך\s+האורחים|איך\s+מתחילים/.test(value)) return 'process'
    // "בר מצווה", "חתונה בפברואר": the answer to the one question the
    // opening asked. Until 29.9 the model answered it with another
    // explanation and another question, and the customer left. Now it
    // is the moment the offer goes out.
    if (eventTypeOf(value) && !lead?.eventType && !isQuestion(value)) return 'event_answer'
    return 'general'
}

function isQuestion(text) {
    return /\?|^(?:איך|מה|כמה|האם|אפשר|למה|מתי|יש\s+מצב|יש\s+אפשרות)\b|\s(?:איך|האם|אפשר|יש\s+מצב)\s/.test(normalizedText(text))
}

const AFFIRMATIVE = /^(?:כן|כן\s+כן|כן\s+בבקשה|כן\s+תודה|אוקיי|אוקי|אוקיי\s+תודה|ok|okay|yes|sure|סבבה|בסדר|יאללה|קדימה|מתאים|מתאים\s+לי|בטח|אשמח|נשמע\s+טוב|למה\s+לא|בואי|בוא|יאללה\s+בוא|👍|🙏|👌|💪)[\s!.,🙂😊👍🙏]*$/u
export function isAffirmative(text) {
    const value = normalizedText(text)
    return value.length <= 24 && AFFIRMATIVE.test(value)
}

const AD_CTA = /אפשר\s+לקבל\s+מידע\s+נוסף|هل\s+يمكنني\s+الحصول\s+على\s+مزيد|can\s+i\s+get\s+more\s+info|более\s+подробн|можно\s+(?:получить\s+)?больше\s+информации/i
export function isAdCta(text) {
    return AD_CTA.test(normalizedText(text))
}

function knownFacts(lead) {
    const facts = KNOWN_FACT_FIELDS.filter(field => {
        const value = lead?.[field]
        return value !== undefined && value !== null && String(value).trim() !== ''
    })
    if (!facts.includes('packageInterest') && lead?.package_interest) facts.push('packageInterest')
    return facts
}

function qualificationTarget(lead = {}) {
    if (!lead.eventType && !lead.eventDate) return 'eventTypeAndDate'
    if (!lead.eventType) return 'eventType'
    if (!lead.eventDate) return 'eventDate'
    return null
}

function openingFields(lead = {}) {
    const blocked = lead.isNew !== true
        || lead.hasPriorConversation === true
        || lead.human === true
        || lead.paymentVerified === true
        || ['handoff', 'closed_won', 'closed_lost'].includes(lead.stage)
    return {
        openingBundleRequired: !blocked,
        qualificationTarget: blocked ? null : qualificationTarget(lead),
    }
}

function paymentLinkWasSent(lead) {
    return Boolean(
        lead?.paymentLinkSentAt
        || lead?.checkoutLinkSentAt
        || lead?.checkoutUrlSentAt
        || lead?.paymentLinkSent === true,
    )
}

function explicitlyRequestsPaymentLink(text) {
    return /(שלח|תשלח|אפשר|צריך).{0,18}(קישור|לינק)|(קישור|לינק).{0,12}(שוב|מחדש)/.test(normalizedText(text))
}

// ── What the conversation already contains ──────────────────────────

function assistantTexts(lead) {
    const turns = Array.isArray(lead?.turns) ? lead.turns : []
    return turns.filter(t => t?.role === 'assistant').map(t => String(t?.text || ''))
}

function lastAssistantText(lead) {
    const texts = assistantTexts(lead)
    return texts.length ? texts[texts.length - 1] : ''
}

// Both catalog prices went out at some point in this chat (opening
// pricing sheet excluded: that is an image the bot cannot read back).
export function pricesStated(lead = {}) {
    if (['offer_sent', 'objection', 'commit_later', 'ready_to_pay'].includes(lead?.stage)) return true
    const printed = PACKAGES.find(p => p.id === 'printed')?.price
    const digital = PACKAGES.find(p => p.id === 'digital')?.price
    return assistantTexts(lead).some(t => t.includes(String(printed)) && t.includes(String(digital)))
}

// The one concession goes out once per conversation, whatever the model
// or the follow-up ladder would like.
export function concessionOffered(lead = {}) {
    return assistantTexts(lead).some(t => /במתנה/.test(t))
}

const CLOSE_QUESTION = /אפתח|פותחים|נפתח|קישור|לינק|להזמין|לסגור|נתחיל|להתחיל|שולח\s+לך|לשלוח\s+לך/
function lastLineWasClose(lead) {
    return CLOSE_QUESTION.test(lastAssistantText(lead))
}

// Simple quantity questions ("2 ספרים", "עותק נוסף") keep the model: the
// arithmetic is allowed and validated. A plain "כמה עולה" is answered
// by the catalog itself.
function plainPriceQuestion(text) {
    return !/\b[2-9]\b|שני|שתי|שניים|עותק|נוסף|עוד\s+ספר|ספרים|שדרוג|לשדרג|פוסטר|אקספרס|משלוח/.test(normalizedText(text))
}

function nextAction(intent, lead, incomingText) {
    if (intent === 'negative_exit') return 'close_lost'
    if (intent === 'payment_intent') {
        if (hasCheckoutFriction(incomingText)) return 'diagnose_checkout'
        return paymentLinkWasSent(lead) && !explicitlyRequestsPaymentLink(incomingText)
            ? 'diagnose_checkout'
            : 'send_payment_link'
    }
    if (intent === 'ad_cta_repeat') return 'send_demo'
    if (intent === 'print_only') return 'handoff_print'
    if (intent === 'price') return plainPriceQuestion(incomingText) ? 'quote_price' : 'answer'
    if (intent === 'process') return 'answer'
    if (intent === 'demo') return 'show_proof'
    if (intent === 'event_answer') return 'present_offer'
    // "כן" to "רוצה שאפתח לכם את הספר?" is an order. "כן" to anything else
    // after the prices is still a yes; before the prices it is a person
    // who wants to hear more, so they get the offer.
    if (intent === 'affirmative') {
        if (lastLineWasClose(lead) || pricesStated(lead)) return 'send_payment_link'
        if (lead?.eventType) return 'present_offer'
        return 'answer_then_qualify'
    }
    if (intent === 'positive_signal') {
        if (pricesStated(lead)) return 'send_payment_link'
        return lead?.eventType ? 'present_offer' : 'answer_then_qualify'
    }
    if (intent === 'objection') return 'handle_objection'
    // The event is known and the offer never went out: a statement (not a
    // question) from the customer is the opening to make it. A question
    // is answered by the model first; the close follows next turn.
    if (intent === 'general'
        && lead?.eventType
        && !pricesStated(lead)
        && !isQuestion(incomingText)
        && ['new', 'opening_completed', 'engaged', undefined, null, ''].includes(lead?.stage)) {
        return 'present_offer'
    }
    return 'answer_then_qualify'
}

export function decideSalesTurn({ lead = {}, incomingText = '', isExistingCustomer = false, pausedForHuman = null, todayISO = null } = {}) {
    const facts = knownFacts(lead)
    const base = {
        ...TURN_LIMITS,
        knownFacts: facts,
        forbiddenRepeats: [...facts],
        todayISO: todayISO || isoTodayInIsrael(),
        ...openingFields(lead),
    }

    if (isExistingCustomer) {
        return {
            ...base,
            openingBundleRequired: false,
            qualificationTarget: null,
            conversationKind: 'customer',
            intent: 'support',
            nextBestAction: 'route_existing_customer',
            modelEligible: false,
        }
    }

    // The raw flags are the legacy check. A caller that knows whether the
    // 48h handoff pause is still running (isPausedForHuman) passes it in;
    // otherwise a lead handed off once would stay mute forever even after
    // the documented expiry.
    const paused = pausedForHuman === null
        ? (lead?.human === true || lead?.stage === 'handoff')
        : pausedForHuman === true
    if (paused) {
        return {
            ...base,
            openingBundleRequired: false,
            qualificationTarget: null,
            conversationKind: 'paused',
            intent: 'handoff_active',
            nextBestAction: 'silence',
            modelEligible: false,
        }
    }

    const intent = detectSalesIntent(incomingText, lead)
    return {
        ...base,
        conversationKind: 'sales',
        intent,
        nextBestAction: nextAction(intent, lead, incomingText),
        modelEligible: true,
    }
}

// gpt-4.1-mini sometimes finishes a Hebrew word in Arabic letters:
// "לאיזה אירוע זה אצلكם?" (seven of ten follow-up drafts on 29.9). The
// customer reads a typo in a script they may not know; the bot reads as
// broken. A message that mixes the two scripts never goes out. Arabic
// on its own is fine: the ad CTA has an Arabic variant and the agent
// answers in the customer's language.
const HEBREW_LETTERS = /[\u05d0-\u05ea]/
const ARABIC_LETTERS = /[\u0600-\u06ff]/
export function hasMixedScript(text = '') {
    const s = String(text || '')
    return HEBREW_LETTERS.test(s) && ARABIC_LETTERS.test(s)
}

const CALL_LANGUAGE = /(שיחת\s+טלפון|בטלפון|אתקשר|להתקשר|נדבר\s+בטלפון|אחזור\s+אליך)/
const KNOWN_QUESTION_PATTERNS = Object.freeze({
    name: /(איך\s+קוראים\s+לך|מה\s+השם)/,
    eventType: /(איזה\s+אירוע|לאיזה\s+אירוע|סוג\s+האירוע)/,
    eventDate: /(מתי\s+האירוע|מה\s+התאריך|תאריך\s+האירוע)/,
    celebrantName: /(איך\s+קוראים\s+לחוגג|מה\s+שם\s+החוגג|שם\s+החוגג)/,
    packageInterest: /(איזו\s+חבילה|איזה\s+מסלול|איזה\s+ספר\s+בחר)/,
})

function packageFor({ parsed, lead, incomingText }) {
    const text = normalizedText(incomingText)
    let id = parsed?.packageInterest || lead?.packageInterest || lead?.package_interest || null
    if (/דיגיטל/.test(text)) id = 'digital'
    else if (/מודפס|הדפס/.test(text)) id = 'printed'
    return PACKAGES.find(item => item.id === id) || PACKAGES.find(item => item.recommended) || PACKAGES[0]
}

// ── The offer, the close, the two doors ─────────────────────────────
//
// These lines are the funnel. They are written here and not by the model
// because on 21-28.9 the model, given 86 leads and every instruction to
// close, asked for the order zero times. It explained, it asked which
// package "speaks to you", it asked about the style of the event. A
// salesperson asks for the order every time the customer gives an
// opening; this policy does it for him.

const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
function isoTodayInIsrael() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
}
function addDays(iso, days) {
    const d = new Date(`${iso}T12:00:00Z`)
    if (Number.isNaN(d.getTime())) return iso
    d.setUTCDate(d.getUTCDate() + Number(days || 0))
    return d.toISOString().slice(0, 10)
}
function hebrewDayMonth(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
    if (!m) return String(iso || '')
    return `${Number(m[3])} ב${HE_MONTHS[Number(m[2]) - 1] || ''}`
}
export function concessionLine(todayISO) {
    const until = hebrewDayMonth(addDays(todayISO || isoTodayInIsrael(), CONCESSION.validDays))
    return CONCESSION.text.replace('{DATE}', until)
}

const price = id => PACKAGES.find(p => p.id === id)?.price || 0
const PRICE_LINE = () => `דיגיטלי ${price('digital')} שח, מודפס בכריכה קשה ${price('printed')} שח כולל משלוח.`

// One sentence that puts the book at THEIR event. The generic line
// ("האורחים סורקים QR...") is what the opening already said; here the
// job is to make the parent picture the specific evening.
const EVENT_LINE = Object.freeze({
    bar_mitzvah: 'בר מצווה זה בדיוק האירוע לזה: ספר שהוא פותח גם בעוד עשרים שנה, עם ברכה ותמונה מכל מי שהיה.',
    bat_mitzvah: 'בת מצווה זה בדיוק האירוע לזה: ספר שהיא פותחת גם בעוד עשרים שנה, עם ברכה ותמונה מכל מי שהיה.',
    wedding: 'מהחתונה נשארות תמונות, ומהספר נשארות המילים של כל מי שהיה שם.',
    brit: 'מהברית נשאר ספר שהוא יקרא כשיגדל, עם ברכה ותמונה מכל המשפחה.',
    birthday: 'מיום ההולדת נשאר ספר עם משהו אישי מכל מי שהיה, לא רק תמונות.',
    other: 'בסוף האירוע נשאר ספר כריכה קשה עם ברכה ותמונה מכל מי שהיה.',
})

function celebrant(lead, parsed) {
    return String(parsed?.celebrantName || lead?.celebrantName || '').trim()
}

function closeQuestion(lead, parsed) {
    const name = celebrant(lead, parsed)
    return name ? `רוצה שאפתח את הספר של ${name}? שולח קישור.` : 'רוצה שאפתח לכם את הספר? שולח קישור.'
}

function presentOfferMessage({ parsed, lead, incomingText }) {
    const type = eventTypeOf(incomingText) || parsed?.eventType || lead?.eventType || 'other'
    const line = EVENT_LINE[type] || EVENT_LINE.other
    return `${line} ${PRICE_LINE()} ${closeQuestion(lead, parsed)}`
}

function quotePriceMessage({ parsed, lead, incomingText }) {
    const type = eventTypeOf(incomingText) || parsed?.eventType || lead?.eventType
    const tail = type ? closeQuestion(lead, parsed) : 'לאיזה אירוע זה אצלכם?'
    return `${PRICE_LINE()} ${tail}`
}

function isPriceObjection(text) {
    return /יקר|מחיר|כסף|תקציב|הרבה|עולה/.test(normalizedText(text))
}
function isFarDateObjection(text) {
    return /רחוק|עוד\s+הרבה\s+זמן|יש\s+זמן|מוקדם\s+מדי|בינתיים/.test(normalizedText(text))
}

function objectionMessage({ decision, lead, incomingText, parsed }) {
    const today = decision.todayISO
    const offered = concessionOffered(lead)
    if (isPriceObjection(incomingText)) {
        // First door: a real page. Second door: digital now, printed
        // later. Third and last: the one concession, with its date.
        const upgradeLine = `אפשר גם להתחיל בדיגיטלי ב-${price('digital')} שח ולשדרג למודפס ב-${UPGRADE.price} שח עד ${UPGRADE.windowDays} יום אחרי האירוע, אותו ספר בדיוק.`
        if (!(lead?.objectionCount > 0) && !offered) {
            return `מבין. תסתכלו רגע על עמוד מספר אמיתי שהדפסנו. ${upgradeLine}`
        }
        if (!offered) return `אני יכול לעשות דבר אחד: ${concessionLine(today)}. זה הכי רחוק שאני יכול ללכת. ${closeQuestion(lead, parsed)}`
        return `זה המחיר, ובלי מזלגות: עיצוב, כריכה קשה ומשלוח בפנים. ${closeQuestion(lead, parsed)}`
    }
    if (isFarDateObjection(incomingText)) {
        const extra = offered ? '' : ` ${concessionLine(today)}, אז שווה להחליט השבוע.`
        return `דווקא כשיש זמן שווה לפתוח עכשיו: הפוסטר וקישור האורחים מוכנים מראש, שולחים אותו עם ההזמנה, ומי שלא מגיע כותב לפני.${extra}`
    }
    // "אחשוב", "אתייעץ": a polite pause. A date on the offer and one
    // question, so the pause has an end.
    const extra = offered ? '' : ` שמרתי לכם ${concessionLine(today)}.`
    return `ברור, זה משהו שמחליטים ביחד.${extra} מתי נוח שאחזור?`
}

function deterministicMessage({ parsed, decision, lead, incomingText }) {
    if (decision.nextBestAction === 'close_lost') return 'תודה שעדכנת, שמחתי לעזור. אם זה יחזור להיות רלוונטי, אנחנו כאן.'
    if (decision.nextBestAction === 'diagnose_checkout') return 'איפה זה נתקע לך, בפתיחת הקישור או בשלב התשלום?'
    if (decision.nextBestAction === 'send_payment_link') {
        const selected = packageFor({ parsed, lead, incomingText })
        return `${selected.name}, ${selected.price} שח ${selected.id === 'printed' ? 'כולל משלוח' : 'כולל מע״מ'}: ${selected.checkout}\nאחרי התשלום מגיע מייל עם הגישה, ואני שולח לכם את הפוסטר לאישור תוך 48 שעות.`
    }
    if (decision.nextBestAction === 'present_offer') return presentOfferMessage({ parsed, lead, incomingText })
    if (decision.nextBestAction === 'quote_price') return quotePriceMessage({ parsed, lead, incomingText })
    if (decision.nextBestAction === 'handle_objection') return objectionMessage({ decision, lead, incomingText, parsed })
    if (decision.nextBestAction === 'send_demo') {
        // A second tap on the ad button. Everything is already above; the
        // only useful move is the one question that starts a real chat.
        return 'הכל למעלה, איך זה עובד והמחירים. לאיזה אירוע זה אצלכם?'
    }
    if (decision.nextBestAction === 'handoff_print') return 'הדפסה של קובץ מוכן זה משהו שמישהו מהצוות מתמחר בנפרד. אני מעביר אליו, והוא יחזור אלייך כאן עוד היום.'
    if (decision.intent === 'price') return quotePriceMessage({ parsed, lead, incomingText })
    if (decision.nextBestAction === 'show_proof') return 'הנה עמוד מתוך ספר אמיתי שהדפסנו, ככה זה יוצא. ' + closeQuestion(lead, parsed)
    if (decision.intent === 'process') return 'האורחים סורקים QR, כותבים ברכה ומעלים תמונה בלי אפליקציה. בסוף מאשרים הכול ומקבלים ספר.'
    // The last resort when no model answer exists. It used to open with a
    // product definition and a two-way question, which read as a machine
    // to everyone who got it. A person who cannot answer right now says so
    // and asks the one thing that lets them help.
    if (lead?.eventType || lead?.eventDate) return 'רגע, אני בודק ומיד חוזר אלייך עם תשובה מסודרת. בינתיים, מה הכי חשוב לך שנפתור, האורחים או הספר עצמו?'
    return 'שמח שכתבת. כדי שאכוון אותך נכון, לאיזה אירוע זה ומתי בערך?'
}

export function buildDeterministicSalesReply({ decision, lead = {}, incomingText = '' } = {}) {
    return enforceSalesReply({
        parsed: {
            malformed: false,
            messages: [],
            stage: lead.stage || 'engaged',
            handoff: false,
            handoffReason: null,
            image: null,
            openingMediaKeys: [],
            eventType: lead.eventType || null,
            callbackPromised: null,
            followUpAt: null,
        },
        decision,
        lead,
        incomingText,
    })
}

// "[image: book_open_spread]" inside the words is the model narrating the
// picture instead of attaching it. Lift the marker out; the first key
// found becomes the image when the model left that field empty.
const INLINE_IMAGE = /\[\s*(?:image|img|תמונה)\s*:\s*([\w-]+)\s*\]/gi
export function liftInlineImageMarkers(messages) {
    let image = null
    const out = (Array.isArray(messages) ? messages : []).map(m => {
        const text = String(m || '').replace(INLINE_IMAGE, (_, key) => {
            if (!image) image = key
            return ''
        })
        return text.replace(/[ \t]*\n[ \t]*\n[ \t]*$/, '').replace(/\s*:\s*$/, '.').replace(/[ \t]{2,}/g, ' ').trim()
    }).filter(Boolean)
    return { messages: out, image }
}

function seenImages(lead) {
    return new Set([...(lead?.imagesSent || []), ...(lead?.mediaSent || []), ...(lead?.mediaRequested || [])].map(String))
}
function pickUnseen(keys, lead) {
    const seen = seenImages(lead)
    return keys.find(k => !seen.has(k)) || null
}
const EVENT_IMAGES = Object.freeze({
    bar_mitzvah: ['book_bar_mitzvah', 'pages_bar_mitzvah', 'cover_personalised', 'book_open_spread'],
    bat_mitzvah: ['book_bar_mitzvah', 'pages_bar_mitzvah', 'cover_personalised', 'book_open_spread'],
    wedding: ['book_wedding', 'pages_wedding', 'book_open_spread', 'cover_personalised'],
    birthday: ['book_birthday', 'pages_birthday', 'book_open_spread', 'cover_personalised'],
    brit: ['cover_personalised', 'book_open_spread'],
    other: ['cover_personalised', 'book_open_spread'],
})
export function pickEventImage(eventType, lead) {
    return pickUnseen(EVENT_IMAGES[eventType] || EVENT_IMAGES.other, lead)
}

// "רוצה שאשלח לך דוגמה?" adds a whole round trip for nothing: the answer
// is always yes. The sentence is dropped and the thing it offered is
// sent - a real spread when it offered a picture, the demo link when it
// offered the demo. The payment link keeps its own deterministic path.
const OFFER_TO_SEND = /(?:^|[.!?]\s*|\n)\s*(?:אז\s+)?(?:רוצה|תרצי|תרצה|אפשר)\s+ש?אשלח\s+(?:לך\s+)?(?:כבר\s+)?(?:את\s+)?(?:ה)?(דוגמה|דוגמא|תמונה|תמונות|דמו|קישור\s+לדמו)[^.!?\n]*[?]/u
export function resolveOfferToSend(message, { lead = {}, hasImage = false } = {}) {
    const m = String(message || '')
    const match = OFFER_TO_SEND.exec(m)
    if (!match) return { message: m, image: null, append: null }
    const what = match[1]
    const stripped = m.replace(match[0], match[0].match(/^[.!?]\s*/)?.[0] || '').replace(/[ \t]{2,}/g, ' ').trim()
    // "רוצה שאשלח את הדמו?" - the offer goes, and nothing replaces it. The
    // demo is sent only when the customer asks to try it (24.9).
    if (/דמו/.test(what)) return { message: stripped || m, image: null, append: null }
    if (hasImage) return { message: stripped || m, image: null, append: null }
    const shown = new Set([...(lead?.imagesSent || []), ...(lead?.mediaSent || []), ...(lead?.mediaRequested || [])])
    const pick = ['book_open_spread', 'cover_personalised', 'upload_screen'].find(k => !shown.has(k)) || null
    return { message: stripped || m, image: pick, append: pick ? null : null }
}

function containsRepeatedKnownQuestion(message, decision) {
    return (decision.forbiddenRepeats || []).some(field => KNOWN_QUESTION_PATTERNS[field]?.test(normalizedText(message)))
}

// Question marks inside URLs are not questions. Until 21.9 this turned
// "checkout/?add-to-cart=6271" into "checkout/.add-to-cart=6271" - a dead
// payment link, sent to a customer who had just said yes.
function keepOneQuestion(message, maxQuestions) {
    const urls = []
    const masked = String(message).replace(/https?:\/\/\S+/g, u => {
        urls.push(u)
        return `\u0000${urls.length - 1}\u0000`
    })
    let seen = 0
    const limited = maxQuestions < 1
        ? masked.replace(/\?/g, '.')
        : masked.replace(/\?/g, () => (++seen <= maxQuestions ? '?' : '.'))
    return limited.replace(/\u0000(\d+)\u0000/g, (_, i) => urls[Number(i)])
}

function compactMessage(message) {
    return String(message || '').replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

// Every figure the bot may state: the two packages, the add-ons, and a
// package plus up to three of one add-on ("שני ספרים מודפסים" is 990 +
// 290). Until 21.9 only the bare package prices passed, so a customer who
// asked twice what two books cost got the price list twice.
function allowedPrices() {
    const out = new Set()
    for (const p of PACKAGES) {
        out.add(p.price)
        if (p.wasPrice) out.add(p.wasPrice)
        for (const a of ADDONS) for (let n = 1; n <= 3; n += 1) out.add(p.price + n * a.price)
    }
    for (const a of ADDONS) out.add(a.price)
    out.add(UPGRADE.price)
    for (const p of PACKAGES) out.add(p.price + UPGRADE.price)
    return out
}
function hasOnlyCurrentCatalogPrices(message) {
    const prices = [...String(message || '').replace(/,/g, '').matchAll(/(?:^|\D)(\d{3,4})(?=\D|$)/g)]
        .map(match => Number(match[1]))
    const current = allowedPrices()
    return prices.length > 0 && prices.every(price => current.has(price))
}

// A model sentence that may precede the deterministic payment line. It
// must add warmth and nothing else: no figure (a wrong price next to the
// right one is worse than no sentence), no link (two links is two ways to
// get it wrong), no question (the customer is paying, not deciding), and
// short enough to read as a remark rather than a pitch.
const WARM_MAX_CHARS = 140
export function warmPaymentOpener(message, decision) {
    const m = compactMessage(message)
    if (!m || m.length > WARM_MAX_CHARS) return null
    if (/https?:\/\/|www\./i.test(m)) return null
    if (/\d{3,}|₪|ש"ח|ש״ח|שקל/.test(m)) return null
    if (m.includes('?')) return null
    if (CALL_LANGUAGE.test(normalizedText(m))) return null
    if (decision && containsRepeatedKnownQuestion(m, decision)) return null
    return m
}

// Over the limit, cut at the end of a sentence rather than mid-word:
// the customer sees a shorter message, not a broken one. A URL that
// straddles the limit means the whole message is unsafe to cut.
function clipMessage(message, maxChars, fallback) {
    if (message.length <= maxChars) return message
    const url = /https?:\/\/\S+/g
    for (const match of message.matchAll(url)) {
        const start = match.index || 0
        const end = start + match[0].length
        if (start < maxChars && end > maxChars) return fallback
    }
    const clipped = message.slice(0, maxChars + 1)
    const sentenceEnd = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('? '), clipped.lastIndexOf('! '), clipped.lastIndexOf('.\n'), clipped.lastIndexOf('?\n'))
    if (sentenceEnd >= Math.floor(maxChars * 0.4)) return clipped.slice(0, sentenceEnd + 1).trim()
    const boundary = clipped.lastIndexOf(' ')
    return clipped.slice(0, boundary >= Math.floor(maxChars * 0.65) ? boundary : maxChars).replace(/[,:;\s]+$/, '').trim()
}

/**
 * Enforce the customer-visible contract after the model has returned.
 * The result is the only object the route may persist or deliver.
 */
export function enforceSalesReply({ parsed = {}, decision, lead = {}, incomingText = '' } = {}) {
    if (!decision) return parsed
    if (decision.nextBestAction === 'silence'
        || decision.conversationKind === 'paused'
        || decision.conversationKind === 'customer') {
        return {
            ...parsed,
            messages: [],
            stage: lead.stage || 'handoff',
            handoff: false,
            handoffReason: null,
            noReply: true,
        }
    }

    const fallback = deterministicMessage({ parsed, decision, lead, incomingText })
    // The route lifts inline image markers before calling here; doing it
    // again costs nothing and protects any other caller.
    const inline = liftInlineImageMarkers(parsed.messages)
    let liftedImage = !parsed.image && inline.image ? inline.image : null
    const candidates = inline.messages
        .map(compactMessage)
        .filter(Boolean)
        .slice(0, Math.max(1, decision.maxMessages || 1))

    // The first message carries the reply; if it is unusable the whole
    // turn falls back to the deterministic line, exactly as before.
    // A later message that misbehaves is merely dropped — no reason to
    // throw away a good answer over a bad postscript.
    const mustUseDeterministic = (
        decision.nextBestAction === 'close_lost'
        || decision.nextBestAction === 'diagnose_checkout'
        || decision.nextBestAction === 'send_payment_link'
        || decision.nextBestAction === 'send_demo'
        || decision.nextBestAction === 'handoff_print'
        || decision.nextBestAction === 'present_offer'
        || decision.nextBestAction === 'quote_price'
        || decision.nextBestAction === 'handle_objection'
        || (decision.intent === 'price' && !hasOnlyCurrentCatalogPrices(candidates.join('\n')))
        || candidates.length === 0
        || CALL_LANGUAGE.test(normalizedText(candidates[0]))
        || hasMixedScript(candidates[0])
        || containsRepeatedKnownQuestion(candidates[0], decision)
    )
    // The payment line itself stays deterministic (right price, right
    // link, always), but "ספר מודפס עולה ₪990… לתשלום מאובטח:" on its own
    // is a vending machine. If the model wrote a short human sentence with
    // no numbers, no link and no question in it, it goes out first and the
    // link follows as its own bubble.
    const warmLead = decision.nextBestAction === 'send_payment_link'
        ? warmPaymentOpener(candidates[0], decision)
        : null
    let messages = mustUseDeterministic
        ? (warmLead ? [warmLead, fallback] : [fallback])
        : [
            candidates[0],
            ...candidates.slice(1).filter(m =>
                !CALL_LANGUAGE.test(normalizedText(m))
                && !hasMixedScript(m)
                && !containsRepeatedKnownQuestion(m, decision)),
        ]

    // An offer to send something becomes the thing itself.
    let appended = null
    if (!mustUseDeterministic) {
        messages = messages.map(m => {
            const r = resolveOfferToSend(m, { lead, hasImage: !!parsed.image || !!liftedImage })
            if (r.image && !liftedImage) liftedImage = r.image
            if (r.append && !appended) appended = r.append
            return r.message
        }).filter(Boolean)
        if (appended && messages.length < Math.max(1, decision.maxMessages || 1)) messages.push(appended)
        else if (appended) messages[messages.length - 1] = `${messages[messages.length - 1]} ${appended}`.trim()
        if (!messages.length) messages = [fallback]
    }

    // One question budget for the whole reply, not per bubble.
    let questionBudget = decision.maxQuestions
    messages = messages.map(m => {
        const kept = keepOneQuestion(compactMessage(m), questionBudget)
        questionBudget = Math.max(0, questionBudget - (kept.match(/\?/g) || []).length)
        return kept
    })

    const hadQuestion = messages.some(m => m.includes('?'))
    const first = clipMessage(messages[0], decision.maxChars, compactMessage(fallback))
    const rest = messages.slice(1)
        .map(m => clipMessage(m, decision.maxChars, ''))
        .filter(Boolean)
    let out = [first, ...rest]
    if (hadQuestion && !out.some(m => m.includes('?')) && fallback.includes('?')) {
        out = [compactMessage(fallback)]
    }
    if (!out[0]) out = [clipMessage(compactMessage(fallback), decision.maxChars, '')].filter(Boolean)

    const result = {
        ...parsed,
        messages: out,
        image: parsed.image || liftedImage || null,
        noReply: false,
    }
    // The event named in this message is a fact whether or not the model
    // wrote it into event_type.
    const namedEvent = eventTypeOf(incomingText)
    if (namedEvent && !result.eventType) result.eventType = namedEvent

    // The offer and the price answer go out with the picture of a book
    // from their kind of event; the price objection with an open spread.
    // Never a picture they already got.
    if (['present_offer', 'quote_price'].includes(decision.nextBestAction)) {
        result.image = pickEventImage(result.eventType || lead.eventType, lead)
        result.stage = 'offer_sent'
        result.handoff = false
        result.handoffReason = null
    }
    if (decision.nextBestAction === 'handle_objection') {
        result.image = isPriceObjection(incomingText) ? pickUnseen(['book_open_spread', 'pages_bar_mitzvah', 'cover_personalised'], lead) : null
        result.stage = 'objection'
        result.objectionRaised = true
        result.handoff = false
        result.handoffReason = null
    }
    if (decision.nextBestAction === 'handoff_print') {
        result.handoff = true
        result.handoffReason = result.handoffReason || 'הלקוח רוצה להדפיס קובץ מוכן - צריך תמחור ידני'
        result.image = null
        result.openingMediaKeys = []
    }
    if (decision.nextBestAction === 'send_demo') {
        result.image = null
        result.openingMediaKeys = []
        if (['opening_completed', 'new'].includes(result.stage)) result.stage = 'engaged'
    }
    // The model can recognize buying intent; it cannot observe money.
    // Only the paid WooCommerce boundary may persist closed_won.
    if (result.stage === 'closed_won' && lead.paymentVerified !== true) {
        result.stage = decision.intent === 'payment_intent' ? 'ready_to_pay' : (lead.stage || 'engaged')
    }
    // "הבנתי, תודה" is not a no. On 20.9 the model closed a February bar
    // mitzvah as closed_lost after exactly that line, which is terminal:
    // no follow-up ever goes out again. Only the customer can close a lead
    // (negative_exit) - a polite pause keeps its stage and gets chased.
    if (result.stage === 'closed_lost' && decision.intent !== 'negative_exit') {
        result.stage = decision.intent === 'objection' ? 'objection' : (lead.stage || 'engaged')
        if (result.stage === 'opening_completed' || result.stage === 'new') result.stage = 'engaged'
    }
    if (decision.nextBestAction === 'close_lost') {
        result.stage = 'closed_lost'
        result.handoff = false
        result.handoffReason = null
        result.image = null
        result.openingMediaKeys = []
        delete result.notifyOwner
    } else if (decision.nextBestAction === 'send_payment_link') {
        result.stage = 'ready_to_pay'
        result.handoff = false
        result.handoffReason = null
        result.image = null
        result.openingMediaKeys = []
        result.packageInterest = packageFor({ parsed, lead, incomingText }).id
    } else if (decision.nextBestAction === 'diagnose_checkout') {
        result.image = null
        result.openingMediaKeys = []
    }
    return result
}

export default decideSalesTurn
