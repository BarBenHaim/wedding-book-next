import { CONCESSION, proofLine } from './catalog'
import { preEventTouchDate, daysUntil, readStrictFollowUpPolicy } from './followupPolicy'
const LANDING_URL = 'https://weddingtales.co.il'
// The first nudge used to point at the website, then briefly at the
// demo. Both are homework. 24.9: one line about what they get, one
// question, no link.
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
const oneLineTemplateText = name => `${name}, בסוף האירוע נשאר לכם ספר כריכה קשה עם כל הברכות והתמונות שהאורחים כתבו. ${proofLine(0)}. לאיזה אירוע זה אצלכם?`
const helpTemplateText = name => `${name}, רציתי לבדוק אם עצרה אתכם שאלה על החבילה, תקלה בתשלום או פשוט התזמון. אפשר לענות לי כאן במשפט אחד.`

// Follow-ups need the actual dialogue too. Bound both turns and characters,
// and keep adjacent roles valid for every supported provider. No media bytes.
export function buildFollowUpMessages(turns = []) {
    let remaining = 6000
    const recent = []
    for (const turn of (Array.isArray(turns) ? turns : []).slice(-24).reverse()) {
        if (!['user', 'assistant'].includes(turn?.role)) continue
        const content = String(turn.text || '').trim().slice(0, Math.min(1200, remaining))
        if (!content) continue
        recent.unshift({ role: turn.role, content })
        remaining -= content.length
        if (remaining <= 0) break
    }
    while (recent.length && recent[0].role !== 'user') recent.shift()
    recent.push({ role: 'user', content: 'כתוב עכשיו את הפולו-אפ ללקוח הזה, לפי ההיסטוריה והכללים. הודעות קודמות של הבוט אינן מקור לעובדות על המוצר.' })
    return recent.reduce((messages, turn) => {
        if (messages.at(-1)?.role === turn.role) messages.at(-1).content += `\n${turn.content}`
        else messages.push({ ...turn })
        return messages
    }, [])
}

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

// Every strategy id planFollowUp can return. The delivery ledger
// (prepareFollowUpDelivery) whitelists strategy ids before writing, and
// the whitelist used to be a second copy of this list inside leads.js.
// On 22.9 three strategies were added here and not there, and for a
// week every first follow-up threw INVALID_FOLLOWUP_METADATA inside a
// catch that only logged "lead failed": one follow-up a day went out
// instead of twenty-five. One list, imported by both sides.
export const FOLLOWUP_STRATEGY_IDS = Object.freeze([
    'consent_reminder', 'consent_callback', 'consent_close',
    'one_line', 'one_question', 'real_page', 'deadline_offer',
    'until_event', 'pre_event',
    'resolve_blocker', 'qualified_offer', 'graceful_close',
    // Retired on 22.9; kept so old ledger rows still validate.
    'proof_site',
])
export const FOLLOWUP_CTAS = Object.freeze(['website', 'reply', 'coupon', 'none'])

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

// The same concession the reply policy gives, with the same date rule,
// so a customer who hears it twice hears the same thing.
const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
function concessionText(todayISO) {
    const base = /^\d{4}-\d{2}-\d{2}$/.test(String(todayISO || '')) ? todayISO : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
    const d = new Date(`${base}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + CONCESSION.validDays)
    const iso = d.toISOString().slice(0, 10)
    const until = `${Number(iso.slice(8, 10))} ב${HE_MONTHS[Number(iso.slice(5, 7)) - 1]}`
    return CONCESSION.text.replace('{DATE}', until)
}
function concessionAlreadyOffered(lead) {
    const turns = Array.isArray(lead?.turns) ? lead.turns : []
    return turns.some(t => t?.role === 'assistant' && /במתנה/.test(String(t?.text || '')))
}

export function planFollowUp(lead = {}, {
    attempt = 1,
    isFinal = false,
    offer = null,
    customerName = '',
    todayISO = null,
    policy = readStrictFollowUpPolicy(),
} = {}) {
    if (policy.enabled) {
        const final = (lead.followUpConsent?.usedReminders || 0) + 1 >= (lead.followUpConsent?.maxReminders || 1)
        const callback = lead.followUpConsent?.callbackAtMs != null
        const messageText = callback
            ? 'חוזרת אליכם במועד שביקשתם לגבי ספר הברכות. מתאים להמשיך מכאן?'
            : final && (lead.followUpConsent?.usedReminders || 0) > 0
                ? 'משאירה כאן את הפרטים. אם תרצו להמשיך בהמשך, אפשר לכתוב כאן.'
                : lead.stage === 'ready_to_pay'
                    ? 'נתקלתם בבעיה בהזמנה, או שיש משהו שצריך לברר לפני שממשיכים?'
                    : 'נשאר משהו לא ברור לגבי הספר, המחיר או איך אוספים ברכות?'
        return {
            ...plan({ name: customerLabel(customerName),
                id: callback ? 'consent_callback' : final ? 'consent_close' : 'consent_reminder',
                objective: 'תזכורת קצרה בהסכמה בלבד, ללא מבצע, דחיפות, מדיה או טענות פעולה שלא אומתו',
                cta: final && !callback ? 'none' : 'reply', templateText: messageText,
            }),
            messageText, strict: true,
        }
    }
    const number = Math.max(1, Math.min(4, Number(attempt) || 1))
    const name = customerLabel(customerName)
    const preEventDate = preEventTouchDate(lead?.eventDate, todayISO)
    const untilEvent = daysUntil(lead?.eventDate, todayISO)

    if (lead.customerDeferred === true || lead.stage === 'commit_later') {
        return plan({ name,
            id: 'one_question',
            objective: 'לחזור רק במועד שהלקוח בחר, להזכיר את ההקשר ולשאול אם מתאים להמשיך. בלי מבצע, דחיפות או קישור תשלום.',
            cta: 'reply',
            templateText: `${name}, כתבת שתרצו לחזור לספר בהמשך. האם עכשיו זמן מתאים להמשיך?`,
        })
    }

    // Touch 4: the pre-event message, thirty (or fourteen) days before
    // the event. The offer, the reason it matters now (the poster), a
    // stranger's word, and the close. Scripted; it goes out as written.
    if (number >= 4) {
        const when = untilEvent != null && untilEvent <= 20 ? 'בעוד שבועיים בערך' : 'בעוד חודש בערך'
        return plan({ name,
            id: 'pre_event',
            objective: 'נגיעה לפני האירוע: הפוסטר צריך להיות מוכן, ההצעה עם התאריך, והבקשה להזמנה.',
            cta: 'reply',
            templateText: `${name}, האירוע ${when}, וכדי שהפוסטר וקישור האורחים יהיו מוכנים בזמן שווה לפתוח עכשיו. ${concessionText(todayISO)}. ${proofLine(1)}. רוצה שאפתח לכם את הספר? שולח קישור.`,
        })
    }

    const final = isFinal === true || (number >= 3 && !preEventDate)

    // Touch 3 with a far event: not goodbye. Say when we will write again
    // and leave the door open; the pre-event touch follows.
    if (number >= 3 && !final && preEventDate) {
        return plan({ name,
            id: 'until_event',
            objective: 'לא להציף: להגיד שנכתוב שוב כחודש לפני האירוע, ושאפשר לפנות קודם.',
            cta: 'reply',
            templateText: `${name}, לא אציף. אכתוב שוב כחודש לפני האירוע, כשזה הזמן להכין את הפוסטר. ואם תרצו קודם, אני כאן.`,
        })
    }

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

    // Checkout-stage context matters on the FIRST touch as well as later.
    if (lead?.stage === 'ready_to_pay') {
        return plan({ name,
            id: 'resolve_blocker',
            objective: 'לברר בעדינות אם עצרה שאלה על החבילה, תקלה בתשלום או תזמון',
            cta: 'reply',
            templateText: helpTemplateText(name),
        })
    }

    // The first touch is the only one that reliably lands inside Meta's
    // 24-hour window (the cron runs twice a day; the second touch is three
    // days later and goes out as the fixed approved template). So the
    // strongest message a lead who already saw the prices can get - the
    // one concession with its date and the close - goes FIRST, not second.
    if (number === 1 && ['demo_sent', 'offer_sent', 'objection', 'commit_later'].includes(lead?.stage) && !concessionAlreadyOffered(lead)) {
        return plan({ name,
            id: 'deadline_offer',
            objective: `ההצעה היחידה שקיימת, עם התאריך שלה: "${concessionText(todayISO)}". משפט אחד שמתחבר לאירוע שלו, ההצעה כמו שהיא כתובה, והבקשה: "רוצה שאפתח לכם את הספר? שולח קישור." בלי שאלה על מה עוצר, בלי לחזור על יתרונות.`,
            cta: 'reply',
            templateText: `${name}, שמרתי לכם ${concessionText(todayISO)}. רוצה שאפתח לכם את הספר? שולח קישור.`,
        })
    }

    if (number === 1) {
        if (['demo_sent', 'offer_sent'].includes(lead?.stage) || lead?.eventType) {
            return plan({ name,
                id: 'one_question',
                objective: 'הוא כבר ראה את הדמו או את המחירים. שאלה אחת קצרה שמתחברת לדבר האחרון שהוא כתב, בלי קישור, בלי מחירים, בלי לחץ. המטרה היחידה: שיענה.',
                cta: 'reply',
                templateText: helpTemplateText(name),
            })
        }
        return plan({ name,
            id: 'one_line',
            objective: 'הודעה אחת של שני משפטים: מה מקבלים בסוף (ספר כריכה קשה עם כל הברכות והתמונות של האורחים) ושאלה אחת, לאיזה אירוע זה אצלו. בלי קישורים, בלי מחירים, בלי "רציתי להראות לך".',
            cta: 'reply',
            mediaPreference: 'video',
            templateText: oneLineTemplateText(name),
        })
    }

    // Second touch for someone who saw the prices and went quiet: the one
    // concession, with its date, and the close. Not a question about what
    // is bothering them; they already know, and it did not make them
    // write. A reason to decide this week does.
    if (['objection', 'commit_later', 'offer_sent', 'demo_sent'].includes(lead?.stage) && !concessionAlreadyOffered(lead)) {
        // Second touch, still no concession on record (e.g. the first
        // touch was composed before 1.10): same offer, same date rule.
        return plan({ name,
            id: 'deadline_offer',
            objective: `ההצעה היחידה שקיימת, עם התאריך שלה: "${concessionText(todayISO)}". משפט אחד שמתחבר לאירוע שלו, ההצעה כמו שהיא כתובה, והבקשה: "רוצה שאפתח לכם את הספר? שולח קישור." בלי שאלה על מה עוצר, בלי לחזור על יתרונות.`,
            cta: 'reply',
            templateText: `${name}, שמרתי לכם ${concessionText(todayISO)}. רוצה שאפתח לכם את הספר? שולח קישור.`,
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
