import { DEMO } from './catalog'

const LANDING_URL = 'https://weddingtales.co.il'
// The first nudge used to point at the website. A website is homework;
// the demo is thirty seconds on the phone, and it is the one thing the
// scripted opening never sends. 22.9: twenty-five "תוכל לראות באתר"
// follow-ups went out in one morning and produced one reply, "ראיתי,
// וזה יקר מאוד".
const DEMO_URL = DEMO.writeBlessing
// Keep in step with whatsapp.js. The approved template's single variable is
// the customer's NAME and its body is fixed by Meta; the richer strategy
// texts below only go out as free text inside the 24h window, or through
// `wt_followup` once that template is approved.
const UNIVERSAL_TEMPLATE = 'wt_followup'
const APPROVED_NAME_TEMPLATE = 'wt_followup_he'
const NAME_ONLY_TEMPLATES = new Set([APPROVED_NAME_TEMPLATE])
const activeTemplate = (env = process.env) => {
    const name = String(env?.SALES_FOLLOWUP_TEMPLATE_NAME || '').trim()
    return name === UNIVERSAL_TEMPLATE || NAME_ONLY_TEMPLATES.has(name) ? name : APPROVED_NAME_TEMPLATE
}
const approvedNameBody = name => `היי ${name}, רק מוודא שלא פספסתי אותך לגבי ספר הברכות. אשמח לענות על כל שאלה 🙏`
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
const demoTemplateText = name => `${name}, אם בא לך להרגיש את זה במקום לקרוא: זה אירוע דמו, אפשר לכתוב שם ברכה מהטלפון תוך חצי דקה: ${DEMO_URL}`
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

function plan({ id, objective, cta, landingUrl = null, mediaPreference = 'none', coupon = null, templateText, name = '' }) {
    const templateName = activeTemplate()
    const nameOnly = NAME_ONLY_TEMPLATES.has(templateName)
    return {
        id,
        objective,
        cta,
        landingUrl,
        mediaPreference,
        coupon,
        templateName,
        // What Meta will actually render, so the transcript records the
        // message the customer received and not the one we wished we sent.
        templateParameters: nameOnly ? [name] : [templateText],
        templateText: nameOnly ? approvedNameBody(name) : templateText,
    }
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
            return plan({ name,
                id: 'qualified_offer',
                objective: 'לתת לליד שכבר הביע כוונת רכישה סיבה אמיתית להשלים הזמנה עכשיו',
                cta: 'coupon',
                landingUrl: LANDING_URL,
                coupon: { code: cleanParameter(offer.code), expiresAt: cleanParameter(offer.expiresAt) },
                templateText: `${name}, שמרנו לכם את הקוד ${cleanParameter(offer.code)} עד ${expiryLabel(offer.expiresAt)}. אפשר לראות את כל הפרטים ולהשלים הזמנה כאן: ${LANDING_URL}`,
            })
        }
        return plan({ name,
            id: 'graceful_close',
            objective: 'לסגור מעגל בכבוד ולהשאיר דלת פתוחה בלי לחץ ובלי הנחה',
            cta: 'none',
            templateText: `${name}, סוגר כאן את המעקב כדי לא להציף. אם תרצו לחזור לספר הברכות בהמשך, פשוט כתבו לנו כאן.`,
        })
    }

    if (number === 1) {
        if (['demo_sent', 'offer_sent'].includes(lead?.stage)) {
            return plan({ name,
                id: 'one_question',
                objective: 'הוא כבר ראה את הדמו או את המחירים. שאלה אחת קצרה שמתחברת לדבר האחרון שהוא כתב, בלי קישור, בלי מחירים, בלי לחץ. המטרה היחידה: שיענה.',
                cta: 'reply',
                templateText: helpTemplateText(name),
            })
        }
        return plan({ name,
            id: 'demo_first',
            objective: 'לתת לו לחוות את זה במקום לקרוא: הקישור לאירוע הדמו, שבו כותבים ברכה מהטלפון תוך חצי דקה. משפט אחד על מה שהאורח מרגיש כשהוא כותב, ובסוף שאלה קלה אחת, לאיזה אירוע זה אצלו. בלי מחירים, בלי לינק לאתר, בלי "רציתי להראות לך".',
            cta: 'demo',
            landingUrl: DEMO_URL,
            mediaPreference: 'video',
            templateText: demoTemplateText(name),
        })
    }

    if (lead?.stage === 'ready_to_pay') {
        return plan({ name,
            id: 'resolve_blocker',
            objective: 'לברר בעדינות אם עצרה שאלה על החבילה, תקלה בתשלום או תזמון',
            cta: 'reply',
            templateText: helpTemplateText(name),
        })
    }

    if (['objection', 'commit_later', 'offer_sent'].includes(lead?.stage)) {
        return plan({ name,
            id: 'resolve_blocker',
            objective: 'להתייחס להתלבטות האחרונה ולבקש תשובה קצרה על הדבר היחיד שעוצר את ההחלטה',
            cta: 'reply',
            templateText: helpTemplateText(name),
        })
    }

    return plan({ name,
        id: 'real_page',
        objective: 'להראות עמוד אמיתי מתוך ספר שהדפסנו, עם משפט אחד על מה שרואים בו, ושאלה קלה אחת. בלי לינק לאתר ובלי לחזור על תמונה שכבר נשלחה.',
        cta: 'reply',
        mediaPreference: 'image',
        templateText: siteTemplateText(name),
    })
}

export default planFollowUp
