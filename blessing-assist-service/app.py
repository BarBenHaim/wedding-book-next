"""
שירות עוזר כתיבת הברכות — Flask.

זהו ה-microservice שמחזיק את כל הלוגיקה של ה-LLM במערכת Wedding Tales.
אפליקציית ה-Next.js לא מדברת עם Gemini ישירות: היא שולחת לכאן בקשה,
וכאן נבנה הפרומפט, נעשית הקריאה למודל, והתשובה מנוקה ומוחזרת.

למה שירות נפרד ולא עוד route ב-Next.js:
  • הפרומפט הוא נכס בפני עצמו. כשהוא יושב בשירות משלו אפשר לנסות בו
    גרסאות (prompt_lab.py) ולבדוק אותו (tests/) בלי להריץ את כל
    האפליקציה ובלי לפרוס אותה מחדש.
  • זו גבולות אחריות נקיים: ה-Next.js יודע על אירועים, אורחים וספרים.
    השירות הזה יודע רק איך לדבר עם מודל שפה.

נקודות קצה:
  GET  /health   — בדיקת חיים. מחזיר גם אם יש מפתח API מוגדר.
  POST /assist   — הבקשה עצמה. שני מצבים: improve / ideas.

השירות חסר-מצב (stateless) בכוונה: אין בו DB ואין בו סשן. כל מה
שהוא צריך מגיע בגוף הבקשה, ולכן אפשר להריץ ממנו כמה עותקים.
"""

import os
import time

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

# טוען את .env אם הוא קיים, כדי שלא צריך לייצא משתני סביבה ידנית
# בכל פתיחת טרמינל. הקובץ עצמו ב-.gitignore — המפתח לא נכנס ל-git.
load_dotenv()

from gemini import GeminiError, call_gemini, parse_list, strip_wrap
from prompts import (
    DEFAULT_MAX_CHARS,
    build_ideas_prompt,
    build_improve_prompt,
    build_system_prompt,
)

app = Flask(__name__)
CORS(app)

# הגבלת קצב פשוטה לפי IP. לא מושלמת (הזיכרון מתאפס בהפעלה מחדש),
# אבל מספיקה כדי שטעות בלולאה בצד הלקוח לא תייצר חשבון ענק.
RATE_LIMIT_MAX = 12
RATE_LIMIT_WINDOW = 60  # שניות
_rate_state = {}


def is_rate_limited(ip):
    now = time.time()
    slot = _rate_state.get(ip)
    if slot is None or now - slot["start"] > RATE_LIMIT_WINDOW:
        _rate_state[ip] = {"start": now, "count": 1}
        return False
    slot["count"] += 1
    return slot["count"] > RATE_LIMIT_MAX


@app.get("/health")
def health():
    """בדיקת חיים. ה-Next.js קורא לזה כדי להחליט אם השירות זמין."""
    return jsonify({
        "ok": True,
        "service": "blessing-assist",
        "model": os.environ.get("GEMINI_MODEL", "gemini-2.0-flash"),
        "has_key": bool(os.environ.get("GEMINI_API_KEY")),
    })


@app.post("/assist")
def assist():
    """
    מייצר או משפר ברכה.

    גוף הבקשה:
      mode         "ideas" (ברירת מחדל) או "improve"
      eventType    wedding / bar_mitzvah / bat_mitzvah / birthday / ...
      names        שמות מי שמברכים אותו (לגראונדינג)
      locale       he / en / es / it
      maxChars     מגבלת האורך של האירוע
      draft        הטיוטה — חובה במצב improve
      relationship / memory / tone   פרטים אופציונליים למצב ideas

    התשובה: {"suggestions": [...]} — תמיד רשימה, גם כשיש הצעה אחת,
    כדי שצד הלקוח לא יצטרך שני מסלולי טיפול.
    """
    client_ip = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown")
    client_ip = client_ip.split(",")[0].strip()
    if is_rate_limited(client_ip):
        return jsonify({"error": "יותר מדי בקשות — נסו שוב בעוד רגע."}), 429

    body = request.get_json(silent=True) or {}
    mode = "improve" if body.get("mode") == "improve" else "ideas"
    event_type = str(body.get("eventType") or "wedding")
    names = str(body.get("names") or "")[:120]
    locale = str(body.get("locale") or "he")
    draft = str(body.get("draft") or "")[:800]

    max_chars = body.get("maxChars")
    try:
        max_chars = int(max_chars)
    except (TypeError, ValueError):
        max_chars = DEFAULT_MAX_CHARS
    max_chars = max(50, min(1200, max_chars))

    if mode == "improve" and len(draft.strip()) < 2:
        return jsonify({"error": "כתבו קודם טיוטה קצרה כדי שאוכל לשפר אותה."}), 400

    system_prompt = build_system_prompt(event_type, names, locale, max_chars)

    if mode == "improve":
        user_prompt = build_improve_prompt(draft, event_type, names, max_chars)
        max_tokens = 400
    else:
        user_prompt = build_ideas_prompt(
            event_type,
            names,
            relationship=str(body.get("relationship") or "")[:80],
            memory=str(body.get("memory") or "")[:400],
            tone=str(body.get("tone") or "")[:40],
            max_chars=max_chars,
        )
        max_tokens = 700

    try:
        raw = call_gemini(system_prompt, user_prompt, max_tokens=max_tokens)
    except GeminiError as exc:
        app.logger.warning("gemini failed: %s", exc)
        if str(exc) == "NO_KEY":
            return jsonify({"error": "עוזר ה-AI לא מוגדר עדיין (חסר מפתח)."}), 503
        return jsonify({"error": "העוזר עמוס כרגע, נסו שוב בעוד רגע."}), 502

    if mode == "improve":
        cleaned = strip_wrap(raw)[: max_chars + 40]
        suggestions = [cleaned] if cleaned else []
    else:
        suggestions = [s[: max_chars + 40] for s in parse_list(raw)][:3]

    return jsonify({"suggestions": suggestions})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
