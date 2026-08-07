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
]

// ── The journey ─────────────────────────────────────────────────────
export const JOURNEY = {
    new: {
        title: 'הודעה ראשונה',
        goal: 'להבין איזה אירוע ומתי, ולהשאיר רושם של בן אדם מקצועי שאכפת לו',
        do: [
            'ענה על מה ששאלו, קודם כל. אל תתעלם מהשאלה כדי לשאול שאלה משלך.',
            'שאלה אחת בלבד: איזה אירוע ומתי. בלי תאריך אתה עובד בחושך.',
        ],
        avoid: ['להציג מחירים לפני שאתה יודע מה האירוע', 'לשאול שתי שאלות', 'לפתוח בברכות ארוכות'],
    },
    engaged: {
        title: 'מכירים את האירוע',
        goal: 'שהוא ידמיין את האירוע שלו עם הספר, לא שיבין תכונות',
        do: [
            'שלח את קישור הדמו החי. מי שכותב ברכה בעצמו כבר מדמיין את האירוע שלו.',
            'אם יש שם לחוגג/ת, השתמש בו. זה מה שהופך את זה לאישי.',
        ],
        avoid: ['לפרט רשימת תכונות', 'להציג חבילות לפני שראה איך זה נראה'],
    },
    demo_sent: {
        title: 'ראה את הדמו',
        goal: 'לעבור מהתרשמות להחלטה',
        do: [
            'שאל מה חשב, ואז הצג את שלוש החבילות יחד עם דגש על המודפס.',
            'זה רגע טוב לתמונה של ספר אמיתי.',
        ],
        avoid: ['ללחוץ לפני שהוא הגיב לדמו', 'לשלוח את שלוש החבילות בלי הקשר'],
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
 * The brief for where this lead actually is, plus the two tips most
 * likely to be useful there. Only one stage is ever injected — handing
 * the model all nine produces an agent that averages them.
 */
export function journeyBlock(stage) {
    const j = journeyFor(stage)
    const tips = VALUE_TIPS.map(t => `- ${t.text} (מתי: ${t.when})`).join('\n')
    return `## איפה אתה נמצא בשיחה הזאת: ${j.title}
המטרה שלך עכשיו: ${j.goal}
תעשה:
${j.do.map(d => `- ${d}`).join('\n')}
אל תעשה:
${j.avoid.map(d => `- ${d}`).join('\n')}

## דברים אמיתיים שמותר ושווה לתת בחינם
תן אחד מהם כשהוא מתאים לרגע, לא כרשימה. זה בונה אמון הרבה יותר מהנחה.
${tips}
`
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
- מספרים וסכומים בספרות: 950 שח, לא "תשע מאות וחמישים".
- קרא את המשפט שלך פעם אחת לפני שאתה שולח. אם הוא נשמע כמו תרגום, שכתב אותו.
`

export default { JOURNEY, VALUE_TIPS, journeyBlock, journeyFor, LANGUAGE_RULES }
