"""Tests for `core.meals`'s vocabulary — the food diary's shared list.

Same shape as `test_drinks.py` and `test_emotions.py`, and for the same reason:
the riskiest thing here is not a function, it is an agreement. The six kinds are
declared a second time in `frontend/src/utils/meals.ts`, because the Polish name
*is* the stored value, and nothing but this file stops the two from drifting.

The failure it prevents is specific. `MealSerializer.kind` is a `ChoiceField`,
so a name spelled differently on one side is not a value quietly saved wrong —
it is a 400 on a chip the patient just pressed, with the screen unable to say
why. Which is the *better* of the two failures, and exactly why the field is a
ChoiceField (see `0009` in CLAUDE.md); this file is what keeps it from
happening at all.

The order is compared as well as the names: it is the order of a day, so it is
content rather than presentation, and the picker draws it straight through.

No database is touched.
"""

import re
from pathlib import Path

from django.test import SimpleTestCase

from core.meals import MAX_MEALS_PER_DAY, MEAL_KINDS

MEALS_TS = (
    Path(__file__).resolve().parent.parent.parent.parent
    / 'frontend' / 'src' / 'utils' / 'meals.ts'
)


def declared_in_typescript():
    """The names out of `MEAL_KINDS` in the .ts file, in declaration order."""
    source = MEALS_TS.read_text(encoding='utf-8')
    match = re.search(
        r'export const MEAL_KINDS = \[(.*?)\] as const', source, re.DOTALL)
    if not match:
        raise AssertionError(
            f'No `export const MEAL_KINDS = [...] as const` in {MEALS_TS}. '
            'If it was renamed or reshaped, this parser has to follow it — '
            'silently matching nothing would retire the guard.'
        )
    return re.findall(r"'([^']+)'", match.group(1))


class VocabularyTests(SimpleTestCase):
    def test_there_are_six_distinct_kinds(self):
        self.assertEqual(len(MEAL_KINDS), 6)
        self.assertEqual(len(set(MEAL_KINDS)), 6)

    def test_they_are_in_the_order_of_a_day(self):
        self.assertEqual(MEAL_KINDS[0], 'Śniadanie')
        self.assertEqual(MEAL_KINDS[-1], 'Przekąska')

    def test_none_of_them_names_a_quantity(self):
        """§04's scope: the module describes food, it does not measure it."""
        for kind in MEAL_KINDS:
            for measure in ('g', 'kcal', 'ml', 'porcj'):
                self.assertNotIn(measure, kind.lower().split())


class CrossLanguageTests(SimpleTestCase):
    """`frontend/src/utils/meals.ts` declares the same list, in the same order.

    Nothing else enforces this. The picker sends what it renders and the
    ChoiceField refuses anything else, so a rename on one side alone is a save
    that fails under a field the patient cannot see.
    """

    def test_typescript_declares_the_same_names_in_the_same_order(self):
        self.assertEqual(declared_in_typescript(), list(MEAL_KINDS))

    def test_the_parser_found_something(self):
        """Guards the guard: a regex that stops matching must fail, not pass."""
        self.assertEqual(len(declared_in_typescript()), 6)

    def test_neither_side_carries_a_polish_label_map(self):
        """The name is the value here, unlike `utils/timeOfDay.ts`.

        A label map would be a second thing to keep in step for nothing, and it
        is the shape somebody reaches for out of habit.
        """
        source = MEALS_TS.read_text(encoding='utf-8')
        self.assertNotIn('MEAL_KIND_LABELS', source)


class BackstopTests(SimpleTestCase):
    def test_a_day_holds_far_more_meals_than_anybody_writes(self):
        """It bounds the table, not the patient — see the constant's comment."""
        self.assertGreaterEqual(MAX_MEALS_PER_DAY, 3 * len(MEAL_KINDS))
