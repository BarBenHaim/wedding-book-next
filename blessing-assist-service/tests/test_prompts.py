"""
טסטים לחלקים הטהורים של השירות.

אין כאן אף קריאה לרשת. זו הסיבה שבניית הפרומפט והפרסור הופרדו
מ-app.py: אפשר לבדוק את הלוגיקה שבאמת יכולה להישבר, בלי מפתח API,
בלי עלות, ובמילישניות.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gemini import parse_list, strip_wrap
from prompts import (
    DEFAULT_MAX_CHARS,
    build_ideas_prompt,
    build_improve_prompt,
    build_system_prompt,
    event_context,
)


class TestEventContext:
    def test_maps_each_event_type(self):
        assert event_context("wedding")["occasion"] == "a wedding"
        assert event_context("bar_mitzvah")["occasion"] == "a bar mitzvah"
        assert event_context("birthday")["occasion"] == "a birthday"

    def test_unknown_type_falls_back_rather_than_crashing(self):
        # אירוע לא מוכר לא אמור להפיל בקשה — עדיף ברכה גנרית מ-500.
        assert event_context("something_new")["occasion"] == "a celebration"

    def test_uses_the_real_names_when_given(self):
        assert event_context("wedding", "דנה ויוסי")["who"] == "דנה ויוסי"

    def test_falls_back_to_a_role_when_no_name(self):
        assert event_context("wedding")["who"] == "the couple"
        assert event_context("wedding", "   ")["who"] == "the couple"


class TestSystemPrompt:
    def test_states_the_output_language(self):
        assert "Write ONLY in Hebrew" in build_system_prompt("wedding", locale="he")
        assert "Write ONLY in English" in build_system_prompt("wedding", locale="en")

    def test_unknown_locale_defaults_to_hebrew(self):
        assert "Hebrew" in build_system_prompt("wedding", locale="klingon")

    def test_carries_the_length_cap_the_event_set(self):
        assert "under 300 characters" in build_system_prompt("wedding", max_chars=300)

    def test_keeps_the_rule_that_stops_invented_names(self):
        # הוספתי את השורה הזו אחרי שהמודל חתם ברכה בשם "ש." שלא קיים.
        # אם מישהו ימחק אותה, הטסט הזה יתפוס את זה.
        assert "never invent names" in build_system_prompt("wedding")

    def test_grounds_on_the_event_and_the_people(self):
        prompt = build_system_prompt("bat_mitzvah", "מיכל")
        assert "bat mitzvah" in prompt
        assert "מיכל" in prompt


class TestImprovePrompt:
    def test_includes_the_draft(self):
        assert "טיוטה שלי" in build_improve_prompt("טיוטה שלי", "wedding")

    def test_asks_to_keep_the_writer_voice(self):
        # זו כל הנקודה של המצב הזה: לשפר בלי לכתוב מחדש.
        assert "personal voice" in build_improve_prompt("x", "wedding")


class TestIdeasPrompt:
    def test_asks_for_json_so_the_output_can_be_parsed(self):
        assert "JSON array" in build_ideas_prompt("wedding")

    def test_weaves_in_the_details_the_guest_gave(self):
        prompt = build_ideas_prompt("wedding", "דנה", relationship="חבר מהצבא",
                                    memory="הטיול בתאילנד", tone="מצחיק")
        assert "חבר מהצבא" in prompt
        assert "הטיול בתאילנד" in prompt
        assert "מצחיק" in prompt

    def test_says_so_explicitly_when_no_details_were_given(self):
        # בלי המשפט הזה המודל ממציא פרטים כדי למלא את החלל.
        assert "No extra details" in build_ideas_prompt("wedding")

    def test_demands_three_distinct_blessings(self):
        prompt = build_ideas_prompt("wedding")
        assert "3 DISTINCT" in prompt
        assert "different in angle" in prompt


class TestStripWrap:
    def test_removes_surrounding_quotes(self):
        assert strip_wrap('"ברכה"') == "ברכה"
        assert strip_wrap("“ברכה”") == "ברכה"

    def test_removes_a_label_the_model_added(self):
        assert strip_wrap("Blessing: ברכה") == "ברכה"
        assert strip_wrap("ברכה: שיהיה במזל") == "שיהיה במזל"

    def test_survives_empty_and_none(self):
        assert strip_wrap("") == ""
        assert strip_wrap(None) == ""


class TestParseList:
    def test_reads_a_clean_json_array(self):
        assert parse_list('["א","ב","ג"]') == ["א", "ב", "ג"]

    def test_reads_json_even_when_the_model_wrapped_it_in_chatter(self):
        # זה קורה בפועל, ולכן יש חיפוש של הסוגריים ולא json.loads ישיר.
        raw = 'Sure! Here you go:\n["א","ב"]\nHope that helps'
        assert parse_list(raw) == ["א", "ב"]

    def test_falls_back_to_numbered_lines(self):
        assert parse_list("1. ברכה אחת\n2. ברכה שתיים") == ["ברכה אחת", "ברכה שתיים"]

    def test_falls_back_to_bullets(self):
        assert parse_list("- ברכה אחת\n- ברכה שתיים") == ["ברכה אחת", "ברכה שתיים"]

    def test_falls_back_to_blank_line_separation(self):
        assert parse_list("ברכה אחת\n\nברכה שתיים") == ["ברכה אחת", "ברכה שתיים"]

    def test_never_returns_more_than_three(self):
        assert len(parse_list("1. א\n2. ב\n3. ג\n4. ד")) <= 3

    def test_drops_empty_entries(self):
        assert parse_list('["א","","ב"]') == ["א", "ב"]

    def test_returns_a_list_for_junk_rather_than_raising(self):
        # המשתמש לא אמור לראות 500 בגלל פלט מוזר של המודל.
        for junk in ["", None, "???", "[not json"]:
            assert isinstance(parse_list(junk), list)

    def test_rescues_the_complete_strings_from_a_truncated_array(self):
        # השכל הזה הגיע מהרצה אמיתית: Gemini 3.6 החזיר מערך JSON שנחתך
        # בתקציב הטוקנים, ו-parse_list החזיר את הטקסט הגולמי כ"הצעה"
        # אחת שמתחילה ב-'['. עכשיו שולפים את המחרוזות ששרדו.
        truncated = '[\n  "ברכה ראשונה שלמה ומלאה בשמחה.",\n  "ברכה שנייה שלמה גם היא.",\n  "שלישית שנחת'
        out = parse_list(truncated)
        assert out == ["ברכה ראשונה שלמה ומלאה בשמחה.", "ברכה שנייה שלמה גם היא."]
        assert not any(x.startswith("[") for x in out)

    def test_unescapes_quotes_inside_a_rescued_string(self):
        raw = '[\n  "הוא אמר \\"מזל טוב\\" בקול רם ומלא שמחה אמיתית",\n  "שנייה שנח'
        out = parse_list(raw)
        assert out == ['הוא אמר "מזל טוב" בקול רם ומלא שמחה אמיתית']
