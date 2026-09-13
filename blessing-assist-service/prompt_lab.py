"""
מעבדת פרומפטים — כלי שורת פקודה להשוואת גרסאות של הפרומפט.

זה הכלי שבו נעשו הניסויים המתועדים ב-experiments.md.

הרעיון: כדי לדעת אם שורה בפרומפט באמת עושה משהו, צריך להריץ את אותה
בקשה פעמיים — עם השורה ובלעדיה — ולהשוות. בלי כלי כזה "שיפור פרומפט"
הוא ניחוש, כי כל הרצה מחזירה טקסט אחר ממילא (temperature 0.85).

שימוש:
    python prompt_lab.py --ablate names      # מה קורה בלי כלל "אל תמציא שמות"
    python prompt_lab.py --ablate cliche     # מה קורה בלי האיסור על קלישאות
    python prompt_lab.py --ablate json       # מה קורה בלי בקשת ה-JSON
    python prompt_lab.py --runs 5            # 5 הרצות של הפרומפט המלא
    python prompt_lab.py --temp 0.2          # אותה בקשה בטמפרטורה נמוכה

דורש GEMINI_API_KEY בסביבה.
"""

import argparse
import os
import sys

import gemini
from gemini import GeminiError, call_gemini, parse_list
from prompts import build_ideas_prompt, build_system_prompt

# כל "אבלציה" היא מחרוזת שמוסרת מהפרומפט, כדי לבדוק מה תרומתה.
# המפתח הוא השם בשורת הפקודה; הערך הוא תחילת השורה שתימחק.
ABLATIONS = {
    "names": "- CRITICAL: never invent names",
    "cliche": "- Specific in feeling",
    "length": "- Keep each blessing under",
    "tone": "- Natural, modern tone",
}


def remove_rule(prompt, prefix):
    """מוריד מהפרומפט את השורה שמתחילה ב-prefix."""
    return "\n".join(line for line in prompt.split("\n") if not line.startswith(prefix))


def main():
    parser = argparse.ArgumentParser(description="השוואת גרסאות פרומפט")
    parser.add_argument("--ablate", choices=list(ABLATIONS) + ["json"],
                        help="איזה כלל להוריד מהפרומפט")
    parser.add_argument("--runs", type=int, default=3, help="כמה הרצות")
    parser.add_argument("--temp", type=float, help="טמפרטורה (ברירת מחדל 0.85)")
    parser.add_argument("--event", default="wedding", help="סוג אירוע")
    parser.add_argument("--names", default="", help="שמות (ריק = בודקים המצאת שמות)")
    args = parser.parse_args()

    if not os.environ.get("GEMINI_API_KEY"):
        print("חסר GEMINI_API_KEY בסביבה.", file=sys.stderr)
        return 1

    if args.temp is not None:
        gemini.TEMPERATURE = args.temp

    system = build_system_prompt(args.event, args.names)
    user = build_ideas_prompt(args.event, args.names)

    label = "פרומפט מלא"
    if args.ablate == "json":
        user = user.replace(
            'Return ONLY a JSON array of 3 strings, nothing else. Example: ["...","...","..."]',
            "Write them out.",
        )
        label = "בלי בקשת JSON"
    elif args.ablate:
        system = remove_rule(system, ABLATIONS[args.ablate])
        label = f"בלי הכלל: {args.ablate}"

    print(f"\n=== {label} · temperature={gemini.TEMPERATURE} · {args.runs} הרצות ===\n")

    for run in range(1, args.runs + 1):
        try:
            raw = call_gemini(system, user, max_tokens=700)
        except GeminiError as exc:
            print(f"הרצה {run}: נכשלה — {exc}")
            continue

        parsed = parse_list(raw)
        print(f"--- הרצה {run} · פורסרו {len(parsed)} הצעות ---")
        for item in parsed:
            print(f"  • {item}")
        if not parsed:
            print(f"  (לא נותח. גולמי: {raw[:120]}...)")
        print()

    return 0


if __name__ == "__main__":
    sys.exit(main())
