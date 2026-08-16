// A model may phrase a sales response, but it must not invent the next
// move. This policy turns the current message and durable lead facts into
// one small, testable instruction before any provider is called.

export const TURN_LIMITS = Object.freeze({
    maxMessages: 1,
    maxChars: 180,
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

export function detectSalesIntent(text = '') {
    const value = normalizedText(text)

    // Terminal intent comes before generic phrases such as "דיברתי עם בן
    // אדם". A polite no is a closed loop, not a human-handoff request.
    if (/ויתר|לוותר|מוותר|החלטנו\s+שלא|לא\s+רלוונט|לא\s+מעוניינ|לא\s+מתאים\s+לנו|ירדנו\s+מזה/.test(value)) return 'negative_exit'

    // Checkout trouble has to beat both the word "מחיר" and a second
    // payment-link send. The useful move is diagnosis, not another pitch.
    if (/(לא\s+הצלח|לא\s+עובד|נתקע|בעיה|תקלה).{0,30}(תשלום|לשלם|קישור|הזמנה)|(תשלום|קישור).{0,30}(לא\s+עובד|בעיה|תקלה|נתקע)/.test(value)) return 'payment_intent'
    if (/רוצה\s+להזמין|רוצ[הים]\s+לסגור|איך\s+משלמ|אפשר\s+לשלם|קישור.{0,12}תשלום|אקח\s+את|נלך\s+על|אפשר\s+להזמין/.test(value)) return 'payment_intent'

    if (/מחיר|כמה.{0,12}עולה|עלות|חבילות|טווח\s+מחירים/.test(value)) return 'price'
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

function nextAction(intent, lead) {
    if (intent === 'negative_exit') return 'close_lost'
    if (intent === 'payment_intent') return paymentLinkWasSent(lead) ? 'diagnose_checkout' : 'send_payment_link'
    if (intent === 'price' || intent === 'process') return 'answer'
    if (intent === 'demo') return 'show_proof'
    if (intent === 'positive_signal') return 'recommend_package'
    if (intent === 'objection') return 'handle_objection'
    return 'answer_then_qualify'
}

export function decideSalesTurn({ lead = {}, incomingText = '', isExistingCustomer = false } = {}) {
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

    if (lead?.human === true || lead?.stage === 'handoff') {
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
        nextBestAction: nextAction(intent, lead),
        modelEligible: true,
    }
}

export default decideSalesTurn
