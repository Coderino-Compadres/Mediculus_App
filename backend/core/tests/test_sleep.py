"""Tests for `core.sleep` — §09's night, and the one rule the data does not state.

The cross-language half is `test_activity.py`'s, for the same reason: the wake
feelings are declared a second time in `frontend/src/utils/sleep.ts`, they
travel over the wire, and `SleepSerializer.wake_feeling` is a `ChoiceField` — so
a rename on one side alone is a 400 on a chip the patient just pressed.

The rest of this file is about `has_night`, which is a rule rather than a
formatting choice: it decides whether a morning counts as answered, and
therefore whether a day appears in a weekly report at all. Its one subtlety —
that a zero in `awakenings` is not an answer — is the same reading
`hasSleep` takes in `frontend/src/utils/dietReport.ts`, and the two must not
drift.

No database is touched.
"""

import datetime
import re
from pathlib import Path

from django.test import SimpleTestCase

from core.sleep import (MAX_AWAKENINGS, SLEEP_QUALITY_VALUES, WAKE_FEELINGS,
                        has_night, serialize_night)

SLEEP_TS = (
    Path(__file__).resolve().parent.parent.parent.parent
    / 'frontend' / 'src' / 'utils' / 'sleep.ts'
)


def _source():
    return SLEEP_TS.read_text(encoding='utf-8')


def feelings_in_typescript():
    """The `value:` keys out of `WAKE_FEELING_OPTIONS`, in declaration order."""
    match = re.search(
        r'export const WAKE_FEELING_OPTIONS = \[(.*?)\] as const',
        _source(), re.DOTALL,
    )
    if not match:
        raise AssertionError(
            f'No `export const WAKE_FEELING_OPTIONS = [...] as const` in '
            f'{SLEEP_TS}. This parser has to follow a rename — silently '
            'matching nothing would retire the guard.'
        )
    return re.findall(r"value: '([^']+)'", match.group(1))


def quality_in_typescript():
    match = re.search(
        r'export const SLEEP_QUALITY_VALUES = \[(.*?)\] as const', _source())
    if not match:
        raise AssertionError(f'No SLEEP_QUALITY_VALUES in {SLEEP_TS}')
    return [int(value) for value in re.findall(r'\d+', match.group(1))]


class VocabularyTests(SimpleTestCase):
    def test_there_are_four_distinct_wake_feelings(self):
        self.assertEqual(len(WAKE_FEELINGS), 4)
        self.assertEqual(len(set(WAKE_FEELINGS)), 4)

    def test_the_quality_scale_is_one_to_five(self):
        self.assertEqual(list(SLEEP_QUALITY_VALUES), [1, 2, 3, 4, 5])

    def test_nothing_here_scores_a_night(self):
        """§09 describes a night; it does not grade one.

        No "sleep score", no efficiency, no debt — the vocabulary is four words
        about how somebody felt, and this is the list one would be added to.
        """
        for value in WAKE_FEELINGS:
            for scored in ('score', 'wynik', 'ocena', 'efficiency', 'debt'):
                self.assertNotIn(scored, value.lower())


class CrossLanguageTests(SimpleTestCase):
    """`frontend/src/utils/sleep.ts` declares the same lists, in the same order."""

    def test_typescript_declares_the_same_feelings_in_the_same_order(self):
        self.assertEqual(feelings_in_typescript(), list(WAKE_FEELINGS))

    def test_typescript_declares_the_same_quality_scale(self):
        self.assertEqual(quality_in_typescript(), list(SLEEP_QUALITY_VALUES))

    def test_the_parsers_found_something(self):
        """Guards the guards: a regex that stops matching must fail, not pass."""
        self.assertEqual(len(feelings_in_typescript()), 4)
        self.assertEqual(len(quality_in_typescript()), 5)

    def test_the_polish_labels_stay_in_typescript(self):
        """Technical keys here, wording there — the `time_of_day.py` split.

        A second copy of "Wyspanie" in Python would be one free to disagree, and
        the whole point of keying these is that the wording can change without a
        migration.
        """
        source = _source()
        self.assertIn('WAKE_FEELING_LABELS', source)
        for label in ('Wyspanie', 'Ociężałość', 'Spokój', 'Napięcie'):
            self.assertIn(label, source)


class SerializeTests(SimpleTestCase):
    def test_a_morning_nobody_answered_for_is_an_empty_shape(self):
        """Not a 404 and not None: the panel starts from exactly this."""
        day = datetime.date(2026, 9, 4)
        night = serialize_night(None, day)

        self.assertEqual(night['date'], '2026-09-04')
        self.assertIsNone(night['fell_asleep_at'])
        self.assertIsNone(night['woke_up_at'])
        self.assertIsNone(night['quality'])
        self.assertIsNone(night['wake_feeling'])
        self.assertEqual(night['awakenings'], 0)


class HasNightTests(SimpleTestCase):
    """Whether a morning counts as answered — which decides whether a day shows
    up in a weekly report at all."""

    def empty(self, **overrides):
        night = serialize_night(None, datetime.date(2026, 9, 4))
        night.update(overrides)
        return night

    def test_an_untouched_night_is_not_described(self):
        self.assertFalse(has_night(self.empty()))

    def test_any_one_real_answer_describes_it(self):
        for field, value in (
            ('fell_asleep_at', '23:40'),
            ('woke_up_at', '06:50'),
            ('quality', 3),
            ('wake_feeling', 'rested'),
        ):
            with self.subTest(field=field):
                self.assertTrue(has_night(self.empty(**{field: value})))

    def test_zero_awakenings_is_not_an_answer(self):
        """The one subtlety, and it is shared with the frontend's `hasSleep`.

        Zero is both "an unbroken night" and the stepper's own starting value,
        and the two cannot be told apart — so the quieter reading wins and a
        night whose only non-default field is a zero it was born with does not
        count as described. Printing otherwise would report an answer nobody
        gave.
        """
        self.assertFalse(has_night(self.empty(awakenings=0)))

    def test_a_positive_count_is_an_answer(self):
        self.assertTrue(has_night(self.empty(awakenings=1)))


class BackstopTests(SimpleTestCase):
    def test_the_interruption_count_is_bounded(self):
        """A held stepper must not write a figure into a clinical record."""
        self.assertGreaterEqual(MAX_AWAKENINGS, 10)
        self.assertLessEqual(MAX_AWAKENINGS, 100)
