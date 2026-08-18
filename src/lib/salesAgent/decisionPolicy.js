// A model may phrase a sales response, but it must not invent the next
// move. This policy turns the current message and durable lead facts into
// one small, testable instruction before any provider is called.

import { PACKAGES } from './catalog'
import { asksPrice, hasPrice, priceFallbackMessage } from './selling'

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

export function detectSalesIntent(text = '') {
    const value = normalizedText(text)

    // Terminal intent comes before generic phrases such as "דיברתי עם בן
    // אדם". A polite no is a closed loop, not a human-handoff request.
    if (/ויתר|לוותר|מוותר|החלטנו\s+שלא|לא\s+רלוונט|לא\s+מעוניינ|לא\s+מתאים\s+לנו|ירדנו\s+מזה/.test(value)) return 'negative_exit'

    // Checkout trouble has to beat both the word "מחיר" and a second
    // payment-link send. The useful move is diagnosis, not another pitch.
    if (hasCheckoutFriction(value)) return 'payment_intent'
    if (/רוצה\s+להזמין|רוצ[הים]\s+לסגור|איך\s+משלמ|אפשר\s+לשלם|קישור.{0,12}תשלום|אקח\s+את|נלך\s+על|אפשר\s+להזמין/.test(value)) return 'payment_intent'

    // asksPrice carries the full "how much" vocabulary ("כמה זה יוצא",
    // "כמה כסף", "how much"); the regex keeps the broader topic words.
    // The two must agree or the dodge-guard repairs a reply the enforcer
    // then throws away.
    if (asksPrice(value) || /מחיר|כמה.{0,12}עולה|עלות|חבילות|טווח\s+מחירים/.test(value)) return 'price'
    if (/דוגמ|תמונה|תמונות|סרטון|וידאו|לראות.{0,18}(ספר|איך|מוצר)|איך\s+זה\s+נראה/.test(value)) return 'demo'
    if (/וואו|מדהים|אהבתי|נראה.{0,8}אש|מושלם|יפה\s+ממש|זה\s+בדיוק/.test(value)) return 'positive_signal'
    if (/יקר|להתייעץ|לחשוב|אחשוב|נדבר\s+על\s+זה|רחוק|לא\s+בטוח|מתלבט/.test(value)) return 'objection'
    if (/איך\s+זה\s+עובד|מה\s+מקבלים|איך\s+האורחים|איך\s+מתחילים/.test(value)) return 'process'
    return 'general'
}

function knownFacts(lead) {
    const facts = KNOWN_FACT_FIELDS.filter(field => {
        const value = lead?.[field]
        return value !== undefined && value !== null && String(value).trim() !== ''
    })
    if (!facts.includes('packageInterest') && lead?.package_interest) facts.push('packageInterest')
    return facts
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
    }

    if (isExistingCustomer) {
        return {
            ...base,
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
            conversationKind: 'paused',
            intent: 'handoff_active',
            nextBestAction: 'silence',
            modelEligible: false,
        }
    }

    const intent = detectSalesIntent(incomingText)
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
    if (/פרימיום|מלכותי/.test(text)) id = 'premium'
    else if (/דיגיטל/.test(text)) id = 'digital'
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
    if (decision.intent === 'price') return priceFallbackMessage()
    if (decision.nextBestAction === 'show_proof') return 'בטח, מצרף דוגמה מתוך ספר אמיתי. מה חשוב לך לראות, את הכריכה או את העמודים מבפנים?'
    if (decision.nextBestAction === 'recommend_package') return 'החבילה המודפסת היא הבחירה של רוב המשפחות, ספר כריכה קשה שמגיע עד הבית. לשלוח לך את הפרטים שלה?'
    if (decision.nextBestAction === 'handle_objection') return 'מבין. מה בעיקר עוצר אותך, המחיר או החשש איך הספר ייצא?'
    if (decision.intent === 'process') return 'האורחים סורקים QR, כותבים ברכה ומעלים תמונה בלי אפליקציה. בסוף מאשרים הכול ומקבלים ספר.'
    return 'הספר מרכז את הברכות והתמונות מהאירוע למזכרת אחת. מה הכי חשוב לך, החוויה לאורחים או הספר המודפס?'
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

function containsRepeatedKnownQuestion(message, decision) {
    return (decision.forbiddenRepeats || []).some(field => KNOWN_QUESTION_PATTERNS[field]?.test(normalizedText(message)))
}

function keepOneQuestion(message, maxQuestions) {
    if (maxQuestions < 1) return message.replace(/\?/g, '.')
    let seen = 0
    return message.replace(/\?/g, () => (++seen <= maxQuestions ? '?' : '.'))
}

function compactMessage(message) {
    return String(message || '').replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
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
    const candidates = (Array.isArray(parsed.messages) ? parsed.messages : [])
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
        || (decision.intent === 'price' && !hasPrice(candidates.join('\n')))
        || candidates.length === 0
        || CALL_LANGUAGE.test(normalizedText(candidates[0]))
        || containsRepeatedKnownQuestion(candidates[0], decision)
    )
    let messages = mustUseDeterministic
        ? [fallback]
        : [
            candidates[0],
            ...candidates.slice(1).filter(m =>
                !CALL_LANGUAGE.test(normalizedText(m))
                && !containsRepeatedKnownQuestion(m, decision)),
        ]

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
        noReply: false,
    }
    // The model can recognize buying intent; it cannot observe money.
    // Only the paid WooCommerce boundary may persist closed_won.
    if (result.stage === 'closed_won' && lead.paymentVerified !== true) {
        result.stage = decision.intent === 'payment_intent' ? 'ready_to_pay' : (lead.stage || 'engaged')
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
