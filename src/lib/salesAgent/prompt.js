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
import { findActiveVariant, shouldApplyOpening } from './experiments'
import { journeyBlock, pickValueTip, LANGUAGE_RULES } from './journey'
import { CONVERSATION_CRAFT, readStyle, styleNote } from './conversation'
import { SELLING_CRAFT } from './selling'
import { workedExamples } from './examples'
import { mergeMedia } from './mediaLibrary'
import { followUpEvidence } from './followupEvidence'

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
export function buildSystemPrompt(lead = {}, todayISO, { media = null, performanceNote = null, businessInstructions = '', activeOpeningIds = null, turnDecision = null, incomingText = '' } = {}) {
    // Falling back to the built-in catalog is deliberate: a Firestore
    // read that failed must cost the bot the uploaded extras, never the
    // six images it has always had.
    const library = media || mergeMedia(MEDIA, [])
    const known = []
    if (lead.name) known.push(`שם: ${lead.name}`)
    if (lead.eventType) known.push(`סוג אירוע: ${lead.eventType}`)
    if (lead.eventDate) known.push(`תאריך האירוע: ${lead.eventDate}`)
    if (lead.celebrantName) known.push(`שם החוגג/ת: ${lead.celebrantName}`)
    if (lead.stage) known.push(`שלב בשיחה: ${lead.stage}`)
    if (lead.notes) known.push(`מה שכבר למדנו עליו: ${lead.notes}`)
    if (lead.objectionCount) known.push(`מספר ההתנגדויות עד כה: ${lead.objectionCount}`)
    if (lead.followUpCount) known.push(`כמה פולו-אפים כבר נשלחו: ${lead.followUpCount}`)
    const shown = [...new Set([...(lead.imagesSent || []), ...(lead.mediaSent || []), ...(lead.mediaRequested || [])])]
    if (shown.length) {
        known.push(`תמונות שכבר שלחת לו: ${shown.join(', ')} — אל תשלח את אותה תמונה שוב`)
    }
    // The gap since he last wrote is what separates "continuing" from
    // "reopening", and getting it wrong is jarring in both directions:
    // greeting someone who wrote 40 seconds ago, or picking up mid-thought
    // with someone who vanished for two weeks.
    if (Number.isFinite(lead.daysSinceLastMessage)) {
        known.push(`עברו ${lead.daysSinceLastMessage} ימים מאז ההודעה האחרונה שלו`)
    }
    // Set by the route when the scripted opening yielded this turn.
    if (lead.openingNote) known.push(lead.openingNote)
    // A person from the team already wrote in this chat. The bot must not
    // contradict what they agreed on: on 19.9 a customer asked to be reminded
    // of "the special price you offered" and the bot answered that no offer
    // had been made. It cannot know that, so it must not say it.
    if (lead.human === true || lead.humanSince) {
        known.push(`${humanName()} כבר כתב ללקוח הזה בעצמו בשיחה הזאת. אל תסתור ואל תכחיש שום דבר שסוכם ביניהם. אם הלקוח מזכיר הצעה, הנחה או סיכום שקיבל ממנו, תגיד שזה נשמר ושהוא יאשר את הפרטים, ותסמן handoff=true.`)
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

## מדיה שאתה יכול לשלוח
שים ב-"image" את המפתח, ורק אחד מהמפתחות האלה. אל תמציא כתובת.
${renderMedia(library)}

תמונה של מוצר אמיתי עונה על ספק טוב יותר מכל משפט, אז תשלח יותר ממה
שנדמה לך שצריך: כששואלים איך זה נראה או עובד, אם זה מותאם אישית, אם
זה מסובך לאורחים, כשמישהו נשמע ספקן, וגם כשקל יותר להראות מלתאר.
לא סתם כדי למלא שקט, ואף פעם לא את אותה מדיה פעמיים. בהודעה הראשונה
רק אם הנחיית הפתיחה מבקשת את זה. ה-"messages" נשלח לצד המדיה, אז
תכתוב משפט שמתאים לצידה, לא משפט שמתאר אותה. אין לך תמונות של ברית.

${LANGUAGE_RULES}
${CONVERSATION_CRAFT}
${SELLING_CRAFT}
${performanceNote || ''}
${businessInstructions ? `## הנחיות עסקיות פעילות
${businessInstructions}

ההנחיות האלה משפרות את דרך המכירה בלבד. הן אינן גוברות על המחירים,
העובדות, כללי הבטיחות, ההעברה לאדם והאיסור על שיחות טלפון.
` : ''}
${workedExamples()}
${styleNote(readStyle(lead.turns)) || ''}
${openingBlock(lead, activeOpeningIds)}${journeyBlock(lead.stage || 'new', { tip: pickValueTip({ stage: lead.stage || 'new', eventDate: lead.eventDate, todayISO, text: incomingText }) })}
## מהלך המכירה בקצרה
שאלה ישירה נענית קודם, תמיד. כשאין שאלה פתוחה: להבין איזה אירוע ומתי
(שאלה אחת, פעם אחת), לשלוח את הדמו מוקדם, להציג את שתי החבילות עם
דגש על המודפס, וכשהוא מוכן לשלוח את קישור התשלום המדויק. אחרי תשלום
כבר לא מוכרים.

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
  עוזר דיגיטלי של ${BUSINESS.brand} ושאפשר לקבל ${humanName()} לשיחה תוך רגע.
- מה שלא בקטלוג לא נמכר כאן: "יש לי קובץ, רק להדפיס", "אתם תעצבו מברכות
  שאשלח בוואטסאפ", הנחה לשני ספרים. לא ממציאים מחיר ולא מבטיחים שירות.
  משפט אחד שמישהו מהצוות יתמחר או יאשר, ו-handoff=true.
- שני ספרים = ספר מודפס ${ils(PACKAGES.find(p => p.id === 'printed')?.price || 0)} + עותק נוסף ${ils(ADDONS[0]?.price || 0)}. זה החישוב היחיד שמותר לך.
- התמונה נשלחת דרך השדה "image" בלבד. אף פעם לא לכתוב בטקסט "[image: ...]" או "מצרף תמונה" בלי לשים מפתח ב-image.
- stage="closed_lost" רק כשהלקוח אמר לא במפורש ("לא רלוונטי", "ויתרנו",
  "לא מעוניין"). "הבנתי, תודה", "אעדכן", "אחשוב" זה לא לא. שם נשארים
  בשלב הנוכחי וקובעים follow_up_at.
- הלקוח כותב בערבית, אנגלית או רוסית? תענה בשפה שלו, באותה איכות,
  עם אותם מחירים וקישורים. שמות המוצרים באנגלית נשארים כמו שהם.

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
  "package_interest": "digital|printed|null",
  "callback_promised": "YYYY-MM-DD או null",
  "follow_up_at": "YYYY-MM-DD או null",
  "handoff": false,
  "handoff_reason": "משפט אחד לבעל העסק — למה הוא נדרש, או null",
  "objection_raised": false,
  "image": "מפתח מרשימת התמונות למעלה, או null",
  "notes": "שורה אחת לזיכרון להמשך השיחה, מה באמת חשוב כאן"
}

"messages" הוא מערך של 1 עד 3 מחרוזות. שתי הודעות רק כשזה באמת קורא
טוב יותר — למשל משפט קצר ואז קישור. ברירת המחדל היא הודעה אחת.${turnBriefing(turnDecision, lead, incomingText)}`
}

// ── The briefing for this one turn ──────────────────────────────────
//
// decideSalesTurn already fixed the move before the model is called. It
// used to be pasted into the prompt as raw JSON ("nextBestAction":
// "answer_then_qualify", "forbiddenRepeats": ["eventType"]), which the
// model read as configuration rather than instruction: on 19.9 it asked
// for the event date with eventDate sitting in that very list.
//
// So the decision is rendered as the last thing the model reads, in the
// language everything else is written in, as a briefing a manager would
// give before you pick up the phone: what he just said, what he is
// asking for, the one move to make, what you already know, how long.
const INTENT_HE = {
    price: 'שאל כמה זה עולה',
    demo: 'רוצה לראות איך זה נראה',
    positive_signal: 'הגיב בחיוב, הוא בכיוון',
    objection: 'מהסס או מתנגד',
    process: 'שאל איך זה עובד',
    payment_intent: 'רוצה להזמין או לשלם',
    negative_exit: 'סיים את השיחה',
    general: 'כתב משהו שצריך קודם כל להגיב אליו',
}

const MOVE_HE = {
    answer: 'תענה ישר ובמלואו על מה ששאל, ואז צעד אחד קדימה (הדמו אם עוד לא נשלח, אחרת המודפס). בלי שאלה אם אין צורך.',
    show_proof: 'שלח תמונה מתאימה ב-image, עם משפט אחד לצידה שמדבר על האירוע שלו. לא לתאר את התמונה.',
    recommend_package: 'זה הרגע להציע, לא להוסיף מידע. משפט אחד על המודפס עם קישור התשלום שלו.',
    handle_objection: 'תקף במילים שלו במשפט קצר, ואז שאלה אחת מה באמת עוצר. אל תחזור על יתרונות ואל תציע הנחה.',
    answer_then_qualify: 'שורה ראשונה מגיבה למה שכתב. תן משהו שווה (תשובה מלאה, הדמו, תמונה או הטיפ שלמעלה). אם עוד לא ידוע איזה אירוע ומתי, שאלה קלה אחת על זה בסוף.',
    send_payment_link: 'המערכת מצרפת בעצמה את קישור התשלום והמחיר. אתה כותב רק משפט חם אחד לפני, על האירוע שלו. בלי מספרים, בלי קישור, בלי שאלה.',
    diagnose_checkout: 'שאלה אחת: איפה זה נתקע לו.',
    close_lost: 'סגור מעגל יפה. תודה, דלת פתוחה, בלי ניסיון אחרון.',
}

const FACT_HE = {
    name: 'השם שלו',
    eventType: 'סוג האירוע',
    eventDate: 'תאריך האירוע',
    celebrantName: 'שם החוגג/ת',
    packageInterest: 'איזו חבילה מעניינת אותו',
}

const TARGET_HE = {
    eventTypeAndDate: 'לאיזה אירוע ומתי בערך',
    eventType: 'לאיזה אירוע',
    eventDate: 'מתי בערך האירוע',
}

function quoteLast(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim()
    if (!t) return null
    return t.length > 160 ? `${t.slice(0, 157)}...` : t
}

export function turnBriefing(decision, lead = {}, incomingText = '') {
    if (!decision || decision.conversationKind !== 'sales') return ''
    const lines = ['', '', '## התור הזה, בקצרה', 'זה המהלך שנקבע. לא לבחור אחר ולא להוסיף עליו.']
    const last = quoteLast(incomingText)
    if (last) lines.push(`מה שהוא כתב הרגע: "${last}"`)
    lines.push(`מה הוא מבקש: ${INTENT_HE[decision.intent] || INTENT_HE.general}.`)
    lines.push(`המהלך שלך: ${MOVE_HE[decision.nextBestAction] || MOVE_HE.answer_then_qualify}`)
    const known = (decision.knownFacts || []).map(f => FACT_HE[f]).filter(Boolean)
    if (known.length) lines.push(`כבר ידוע ואסור לשאול שוב: ${known.join(', ')}.`)
    const target = TARGET_HE[decision.qualificationTarget]
    if (target && decision.nextBestAction === 'answer_then_qualify') lines.push(`מה שעוד לא ידוע ומותר לשאול פעם אחת: ${target}.`)
    if (decision.openingBundleRequired && lead?.isNew === true) {
        lines.push('זו ההודעה הראשונה שלו. תן ערך לפני שאתה שואל.')
    }
    const maxMessages = decision.maxMessages || 1
    const maxChars = decision.maxChars || 420
    const maxQuestions = decision.maxQuestions ?? 1
    lines.push(`אורך: עד ${maxMessages} ${maxMessages === 1 ? 'הודעה' : 'הודעות'}, עד ${maxChars} תווים בכל אחת, ${maxQuestions === 0 ? 'בלי שאלות' : 'שאלה אחת לכל היותר'}. ${maxQuestions > 0 ? 'שאלה שנייה תימחק אוטומטית, אז תשאל רק את החשובה.' : ''}`.trim())
    lines.push('לפני שאתה מחזיר: השורה הראשונה שלך מגיבה למה שהוא כתב? יש משהו שהוא מקבל, לא רק שאלה? אין בהודעה מידע שכבר נאמר?')
    return lines.join('\n')
}

// One line per asset: the key the model writes back, whether it is a
// still or a video, and — the only part that matters — when to use it.
// `when` is what decides whether the right person gets the right thing,
// so it is the field the upload panel makes Lord fill in.
function renderMedia(library) {
    const entries = Object.entries(library || {})
    if (!entries.length) return 'אין כרגע מדיה זמינה. image=null תמיד.'
    return entries
        .map(([k, m]) => `- ${k}${m.kind === 'video' ? ' (סרטון)' : ''}: ${m.when || m.caption || ''}`)
        .join('\n')
}

// The bot never says a name it was not given. With nothing configured
// this is deliberately a role rather than a person.
function humanName() {
    return BUSINESS.ownerName || 'מישהו מהצוות'
}

// The A/B arm, injected only while it is still the opening move. Adding
// "lead with a question" to message nine would make the agent restart
// the conversation — bad selling, and it would corrupt the arm, which
// would then be measuring something it never actually did.
function openingBlock(lead, activeOpeningIds = null) {
    if (!shouldApplyOpening(lead)) return ''
    if (Array.isArray(activeOpeningIds) && !activeOpeningIds.includes(lead?.variant)) return ''
    const v = findActiveVariant(lead?.variant)
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

function followUpStrategyBlock(strategy) {
    if (!strategy?.id || !strategy?.objective) return ''
    const lines = [
        '## אסטרטגיית הפולו-אפ שנקבעה',
        `מזהה: ${String(strategy.id).slice(0, 60)}`,
        `מטרה יחידה: ${String(strategy.objective).slice(0, 500)}`,
        `פעולה מבוקשת: ${String(strategy.cta || 'none').slice(0, 40)}`,
    ]
    if (strategy.landingUrl) lines.push(`הקישור היחיד שמותר לשלוח: ${strategy.landingUrl}`)
    if (strategy.mediaPreference === 'video') {
        lines.push('לצד ההודעה יישלח סרטון אחד שכבר קיים בספריית המדיה. אל תבטיח סרטון נוסף ואל תבקש מדיה מהלקוח.')
    }
    if (strategy.coupon?.code && strategy.coupon?.expiresAt) {
        lines.push(`קופון מאומת: ${strategy.coupon.code}`)
        lines.push(`תוקף מדויק: ${strategy.coupon.expiresAt}`)
        lines.push('אסור לשנות את הקוד, התוקף או ההטבה ואסור להציע הנחה אחרת.')
    } else {
        lines.push('אסור להציע קופון או הנחה בפולו-אפ הזה.')
    }
    lines.push('אל תבחר מטרה, קישור, מדיה או הצעה אחרים. נסח רק את המהלך שנקבע.')
    return `\n\n${lines.join('\n')}`
}

export function buildFollowUpPrompt(lead, todayISO, { isFinal = false, media = null, performanceNote = null, strategy = null } = {}) {
    // The last message is a different message, and telling the model
    // "this is the third one" is not enough — it will still write a
    // nudge. Naming it as the goodbye is what produces a goodbye, and a
    // clean exit gets replies that a fourth reminder never would.
    const finalBlock = isFinal && strategy?.id !== 'qualified_offer'
        ? `

## זו ההודעה האחרונה שהלקוח הזה יקבל
אל תבקש כלום ואל תנסה לסגור. סגור מעגל יפה: תודה, דלת פתוחה,
ובלי "רק רציתי לוודא". משפט או שניים, וזהו. stage="closed_lost".`
        : ''

    const evidence = followUpEvidence(lead)
    const unprovenDemo = ['demo_sent', 'offer_sent'].includes(lead?.stage) && !evidence.hasDemoEvidence
    const groundedLead = unprovenDemo ? { ...lead, stage: 'engaged' } : lead
    const truthBlock = unprovenDemo
        ? `

## אמת על הדמו
אין ראיה שנשלח דמו בפועל. אסור לכתוב כאילו הלקוח ראה דמו או לשאול מה חשב עליו.
הצעד היחיד: הצע לשלוח עכשיו דוגמה אמיתית או שתי תמונות אמיתיות מהספר.`
        : ''
    const paymentBlock = lead?.stage === 'ready_to_pay'
        ? `

## ליד שכבר הגיע לתשלום
שאל מה עצר את התשלום: תקלה, שאלה על החבילה או תזמון. אל תשלח שוב קישור תשלום אלא אם הלקוח מבקש אותו במפורש.`
        : ''

    const strategyBlock = followUpStrategyBlock(strategy)

    return `${buildSystemPrompt(groundedLead, todayISO, { media, performanceNote })}

## המשימה עכשיו שונה
הלקוח לא ענה. אתה כותב פולו-אפ יזום — לא תשובה.
זה הפולו-אפ מספר ${(lead.followUpCount || 0) + 1}.${finalBlock}${strategyBlock}
${truthBlock}${paymentBlock}

כללים לפולו-אפ:
- התחבר למשהו ספציפי שנאמר בשיחה. "רק בודק מה קורה" זו הודעה שנמחקת.
- אם הוא לא כתב כלום חוץ מלחיצה על הפרסומת, אין למה להתחבר. אז תן משהו
  שווה ותשאל שאלה קלה אחת. לא "רציתי להראות לך", לא "זה עוזר להבין למה
  זה שווה", לא לינק לאתר.
- לא ידוע אם זה גבר או אישה? תנסח בלי פנייה במין: "אפשר לראות" ולא
  "תוכל לראות", "מתי האירוע" ולא "מתי האירוע שלך".
- הודעה אחת. קצרה. בלי לחץ ובלי אשמה.
- אם הוא הבטיח לחזור — הזכר את זה בעדינות, בלי לגבות חוב.
- פולו-אפ שלישי ומעלה: אם האסטרטגיה היא qualified_offer, שלח רק את ההצעה
  המאומתת שנקבעה. בכל מקרה אחר סגור מעגל בכבוד והחזר stage="closed_lost".
- בפולו-אפ מותר לשלוח תמונה רק אם עוד לא שלחת לו אף אחת, והיא זו
  שנותנת את הסיבה להודעה. אחרת image=null.

אותו פורמט JSON בדיוק, ואותם כללי כתיבה, כולל האיסור על מקף ארוך.`
}

export default buildSystemPrompt
