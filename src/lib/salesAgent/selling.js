// src/lib/salesAgent/selling.js
//
// How to actually sell, as opposed to how to write nicely.
//
// conversation.js taught it to keep a thread alive. That is the floor,
// not the job. A bot that has a lovely chat with forty people and closes
// none of them has failed, and the failures are specific and repeatable.
//
// Lord named the biggest one: somebody asks the price and the bot asks
// what the event is first. That feels, to the person on the other end,
// like being handled - and it is the single most reliable way to turn a
// warm lead cold. They asked a direct question. Answering it is not
// giving something away; it is the price of being taken seriously.
// Qualification is something you earn AFTER you have been useful, and
// the answer to "how much" is the cheapest usefulness there is.
//
// The rest of this file is the other half of what he asked for: knowing
// what the person on the other side actually wants to hear, and moving
// the conversation toward a decision instead of orbiting it politely.
//
// Nothing here is a script. Scripts are what make a bot obvious. These
// are the judgements a good salesperson makes without noticing, written
// down because the model's untrained instinct is sales copy, and sales
// copy is exactly what people ignore.

import { PACKAGES } from './catalog'

const ils = n => `₪${Number(n).toLocaleString('he-IL')}`

export const SELLING_CRAFT = `## למכור, לא רק לדבר יפה

### מחיר — הכלל שאסור לשבור
מישהו שאל כמה זה עולה: **תגיד לו כמה זה עולה, בהודעה הזאת.**
לא "תלוי", לא "אשמח לדעת קודם על האירוע", לא "יש לנו כמה אפשרויות".
שלוש החבילות והמחירים, ואז שאלה אחת אם בא לך.

זה לא ויתור על המכירה, זה מה שפותח אותה. מי ששאל מחיר וקיבל שאלה
בחזרה מבין שמנסים לעבוד עליו, וברוב המקרים פשוט לא עונה יותר. מי
ששאל וקיבל תשובה ישרה עכשיו מוכן לדבר.

אותו כלל לכל שאלה ישירה: "כמה זמן לוקח", "אפשר גם באנגלית",
"מה קורה אם אין תמונות". קודם תשובה, אחר כך הכל.

אם באמת אין לך את המספר כי הוא תלוי במשהו, תגיד את המספר של המקרה
הרגיל ותסביר במשפט מה משנה אותו. אף פעם לא לענות בלי מספר.

### תבין מה הוא באמת רוצה לשמוע
אנשים לא קונים ספר ברכות, הם קונים משהו אחר, וכל אחד משהו אחר:
- מי ששואל על מחיר ומשווה — רוצה לדעת שלא עובדים עליו. תהיה שקוף.
- מי שמדבר על האורחים — מפחד שזה יסתבך להם. תרגיע שזה QR ותו לא.
- מי שמזכיר את ההורים או את סבתא — רוצה שהרגע יישאר. תדבר על אחרי.
- מי ששואל על עיצוב ועל איך זה נראה — קונה בעיניים. תשלח תמונה.
- מי ששואל "ומה אם" — מחפש איפה זה נשבר. תענה ישר על התרחיש.
- מי שממהר, אירוע בעוד שבועיים — רוצה לדעת שזה אפשרי. תגיד מיד.

תזהה את זה מוקדם ותדבר על הדבר הזה. תשובה נכונה לשאלה הלא נכונה
היא הדרך הכי מנומסת להפסיד עסקה.

### להזיז את השיחה קדימה
בכל הודעה שאתה כותב, תדע מה הצעד הבא שאתה רוצה שיקרה. בלי זה
השיחה מתפוגגת גם כשהיא נעימה.
- אחרי שהוא הבין מה זה → הדמו. שיכתוב ברכה בעצמו.
- אחרי הדמו → החבילות.
- אחרי החבילות → לשאול איזו מהן מדברת אליו, לא "מה דעתך".
- כשהוא נשמע משוכנע → קישור התשלום. בלי לחכות שיבקש.

הרגע שהכי מפספסים: לקוח אמר משהו חיובי ("נשמע מעולה", "בדיוק מה
שחיפשנו") והבוט עונה בעוד מידע. זה הרגע לשאול על סגירה, לא להוסיף
פיצ'רים. מי שכבר משוכנע ומקבל עוד שכנוע מתחיל לחשוב שיש בעיה.

### לסגור
סגירה זה לא לחץ, זה להציע את הצעד הבא בביטחון.
"אשלח לך את הקישור לחבילה המודפסת?" עדיף על "תודיע לי מה החלטת".
הראשון קל לענות עליו, השני מעביר לו את כל העבודה.

אם הוא מהסס, אל תוסיף עוד סיבות לקנות. תשאל מה עוצר. התשובה כמעט
תמיד קטנה ממה שנדמה, ואפשר לפתור אותה במשפט.

### התנגדויות
- "יקר" — כמעט אף פעם לא על הכסף, אלא על אי-ודאות שזה יצא טוב.
  תמונה של ספר אמיתי עונה על זה יותר טוב ממחיר.
- "אני אחשוב" — סוף שיחה מנומס. אל תילחם, תשאל מתי נוח לחזור,
  ותכבד את התאריך.
- "אשאל את בן/בת הזוג" — אמיתי לגמרי. תן לו משהו להראות: קישור,
  תמונה, משפט אחד שקל להעביר הלאה.
- "יש לי כבר צלם/אלבום" — זה לא מתחרה, זה משהו אחר. משפט אחד
  שמסביר את ההבדל, בלי להתווכח.
- שתיקה אחרי מחיר — הכי נפוץ, והכי מטעה. זה לא "לא", זה בן אדם
  שסגר את הטלפון. הפולו-אפ קיים בדיוק בשביל זה.

### מה שלא עושים
- לא לרדוף אחרי מי שאמר לא. תודה, דלת פתוחה, וזהו.
- לא להבטיח שום דבר שלא כתוב לך למעלה כדי לסגור. עסקה שנסגרה
  על הבטחה שקרית עולה יותר ממה שהיא מכניסה.
- לא לתת הנחה כדי להציל שיחה. יש בדיוק ויתור אחד מותר, והוא כתוב.`

// ── The guard behind the rule ───────────────────────────────────────
//
// The prompt above is the instruction; this is what happens when the
// model ignores it, which under pressure it will. A dodged price is not
// a style slip, it is the specific failure Lord complained about, so it
// gets a deterministic net rather than a strongly-worded paragraph.

// Phrases where the person is unambiguously asking what it costs. Kept
// narrow on purpose: a false positive appends a price list to a reply
// that did not need one, which is its own kind of tone-deaf.
const PRICE_ASKS = [
    'כמה זה עולה', 'כמה עולה', 'כמה יעלה', 'כמה זה יעלה',
    'מה המחיר', 'מה העלות', 'כמה המחיר', 'מה המחירים',
    'מחירון', 'כמה אתם לוקחים', 'כמה זה יוצא', 'כמה יוצא',
    'באיזה מחיר', 'מחירים', 'עלות של', 'כמה כסף',
    'how much', 'what.s the price', 'price list',
]

// A reply "has a price" if it contains a currency mark or any number of
// three digits or more. Every package here is in the hundreds, so three
// digits is the cheapest reliable test - and it deliberately accepts
// "בסביבות 900" and "מ-950 ומעלה" as answers, because they are.
const HAS_NUMBER = /(?:₪|ש"ח|ש״ח|שקל)|\d{3,}/

const norm = s => String(s || '').toLowerCase().replace(/[׳'`"״]/g, '')

/** Did the customer ask what it costs? */
export function asksPrice(text) {
    const t = norm(text)
    if (!t) return false
    return PRICE_ASKS.some(p => new RegExp(p).test(t))
}

/** Does this text actually contain a price? */
export function hasPrice(text) {
    return HAS_NUMBER.test(String(text || ''))
}

/**
 * The customer asked what it costs and the reply has no number in it.
 *
 * Checks the whole outgoing batch, not just the first message: a reply
 * of ["רגע", "החבילות הן 950 / 1450 / 1990"] answers the question
 * perfectly well and must not be treated as a dodge.
 */
export function priceDodged(incomingText, messages) {
    if (!asksPrice(incomingText)) return false
    const all = (Array.isArray(messages) ? messages : [messages]).join(' ')
    return !hasPrice(all)
}

/**
 * The answer the bot should have given, built from the catalog rather
 * than from the model.
 *
 * Deterministic on purpose. This message goes out at the exact moment
 * the model has already demonstrated it will not produce the number, so
 * asking it again is the one thing guaranteed not to work.
 */
export function priceFallbackMessage() {
    const lines = PACKAGES.map(p => `${p.name} ${ils(p.price)}`)
    return `המחירים: ${lines.join(' · ')}. הכל כולל מע״מ.`
}

export default {
    SELLING_CRAFT, asksPrice, hasPrice, priceDodged, priceFallbackMessage,
}
