const LANDING_URL = 'https://weddingtales.co.il'
const MAX_OFFER_WINDOW_MS = 48 * 60 * 60 * 1000
const HIGH_INTENT_STAGES = new Set([
    'ready_to_pay',
    'offer_sent',
    'objection',
    'commit_later',
    'demo_sent',
])

const cleanParameter = (value, fallback = '') => String(value || fallback)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)

const customerLabel = value => cleanParameter(value, 'משפחה יקרה') || 'משפחה יקרה'
const siteTemplateText = name => `${name}, רציתי לשלוח לך שוב דרך קצרה לראות איך ספר הברכות עובד. הסרטון והפרטים מחכים באתר: ${LANDING_URL}`
const helpTemplateText = name => `${name}, רציתי לבדוק אם עצרה אתכם שאלה על החבילה, תקלה בתשלום או פשוט התזמון. אפשר לענות לי כאן במשפט אחד.`

function expiryLabel(iso) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jerusalem',
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
    }).formatToParts(new Date(iso)).map(part => [part.type, part.value]))
    return `${Number(parts.day)}.${Number(parts.month)}.${parts.year}`
}

export function readFollowUpOffer(env = process.env, nowMs = Date.now()) {
    const code = cleanParameter(env?.SALES_FOLLOWUP_COUPON_CODE).toUpperCase()
    const expiresAt = cleanParameter(env?.SALES_FOLLOWUP_COUPON_EXPIRES_AT)
    const expiresAtMs = Date.parse(expiresAt)
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return null
    if (!Number.isFinite(expiresAtMs)) return null
    if (expiresAtMs <= Number(nowMs) || expiresAtMs - Number(nowMs) > MAX_OFFER_WINDOW_MS) return null
    return { code, expiresAt: new Date(expiresAtMs).toISOString() }
}

function plan({ id, objective, cta, landingUrl = null, mediaPreference = 'none', coupon = null, templateName, templateParameters, templateText }) {
    return { id, objective, cta, landingUrl, mediaPreference, coupon, templateName, templateParameters, templateText }
}

export function planFollowUp(lead = {}, {
    attempt = 1,
    isFinal = false,
    offer = null,
    customerName = '',
} = {}) {
    const number = Math.max(1, Math.min(3, Number(attempt) || 1))
    const name = customerLabel(customerName)
    const final = isFinal === true || number >= 3

    if (final) {
        if (HIGH_INTENT_STAGES.has(lead?.stage) && offer?.code && offer?.expiresAt) {
            return plan({
                id: 'qualified_offer',
                objective: 'לתת לליד שכבר הביע כוונת רכישה סיבה אמיתית להשלים הזמנה עכשיו',
                cta: 'coupon',
                landingUrl: LANDING_URL,
                coupon: { code: cleanParameter(offer.code), expiresAt: cleanParameter(offer.expiresAt) },
                templateName: 'wt_followup_offer',
                templateParameters: [name, cleanParameter(offer.code), expiryLabel(offer.expiresAt)],
                templateText: `${name}, שמרנו לכם את הקוד ${cleanParameter(offer.code)} עד ${expiryLabel(offer.expiresAt)}. אפשר לראות את כל הפרטים ולהשלים הזמנה כאן: ${LANDING_URL}`,
            })
        }
        return plan({
            id: 'graceful_close',
            objective: 'לסגור מעגל בכבוד ולהשאיר דלת פתוחה בלי לחץ ובלי הנחה',
            cta: 'none',
            templateName: 'wt_followup_close',
            templateParameters: [name],
            templateText: `${name}, סוגר כאן את המעקב כדי לא להציף. אם תרצו לחזור לספר הברכות בהמשך, פשוט כתבו לנו כאן.`,
        })
    }

    if (number === 1) {
        return plan({
            id: 'proof_site',
            objective: 'להמחיש במהירות איך ספר הברכות נראה ולהוביל לפרטים באתר',
            cta: 'website',
            landingUrl: LANDING_URL,
            mediaPreference: 'video',
            templateName: 'wt_followup_site',
            templateParameters: [name],
            templateText: siteTemplateText(name),
        })
    }

    if (lead?.stage === 'ready_to_pay') {
        return plan({
            id: 'resolve_blocker',
            objective: 'לברר בעדינות אם עצרה שאלה על החבילה, תקלה בתשלום או תזמון',
            cta: 'reply',
            templateName: 'wt_followup_help',
            templateParameters: [name],
            templateText: helpTemplateText(name),
        })
    }

    if (['objection', 'commit_later', 'offer_sent'].includes(lead?.stage)) {
        return plan({
            id: 'resolve_blocker',
            objective: 'להתייחס להתלבטות האחרונה ולבקש תשובה קצרה על הדבר היחיד שעוצר את ההחלטה',
            cta: 'reply',
            templateName: 'wt_followup_help',
            templateParameters: [name],
            templateText: helpTemplateText(name),
        })
    }

    return plan({
        id: 'proof_site',
        objective: 'להחזיר את הליד לפרטים המלאים באתר בלי לחזור על מדיה שכבר נשלחה',
        cta: 'website',
        landingUrl: LANDING_URL,
        templateName: 'wt_followup_site',
        templateParameters: [name],
        templateText: siteTemplateText(name),
    })
}

export default planFollowUp
