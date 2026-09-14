# שירות עוזר כתיבת הברכות

ה-microservice בפייתון שמחזיק את כל לוגיקת ה-LLM של Wedding Tales.

אפליקציית ה-Next.js לא מדברת עם Gemini ישירות — היא שולחת בקשה לכאן,
וכאן נבנה הפרומפט, נעשית הקריאה למודל, והתשובה מנוקה ומוחזרת.

## למה שירות נפרד

שני נימוקים, ושניהם נכונים גם מחוץ להקשר של הקורס:

**הפרומפט הוא נכס בפני עצמו.** כשהוא יושב בשירות משלו אפשר להריץ עליו
ניסויים (`prompt_lab.py`) ולכתוב לו טסטים בלי להריץ את כל האפליקציה
ובלי לפרוס אותה מחדש.

**גבולות אחריות נקיים.** ה-Next.js יודע על אירועים, אורחים וספרים.
השירות הזה יודע רק איך לדבר עם מודל שפה. הוא חסר-מצב לגמרי — אין בו
DB ואין בו סשן — ולכן אפשר להריץ ממנו כמה עותקים.

## הפעלה

```bash
cd blessing-assist-service
python -m venv venv && source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # ואז לערוך ולשים GEMINI_API_KEY אמיתי
python app.py               # .env נטען אוטומטית
```

השירות עולה על `http://localhost:5001`.

מפתח מתקבל חינם ב-[Google AI Studio](https://aistudio.google.com/apikey).

## נקודות קצה

| | |
|---|---|
| `GET /health` | בדיקת חיים. מחזיר גם אם מוגדר מפתח API |
| `POST /assist` | מייצר או משפר ברכה |

```bash
curl -X POST http://localhost:5001/assist \
  -H 'Content-Type: application/json' \
  -d '{"mode":"ideas","eventType":"wedding","names":"דנה ויוסי","relationship":"חבר מהצבא"}'
```

תשובה: `{"suggestions": ["...", "...", "..."]}` — תמיד רשימה, גם כשיש
הצעה אחת, כדי שצד הלקוח לא יצטרך שני מסלולי טיפול.

## מבנה

| קובץ | תפקיד |
|---|---|
| `app.py` | Flask — ניתוב, ולידציה, הגבלת קצב |
| `prompts.py` | בניית הפרומפט. **פונקציות טהורות** — אין רשת, אין Flask |
| `gemini.py` | הקריאה ל-API והניקוי של מה שחוזר. השכבה היחידה שנוגעת ברשת |
| `prompt_lab.py` | כלי CLI להשוואת גרסאות פרומפט |
| `experiments.md` | תיעוד הניסויים ומה למדתי מכל אחד |
| `tests/` | 28 טסטים, אף אחד מהם לא דורש מפתח API |

ההפרדה הזו היא הסיבה שאפשר להריץ `pytest` בלי מפתח ובלי אינטרנט:
כל מה שיכול באמת להישבר — בניית הפרומפט והפרסור של התשובה — הוא קוד
טהור.

## טסטים

```bash
python -m pytest tests/ -q
```

## ניסויים בפרומפט

```bash
python prompt_lab.py --ablate names     # מה קורה בלי הכלל "אל תמציא שמות"
python prompt_lab.py --ablate json      # מה קורה בלי בקשת JSON מפורשת
python prompt_lab.py --temp 0.2         # אותה בקשה בטמפרטורה נמוכה
```

הממצאים מתועדים ב-[experiments.md](./experiments.md).

## פריסה לאוויר — Vercel, אותו חשבון שכבר יש

ל-Vercel יש preset ל-Flask: הוא מחפש `app.py` עם משתנה `app`, קורא את
`requirements.txt`, ומנתב כל בקשה לאפליקציה. זה בדיוק מה שיש כאן, אז
אין קונפיגורציה. הסיבה שזה עדיף על Render החינמי: אין "שינה" של
15 דקות, cold start של ~שנייה, ותקרת ריצה של 300 שניות ב-Hobby
(Gemini לוקח 8–23).

השירות הוא **פרויקט Vercel נפרד** מאותו ריפו:

1. [vercel.com/new](https://vercel.com/new) ← Import ← `BarBenHaim/wedding-book-next`
2. **Root Directory** ← `blessing-assist-service` (הצעד שקל לפספס)
3. Environment Variables:
   - `GEMINI_API_KEY` — המפתח
   - `ASSIST_SHARED_SECRET` — מחרוזת אקראית ארוכה, כל דבר
4. **Deploy** ← ~1 דקה ← כתובת כמו `https://wedding-tales-blessing-assist.vercel.app`
5. בדוק: `<הכתובת>/health` צריך להחזיר `"ok": true, "has_key": true`

ואז בפרויקט **האתר** (the-wedding-gift) ← Settings ← Environment Variables:

```
BLESSING_ASSIST_URL   = https://wedding-tales-blessing-assist.vercel.app
ASSIST_SHARED_SECRET  = אותה מחרוזת בדיוק
```

← **Redeploy**. מרגע זה עוזר הכתיבה באתר החי עובר דרך פייתון, והחיווי
בדף הפרויקט ירוק.

**למה הסוד המשותף:** הנקודה `/assist` ציבורית וכל קריאה אליה עולה
כסף. הגבלת קצב לפי IP לא שווה על serverless (הזיכרון מתאפס). עם הסוד,
רק ה-Next.js שלך יכול להוציא את המפתח שלך. בלי המשתנה (פיתוח מקומי)
הבדיקה פשוט כבויה.
