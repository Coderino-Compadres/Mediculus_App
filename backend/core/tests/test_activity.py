"""Tests for `core.activity`'s vocabulary — §09's shared lists.

Same shape as `test_meals.py`, `test_drinks.py` and `test_emotions.py`, and for
the same reason: the riskiest thing here is not a function, it is an agreement.
Both lists are declared a second time in `frontend/src/utils/activity.ts`, and
nothing but this file stops the two from drifting.

The failure it prevents is specific. `ActivitySerializer.kind` and
`.feeling_after` are `ChoiceField`s, so a name spelled differently on one side
is not a value quietly saved wrong — it is a 400 on a chip the patient just
pressed, with the screen unable to say why. Which is the *better* of the two
failures (see `0009` in CLAUDE.md), and this file is what keeps it from
happening at all.

The two lists are split differently on purpose and that is checked too:
`ACTIVITY_KINDS` are Polish names and the name *is* the stored value, while
`FEELING_AFTER` are technical keys whose Polish labels live in the frontend.
The second split exists because those three words are a copy decision that has
already moved once (the mockup says "Dobre", the app says "Lepsze"), and a copy
decision must not be a schema change.

No database is touched.
"""

import re
from pathlib import Path

from django.test import SimpleTestCase

from core.activity import (ACTIVITY_KIND_CHOICES, ACTIVITY_KIND_OTHER,
                           ACTIVITY_KINDS, DAY_IS_FULL, FEELING_AFTER,
                           MAX_ACTIVITIES_PER_DAY, MAX_DURATION_MINUTES,
                           kind_label)

ACTIVITY_TS = (
    Path(__file__).resolve().parent.parent.parent.parent
    / 'frontend' / 'src' / 'utils' / 'activity.ts'
)


def _source():
    return ACTIVITY_TS.read_text(encoding='utf-8')


def kinds_in_typescript():
    """The names out of `ACTIVITY_KINDS` in the .ts file, in declaration order."""
    match = re.search(
        r'export const ACTIVITY_KINDS = \[(.*?)\] as const', _source(), re.DOTALL)
    if not match:
        raise AssertionError(
            f'No `export const ACTIVITY_KINDS = [...] as const` in {ACTIVITY_TS}. '
            'If it was renamed or reshaped, this parser has to follow it — '
            'silently matching nothing would retire the guard.'
        )
    return re.findall(r"'([^']+)'", match.group(1))


def feelings_in_typescript():
    """The `value:` keys out of `FEELING_AFTER_OPTIONS`, in declaration order."""
    match = re.search(
        r'export const FEELING_AFTER_OPTIONS = \[(.*?)\] as const',
        _source(), re.DOTALL,
    )
    if not match:
        raise AssertionError(
            f'No `export const FEELING_AFTER_OPTIONS = [...] as const` in '
            f'{ACTIVITY_TS}. This parser has to follow a rename — silently '
            'matching nothing would retire the guard.'
        )
    return re.findall(r"value: '([^']+)'", match.group(1))


class VocabularyTests(SimpleTestCase):
    def test_there_are_six_distinct_kinds(self):
        self.assertEqual(len(ACTIVITY_KINDS), 6)
        self.assertEqual(len(set(ACTIVITY_KINDS)), 6)

    def test_the_free_text_chip_is_a_value_the_column_may_hold(self):
        """"Inne" is a chip the patient chose, not a value outside the list.

        Which is why it is in `ACTIVITY_KIND_CHOICES` rather than handled as an
        absence: the answer "something else, and here is what" is two columns
        and one answer, the shape `activityKindLabel` reads.
        """
        self.assertIn(ACTIVITY_KIND_OTHER, ACTIVITY_KIND_CHOICES)
        self.assertNotIn(ACTIVITY_KIND_OTHER, ACTIVITY_KINDS)
        self.assertEqual(len(ACTIVITY_KIND_CHOICES), len(ACTIVITY_KINDS) + 1)

    def test_the_feeling_scale_starts_at_the_negative_answer(self):
        """§09's own design note: for part of these patients movement can be a
        burden, so "gorsze" has to be exactly as easy to give as "lepsze"."""
        self.assertEqual(FEELING_AFTER[0], 'worse')
        self.assertEqual(FEELING_AFTER[-1], 'better')
        self.assertEqual(len(FEELING_AFTER), 3)

    def test_nothing_in_either_list_measures_anything(self):
        """The module records what somebody wrote down, not what a device read.

        No intensity, no effort, no pace, no heart rate, no calorie — those are
        excluded by §09 rather than missing, and this list is where one would
        arrive looking like an improvement.
        """
        for value in ACTIVITY_KIND_CHOICES + FEELING_AFTER:
            lowered = value.lower()
            for measure in ('kcal', 'kalor', 'tętno', 'puls', 'intensyw', 'tempo'):
                self.assertNotIn(measure, lowered)


class KindLabelTests(SimpleTestCase):
    """The chip and its free text are two columns and one answer."""

    def test_a_plain_chip_answers_itself(self):
        self.assertEqual(kind_label('Spacer', None), 'Spacer')

    def test_the_other_chip_answers_with_what_was_typed(self):
        self.assertEqual(kind_label(ACTIVITY_KIND_OTHER, 'Nordic walking'),
                         'Nordic walking')

    def test_the_other_chip_with_nothing_typed_is_unanswered(self):
        """An ordinary state: no field on this form blocks a save."""
        self.assertIsNone(kind_label(ACTIVITY_KIND_OTHER, ''))
        self.assertIsNone(kind_label(ACTIVITY_KIND_OTHER, '   '))
        self.assertIsNone(kind_label(ACTIVITY_KIND_OTHER, None))

    def test_no_chip_at_all_is_unanswered(self):
        self.assertIsNone(kind_label(None, ''))

    def test_the_free_text_is_trimmed(self):
        self.assertEqual(kind_label(ACTIVITY_KIND_OTHER, '  Taniec w kuchni  '),
                         'Taniec w kuchni')


class CrossLanguageTests(SimpleTestCase):
    """`frontend/src/utils/activity.ts` declares the same two lists.

    Nothing else enforces this. The form sends what it renders and both
    ChoiceFields refuse anything else, so a rename on one side alone is a save
    that fails under a control the patient cannot see.
    """

    def test_typescript_declares_the_same_kinds_in_the_same_order(self):
        self.assertEqual(kinds_in_typescript(), list(ACTIVITY_KINDS))

    def test_typescript_declares_the_same_feelings_in_the_same_order(self):
        self.assertEqual(feelings_in_typescript(), list(FEELING_AFTER))

    def test_typescript_declares_the_same_other_chip(self):
        match = re.search(
            r"export const ACTIVITY_KIND_OTHER = '([^']+)'", _source())
        self.assertIsNotNone(match, 'ACTIVITY_KIND_OTHER not found in the .ts')
        self.assertEqual(match.group(1), ACTIVITY_KIND_OTHER)

    def test_the_parsers_found_something(self):
        """Guards the guards: a regex that stops matching must fail, not pass."""
        self.assertEqual(len(kinds_in_typescript()), 6)
        self.assertEqual(len(feelings_in_typescript()), 3)

    def test_the_kinds_carry_no_label_map_and_the_feelings_do(self):
        """The two halves are split differently, and on purpose.

        A kind's Polish name *is* its stored value, so a label map for it would
        be a second thing to keep in step for nothing. A feeling's is not, which
        is exactly what lets "Dobre" become "Lepsze" without a migration.
        """
        source = _source()
        self.assertNotIn('ACTIVITY_KIND_LABELS', source)
        self.assertIn('FEELING_AFTER_LABELS', source)


class BackstopTests(SimpleTestCase):
    def test_a_day_holds_far_more_activities_than_anybody_records(self):
        """It bounds the table, not the patient."""
        self.assertGreaterEqual(MAX_ACTIVITIES_PER_DAY, 10)

    def test_an_activity_cannot_outlast_the_day_it_is_filed_under(self):
        self.assertEqual(MAX_DURATION_MINUTES, 24 * 60)

    def test_the_full_day_refusal_is_not_a_judgement_about_moving(self):
        """Worded as a limit on the list, like `meals.DAY_IS_FULL` is about food.

        This module must never have an opinion about how much somebody moves —
        it is the same care the food diary takes about how much somebody eats.
        """
        lowered = DAY_IS_FULL.lower()
        for judgement in ('za dużo', 'za dużo', 'przesad', 'wystarcz',
                          'nie możesz', 'nie możesz'):
            self.assertNotIn(judgement, lowered)
