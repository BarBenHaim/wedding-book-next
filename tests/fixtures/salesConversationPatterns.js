export const SALES_CONVERSATION_PATTERNS = Object.freeze([
    {
        id: 'price-short',
        lead: { eventType: 'bar_mitzvah' },
        incomingText: 'כמה עולה הספר המודפס?',
        parsed: { messages: ['יש כמה אפשרויות ואשמח להסביר'], stage: 'engaged', handoff: false },
        expected: { intent: 'price', nextBestAction: 'answer', stage: 'engaged', handoff: false },
    },
    {
        id: 'demo-proof',
        lead: {},
        incomingText: 'אפשר לראות דוגמה אמיתית?',
        parsed: { messages: ['בשמחה, מתי נוח שאתקשר אליך בטלפון?'], stage: 'engaged', handoff: false },
        expected: { intent: 'demo', nextBestAction: 'show_proof', stage: 'engaged', handoff: false },
    },
    {
        id: 'known-event-facts',
        lead: { eventType: 'bar_mitzvah', eventDate: '2026-11-05', celebrantName: 'נועם' },
        incomingText: 'אפשר עוד פרטים?',
        parsed: { messages: ['בטח, לאיזה אירוע זה ומתי האירוע?'], stage: 'engaged', handoff: false },
        expected: { intent: 'general', nextBestAction: 'answer_then_qualify', stage: 'engaged', handoff: false },
    },
    {
        id: 'positive-signal',
        lead: { eventType: 'bar_mitzvah' },
        incomingText: 'וואו זה בדיוק מה שחיפשנו',
        parsed: { messages: ['מעולה, אתקשר להסביר עוד'], stage: 'engaged', handoff: false },
        expected: { intent: 'positive_signal', nextBestAction: 'recommend_package', stage: 'engaged', handoff: false },
    },
    {
        id: 'payment-friction',
        lead: { packageInterest: 'printed', paymentLinkSentAt: 1 },
        incomingText: 'לא הצלחתי להשלים את התשלום',
        parsed: { messages: ['נסה שוב כאן https://example.invalid/checkout'], stage: 'ready_to_pay', handoff: false },
        expected: { intent: 'payment_intent', nextBestAction: 'diagnose_checkout', stage: 'ready_to_pay', handoff: false },
    },
    {
        id: 'clean-negative-exit',
        lead: {},
        incomingText: 'החלטנו לוותר, תודה',
        parsed: { messages: ['אעביר אותך לנציג'], stage: 'handoff', handoff: true },
        expected: { intent: 'negative_exit', nextBestAction: 'close_lost', stage: 'closed_lost', handoff: false },
    },
    {
        id: 'existing-customer',
        lead: { stage: 'closed_won' },
        isExistingCustomer: true,
        incomingText: 'צריך עזרה עם הספר שכבר קניתי',
        parsed: { messages: ['הנה חבילת המכירה'], stage: 'engaged', handoff: false },
        expected: { intent: 'support', nextBestAction: 'route_existing_customer', stage: 'closed_won', handoff: false, noReply: true },
    },
    {
        id: 'active-human-handoff',
        lead: { human: true, stage: 'handoff' },
        incomingText: 'יש עדכון?',
        parsed: { messages: ['אני ממשיך למכור לך'], stage: 'engaged', handoff: false },
        expected: { intent: 'handoff_active', nextBestAction: 'silence', stage: 'handoff', handoff: false, noReply: true },
    },
])

export default SALES_CONVERSATION_PATTERNS
