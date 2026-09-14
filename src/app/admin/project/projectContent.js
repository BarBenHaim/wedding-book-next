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
            'הפייתון קצר ומובן בכוונה — כ-450 שורות, 28 טסטים',
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

/**
 * The Python files, with a guided walkthrough for each. `from`/`to` are
 * 1-based line ranges in the real source (see pyCode.generated.js, which
 * scripts/sync-project-code.mjs regenerates on every build). When a file
 * changes, update the ranges here - the modal highlights them.
 */
export const PY_FILES = [
    {
        name: 'app.py',
        role: 'Flask — ניתוב, ולידציה, הגבלת קצב',
        summary:
            'השער של השירות. מקבל בקשת HTTP מה-Next.js, בודק אותה, בוחר פרומפט לפי המצב, ' +
            'שולח ל-Gemini דרך gemini.py, ומחזיר JSON נקי. הוא עצמו לא יודע לבנות פרומפט ולא ' +
            'יודע לדבר עם גוגל — את שני הדברים האלה הוא מייבא.',
        walkthrough: [
            { from: 1, to: 21, title: 'למה שירות נפרד', text: 'ה-docstring מסביר את ההחלטה הארכיטקטונית: הפרומפט הוא נכס בפני עצמו, ה-Next.js יודע על אירועים וספרים, השירות הזה יודע רק לדבר עם מודל שפה. חסר-מצב בכוונה — אין DB, אין סשן.' },
            { from: 23, to: 43, title: 'הרכבה', text: 'load_dotenv טוען את .env בפיתוח (הקובץ ב-.gitignore). שימו לב לייבוא: call_gemini ו-parse_list מ-gemini.py, בניית הפרומפטים מ-prompts.py. app.py רק מחבר.' },
            { from: 45, to: 59, title: 'הגבלת קצב', text: '12 בקשות לדקה לכל IP. פשוט וזיכרוני — לא מושלם על serverless, אבל מונע מלולאה שגויה בצד הלקוח לייצר חשבון ענק אצל גוגל.' },
            { from: 62, to: 70, title: 'GET /health', text: 'זה מה שהחיווי הירוק בראש הדף הזה קורא. מחזיר גם את שם המודל והאם יש מפתח — בלי לחשוף את המפתח עצמו.' },
            { from: 72, to: 84, title: 'סוד משותף (אופציונלי)', text: 'שכבת הגנה שנשארה מהתקופה שהשירות היה ציבורי. היום הוא פנימי ב-Vercel (binding), אז בלי המשתנה הבדיקה פשוט כבויה.' },
            { from: 87, to: 127, title: 'POST /assist — קליטה וולידציה', text: 'קורא את גוף הבקשה, קוצץ כל שדה לאורך סביר, מצמיד את maxChars לטווח 50–1200, ודורש טיוטה במצב improve. כל מה שהמודל יקבל עובר כאן קודם.' },
            { from: 129, to: 146, title: 'בחירת הפרומפט לפי מצב', text: 'system prompt אחד לשני המצבים, ו-user prompt שונה: improve משפר טיוטה, ideas מבקש מערך JSON של 3. תקציבי הטוקנים (1024 / 2048) גדולים כי עברית יקרה בטוקנים וב-Gemini 3.x גם ה-thinking נספר — 400 נחתכו באמצע.' },
            { from: 148, to: 159, title: 'הקריאה ותרגום שגיאות', text: 'GeminiError אחד הופך לשתי תשובות: 503 כשאין מפתח, 502 כשגוגל נכשלה. למשתמש טקסט אנושי; למפתח, ב-FLASK_DEBUG=1, גם השגיאה האמיתית.' },
            { from: 161, to: 167, title: 'ניקוי והחזרה', text: 'strip_wrap מוריד מרכאות ותוויות, parse_list הופך את התשובה לרשימה, וכל הצעה נקצצת ל-maxChars+40. תמיד חוזרת רשימה, גם עם הצעה אחת — צד הלקוח מטפל במסלול אחד.' },
            { from: 170, to: 172, title: 'הרצה מקומית', text: 'python app.py — פורט 5001. ב-Vercel הקובץ הזה לא רץ ככה: ה-runtime מייבא את app ומריץ אותו כפונקציה.' },
        ],
    },
    {
        name: 'prompts.py',
        role: 'בניית הפרומפט. פונקציות טהורות — אין רשת',
        summary:
            'הלב של הפרויקט מבחינת ה-LLM. שלוש פונקציות שמקבלות פרטי אירוע ומחזירות טקסט — ' +
            'בלי רשת, בלי Flask, בלי מפתח. לכן אפשר לבדוק אותן ב-pytest במילישניות, וכלי הניסויים ' +
            'מייבא אותן ישירות.',
        walkthrough: [
            { from: 1, to: 16, title: 'למה קובץ נפרד', text: 'שתי סיבות: פונקציה טהורה ניתנת לבדיקה בלי מוק; וניסויים בפרומפט לא צריכים להרים שרת. וההערה על שפה: הפרומפט באנגלית אף שהפלט עברית — המודלים מדייקים יותר בהוראות באנגלית.' },
            { from: 18, to: 22, title: 'קבועים', text: 'קוד שפה → השם שהמודל מבין, וברירת מחדל של 210 תווים אם האירוע לא הגדיר משלו.' },
            { from: 25, to: 42, title: 'event_context — ה-grounding', text: 'מתרגם סוג אירוע לתיאור אנושי ולמי פונים. בלי זה המודל כותב ברכה גנרית שמתאימה לכל דבר; איתו הוא יודע שזו בר מצווה ולא חתונה.' },
            { from: 45, to: 72, title: 'build_system_prompt — ההוראות הקבועות', text: 'כל שורה כאן נולדה מכישלון אמיתי (experiments.md): "never invent names" אחרי שהמודל המציא "ש." כשלא היה שם; האיסור על קלישאות אחרי ש"מאחלים לכם חיים מאושרים" חזר בכל ברכה שנייה. זה בדיוק מה שמופיע בטאב "הפרומפט".' },
            { from: 75, to: 83, title: 'build_improve_prompt', text: 'מצב שיפור: שומר על הכוונה והקול של הכותב, מחמם ומדייק, מתקן שגיאות, מוריד קלישאות — ומחזיר רק את הברכה, בלי הקדמות.' },
            { from: 86, to: 110, title: 'build_ideas_prompt — 3 הצעות', text: 'מרכיב את הפרטים שהאורח נתן (קשר, זיכרון, טון) לשורה אחת, ומבקש במפורש מערך JSON של 3 מחרוזות. הבקשה המפורשת לפורמט היא מה שהופך את הפלט לניתן לפרסור אמין.' },
        ],
    },
    {
        name: 'gemini.py',
        role: 'הקריאה ל-API והניקוי. השכבה היחידה שנוגעת ברשת',
        summary:
            'הקובץ היחיד בפרויקט שמדבר עם האינטרנט. קריאת REST ישירה ל-Gemini בלי SDK — ' +
            'כדי שיהיה ברור בדיוק מה נשלח — ואחריה הפרסור של מה שחזר, כולל המקרים שבהם המודל ' +
            'לא החזיר בדיוק מה שביקשנו.',
        walkthrough: [
            { from: 14, to: 21, title: 'הגדרות', text: 'gemini-3.6-flash — מהיר וזול, לברכה קצרה לא צריך מודל גדול. טמפרטורה 0.85 ולא 0.2: ברכה היא כתיבה יצירתית, ובטמפרטורה נמוכה שלוש ההצעות יוצאות כמעט זהות.' },
            { from: 24, to: 26, title: 'GeminiError', text: 'שגיאה אחת לכל כישלון מול ה-API. app.py מתרגם אותה לתשובה ידידותית; הקובץ הזה לא יודע שיש משתמש בכלל.' },
            { from: 28, to: 50, title: 'call_gemini — בניית הבקשה', text: 'systemInstruction נפרד מ-contents — בדיוק ההפרדה שיש ב-prompts.py. שימו לב להערה: camelCase ולא snake_case. ספריית הפייתון של גוגל משתמשת ב-system_instruction, ה-REST לא — וזה נכשל ב-400 בפעם הראשונה.' },
            { from: 52, to: 71, title: 'שליחה ופענוח', text: 'המפתח נשלח כפרמטר query, timeout של 25 שניות. סטטוס שאינו 200 הופך ל-GeminiError עם 300 התווים הראשונים של התשובה של גוגל — היא מסבירה בדיוק מה לא בסדר. חסר candidates = המודל חסם (safety).' },
            { from: 74, to: 79, title: 'strip_wrap', text: 'מוריד מרכאות עוטפות ותוויות כמו "Blessing:" שהמודל לפעמים מוסיף למרות ההוראה.' },
            { from: 82, to: 115, title: 'parse_list — שלושה מסלולים', text: 'קודם JSON כמו שביקשנו. אם המערך התחיל אבל לא נסגר (הפלט נחתך בתקציב הטוקנים) — שולפים בביטוי רגולרי רק את המחרוזות השלמות, וזורקים הצעה חצויה. ואם אין JSON בכלל — פיצול לפי שורות ריקות, תבליטים או מספור. למשתמש אסור לראות שגיאה בגלל פורמט.' },
        ],
    },
    {
        name: 'prompt_lab.py',
        role: 'כלי CLI להשוואת גרסאות פרומפט',
        summary:
            'מעבדת הניסויים. כדי לדעת אם שורה בפרומפט באמת עושה משהו צריך להריץ את אותה בקשה ' +
            'עם השורה ובלעדיה ולהשוות — אחרת "שיפור פרומפט" הוא ניחוש, כי כל הרצה מחזירה טקסט ' +
            'אחר ממילא. הניסויים ב-experiments.md נעשו עם הכלי הזה.',
        walkthrough: [
            { from: 1, to: 18, title: 'שימוש', text: '--ablate names מוריד את הכלל "אל תמציא שמות" ומראה מה קורה בלעדיו; --ablate json מבקש טקסט חופשי במקום מערך; --temp 0.2 מדגים למה 0.85. דורש GEMINI_API_KEY.' },
            { from: 28, to: 40, title: 'ABLATIONS', text: 'כל אבלציה היא תחילת שורה שתימחק מה-system prompt. remove_rule מסננת את השורה — פשוט, ומספיק כדי לבודד תרומה של כלל אחד.' },
            { from: 43, to: 72, title: 'הרכבת הניסוי', text: 'בונה את אותם פרומפטים בדיוק כמו app.py — מאותן פונקציות ב-prompts.py — ואז מסיר את מה שביקשו. זו הסיבה שהפרומפטים חייבים לשבת בקובץ נפרד: אחרת כל ניסוי היה מחייב להרים שרת.' },
            { from: 74, to: 95, title: 'הרצה והדפסה', text: 'N הרצות, כל אחת מפורסרת ב-parse_list כמו בייצור. כשהפרסור נכשל מדפיס את הגולמי — כך התגלה שהמערך נחתך בתקציב הטוקנים.' },
        ],
    },
    {
        name: 'tests/test_prompts.py',
        role: '28 טסטים, אף אחד לא דורש מפתח API',
        summary:
            'pytest על החלקים הטהורים בלבד: בניית הפרומפט והפרסור. אין כאן אף קריאה לרשת, ' +
            'ולכן הטסטים רצים במילישניות, בלי מפתח ובלי עלות — וזו בדיוק ההצדקה להפרדה בין ' +
            'prompts.py ו-gemini.py לבין app.py.',
        walkthrough: [
            { from: 1, to: 21, title: 'מה נבדק ומה לא', text: 'מייבא ישירות מ-prompts ו-gemini. app.py לא מיובא בכלל — הוא רק חיבור, והלוגיקה שבאמת יכולה להישבר יושבת בשני האחרים.' },
            { from: 24, to: 41, title: 'TestEventContext', text: 'כל סוג אירוע ממופה נכון, ושם ריק נופל לתיאור גנרי ("the couple") במקום לשם מומצא.' },
            { from: 42, to: 63, title: 'TestSystemPrompt', text: 'ההוראות הקריטיות באמת נמצאות בפרומפט: השפה הנכונה, מגבלת האורך של האירוע, הכלל על שמות. אם מישהו ימחק שורה בטעות — הטסט נופל.' },
            { from: 64, to: 93, title: 'TestImprovePrompt / TestIdeasPrompt', text: 'הטיוטה נכנסת לפרומפט, הפרטים שהאורח נתן נכנסים רק אם ניתנו, ובקשת ה-JSON תמיד נמצאת.' },
            { from: 94, to: 149, title: 'TestStripWrap / TestParseList', text: 'הפרסור מול כל מה שראינו מהמודל: JSON נקי, JSON עטוף בטקסט, רשימה ממוספרת — ומערך חתוך באמצע, שממנו חוזרות רק המחרוזות השלמות. הטסט האחרון נכתב אחרי באג אמיתי בייצור.' },
        ],
    },
]

/** What to click, in what order, when presenting. */
export const DEMO_SCRIPT = [
    { step: 'הראה את המוצר החי', detail: 'app.weddingtales.co.il — סרוק QR של אירוע דמו והגע לדף הברכה' },
    { step: 'הפעל את עוזר הכתיבה', detail: 'לחץ "עזרו לי לכתוב", מלא קשר/זיכרון/טון, קבל 3 הצעות' },
    { step: 'הראה מאיפה זה הגיע', detail: 'הטאב "הפרומפט" כאן — זה בדיוק מה שנשלח למודל' },
    { step: 'הראה את הפייתון', detail: 'prompts.py → gemini.py. הסבר למה ההפרדה מאפשרת טסטים בלי מפתח' },
    { step: 'הרץ ניסוי חי', detail: 'python prompt_lab.py --ablate names --runs 3 — והשווה לפלט עם הכלל' },
    { step: 'הרץ את הטסטים', detail: 'python -m pytest tests/ -q — 28 עוברים בלי רשת' },
    { step: 'עבור על הדיאגרמות', detail: 'הטאב "דיאגרמות" — עקוב אחרי הבקשה מהאורח עד Gemini וחזרה' },
    { step: 'סגור עם המספרים', detail: 'הטאב "סקירה" — אירועים, ברכות, תמונות. מוצר, לא תרגיל' },
]
