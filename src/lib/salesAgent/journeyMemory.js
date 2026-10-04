// Deterministic customer timing memory. The model may extract a callback
// date, but cannot invent permission to chase or clear a customer's pause.
export function isCustomerDeferral(text = '') {
    const value = String(text)
    if (/(?:אפשר|האם|איך|מתי).{0,25}(?:לשדרג|לשנות|לערוך|להוסיף)/.test(value)
        && !/לא\s+עכשיו|נדבר|אחזור\s+אליכם/.test(value)) return false
    return /לא\s+עכשיו|(?:נדבר|נמשיך|נתקדם|אזמין|הקישור|קישור|תשלום|דברו\s+איתי|עדיף).{0,25}בהמשך|^בהמשך[\s.!?]*$|קרוב\s+יותר|מוקדם\s+מדי|עוד\s+רחוק|האירוע\s+רחוק|^רחוק[\s.!?]*$|אחשוב|אבדוק|להתייעץ|אתייעץ|אדבר\s+עם|אחזור\s+אליכם|אני\s+אפנה|אל\s+תחזר|לא\s+לפנות|אל\s+תשלחו/.test(value)
}

export function customerWillReturn(text = '') {
    return /אחזור\s+אליכם|אני\s+אפנה|אל\s+תחזר|לא\s+לפנות|אל\s+תשלחו/.test(String(text))
}

function previousAssistant(lead) {
    return (lead?.turns || []).filter(turn => turn?.role === 'assistant').at(-1)?.text || ''
}

function acceptedCallbackDate({ parsed, lead, incomingText, todayISO }) {
    const date = String(parsed?.callbackPromised || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date <= todayISO || customerWillReturn(incomingText)) return null
    const answeringTiming = /מתי.{0,35}(?:נחזור|אחזור|לחזור)/.test(previousAssistant(lead))
    const requestingContact = /תחזור|תחזרו|תחזרי|לחזור|תזכיר|צרו\s+קשר/.test(incomingText)
    const hasTiming = /\d|מחר|שבוע|חודש|ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר|ראשון|שני|שלישי|רביעי|חמישי/.test(incomingText)
    return (answeringTiming || requestingContact) && hasTiming ? date : null
}

export function applyCustomerTiming({ result, decision, lead = {}, incomingText = '' }) {
    const deferredNow = decision.intent === 'defer_request' || isCustomerDeferral(incomingText)
    const callbackDate = acceptedCallbackDate({ parsed: result, lead, incomingText, todayISO: decision.todayISO })
    if (deferredNow || lead.customerDeferred === true || lead.stage === 'commit_later' || callbackDate) {
        const resuming = decision.nextBestAction === 'send_payment_link'
        const legacyCallback = lead.stage === 'commit_later' && lead.callbackPromised
            ? lead.followUpAt || lead.callbackPromised : null
        result.customerDeferred = !resuming
        result.customerCallbackAt = resuming ? null : callbackDate || (deferredNow ? null : lead.customerCallbackAt || legacyCallback || null)
        result.callbackPromised = null
        if (!resuming) {
            result.followUpAt = result.customerCallbackAt || null
            if (!result.handoff && !['closed_won', 'closed_lost'].includes(result.stage)) result.stage = 'commit_later'
        }
    }
    return result
}
