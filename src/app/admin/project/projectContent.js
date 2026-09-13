// src/app/admin/project/projectContent.js
//
// The content of the project page, as data.
//
// Kept out of the component for one reason: this is the material that
// gets ARGUED about before a presentation - wording, which evidence goes
// against which criterion - and editing it should not mean reading JSX.
// It is also the only part that needs updating when the project moves on.

/** Where the grader's marks come from, and what to show for each. */
export const RUBRIC = [
    {
        weight: '15%',
        title: 'אפיון הפרויקט',
        evidence: [
            'docs/ARCHITECTURE.md — 323 שורות, נכתב מתוך הקוד ולא לפניו',
            'המוצר חי עם לקוחות משלמים: האפיון נבחן במציאות, לא על הנייר',
            'טאב "הדגמה" כאן — מסלול המשתמש מקצה לקצה',
        ],
    },
    {
        weight: '25%',
        title: 'פיתוח בעזרת כלי AI + הבנת הקוד',
        evidence: [
            'מנוע הרכבת עמודי ספר הברכות — נבנה במהלך הקורס עם כלי AI',
            'מנוע עיצוב האלבומים — 2,018 שורות, 39 מתכוני לייאאוט',
            'שירות ה-Flask שבדף הזה — הוצאת לוגיקת ה-LLM לשירות נפרד',
            'הבאגים שנמצאו ברנדור ולא בחשיבה — מתועדים בהודעות הקומיט',
        ],
    },
    {
        weight: '20%',
        title: 'System + Sequence Diagram והבנת הקוד',
        evidence: [
            'שתי הדיאגרמות בטאב "דיאגרמות" — SVG בקוד, לא תמונה',
            'זרימת עוזר הברכות מסומנת מקצה לקצה, כולל מסלול הנפילה',
        ],
    },
    {
        weight: '5%',
        title: 'Git / GitHub',
        evidence: [
            'שני ריפוזיטוריז: wedding-book-next (web) ו-wedding-tales-mobile',
            'הודעות קומיט שמסבירות למה, לא רק מה',
        ],
    },
    {
        weight: '15%',
        title: 'הצגה + בחינה על הקוד',
        evidence: [
            'הדף הזה הוא המצגת',
            'לינק חי: app.weddingtales.co.il',
            'הפייתון קצר ומובן בכוונה — 447 שורות סך הכל, 26 טסטים',
        ],
    },
    {
        weight: '10%',
        title: 'התרשמות כללית',
        evidence: [
            'מוצר אמיתי עם משתמשים, לא תרגיל',
            'גם ב-App Store, ובדרך ל-Google Play',
        ],
    },
]

/** The prompt experiments, summarised. Full write-up in experiments.md. */
export const EXPERIMENTS = [
    {
        title: 'המצאת שמות',
        problem: 'המודל חתם ברכה "באהבה, ש." — אות שלא הגיעה משום מקום.',
        tried: 'הרצה עם ובלי הכלל "never invent names, initials, single letters".',
        result: 'בלי הכלל: כשליש מההרצות המציאו שם. עם הכלל: אפס.',
        lesson: 'איסור כללי לא עבד. מה שעבד היה למנות במפורש את הצורות שראיתי.',
    },
    {
        title: 'קלישאות',
        problem: 'כל ההצעות יצאו וריאציה על "מאחלים לכם חיים מאושרים".',
        tried: '"Avoid cliches" → "Be specific" → דוגמאות שליליות ממשיות בתוך הפרומפט.',
        result: 'רק הגרסה עם הדוגמאות הקונקרטיות עבדה.',
        lesson: 'דוגמה שלילית מדויקת שווה יותר מהוראה מופשטת.',
    },
    {
        title: 'בקשת JSON',
        problem: '"כתוב 3 ברכות" החזיר פורמט אחר בכל פעם — מספור, תבליטים, פסקאות.',
        tried: 'הוספת "Return ONLY a JSON array of 3 strings" מול הורדתה.',
        result: 'עם הבקשה רוב ההרצות תקינות; בלעדיה כמעט אף אחת. אבל חלקן עדיין עטפו את ה-JSON בטקסט.',
        lesson: 'בקשת פורמט משפרת סיכוי ולא מבטיחה. פרסור סלחני הוא הכרח, לא עצלות.',
    },
    {
        title: 'טמפרטורה',
        problem: 'האם 0.85 מוגזם?',
        tried: 'אותה בקשה ב-0.2 מול 0.85.',
        result: 'ב-0.2 שלוש ה"הצעות השונות" יצאו כמעט זהות.',
        lesson: 'מצב שכל תכליתו להציע אפשרויות נהרס מטמפרטורה נמוכה.',
    },
    {
        title: 'שפת הפרומפט',
        problem: 'הפלט עברי — אולי גם הפרומפט צריך להיות?',
        tried: 'תרגום הפרומפט המערכתי כולו לעברית.',
        result: 'באנגלית הציות לכללים השליליים היה עקבי יותר.',
        lesson: 'הפרומפט נשאר אנגלית; השפה נקבעת בהוראה אחת מפורשת.',
    },
]

/** The exact system prompt the service sends. */
export const SYSTEM_PROMPT = `You are a gifted writer helping an everyday guest write a genuinely
beautiful, heartfelt {occasion} blessing for {who}. Write ONLY in {lang}.
Make it EXCELLENT - something the guest would be proud to sign:
- Warm, sincere and human; sounds like a real person speaking from the
  heart, not a greeting-card cliche.
- Complete, flowing, grammatical sentences. NEVER fragments or cut-off
  thoughts.
- Specific in feeling; avoid empty generic lines used alone.
- CRITICAL: never invent names, initials, single letters, or
  placeholders. Use the recipient's name only if it is given to you.
  Do NOT mention any other people unless the guest explicitly provided
  them.
- Natural, modern tone - not flowery or archaic. No hashtags. At most
  one emoji, only if it truly fits.
- Keep each blessing under {maxChars} characters, ideally 2-4 short
  sentences.
Return plain text only - no preamble, no quotes, no numbering, no
labels.`

/** The Python files, and what each is for. */
export const PY_FILES = [
    { name: 'app.py', lines: 142, role: 'Flask — ניתוב, ולידציה, הגבלת קצב' },
    { name: 'prompts.py', lines: 110, role: 'בניית הפרומפט. פונקציות טהורות — אין רשת' },
    { name: 'gemini.py', lines: 100, role: 'הקריאה ל-API והניקוי. השכבה היחידה שנוגעת ברשת' },
    { name: 'prompt_lab.py', lines: 95, role: 'כלי CLI להשוואת גרסאות פרומפט' },
    { name: 'tests/test_prompts.py', lines: 145, role: '26 טסטים, אף אחד לא דורש מפתח API' },
]

/** What to click, in what order, when presenting. */
export const DEMO_SCRIPT = [
    { step: 'הראה את המוצר החי', detail: 'app.weddingtales.co.il — סרוק QR של אירוע דמו והגע לדף הברכה' },
    { step: 'הפעל את עוזר הכתיבה', detail: 'לחץ "עזרו לי לכתוב", מלא קשר/זיכרון/טון, קבל 3 הצעות' },
    { step: 'הראה מאיפה זה הגיע', detail: 'הטאב "הפרומפט" כאן — זה בדיוק מה שנשלח למודל' },
    { step: 'הראה את הפייתון', detail: 'prompts.py → gemini.py. הסבר למה ההפרדה מאפשרת טסטים בלי מפתח' },
    { step: 'הרץ ניסוי חי', detail: 'python prompt_lab.py --ablate names --runs 3 — והשווה לפלט עם הכלל' },
    { step: 'הרץ את הטסטים', detail: 'python -m pytest tests/ -q — 26 עוברים בלי רשת' },
    { step: 'עבור על הדיאגרמות', detail: 'הטאב "דיאגרמות" — עקוב אחרי הבקשה מהאורח עד Gemini וחזרה' },
    { step: 'סגור עם המספרים', detail: 'הטאב "סקירה" — אירועים, ברכות, תמונות. מוצר, לא תרגיל' },
]
