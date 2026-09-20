// src/lib/salesAgent/journey.js
//
// The customer journey, written down.
//
// Before this file the agent had one prompt describing a five-step
// funnel and improvised the rest. That produces a competent salesperson
// with no memory of what good looks like at each moment: it will pitch
// packages to someone who has not said what event they are having, or
// ask another qualifying question to someone who has just asked for the
// payment link.
//
// So each stage gets a written brief — one goal, a short list of what to
// do, and a shorter list of what not to. Only the brief for the lead's
// CURRENT stage is injected, which keeps the prompt small and, more
// importantly, keeps the agent from reading nine sets of instructions
// and averaging them.
//
// This file is also the thing to edit when a conversation goes badly.
// The A/B test in experiments.js answers "which opening wins" over
// months; this answers "what should have happened in message four" and
// can be fixed the same afternoon.

// ── Things worth giving away ────────────────────────────────────────
//
// A sales agent that only ever asks is a nuisance. These are real,
// specific and useful to a parent planning an event, and they cost
// nothing to give. They also happen to fix the product's weakest point:
// a book is only as good as the number of guests who actually wrote in
// it, and most of these raise that number.
//
// Deliberately phrased as suggestions, never as statistics. "Doubles
// your blessings" would be an invented claim, and the whole design of
// this agent is that it never invents.
export const VALUE_TIPS = [
    {
        id: 'poster_placement',
        when: 'אחרי שסגרו, או כשמישהו שואל איך גורמים לאורחים באמת לכתוב',
        text: 'שווה למקם את הפוסטר ליד הכיבוד או בכניסה, לא ליד שולחן המתנות. שם אנשים עומדים כמה דקות ממילא.',
    },
    {
        id: 'mc_reminder',
        when: 'תכנון האירוע, או שאלה על כמה ברכות מגיעות בפועל',
        text: 'אם המנחה או הדיג׳יי מזכיר את זה פעם אחת באמצע הערב, זה עושה הבדל גדול יותר מכל שילוט.',
    },
    {
        id: 'family_group',
        when: 'לפני האירוע, במיוחד כשיש משפחה גדולה',
        text: 'אפשר לשלוח את הקישור בקבוצת הוואטסאפ המשפחתית יום לפני. מי שלא יגיע עדיין יכול לכתוב.',
    },
    {
        id: 'after_event',
        when: 'כששואלים מה קורה אם שכחו, או אחרי האירוע',
        text: 'הקישור נשאר פתוח גם אחרי האירוע, אז מי שפספס משלים מהבית ואפשר להוסיף ברכות עוד כמה ימים.',
    },
    {
        id: 'timing',
        when: 'כשהאירוע קרוב ויש לחץ של זמן',
        text: 'עמוד האורחים והפוסטר מוכנים תוך 48 שעות מאישור העיצוב, אז גם אירוע בעוד שבוע הוא ריאלי.',
    },
    {
        id: 'panel_fixes',
        when: 'כשחוששים מה האורחים יכתבו, משגיאות כתיב או מברכות מביכות',
        text: 'שום דבר לא נכנס לספר בלי שראיתם אותו. בפאנל מאשרים כל ברכה, מתקנים שגיאות כתיב ומסדרים את הסדר, ורק אז זה הולך לדפוס.',
    },
    {
        id: 'older_guests',
        when: 'כשמזכירים סבא וסבתא או אורחים מבוגרים שקשה להם עם טלפון',
        text: 'לסבא וסבתא לא צריך טלפון חכם. מישהו צעיר במשפחה יושב לידם דקה, וכותב את הברכה שלהם מהטלפון שלו, עם תמונה משותפת.',
    },
    {
        id: 'far_date',
        when: 'כשהאירוע רחוק והלקוח מרגיש שאין סיבה לסגור עכשיו',
        text: 'כשסוגרים מוקדם, הפוסטר וקישור האורחים מוכנים הרבה לפני, ואפשר לשלוח את הקישור עם ההזמנה. ככה מי שלא יגיע כותב עוד לפני האירוע.',
    },
]

// The one tip that fits THIS conversation, or null. The full list used to
// be pasted into every prompt with "pick one when it fits"; in practice the
// model either ignored it or read three of them out loud. One tip, chosen
// here from what the customer actually wrote and where the event sits in
// time, is something the model can drop into a sentence.
const NEAR_DAYS = 21
const FAR_DAYS = 75

function daysUntil(iso, todayISO) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/
    if (!m.test(String(iso || '')) || !m.test(String(todayISO || ''))) return null
    const a = Date.parse(`${iso}T12:00:00Z`)
    const b = Date.parse(`${todayISO}T12:00:00Z`)
    if (Number.isNaN(a) || Number.isNaN(b)) return null
    return Math.round((a - b) / 86_400_000)
}

const TIP_TRIGGERS = [
    { id: 'older_guests', re: /סבא|סבתא|מבוגר|קשיש|לא\s+יודע(?:ים|ת)?\s+להשתמש|לא\s+מסתדר(?:ים|ת)?\s+עם/ },
    { id: 'panel_fixes', re: /שגיא|כתיב|מביך|מה\s+יכתבו|יכתבו\s+שטויות|לשלוט|לאשר/ },
    { id: 'after_event', re: /שכח|פספס|אחרי\s+האירוע|האירוע\s+כבר|עבר\s+כבר|כבר\s+היה/ },
    { id: 'mc_reminder', re: /כמה\s+ברכות|באמת\s+יכתבו|יכתבו\s+בכלל|אנשים\s+לא\s+כותבים|ישתפו\s+פעולה/ },
    { id: 'family_group', re: /משפחה\s+גדולה|הרבה\s+אורחים|חו"?ל|לא\s+יגיע|בחו״ל|מחו"ל/ },
    { id: 'timing', re: /דחוף|בעוד\s+שבוע|נספיק|יספיק|מהר|בזמן\s+ל/ },
]

export function pickValueTip({ stage = 'new', eventDate = null, todayISO = null, text = '' } = {}) {
    const value = String(text || '')
    if (value) {
        for (const t of TIP_TRIGGERS) {
            if (t.re.test(value)) return VALUE_TIPS.find(v => v.id === t.id) || null
        }
    }
    const byId = id => VALUE_TIPS.find(v => v.id === id) || null
    const days = daysUntil(eventDate, todayISO)
    if (days !== null && days < 0) return byId('after_event')
    if (days !== null && days <= NEAR_DAYS) return byId('timing')
    if (stage === 'closed_won') return byId('poster_placement')
    if (['offer_sent', 'objection', 'commit_later'].includes(stage)) {
        return days !== null && days >= FAR_DAYS ? byId('far_date') : byId('mc_reminder')
    }
    if (days !== null && days >= FAR_DAYS) return byId('far_date')
    return null
}

// ── The journey ─────────────────────────────────────────────────────
export const JOURNEY = {
    new: {
        title: 'הודעה ראשונה',
        goal: 'שירגיש שקיבל משהו שווה כבר מההודעה הראשונה, לא שנכנס לתשאול',
        do: [
            'ענה על מה ששאלו, במלואו. זה הדבר היחיד שחובה שיקרה כאן.',
            'תן משהו לפני שאתה מבקש משהו: משפט שמסביר מה מקבלים בסוף, קישור הדמו, תמונה, או פשוט תשובה מלאה.',
            'שאלה קלה אחת מותרת בסוף, אם היא טבעית. "לאיזה אירוע ומתי בערך?" נחשב שאלה קלה אחת.',
        ],
        avoid: [
            'לפתוח בשאלה לפני שנתת משהו',
            'לחזור על שאלה שלא נענתה',
            'לשאול יותר משאלה אחת',
            'לפתוח בברכות ארוכות',
        ],
    },
    engaged: {
        title: 'מכירים את האירוע',
        goal: 'שהוא ידמיין את האירוע שלו עם הספר, לא שיבין תכונות',
        do: [
            'קודם תגיב למה שהוא כתב. אם אמר "בר מצווה של האחיין" או נתן תאריך, מילה אחת על זה לפני כל דבר אחר.',
            'שלח את קישור הדמו החי, לא "רוצה שאשלח דמו?". מי שכותב ברכה בעצמו כבר מדמיין את האירוע שלו.',
            'אם יש שם לחוגג/ת, השתמש בו. זה מה שהופך את זה לאישי.',
            'אם המחירים כבר נאמרו ואתה יודע מה האירוע, מותר להציע את המודפס עם הקישור כבר עכשיו, במשפט אחד.',
        ],
        avoid: ['לפרט רשימת תכונות', 'לבקש רשות לשלוח משהו במקום לשלוח', 'לחזור על מחירים שכבר נאמרו'],
    },
    demo_sent: {
        title: 'ראה את הדמו',
        goal: 'לעבור מהתרשמות להחלטה',
        do: [
            'שאל מה חשב, במשפט אחד. אם המחירים כבר נאמרו לו בשיחה (בפתיחה או קודם), אל תחזור עליהם.',
            'אם הוא כבר אמר לאיזה אירוע ומתי, הצעד הבא הוא הצעה, לא עוד מידע: "הכי פשוט לפתוח את הספר עכשיו, הנה הקישור למודפס" עם קישור התשלום. עם תאריך רחוק אפשר להוסיף שיש זמן ושהקישור לאורחים נשאר פתוח.',
            'זה רגע טוב לתמונה של ספר אמיתי.',
        ],
        avoid: ['ללחוץ לפני שהוא הגיב לדמו', 'לשאול "רוצה שאסביר על החבילות?" כשהוא כבר ראה מחירים', 'שתי שאלות בהודעה אחת', 'לפרט זמני הפקה ולוגיסטיקה שלא שאלו עליהם'],
    },
    offer_sent: {
        title: 'ראה מחירים',
        goal: 'להסיר את המכשול האמיתי, שהוא כמעט אף פעם לא המחיר עצמו',
        do: [
            'שאל מה מטריד. בדרך כלל זה "האם באמת יכתבו" או "האם זה יגיע בזמן".',
            'תן טיפ אמיתי מהרשימה למטה. זה בונה אמון יותר מכל הנחה.',
        ],
        avoid: ['להוריד מחיר', 'לשלוח את הקישור שוב בלי שביקשו', 'להמציא דחיפות'],
    },
    objection: {
        title: 'התנגדות',
        goal: 'להבין מה באמת עומד מאחורי זה, ולא לנצח בוויכוח',
        do: [
            'תקף את ההתנגדות במילים שלו לפני שאתה עונה.',
            'אם התנגד למחיר פעמיים או ביקש הנחה במפורש, זה הרגע לוויתור היחיד שמותר לך.',
        ],
        avoid: ['להתווכח', 'לחזור על אותם יתרונות בניסוח אחר', 'להציע הנחה שלא קיימת'],
    },
    commit_later: {
        title: 'הבטיח לחזור',
        goal: 'לשמור על הדלת פתוחה בלי ללחוץ',
        do: ['אשר בחיוב וקצר', 'שאל מתי נוח שנחזור, ותכבד את התאריך'],
        avoid: ['לנסות לסגור עכשיו בכל זאת', 'לשלוח עוד חומר "רק כדי שיהיה"'],
    },
    ready_to_pay: {
        title: 'מוכן לשלם',
        goal: 'להסיר כל חיכוך בין הרגע הזה לתשלום',
        do: [
            'שלח את קישור התשלום המדויק של החבילה שבחר, ותו לא.',
            'משפט אחד על מה קורה אחרי התשלום, כדי שלא יתלבט.',
        ],
        avoid: ['לשאול עוד שאלות', 'להציע שדרוג עכשיו', 'לשלוח שלושה קישורים'],
    },
    closed_won: {
        title: 'שילם',
        goal: 'אתה כבר לא מוכר. עכשיו מרגיעים ומכינים.',
        do: ['הסבר בקצרה מה השלב הבא', 'זה הרגע הכי טוב לתת טיפ שיגרום ליותר אורחים לכתוב'],
        avoid: ['למכור עוד משהו', 'להיעלם'],
    },
    closed_lost: {
        title: 'לא נסגר',
        goal: 'לסיים יפה. אנשים חוזרים.',
        do: ['סגור מעגל בחום ובקצרה', 'השאר דלת פתוחה בלי תנאים'],
        avoid: ['ניסיון אחרון', 'להישמע נעלב'],
    },
}

export function journeyFor(stage) {
    return JOURNEY[stage] || JOURNEY.new
}

/**
 * The brief for where this lead actually is, plus at most ONE tip — the
 * one pickValueTip chose for this turn. Only one stage is ever injected:
 * handing the model all nine produces an agent that averages them, and
 * handing it eight tips produced an agent that recited three.
 */
export function journeyBlock(stage, { tip = null } = {}) {
    const j = journeyFor(stage)
    const tipBlock = tip
        ? `
## משהו שווה לתת לו עכשיו, בחינם
${tip.text}
תשלב את זה במשפט אחד, במילים שלך, רק אם זה יושב טבעי על מה שהוא כתב. לא כטיפ מספר אחת, לא כרשימה, ולא אם כבר אמרת לו את זה.
`
        : ''
    return `## איפה אתה נמצא בשיחה הזאת: ${j.title}
המטרה שלך עכשיו: ${j.goal}
תעשה:
${j.do.map(d => `- ${d}`).join('\n')}
אל תעשה:
${j.avoid.map(d => `- ${d}`).join('\n')}
${tipBlock}`
}

// ── Language quality ────────────────────────────────────────────────
//
// "No spelling mistakes" is not something a prompt can promise, but most
// of what reads as sloppy in Hebrew here is a small, closed set: brand
// and product terms written inconsistently, and the model reaching for a
// word it is unsure how to spell instead of a simpler one it knows.
//
// So: pin the terms, and give it an explicit escape hatch. A short
// correct sentence beats a long one with a wrong word in it.
export const TERMS = [
    'Wedding Tales (באנגלית תמיד, לא בתעתיק עברי)',
    'ספר הברכות',
    'בר מצווה · בת מצווה (שתי מילים, עם ו׳)',
    'ברכה · ברכות',
    'כריכה קשה',
    'פוסטר QR',
    'עמוד האורחים',
]

export const LANGUAGE_RULES = `## עברית נקייה
כתוב עברית תקנית ומדויקת. ההודעות האלה מייצגות עסק, וטעות כתיב אחת
מוזילה את כל מה שנאמר לפניה.
- אם אתה לא בטוח באיות של מילה, תנסח מחדש עם מילה שאתה בטוח בה.
  משפט קצר ונכון עדיף על משפט מרשים עם שגיאה.
- שמור על איות אחיד למונחים שלנו:
${TERMS.map(t => `  · ${t}`).join('\n')}
- בלי קיצורים מסורבלים, בלי כתיב מדובר ("איזה" במקום "אילו" זה בסדר,
  "בייסיקלי" לא).
- מספרים וסכומים בספרות: 990 שח, לא "תשע מאות ותשעים".
- קרא את המשפט שלך פעם אחת לפני שאתה שולח. אם הוא נשמע כמו תרגום, שכתב אותו.
`

export default { JOURNEY, VALUE_TIPS, journeyBlock, journeyFor, pickValueTip, LANGUAGE_RULES }
