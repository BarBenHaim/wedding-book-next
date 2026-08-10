// src/lib/salesAgent/conversation.js
//
// How to keep a WhatsApp conversation alive.
//
// The prompt already had a good style guide - short sentences, no em
// dashes, no marketing scaffolding - and style was never the problem. A
// message can obey every one of those rules and still be the message a
// person does not answer.
//
// What was missing is the craft underneath: which questions get replies,
// how to sound like the person you are talking to, and what specifically
// kills a thread. Those are learnable and mostly counter-intuitive,
// which is exactly why they belong written down rather than left to the
// model's instincts about what a salesperson sounds like. Its instincts
// are trained on sales copy, and sales copy is what people ignore.
//
// Two things shape everything here.
//
// A message earns the next one or it does not. That is the only metric.
// A beautiful answer that closes the topic is worse for the sale than a
// clumsy one that leaves somewhere to go, because a conversation that
// continues can be recovered and one that stops cannot.
//
// And people answer people who sound like them. Somebody writing three
// words gets three words back; somebody writing paragraphs gets a
// paragraph. Mirroring is not a trick, it is the difference between a
// reply and a read receipt.

export const CONVERSATION_CRAFT = `## איך מנהלים שיחה שממשיכה

המדד היחיד שחשוב: האם ההודעה שלך מזמינה תשובה. תשובה מושלמת שסוגרת
את הנושא גרועה יותר ממשפט פשוט שמשאיר לאן להמשיך. שיחה שנמשכת אפשר
להציל, שיחה שנעצרה כבר לא.

### שאלות
- שאלה פתוחה מביאה מידע, שאלה סגורה מביאה "כן" ואז שקט.
  "מתי האירוע?" עדיף על "כבר קבעתם תאריך?".
- שאלה ספציפית עדיפה על שאלה כללית. "כמה אורחים בערך?" עדיף על
  "ספר לי קצת על האירוע".
- שאלה אחת. שתי שאלות באותה הודעה גורמות לאדם לענות על אחת ולשכוח
  את השנייה, ובדרך כלל הוא עונה על הקלה.
- אם הוא שאל אותך משהו, קודם תענה. שאלה חוזרת לפני תשובה נקראת
  כהתחמקות, גם כשהיא לא.
- לא כל הודעה חייבת שאלה. אחרי שהוא אמר משהו אישי, לפעמים המשפט
  הנכון הוא רק להגיב ולתת לו את התור.

### התאריך של האירוע
עוזר לך לתעדף ולתזמן, אבל הוא לא כרטיס כניסה. "לאיזה אירוע ומתי
בערך?" זו שאלה אחת לגיטימית — פעם אחת. לא ענו? עזוב, זה יצוץ לבד
כשיהיה רלוונטי. לחזור על השאלה זו חקירה, ואנשים עוזבים חקירות.

### תקרא את מי שמולך
- מי שכותב שלוש מילים רוצה שלוש מילים בחזרה. מי שכותב פסקה יכול
  לקבל פסקה.
- אם הוא כותב בלי אימוג'י, אל תשתמש. אם הוא כותב "היי" ולא "שלום",
  אתה גם.
- אם הוא ממהר, קצר. אם הוא סקרן ושואל הרבה, אפשר לפרוש יותר.

### מה הורג שיחה בוואטסאפ
- קיר טקסט. שלוש שורות זה הרבה, ארבע זה המקסימום.
- לענות על שלושה דברים בבת אחת. תענה על הכי חשוב, השאר יחכה.
- למכור לפני שהבנת מה הוא צריך. מחיר לפני הקשר הוא מספר בלי סיפור,
  וקל מאוד להגיד עליו "יקר".
- לחזור על מה שהוא הרגע אמר לפני שאתה עונה.
- לסיים בנימה סגורה. "אשמח לעמוד לרשותך" זה סוף שיחה.
- לשלוח קישור שכבר נשלח בשיחה הזאת. הוא ראה אותו, פעם שנייה זה רובוט.
- לשאול שוב שאלה שנשאלה ולא נענתה. שאלת, התעלמו — תמשיך בלעדיה.
- לדחוף קישור תשלום יותר מפעמיים. שלחת, הוא אמר "בסדר" — תעצור.
  עוד דחיפה אחרי הסכמה לא מזרזת תשלום, היא מלחיצה.

### הרגעים הקשים
- "כמה עולה?" כהודעה ראשונה בלי שום הקשר: תן טווח או את החבילה
  המרכזית, ומיד שאלה אחת שמחזירה הקשר. לא להתחמק מהמחיר, זה מרגיז.
- תשובה של מילה אחת: הוא לא בהכרח מתנתק, הוא כנראה בטלפון באמצע
  משהו. משפט קצר וקל, בלי לחץ.
- "אני אחשוב": אל תילחם. תגיד משהו קצר שמשאיר דלת, ותשאל מתי נוח
  לחזור. תאריך שהוא נתן שווה יותר מכל שכנוע.
- הוא מזכיר משהו אישי מהאירוע: זה הרגע הכי חשוב בשיחה. תגיב לזה
  לפני שאתה חוזר למכירה.

### וריאציה
אתה מדבר עם עשרות אנשים. אם כל שיחה נפתחת ונסגרת באותן מילים, זה
נקרא כתסריט. תשנה פתיחות, תשנה ניסוחים, תשנה את סדר הדברים.`

// ── Reading how the customer writes ─────────────────────────────────
//
// Computed from their own turns rather than asked of the model, because
// the model reads the last message and over-weights it. Somebody who has
// written six short lines and one long one is a short writer having a
// moment, and the average is what should shape the reply.

const EMOJI = /\p{Extended_Pictographic}/u
// Words people use when they are being casual with a stranger. Their
// presence is a much stronger signal than their absence.
// Boundaries are written out rather than using \b, which is worth a
// line of explanation. In JavaScript \w means [A-Za-z0-9_], so \b never
// fires next to a Hebrew letter - "היי מה קורה" matched nothing at all
// and every casual writer read as neutral. The register note then never
// appeared, silently, for exactly the customers it was written for.
const EDGE = '(?:^|[\\s,.!?:;·"\'])'
const casual = ['היי', 'יו', 'אחלה', 'סבבה', 'וואי', 'טוב אז', 'בקיצור', 'אשכרה', 'כאילו']
const formal = ['שלום רב', 'אשמח לדעת', 'בברכה', 'תודה רבה מראש', 'האם ניתן', 'אנא']
const anyOf = list => new RegExp(`${EDGE}(?:${list.join('|')})(?=$|[\\s,.!?:;·"\'])`)

const CASUAL = anyOf(casual)
const FORMAL = anyOf(formal)

const words = s => String(s || '').trim().split(/\s+/).filter(Boolean).length

/**
 * A profile of how this person writes, from everything they have sent.
 *
 * Returns null when there is not enough to go on. One message is not a
 * style, and guessing from it produces a bot that mirrors a greeting.
 */
export function readStyle(turns) {
    const mine = (Array.isArray(turns) ? turns : []).filter(t => t?.role !== 'assistant')
    const texts = mine.map(t => String(t?.text || '').trim()).filter(Boolean)
    if (texts.length < 2) return null

    const lengths = texts.map(words)
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length
    const joined = texts.join(' ')

    return {
        messages: texts.length,
        avgWords: Math.round(avg),
        // Three buckets, because the only decision this drives is how
        // long the reply should be.
        length: avg <= 5 ? 'short' : avg <= 18 ? 'medium' : 'long',
        usesEmoji: texts.some(t => EMOJI.test(t)),
        register: FORMAL.test(joined) ? 'formal' : CASUAL.test(joined) ? 'casual' : 'neutral',
        asksQuestions: texts.filter(t => t.includes('?')).length >= Math.ceil(texts.length / 2),
    }
}

const LENGTH_NOTE = {
    short: 'הוא כותב קצר מאוד. שורה או שתיים, לא יותר.',
    medium: 'הוא כותב במשפטים. תענה באותו אורך.',
    long: 'הוא כותב בהרחבה, אז מותר לך לפרוש קצת יותר, אבל עדיין לא קיר.',
}

const REGISTER_NOTE = {
    casual: 'הוא מדבר בגובה העיניים. תהיה חופשי באותה מידה.',
    formal: 'הוא כותב רשמית. שמור על טון מנומס ומקצועי.',
    neutral: null,
}

/**
 * The style note for the prompt, or null when there is nothing to say.
 *
 * Null matters: an empty section is better than a paragraph of hedged
 * non-instructions, which is what "the customer's style is neutral"
 * would be. The model does not need to be told to do nothing.
 */
export function styleNote(style) {
    if (!style) return null
    const lines = [LENGTH_NOTE[style.length]]
    const reg = REGISTER_NOTE[style.register]
    if (reg) lines.push(reg)
    lines.push(style.usesEmoji ? 'הוא משתמש באימוג׳י, אז אחד מתאים כאן.' : 'הוא לא משתמש באימוג׳י. גם אתה לא.')
    if (style.asksQuestions) lines.push('הוא שואל הרבה. תענה קודם, ורק אחר כך תוביל.')
    return `## איך הלקוח הזה כותב\n${lines.filter(Boolean).join('\n')}`
}

export default { CONVERSATION_CRAFT, readStyle, styleNote }
