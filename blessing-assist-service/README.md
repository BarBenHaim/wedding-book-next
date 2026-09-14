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

## פריסה לאוויר (Render, חינם)

הריפו כולל `render.yaml`, אז זה Blueprint — Render קורא אותו ומקים את
השירות לבד.

1. [dashboard.render.com](https://dashboard.render.com) ← **New** ← **Blueprint**
2. חבר את `BarBenHaim/wedding-book-next` — Render ימצא את `render.yaml`
3. הוא יבקש רק `GEMINI_API_KEY` — הדבק אותו שם (הוא מסומן `sync: false`, לא נכנס ל-git)
4. **Apply**. אחרי ~2 דקות תקבל כתובת כמו `https://wedding-tales-blessing-assist.onrender.com`
5. בדוק: `<הכתובת>/health` צריך להחזיר `"ok": true, "has_key": true`

ואז ב-Vercel ← Project ← Settings ← Environment Variables:

```
BLESSING_ASSIST_URL = https://wedding-tales-blessing-assist.onrender.com
```

ו-**Redeploy**. מרגע זה עוזר הכתיבה באתר החי עובר דרך פייתון, והחיווי
בדף הפרויקט ירוק.

**Free tier:** השירות נרדם אחרי ~15 דקות ללא תנועה ומתעורר ב-30–50
שניות. Next.js מחכה 20 שניות ואז נופל ל-Claude — האורח לא רואה שגיאה,
אבל הבקשה הראשונה אחרי שקט לא תעבור דרך פייתון. Starter (~$7 לחודש)
משאיר אותו ער. **להצגה בכיתה: תפתח את `/health` דקה לפני**, וזה ער.
