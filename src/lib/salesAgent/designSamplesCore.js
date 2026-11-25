// The pure rules of the free sign sample: whom to offer it, the fixed words,
// and which photo answers the offer. No Firebase here.
// Design: docs/superpowers/specs/2026-11-25-lead-design-samples-design.md

export const OFFER_WINDOW_MS = 14 * 86_400_000

// Hebrew letters that attach to the front of a word. "ש" is allowed only before
// "בר", so that "שבת מצווה" is not read as a bat mitzvah.
const MITZVAH = /(?:^|[^א-ת])(?:[והבלכמ]{0,3}|ש(?=בר))(בר|בת)[\s\-־'"׳]*ה?מצוו?ה(?![א-ת])/g

// Only the lead's own words count: the stored event type can be wrong.
export function mitzvahKind(texts) {
    const found = new Set()
    for (const raw of texts || []) {
        const text = String(raw || '')
        for (const match of text.matchAll(MITZVAH)) found.add(match[1] === 'בר' ? 'bar' : 'bat')
        if (/\bbar\s*mitzva/i.test(text)) found.add('bar')
        if (/\bbat\s*mitzva/i.test(text)) found.add('bat')
    }
    if (found.size > 1) return 'both'
    return found.values().next().value || null
}

const CHILD = {
    bar: { who: 'הבן שלכם', of: 'שלו', likes: 'הוא אוהב', forThem: 'במיוחד בשבילו' },
    bat: { who: 'הבת שלכם', of: 'שלה', likes: 'היא אוהבת', forThem: 'במיוחד בשבילה' },
    both: { who: 'הילד שלכם', of: 'שלו', likes: 'אוהבים', forThem: 'במיוחד' },
}
const child = kind => CHILD[kind] || CHILD.both

// Fixed words Lord approves. Never written by a model.
export function offerText(kind) {
    const c = child(kind)
    return `אפשר גם לראות איך שלט "ברכו את" ייראה עם ${c.who}: שלחו כאן תמונה ${c.of}, את השם ומה ${c.likes}, `
        + `ונעצב דוגמה ${c.forThem}, ללא עלות. התמונה תשמש רק לדוגמה, תעובד בשירות עיצוב חיצוני ותימחק אחרי 30 יום.`
}

export function samplePhotoAck(kind) {
    const c = child(kind)
    return `קיבלתי את התמונה, תודה. אם עוד לא כתבתם, שלחו גם את השם ${c.of} ומה ${c.likes}. את הדוגמה נשלח לכאן כשתהיה מוכנה.`
}

export const SAMPLE_CAPTION = 'הנה הדוגמה שעיצבנו במיוחד ✨ זו דוגמה להמחשה.'

// Turns where a sample offer does not get in the way of the sale.
const OFFER_ACTIONS = new Set(['answer_then_qualify', 'answer', 'show_workflow', 'show_proof'])
const NO_OFFER_STAGES = new Set(['handoff', 'closed_won', 'closed_lost', 'ready_to_pay', 'commit_later'])
const NO_OFFER_INTENTS = new Set(['price', 'objection'])

// The kind of child to offer a sample for, or null.
export function shouldOfferSample({ settings, phone, mode, lead = {}, incomingText = '', reply = {}, decision = {} }) {
    const allowed = settings?.enabled === true || (settings?.testPhones || []).includes(phone)
    if (!allowed || mode !== 'full_sales' || lead.designSample) return null
    const turns = Array.isArray(lead.turns) ? lead.turns : []
    if (lead.isNew === true || !turns.some(turn => turn.role === 'assistant')) return null
    if (!reply.messages?.length || reply.handoff || reply.noReply || reply.customerDeferred) return null
    if (NO_OFFER_STAGES.has(reply.stage) || NO_OFFER_STAGES.has(lead.stage)) return null
    if (!OFFER_ACTIONS.has(decision.nextBestAction) || NO_OFFER_INTENTS.has(decision.intent)) return null
    return mitzvahKind([...turns.filter(turn => turn.role === 'user').map(turn => turn.text), incomingText])
}

export function acceptsSamplePhoto({ lead, messageType, nowMs = Date.now() }) {
    const sample = lead?.designSample
    if (messageType !== 'image' || !['offered', 'received'].includes(sample?.status)) return false
    const offeredAt = Number(sample.offeredAt)
    return offeredAt > 0 && nowMs - offeredAt <= OFFER_WINDOW_MS
}
