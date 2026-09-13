"""
בניית הפרומפט לעוזר כתיבת הברכות.

הקובץ הזה הוא הלב של הפרויקט מבחינת ה-LLM: כאן נבנה הפרומפט שנשלח
ל-Gemini. הפרדתי אותו מ-app.py בכוונה משתי סיבות:

1. הוא **פונקציה טהורה** — נכנס מילון של פרטי האירוע, יוצא טקסט.
   אין בו רשת, אין בו Flask, ולכן אפשר לבדוק אותו בטסטים בלי שום
   מוק ובלי לשלם על קריאת API.
2. ניסויים בפרומפט (ראו prompt_lab.py) מייבאים אותו ישירות. אם הבנייה
   הייתה יושבת בתוך handler של Flask, כל ניסוי היה מחייב להרים שרת.

לשון: הפרומפט עצמו באנגלית אף שהפלט עברית, כי המודלים מדייקים יותר
בהוראות באנגלית — הוראת השפה עצמה ("Write ONLY in Hebrew") היא זו
שקובעת את שפת הפלט.
"""

# שפות נתמכות: קוד -> השם שהמודל מבין
LANGS = {"he": "Hebrew", "en": "English", "es": "Spanish", "it": "Italian"}

# ברירת מחדל לאורך ברכה, אם האירוע לא הגדיר משלו
DEFAULT_MAX_CHARS = 210


def event_context(event_type, names=""):
    """
    מתרגם סוג אירוע לתיאור אנושי + איך לפנות למי שמברכים אותו.

    זה ה-"grounding": בלי זה המודל כותב ברכה גנרית שמתאימה לכל אירוע,
    ועם זה הוא יודע שמדובר בבר מצווה ולא בחתונה.
    """
    names = (names or "").strip()
    table = {
        "wedding":     ("a wedding",    names or "the couple"),
        "bar_mitzvah": ("a bar mitzvah", names or "the bar mitzvah boy"),
        "bat_mitzvah": ("a bat mitzvah", names or "the bat mitzvah girl"),
        "birthday":    ("a birthday",   names or "the birthday person"),
        "poker":       ("a game night", names or "the host"),
        "travel":      ("a trip",       names or "the traveler"),
    }
    occasion, who = table.get(event_type, ("a celebration", names or "the guest of honor"))
    return {"occasion": occasion, "who": who}


def build_system_prompt(event_type, names="", locale="he", max_chars=DEFAULT_MAX_CHARS):
    """
    הפרומפט המערכתי — ההוראות הקבועות שחלות על כל בקשה.

    כל שורה כאן נולדה מכישלון אמיתי שראיתי בפלט (ראו experiments.md):
    השורה על "never invent names" נוספה אחרי שהמודל המציא "ש." כשלא
    נתנו לו שם, והשורה על clichés נוספה אחרי שכל ברכה שנייה יצאה
    "מאחלים לכם חיים מאושרים".
    """
    lang = LANGS.get(locale, LANGS["he"])
    ctx = event_context(event_type, names)

    return (
        f"You are a gifted writer helping an everyday guest write a genuinely beautiful, heartfelt "
        f"{ctx['occasion']} blessing for {ctx['who']}. Write ONLY in {lang}.\n"
        f"Make it EXCELLENT - something the guest would be proud to sign:\n"
        f"- Warm, sincere and human; sounds like a real person speaking from the heart, "
        f"not a greeting-card cliche.\n"
        f"- Complete, flowing, grammatical sentences. NEVER fragments or cut-off thoughts.\n"
        f"- Specific in feeling; avoid empty generic lines used alone.\n"
        f"- CRITICAL: never invent names, initials, single letters, or placeholders. "
        f"Use the recipient's name only if it is given to you. "
        f"Do NOT mention any other people unless the guest explicitly provided them.\n"
        f"- Natural, modern tone - not flowery or archaic. No hashtags. "
        f"At most one emoji, only if it truly fits.\n"
        f"- Keep each blessing under {max_chars} characters, ideally 2-4 short sentences.\n"
        f"Return plain text only - no preamble, no quotes, no numbering, no labels."
    )


def build_improve_prompt(draft, event_type, names="", max_chars=DEFAULT_MAX_CHARS):
    """מצב 'שיפור': המשתמש כתב טיוטה ואנחנו משפרים אותה בלי לאבד את הקול שלו."""
    ctx = event_context(event_type, names)
    return (
        f"Improve this {ctx['occasion']} blessing. Keep the writer's intent and personal voice, "
        f"make it warmer, smoother and more specific, fix any grammar/spelling, remove cliches, "
        f"and keep it under {max_chars} characters. Return ONLY the improved blessing.\n\n"
        f'Draft:\n"""{draft}"""'
    )


def build_ideas_prompt(event_type, names="", relationship="", memory="", tone="",
                       max_chars=DEFAULT_MAX_CHARS):
    """
    מצב 'רעיונות': המשתמש נותן כמה פרטים ואנחנו מייצרים 3 הצעות שונות.

    בקשת JSON מפורשת (ולא "כתוב 3 ברכות") היא מה שהופך את הפלט לניתן
    לפרסור אמין. עדיין יש fallback בפרסור, כי מודלים לפעמים עוטפים
    את ה-JSON בטקסט.
    """
    ctx = event_context(event_type, names)
    details = " ".join(filter(None, [
        f"Relationship to {ctx['who']}: {relationship}." if relationship else "",
        f"A detail / memory / wish to weave in: {memory}." if memory else "",
        f"Desired tone: {tone}." if tone else "",
    ]))
    if not details:
        details = "No extra details were given, so keep them broadly warm but still fresh."

    return (
        f"Write 3 DISTINCT short {ctx['occasion']} blessings for {ctx['who']}. "
        f"{details} "
        f"Each must be a complete standalone blessing, different in angle and wording "
        f"from the others, under {max_chars} characters. "
        f'Return ONLY a JSON array of 3 strings, nothing else. Example: ["...","...","..."]'
    )
