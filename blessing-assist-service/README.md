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
export GEMINI_API_KEY=...   # Windows PowerShell: $env:GEMINI_API_KEY="..."
python app.py
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
| `tests/` | 26 טסטים, אף אחד מהם לא דורש מפתח API |

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
