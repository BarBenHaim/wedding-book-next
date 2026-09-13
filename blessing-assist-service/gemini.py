"""
הקריאה ל-Gemini API, והניקוי של מה שחוזר ממנה.

מופרד מ-app.py כי זו השכבה היחידה שנוגעת ברשת. כל השאר בפרויקט
נבדק בלי חיבור לאינטרנט.
"""

import json
import os
import re

import requests

# gemini-3.6-flash: מהיר וזול. לברכה קצרה אין צורך במודל גדול.
MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"

# 0.85 ולא 0.2: ברכה היא כתיבה יצירתית. בטמפרטורה נמוכה כל שלוש
# ההצעות יוצאות כמעט זהות, וזה בדיוק מה שהמצב הזה אמור למנוע.
TEMPERATURE = 0.85
TIMEOUT_SECONDS = 25


class GeminiError(Exception):
    """נכשלה קריאה ל-API. app.py מתרגם את זה לשגיאה ידידותית למשתמש."""


def call_gemini(system_prompt, user_prompt, max_tokens=700):
    """
    שולח פרומפט ומחזיר את הטקסט שחזר.

    ל-Gemini יש שדה systemInstruction נפרד מההודעה עצמה — בדיוק
    ההפרדה שיש ב-prompts.py בין ההוראות הקבועות לבין הבקשה הספציפית.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise GeminiError("NO_KEY")

    payload = {
        # camelCase, not snake_case. The Python client library uses
        # system_instruction, the REST API does not - and it rejects the
        # unknown field with a 400 rather than ignoring it.
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {
            "temperature": TEMPERATURE,
            "maxOutputTokens": max_tokens,
        },
    }

    try:
        response = requests.post(
            API_URL,
            params={"key": api_key},
            json=payload,
            timeout=TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise GeminiError(f"NETWORK: {exc}") from exc

    if response.status_code != 200:
        # התשובה של גוגל מסבירה בדיוק מה לא בסדר (שדה לא מוכר, מודל לא
        # קיים, מפתח חסום). היא לא מכילה את המפתח — הוא נשלח ב-query.
        raise GeminiError(f"HTTP {response.status_code}: {response.text[:300]}")

    data = response.json()
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as exc:
        # קורה כשהמודל חוסם את התשובה (safety) — אין candidates בכלל.
        raise GeminiError(f"NO_TEXT: {json.dumps(data)[:200]}") from exc


def strip_wrap(text):
    """מוריד מרכאות עוטפות ותוויות כמו 'Blessing:' שהמודל לפעמים מוסיף."""
    cleaned = (text or "").strip()
    cleaned = re.sub(r'^["\'“”]+|["\'“”]+$', "", cleaned).strip()
    cleaned = re.sub(r"^(blessing|ברכה)\s*:\s*", "", cleaned, flags=re.IGNORECASE).strip()
    return cleaned


def parse_list(raw):
    """
    הופך את תשובת ה'רעיונות' לרשימת מחרוזות.

    מנסה קודם JSON — זה מה שביקשנו — ואם המודל עטף אותו בטקסט או
    ויתר עליו, נופל לפיצול לפי שורות ריקות / תבליטים / מספור.
    שני המסלולים נחוצים: בפועל המודל מחזיר JSON נקי ברוב המקרים,
    אבל לא בכולם, ולמשתמש אסור לראות שגיאה בגלל זה.
    """
    text = (raw or "").strip()

    start, end = text.find("["), text.rfind("]")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(text[start:end + 1])
            if isinstance(parsed, list):
                items = [strip_wrap(str(x)) for x in parsed]
                return [x for x in items if x]
        except json.JSONDecodeError:
            pass  # ממשיכים לפיצול לפי שורות

    # המערך התחיל כ-JSON אבל לא נסגר — קורה כשהפלט נחתך בתקציב הטוקנים.
    # במקום להחזיר את הטקסט הגולמי כ"הצעה" אחת, שולפים את המחרוזות
    # השלמות שכן הגיעו. הצעה שנחתכה באמצע נזרקת, לא מוצגת חצי.
    if start >= 0:
        complete = re.findall(r'"((?:[^"\\]|\\.)*)"', text[start:])
        complete = [strip_wrap(c.replace('\\"', '"').replace('\\n', ' ')) for c in complete]
        complete = [c for c in complete if len(c) > 15]
        if complete:
            return complete[:3]

    parts = re.split(r"\n{2,}|\n(?=\d+[.)]\s)|\n(?=[-•]\s)", text)
    items = [strip_wrap(re.sub(r"^\s*(\d+[.)]|[-•])\s*", "", p)) for p in parts]
    return [x for x in items if x][:3]
