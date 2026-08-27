"""Tests for `core.emotions` — the vocabulary both halves of the app share.

The riskiest thing here is not a function, it is an agreement: the same ten
strings are declared a second time in `frontend/src/utils/emotions.ts`, and
nothing but this test stops the two from drifting. A name added on one side only
loses its colour on the chart; a name spelled differently loses its bar entirely.
"""

import re
from pathlib import Path

from django.test import SimpleTestCase

from core.emotions import (EMOTIONS, MOOD_SCALE_EMOTIONS, STRES,
                           normalize_emotion)

EMOTIONS_TS = (
    Path(__file__).resolve().parent.parent.parent.parent
    / 'frontend' / 'src' / 'utils' / 'emotions.ts'
)


class VocabularyTests(SimpleTestCase):
    def test_there_are_ten_distinct_emotions(self):
        self.assertEqual(len(EMOTIONS), 10)
        self.assertEqual(len(set(EMOTIONS)), 10)

    def test_every_emotion_can_be_stored_as_a_number(self):
        """Nine have a `mood_scale` column; 'Stres' lives on the diary row."""
        scaled = {emotion for _, emotion in MOOD_SCALE_EMOTIONS}

        self.assertEqual(scaled | {STRES}, set(EMOTIONS))

    def test_no_two_emotions_share_a_scale_column(self):
        columns = [column for column, _ in MOOD_SCALE_EMOTIONS]

        self.assertEqual(len(columns), len(set(columns)))

    def test_every_canonical_name_normalizes_to_itself(self):
        for emotion in EMOTIONS:
            with self.subTest(emotion=emotion):
                self.assertEqual(normalize_emotion(emotion), emotion)


class FrontendParityTests(SimpleTestCase):
    """The character-for-character agreement with utils/emotions.ts."""

    def frontend_names(self):
        source = EMOTIONS_TS.read_text(encoding='utf-8')
        block = re.search(
            r'export const EMOTION_COLORS: Record<EmotionName, string> = \{(.*?)\}',
            source, re.S,
        )
        self.assertIsNotNone(block, 'EMOTION_COLORS not found — did the file move?')
        names = []
        for line in block.group(1).splitlines():
            match = re.match(r"\s*'([^']+)':|\s*([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]+):", line)
            if match:
                names.append(match.group(1) or match.group(2))
        return names

    def test_the_frontend_file_is_where_we_think_it_is(self):
        self.assertTrue(EMOTIONS_TS.exists(), f'{EMOTIONS_TS} is missing')

    def test_both_sides_declare_them_in_the_same_order(self):
        """Not pedantry: the order breaks ties in the report rankings, on both
        sides. `core/reports.py` reads it out of EMOTIONS, the browser used to
        read it out of EMOTION_COLORS' keys — two equally-rated emotions have to
        come out in the same order wherever they are ranked, or the same week
        reads differently on two screens."""
        self.assertEqual(self.frontend_names(), list(EMOTIONS))

    def test_both_sides_list_exactly_the_same_ten_names(self):
        self.assertEqual(sorted(self.frontend_names()), sorted(EMOTIONS))

    def test_every_frontend_name_has_a_colour(self):
        source = EMOTIONS_TS.read_text(encoding='utf-8')

        for emotion in EMOTIONS:
            with self.subTest(emotion=emotion):
                # Either quoted (multi-word) or bare, followed by a hex colour.
                self.assertRegex(source, rf"'?{re.escape(emotion)}'?:\s*'#[0-9A-Fa-f]{{6}}'")

    def test_the_type_union_matches_the_colour_map(self):
        source = EMOTIONS_TS.read_text(encoding='utf-8')
        union = re.search(r'export type EmotionName =(.*?)\n\n', source, re.S).group(1)
        declared = re.findall(r"'([^']+)'", union)

        self.assertEqual(sorted(declared), sorted(EMOTIONS))


class NormalizeEmotionTests(SimpleTestCase):
    def test_a_patient_s_own_wording_maps_onto_the_vocabulary(self):
        self.assertEqual(normalize_emotion('niepokój'), 'Lęk')
        self.assertEqual(normalize_emotion('gniew'), 'Złość')
        self.assertEqual(normalize_emotion('wyrzuty sumienia'), 'Poczucie winy')

    def test_it_ignores_case_accents_and_stray_whitespace(self):
        for text in ('LĘK', 'lek', '  Lęk  ', 'lĘk'):
            with self.subTest(text=text):
                self.assertEqual(normalize_emotion(text), 'Lęk')

    def test_a_word_outside_the_vocabulary_is_not_forced_into_the_nearest_one(self):
        # 'zmęczenie' is in the seed data and is genuinely none of the ten;
        # guessing would put a wrong colour on somebody's chart.
        self.assertIsNone(normalize_emotion('zmęczenie'))
        self.assertIsNone(normalize_emotion('ekscytacja'))

    def test_polish_stroked_l_is_folded_like_any_other_diacritic(self):
        """NFKD cannot decompose 'ł', so it needs handling of its own.

        Without it 'Złość' — a canonical name the API itself writes into
        `current_strongest_emotion` — was not recognised by its own vocabulary,
        and the dashboard quietly fell back to the highest rating instead of the
        emotion the entry declared.
        """
        self.assertEqual(normalize_emotion('Złość'), 'Złość')
        self.assertEqual(normalize_emotion('złość'), 'Złość')
        self.assertEqual(normalize_emotion('zlosc'), 'Złość')
        self.assertEqual(normalize_emotion('wściekłość'), 'Złość')
        self.assertEqual(normalize_emotion('zakłopotanie'), 'Wstyd')

    def test_empty_input_is_answered_with_none_rather_than_an_error(self):
        for text in (None, '', '   '):
            with self.subTest(text=text):
                self.assertIsNone(normalize_emotion(text))
