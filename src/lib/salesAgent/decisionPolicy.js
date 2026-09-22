// A model may phrase a sales response, but it must not invent the next
// move. This policy turns the current message and durable lead facts into
// one small, testable instruction before any provider is called.

import { PACKAGES, ADDONS, DEMO } from './catalog'
import { asksPrice, priceFallbackMessage } from './selling'

// Two messages, not one: a real seller answers, then adds one step. A
// single 180-char bubble forced almost every model reply through the
// deterministic fallback, which reads as a script because it is one.
export const TURN_LIMITS = Object.freeze({
    maxMessages: 2,
    maxChars: 420,
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
    if (/וואו|מדהים|אהבתי|נראה.{0,8}אש|מושלם|יפה\s+ממש|זה\s+בדיוק/.test(value)) return 'positive_signal'
    if (/יקר|להתייעץ|לחשוב|אחשוב|נדבר\s+על\s+זה|רחוק|לא\s+בטוח|מתלבט/.test(value)) return 'objection'
    if (/איך\s+זה\s+עובד|מה\s+מקבלים|איך\s+האורחים|איך\s+מתחילים/.test(value)) return 'process'
    return 'general'
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
    if (intent === 'price' || intent === 'process') return 'answer'
    if (intent === 'demo') return 'show_proof'
    if (intent === 'positive_signal') return 'recommend_package'
    if (intent === 'objection') return 'handle_objection'
    return 'answer_then_qualify'
}

export function decideSalesTurn({ lead = {}, incomingText = '', isExistingCustomer = false, pausedForHuman = null } = {}) {
    const facts = knownFacts(lead)
    const base = {
        ...TURN_LIMITS,
        knownFacts: facts,
        forbiddenRepeats: [...facts],
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

function deterministicMessage({ parsed, decision, lead, incomingText }) {
    if (decision.nextBestAction === 'close_lost') return 'תודה שעדכנת, שמחתי לעזור. אם זה יחזור להיות רלוונטי, אנחנו כאן.'
    if (decision.nextBestAction === 'diagnose_checkout') return 'איפה זה נתקע לך, בפתיחת הקישור או בשלב התשלום?'
    if (decision.nextBestAction === 'send_payment_link') {
        const selected = packageFor({ parsed, lead, incomingText })
        return `${selected.name} עולה ₪${selected.price} וכולל מע״מ. לתשלום מאובטח: ${selected.checkout}`
    }
    if (decision.nextBestAction === 'send_demo') {
        return demoAlreadySent(lead)
            ? 'שלחתי למעלה את כל הפרטים והמחירים. אם יש שאלה, אני כאן. לאיזה אירוע זה אצלכם?'
            : `אם בא לך להרגיש את זה במקום לקרוא, זה אירוע דמו אמיתי. אפשר לכתוב שם ברכה מהטלפון תוך חצי דקה: ${DEMO.writeBlessing}`
    }
    if (decision.nextBestAction === 'handoff_print') return 'הדפסה של קובץ מוכן זה משהו שמישהו מהצוות מתמחר בנפרד. אני מעביר אליו, והוא יחזור אלייך כאן עוד היום.'
    if (decision.intent === 'price') return priceFallbackMessage()
    if (decision.nextBestAction === 'show_proof') return 'בטח, מצרף דוגמה מתוך ספר אמיתי. מה חשוב לך לראות, את הכריכה או את העמודים מבפנים?'
    if (decision.nextBestAction === 'recommend_package') return 'החבילה המודפסת היא הבחירה של רוב המשפחות, ספר כריכה קשה שמגיע עד הבית. לשלוח לך את הפרטים שלה?'
    if (decision.nextBestAction === 'handle_objection') return 'מבין. מה בעיקר עוצר אותך, המחיר או החשש איך הספר ייצא?'
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

function demoAlreadySent(lead) {
    if (lead?.demoEvidenceDelivered === true) return true
    const turns = Array.isArray(lead?.turns) ? lead.turns : []
    return turns.some(t => t?.role === 'assistant' && String(t?.text || '').includes(DEMO.writeBlessing))
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
    if (/דמו/.test(what)) {
        if (demoAlreadySent(lead)) return { message: stripped || m, image: null, append: null }
        return { message: stripped, image: null, append: `הנה דוגמה חיה, אפשר לכתוב שם ברכה מהטלפון: ${DEMO.writeBlessing}` }
    }
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

function clipMessage(message, maxChars, fallback) {
    if (message.length <= maxChars) return message
    const url = /https?:\/\/\S+/g
    for (const match of message.matchAll(url)) {
        const start = match.index || 0
        const end = start + match[0].length
        if (start < maxChars && end > maxChars) return fallback
    }
    const clipped = message.slice(0, maxChars + 1)
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
        || (decision.intent === 'price' && !hasOnlyCurrentCatalogPrices(candidates.join('\n')))
        || candidates.length === 0
        || CALL_LANGUAGE.test(normalizedText(candidates[0]))
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
    if (decision.nextBestAction === 'handoff_print') {
        result.handoff = true
        result.handoffReason = result.handoffReason || 'הלקוח רוצה להדפיס קובץ מוכן - צריך תמחור ידני'
        result.image = null
        result.openingMediaKeys = []
    }
    if (decision.nextBestAction === 'send_demo') {
        result.image = null
        result.openingMediaKeys = []
        if (!['handoff', 'closed_won', 'closed_lost'].includes(result.stage) && result.stage !== 'ready_to_pay') result.stage = 'demo_sent'
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
