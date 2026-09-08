"""Tests for `core.time_of_day` — the "pora dnia" vocabulary the wire carries.

Like `core.emotions`, the risky thing here is not a function but an agreement:
the same four values are declared a second time in
`frontend/src/utils/timeOfDay.ts`, and until now nothing stopped the two from
drifting. CLAUDE.md asks for exactly this check ("timeOfDay.ts wants the same
cross-language check test_emotions.py runs over the emotion names"), and the
history is what makes it worth having: the form had been sending this field for
a while and a plain `serializers.Serializer` discarded it *without an error*, so
a patient picked "Wieczór", was told the entry was saved, reopened it and found
the question blank. A value spelled differently on one side is the same silent
loss, only with a 400 instead — which is the better failure and still not one
anybody wants to debug from a bug report.

The split of responsibilities is the other thing pinned here: only the four
technical keys live in Python, and the Polish labels live only in TypeScript. A
second copy of 'Rano'/'Południe'/'Wieczór'/'Noc' in Python would be one that can
quietly disagree — the opposite arrangement to `emotions.py`, where the Polish
name *is* the stored value.
"""

import re
from pathlib import Path

from django.test import SimpleTestCase

from core.diary import DiaryEntrySerializer
from core.models import Diary
from core.time_of_day import (EVENING, MORNING, NIGHT, NOON,
                              TIME_OF_DAY_CHOICES, TIMES_OF_DAY)

TIME_OF_DAY_TS = (
    Path(__file__).resolve().parent.parent.parent.parent
    / 'frontend' / 'src' / 'utils' / 'timeOfDay.ts'
)


class VocabularyTests(SimpleTestCase):
    def test_there_are_four_distinct_values(self):
        self.assertEqual(len(TIMES_OF_DAY), 4)
        self.assertEqual(len(set(TIMES_OF_DAY)), 4)

    def test_they_are_in_the_order_a_day_happens(self):
        """Chronological, so anything grouping by time of day — the analysis
        screen's heatmap is the first — reads in the order of a day rather than
        in whatever order the four names sort in."""
        self.assertEqual(TIMES_OF_DAY, (MORNING, NOON, EVENING, NIGHT))

    def test_the_values_are_the_technical_keys_and_not_the_polish_labels(self):
        """The API stores the key and never words it: the Polish label belongs to
        `frontend/src/utils/timeOfDay.ts` alone. A Polish string appearing here
        would be a second copy of the wording, free to disagree with the one on
        screen."""
        for value in TIMES_OF_DAY:
            with self.subTest(value=value):
                self.assertRegex(value, r'^[a-z]+$')

    def test_choices_pair_each_value_with_itself(self):
        """Django wants a label; the Polish one is the frontend's, and 'Morning'
        — which is what Django would invent — would be a third wording nobody
        asked for."""
        self.assertEqual(TIME_OF_DAY_CHOICES, tuple((value, value) for value in TIMES_OF_DAY))


class ModelAndSerializerTests(SimpleTestCase):
    """The two places the vocabulary is enforced, both reading it from here."""

    def test_the_diary_column_accepts_exactly_these_four(self):
        field = Diary._meta.get_field('time_of_day')

        self.assertEqual([value for value, _ in field.choices], list(TIMES_OF_DAY))

    def test_the_column_is_nullable_because_the_question_is_optional(self):
        """Every answer on the entry form is optional, and `0009` deliberately
        backfilled nothing: an older row says nothing about what time of day it
        describes, so NULL there is the correct value rather than a gap."""
        self.assertTrue(Diary._meta.get_field('time_of_day').null)

    def test_the_serializer_names_the_field_rather_than_ignoring_it(self):
        """THE BUG THIS FIELD EXISTS BECAUSE OF. `DiaryEntrySerializer` is a
        plain `Serializer`, which drops an undeclared key without an error — so
        for a while the form's answer was discarded silently and the patient was
        told the entry had been saved."""
        self.assertIn('time_of_day', DiaryEntrySerializer().fields)

    def test_an_answer_outside_the_four_buckets_is_a_400(self):
        """A ChoiceField rather than free text: the one thing this answer must
        never be again is quietly dropped, and free text would let 'popołudnie'
        into a column the frontend looks values up in."""
        serializer = DiaryEntrySerializer(data={'time_of_day': 'afternoon'})

        self.assertFalse(serializer.is_valid())
        self.assertIn('time_of_day', serializer.errors)

    def test_the_polish_label_is_not_an_accepted_value(self):
        """'Rano' is what the screen prints, never what it sends."""
        serializer = DiaryEntrySerializer(data={'time_of_day': 'Rano'})

        self.assertFalse(serializer.is_valid())

    def test_each_of_the_four_is_accepted(self):
        for value in TIMES_OF_DAY:
            with self.subTest(value=value):
                serializer = DiaryEntrySerializer(data={'time_of_day': value})

                self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_an_unanswered_question_is_accepted_as_null_and_as_absent(self):
        for data in ({'time_of_day': None}, {}):
            with self.subTest(data=data):
                serializer = DiaryEntrySerializer(data=data)

                self.assertTrue(serializer.is_valid(), serializer.errors)


class FrontendParityTests(SimpleTestCase):
    """The character-for-character agreement with utils/timeOfDay.ts.

    Nothing else enforces it: the value travels in both directions (the form
    sends one, the archive redraws its chip by looking the answer up), so a
    rename on one side alone is a 400 on save and a blank chip on read.
    """

    def frontend_options(self):
        source = TIME_OF_DAY_TS.read_text(encoding='utf-8')
        block = re.search(
            r'export const TIME_OF_DAY_OPTIONS = \[(.*?)\] as const', source, re.S,
        )
        self.assertIsNotNone(block, 'TIME_OF_DAY_OPTIONS not found — did the file move?')
        return re.findall(
            r"\{\s*value:\s*'([^']+)',\s*label:\s*'([^']+)'\s*\}", block.group(1),
        )

    def test_the_frontend_file_is_where_we_think_it_is(self):
        self.assertTrue(TIME_OF_DAY_TS.exists(), f'{TIME_OF_DAY_TS} is missing')

    def test_both_sides_declare_the_same_four_values(self):
        values = [value for value, _ in self.frontend_options()]

        self.assertEqual(sorted(values), sorted(TIMES_OF_DAY))

    def test_both_sides_declare_them_in_the_same_order(self):
        """The order carries meaning on both: the frontend's chip row and any
        chart grouped by time of day read chronologically, and so does anything
        here that iterates TIMES_OF_DAY."""
        values = [value for value, _ in self.frontend_options()]

        self.assertEqual(values, list(TIMES_OF_DAY))

    def test_every_value_has_a_polish_label_over_there(self):
        labels = {value: label for value, label in self.frontend_options()}

        self.assertEqual(labels, {
            'morning': 'Rano',
            'noon': 'Południe',
            'evening': 'Wieczór',
            'night': 'Noc',
        })

    def test_the_type_union_is_derived_from_the_options_rather_than_retyped(self):
        """A hand-written union is a third list to keep in step; the file derives
        `TimeOfDay` from TIME_OF_DAY_OPTIONS, so this test guards the derivation
        instead of the values."""
        source = TIME_OF_DAY_TS.read_text(encoding='utf-8')

        self.assertRegex(
            source,
            r"export type TimeOfDay = \(typeof TIME_OF_DAY_OPTIONS\)\[number\]\['value'\]",
        )
