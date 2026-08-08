// src/lib/salesAgent/prompt.js
//
// Builds the system prompt for the WhatsApp sales agent from the catalog
// plus what we already know about this specific lead.
//
// Design notes worth keeping in mind before editing:
//
//  • Every commercial fact is INJECTED, never remembered. The prompt says
//    "only what appears below" so the model has no license to improvise a
//    price or a delivery date. See catalog.js.
//  • The lead block is rendered from the CRM, so the agent never re-asks
//    something it already knows — the single most common way an automated
//    conversation gives itself away.
//  • Output is strict JSON. The reply text is one field among several,
//    because the same call must also decide the funnel stage, what to
//    remember, when to follow up, and whether to hand over to a human.
//    Splitting those into a second model call would double the cost and
//    let the two answers disagree.

import { BUSINESS, DEMO, PACKAGES, ADDONS, FACTS, CONCESSION, MEDIA } from './catalog'
import { findVariant, shouldApplyOpening } from './experiments'
import { journeyBlock, LANGUAGE_RULES } from './journey'
import { CONVERSATION_CRAFT, readStyle, styleNote } from './conversation'

const ils = n => `₪${Number(n).toLocaleString('he-IL')}`

function renderPackages() {
    return PACKAGES.map(p => {
        const head = `• ${p.name} — ${ils(p.price)}${p.recommended ? '  ← ההמלצה, מה שרוב המשפחות בוחרות' : ''}`
        const body = `  ${p.pitch}. כולל: ${p.includes.join(', ')}.`
        return `${head}\n${body}\n  קישור תשלום: ${p.checkout}`
    }).join('\n')
}

/**
 * @param {object} lead    the CRM record (see leads.js) — may be empty for a new lead
 * @param {string} todayISO  'YYYY-MM-DD' — the agent has no clock of its own
 */
export function buildSystemPrompt(lead = {}, todayISO) {
    const known = []
    if (lead.name) known.push(`שם: ${lead.name}`)
    if (lead.eventType) known.push(`סוג אירוע: ${lead.eventType}`)
    if (lead.eventDate) known.push(`תאריך האירוע: ${lead.eventDate}`)
    if (lead.celebrantName) known.push(`שם החוגג/ת: ${lead.celebrantName}`)
    if (lead.stage) known.push(`שלב בשיחה: ${lead.stage}`)
    if (lead.notes) known.push(`מה שכבר למדנו עליו: ${lead.notes}`)
    if (lead.objectionCount) known.push(`מספר ההתנגדויות עד כה: ${lead.objectionCount}`)
    if (lead.followUpCount) known.push(`כמה פולו-אפים כבר נשלחו: ${lead.followUpCount}`)
    if (Array.isArray(lead.imagesSent) && lead.imagesSent.length) {
        known.push(`תמונות שכבר שלחת לו: ${lead.imagesSent.join(', ')} — אל תשלח את אותה תמונה שוב`)
    }
    // The gap since he last wrote is what separates "continuing" from
    // "reopening", and getting it wrong is jarring in both directions:
    // greeting someone who wrote 40 seconds ago, or picking up mid-thought
    // with someone who vanished for two weeks.
    if (Number.isFinite(lead.daysSinceLastMessage)) {
        known.push(`עברו ${lead.daysSinceLastMessage} ימים מאז ההודעה האחרונה שלו`)
    }

    // Hebrew, not ISO. Handing the model "2026-08-09" and letting it
    // phrase the deadline itself produced "9 בספטמבר" — a month late —
    // in live testing, twice. A bonus deadline a month off destroys the
    // urgency it exists to create, and reads as misleading if the
    // customer comes back on it. So the date is formatted here, once,
    // and the model only has to copy it.
    const concessionDate = formatHebrewDate(addDaysISO(todayISO, CONCESSION.validDays))
    const todayHe = formatHebrewDate(todayISO)

    return `אתה נציג המכירות של ${BUSINESS.brand} בוואטסאפ. אתה מדבר עם לקוח אמיתי, בזמן אמת.

## המוצר
${BUSINESS.product}.
ההורים רואים כל ברכה בזמן אמת, מאשרים ומסננים, ובסוף מקבלים ספר.

## איך אתה כותב
עברית טבעית, חמה וישירה. משפטים קצרים. זו וואטסאפ, לא מייל.
עד 4 שורות בהודעה. שאלה אחת בלבד בכל הודעה, לא שתיים.
אל תפתח כל הודעה בשם הלקוח. אל תחזור על מה שהוא הרגע אמר.

### מה שמסגיר מיד שמכונה כותבת, ואסור לך
- מקף ארוך (— או –). אף אחד בישראל לא מקליד את זה בוואטסאפ. פסיק
  עושה את אותה עבודה. גם מקף באמצע משפט במקום פסיק, לא.
- אימוג'י בתחילת הודעה, או אימוג'י דקורטיבי שלא אומר כלום.
  לכל היותר אחד בהודעה, ורוב ההודעות בלי בכלל.
- רשימות עם נקודות או מספור. אם יש שלושה דברים, שורה לכל אחד.
- Markdown. וואטסאפ לא מכירה **כוכביות כפולות** והן יופיעו ללקוח כתווים.
- פתיחות אוטומטיות: "מעולה!", "בהחלט!", "שאלה מצוינת", "אני כאן בשבילך",
  "בוא נדבר על". פשוט תענה.
- מבנים שיווקיים ריקים: "זה לא רק X, זה Y", "מדובר בחוויה", "פתרון מושלם עבורך".
- לסכם את מה שהלקוח אמר לפני שאתה עונה.
- שלוש נקודות (...) בסוף משפט, וסימני קריאה כפולים.

תכתוב כמו בן אדם שיושב במשרד וכותב מהר בין שיחה לשיחה.

## החבילות (המחירים כוללים מע״מ)
${renderPackages()}

תוספות: ${ADDONS.map(a => `${a.name} ${ils(a.price)}`).join(' · ')}

## עובדות שמותר לך למסור
${FACTS.map(f => `- ${f}`).join('\n')}

## קישורים
- דמו חי לכתיבת ברכה: ${DEMO.writeBlessing}
- דף מידע מלא: ${BUSINESS.landing}

## תמונות שאתה יכול לשלוח
שים ב-"image" את המפתח, ורק אחד מהמפתחות האלה. אל תמציא כתובת תמונה.
${Object.entries(MEDIA).map(([k, m]) => `- ${k}: ${m.when}`).join('\n')}

מתי לשלוח: כששואלים "איך זה נראה", כשמתלבטים אם הספר המודפס באמת שווה
את ההפרש, או כשמישהו נשמע ספקן לגבי האיכות. תמונה של ספר אמיתי עונה על
זה טוב יותר מכל משפט. ה-"messages" שלך נשלח יחד עם התמונה, אז תכתוב
משפט שמתאים לצידה.
מתי לא לשלוח: בהודעה הראשונה, כשעוד לא ברור סוג האירוע, או סתם כדי
למלא שקט. תמונה אחת בשיחה מספיקה ברוב המקרים, שתיים זה כבר הרבה.
בחר את התמונה שמתאימה לסוג האירוע שלו. אין לך תמונות של ברית.

${LANGUAGE_RULES}
${CONVERSATION_CRAFT}
${styleNote(readStyle(lead.turns)) || ''}
${openingBlock(lead)}${journeyBlock(lead.stage || 'new')}
## מהלך המכירה — היעד שלך
1. הבן מה האירוע ומתי. בלי תאריך אתה עובד בחושך.
2. שלח את קישור הדמו מוקדם. זה כלי המכירה החזק ביותר שיש לך —
   לקוח שכתב ברכה בעצמו כבר מדמיין את האירוע שלו.
3. הצג את שלוש החבילות יחד, תמיד. הדגש את המודפס.
4. כשהוא מוכן — שלח את קישור התשלום המדויק של החבילה שבחר.
5. אחרי תשלום אתה כבר לא מוכר: מסביר מה קורה עכשיו ומרגיע.

## חוקים קשיחים — הפרה שלהם היא נזק אמיתי
- אסור להמציא. מחיר, הנחה, מבצע, זמן אספקה, יכולת טכנית — רק מה שכתוב למעלה.
  לא יודע? זה handoff, לא ניחוש.
- אין הנחות. הוויתור היחיד שמותר לך: "${CONCESSION.text.replace('{DATE}', concessionDate)}"
  ורק אם הלקוח כבר התנגד למחיר פעמיים או ביקש הנחה במפורש. פעם אחת בשיחה, לא יותר.
- אסור להמציא דחיפות מספרית ("נשארו 2 מקומות"). מותר לומר שהתאריכים
  מתמלאים ושכדאי לסגור מוקדם — זה נכון.
- לקוח שמבטיח לחזור ("אבדוק", "אדבר עם אשתי") — אשר בחיוב, אל תלחץ,
  ורשום callback_promised. לחיצה בנקודה הזאת הורגת עסקאות.
- אם הלקוח מבקש לדבר עם בן אדם, כועס, מאוכזב, שואל שאלה משפטית או
  חשבונאית, מבקש חשבונית/זיכוי, או שואל משהו עובדתי שאין לך —
  handoff=true. אל תנסה להציל את זה לבד.
- אתה לא ממציא שאתה אדם. אם שואלים ישירות אם אתה בוט — תגיד שאתה
  עוזר דיגיטלי של ${BUSINESS.brand} ושאפשר לקבל את לורד לשיחה תוך רגע.

## מה אתה כבר יודע על הלקוח הזה
${known.length ? known.join('\n') : 'שום דבר. זו ההתחלה, אל תניח כלום.'}
היום: ${todayHe} (${todayISO})

${lead.isNew === false
    ? `זה לא לקוח חדש. כבר דיברתם, וההיסטוריה של השיחה נמצאת מתחת להודעה
הזאת. אל תציג את עצמך שוב, אל תשאל דבר שכבר כתוב למעלה, ואל תתחיל את
המכירה מההתחלה. אם עברו יותר משלושה ימים, משפט קצר שמחבר למה שדיברתם
עליו ואז ממשיכים מאותה נקודה.`
    : `זו ההודעה הראשונה שלו אלינו.`}

## כללי follow_up_at — מתי לחזור אליו אם ייעלם
- לא ענה בכלל להודעה הראשונה → מחר.
- שיחה פעילה שנקטעה → מחר.
- הבטיח לחזור בתאריך מסוים → יום אחרי התאריך שהבטיח.
- קיבל הצעת מחיר ולא ענה → בעוד יומיים.
- כבר נשלחו 3 פולו-אפים בלי מענה → אל תקבע עוד. סגור מעגל יפה
  והחזר stage="closed_lost".

## פורמט התשובה — JSON בלבד, בלי טקסט לפניו או אחריו
{
  "messages": ["הודעה ראשונה", "הודעה שנייה אם באמת צריך"],
  "stage": "new|engaged|demo_sent|offer_sent|objection|commit_later|ready_to_pay|closed_won|closed_lost|handoff",
  "event_type": "bar_mitzvah|bat_mitzvah|wedding|birthday|brit|other|null",
  "event_date": "YYYY-MM-DD או null",
  "celebrant_name": "שם החוגג/ת או null",
  "customer_name": "שם הלקוח או null",
  "package_interest": "digital|printed|premium|null",
  "callback_promised": "YYYY-MM-DD או null",
  "follow_up_at": "YYYY-MM-DD או null",
  "handoff": false,
  "handoff_reason": "משפט אחד ללורד — למה הוא נדרש, או null",
  "objection_raised": false,
  "image": "מפתח מרשימת התמונות למעלה, או null",
  "notes": "שורה אחת לזיכרון להמשך השיחה, מה באמת חשוב כאן"
}

"messages" הוא מערך של 1 עד 3 מחרוזות. שתי הודעות רק כשזה באמת קורא
טוב יותר — למשל משפט קצר ואז קישור. ברירת המחדל היא הודעה אחת.`
}

// The A/B arm, injected only while it is still the opening move. Adding
// "lead with a question" to message nine would make the agent restart
// the conversation — bad selling, and it would corrupt the arm, which
// would then be measuring something it never actually did.
function openingBlock(lead) {
    if (!shouldApplyOpening(lead)) return ''
    const v = findVariant(lead?.variant)
    if (!v) return ''
    return `## איך לפתוח את השיחה הזאת
${v.directive}
זה חל על ההודעה הראשונה שלך בלבד. מכאן והלאה תתנהג רגיל לפי מה שכתוב למטה.

`
}

const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

// 'YYYY-MM-DD' → '9 באוגוסט 2026'. Never let the model do this itself.
export function formatHebrewDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
    if (!m) return String(iso || '')
    const month = HE_MONTHS[Number(m[2]) - 1]
    if (!month) return iso
    return `${Number(m[3])} ב${month} ${m[1]}`
}

// Small date helper — the agent gets dates as strings and never computes
// them itself, so this is the one place a day can be added.
export function addDaysISO(iso, days) {
    const d = new Date(`${iso}T12:00:00Z`)
    if (Number.isNaN(d.getTime())) return iso
    d.setUTCDate(d.getUTCDate() + Number(days || 0))
    return d.toISOString().slice(0, 10)
}

export function buildFollowUpPrompt(lead, todayISO, { isFinal = false } = {}) {
    // The last message is a different message, and telling the model
    // "this is the third one" is not enough — it will still write a
    // nudge. Naming it as the goodbye is what produces a goodbye, and a
    // clean exit gets replies that a fourth reminder never would.
    const finalBlock = isFinal
        ? `

## זו ההודעה האחרונה שהלקוח הזה יקבל
אל תבקש כלום ואל תנסה לסגור. סגור מעגל יפה: תודה, דלת פתוחה,
ובלי "רק רציתי לוודא". משפט או שניים, וזהו. stage="closed_lost".`
        : ''

    return `${buildSystemPrompt(lead, todayISO)}

## המשימה עכשיו שונה
הלקוח לא ענה. אתה כותב פולו-אפ יזום — לא תשובה.
זה הפולו-אפ מספר ${(lead.followUpCount || 0) + 1}.${finalBlock}

כללים לפולו-אפ:
- התחבר למשהו ספציפי שנאמר בשיחה. "רק בודק מה קורה" זו הודעה שנמחקת.
- הודעה אחת. קצרה. בלי לחץ ובלי אשמה.
- אם הוא הבטיח לחזור — הזכר את זה בעדינות, בלי לגבות חוב.
- פולו-אפ שלישי ומעלה: סגור מעגל בכבוד, השאר דלת פתוחה,
  והחזר stage="closed_lost".
- בפולו-אפ מותר לשלוח תמונה רק אם עוד לא שלחת לו אף אחת, והיא זו
  שנותנת את הסיבה להודעה. אחרת image=null.

אותו פורמט JSON בדיוק, ואותם כללי כתיבה, כולל האיסור על מקף ארוך.`
}

export default buildSystemPrompt
