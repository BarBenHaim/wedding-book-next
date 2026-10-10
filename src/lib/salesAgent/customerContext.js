// Support wording is only a reason to check the existing ownerPhone index.
// It is never proof of a purchase, payment, or customer identity. The reply
// route must still require a matching wedding or trusted stored lead state.

const MAX_CONTEXT_TURNS = 12
const MAX_TEXT_CHARS = 1_200

function boundedText(value) {
    return typeof value === 'string'
        ? value.slice(0, MAX_TEXT_CHARS).trim().toLowerCase().replace(/\s+/g, ' ')
        : ''
}

const OWN_ITEM = /(?:ה?ספר|ה?אלבום|ה?הזמנה|ה?עמודים|ה?ברכות|ה?פוסטר)\s+(?:שלי|שלנו)|\b(?:my|our)\s+(?:book|album|order|pages?|blessings|poster)\b/
const EXISTING_ITEM = /הספר|האלבום|העמודים|הדפים|הברכות|הפוסטר|\b(?:the|my|our)\s+(?:book|album|pages?|blessings|poster)\b/
const SUPPORT_ACTION = /לסדר|סידור|לערוך|עריכ[הת]|להוסיף|להסיר|למחוק|לשנות|שינוי|לתקן|תיקון|לתרגם|תרגום|להדפיס|להדפסה|להוריד|להורדה|לייצא|ייצוא|יצוא|לא\s+(?:נפתח|נפתחים|נפתחות|מופיע|מופיעות)|\b(?:edit|editing|reorder|reordering|add|remove|delete|change|fix|translate|translation|missing|print|printing|download|export)\b/
const SEND_PAGES = /(?:לשלוח|תשלח|שלח|לקבל).{0,40}(?:העמודים|הדפים)|\bsend\b.{0,40}\b(?:the|my|our)\s+pages?\b/
const PURCHASE_CLAIM = /כבר\s+(?:קניתי|קנינו|רכשתי|רכשנו|הזמנתי|הזמנו|שילמתי|שילמנו)|\b(?:i|we)(?:\s+have|['’]ve)?\s+already\s+(?:bought|ordered|paid)\b/
const SHORT_ACK = /^(?:כן(?:\s+כן)?(?:\s+בבקשה|\s+תודה)?|בסדר|סבבה|אוקי|אוקיי|בטח|yes(?:\s+please)?|ok|okay|sure|👍|🙏)[\s!.?,🙂😊👍🙏]*$/u
// Only neutral language fragments can bridge a support thread. A question
// about English availability or the price of another book is a new topic.
const LANGUAGE_FRAGMENT_HE = /^(?:(?:אני\s+)?(?:רציתי|רוצה|צריך|צריכה)\s+)?(?:(?:התכוונתי|התכוונו|כוונתי|בעצם|כלומר|רק|כן)\s+)*(?:(?:ל?גרסה|ל?נוסח|ל?תרגום)\s+)?[בל]?(?:אנגלית|עברית)(?:\s+בבקשה)?[.!?]*$/
const LANGUAGE_FRAGMENT_EN = /^(?:(?:(?:i|we)\s+meant|actually)[,:]?\s+)?(?:the\s+|in\s+)?(?:english|hebrew)(?:\s+(?:version|translation))?(?:,?\s+please)?[.!?]*$/

function isSupportLike(text) {
    return OWN_ITEM.test(text)
        || PURCHASE_CLAIM.test(text)
        || (EXISTING_ITEM.test(text) && SUPPORT_ACTION.test(text))
        || (SEND_PAGES.test(text) && !/דוגמ|\b(?:sample|preview)\b/.test(text))
}

function isNeutralContinuation(text) {
    return SHORT_ACK.test(text) || LANGUAGE_FRAGMENT_HE.test(text) || LANGUAGE_FRAGMENT_EN.test(text)
}

export function shouldLookupCustomerByPhone({ lead = {}, incomingText = '' } = {}) {
    if (lead?.isNew === true) return true
    const text = boundedText(incomingText)
    if (isSupportLike(text)) return true
    // A bare yes or language correction can continue a support request.
    // Only the customer's own most recent substantive turn counts; model
    // copy and old support topics must not turn a buyer turn into a lookup.
    if (!isNeutralContinuation(text)) return false
    const turns = Array.isArray(lead?.turns) ? lead.turns.slice(-MAX_CONTEXT_TURNS) : []
    for (let i = turns.length - 1; i >= 0; i -= 1) {
        if (turns[i]?.role !== 'user') continue
        const previous = boundedText(turns[i].text)
        if (!previous || isNeutralContinuation(previous)) continue
        return isSupportLike(previous)
    }
    return false
}
