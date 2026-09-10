"""Tests for `core.drinks` — the hydration screen's shared vocabulary.

Same shape as `test_emotions.py`, and for the same reason: the riskiest thing
here is not a function, it is an agreement. The six names are declared a second
time in `frontend/src/utils/drinks.ts` and nothing but this file stops the two
from drifting. A name spelled differently on one side is a chip the server
answers 400 to, with the screen unable to say why.

The other half is the rule the names encode: only water counts. If a coefficient
for tea ever appears in either module, `WaterIsTheOnlyOneCountedTests` is what
says the client decided otherwise.

No database is touched.
"""

import re
from pathlib import Path

from django.test import SimpleTestCase

from core.drinks import (BOTTLE_ML, DAILY_TARGET_GLASSES, DRINKS, GLASS_ML,
                         MAX_AMOUNT_ML, MAX_ENTRIES_PER_DAY, MIN_AMOUNT_ML,
                         OTHER_DRINKS, WATER, WEEK_DAYS)

DRINKS_TS = (
    Path(__file__).resolve().parent.parent.parent.parent
    / 'frontend' / 'src' / 'utils' / 'drinks.ts'
)


class VocabularyTests(SimpleTestCase):
    def test_there_are_six_distinct_drinks(self):
        self.assertEqual(len(DRINKS), 6)
        self.assertEqual(len(set(DRINKS)), 6)

    def test_water_is_first_and_is_not_one_of_the_others(self):
        self.assertEqual(DRINKS[0], WATER)
        self.assertNotIn(WATER, OTHER_DRINKS)

    def test_drinks_is_water_plus_the_others_in_order(self):
        self.assertEqual(DRINKS, (WATER,) + OTHER_DRINKS)

    def test_water_with_lemon_is_one_of_the_others(self):
        """The client's own list puts it under "Inne napoje". Reading that as an
        oversight and counting it as water would answer a clinical question this
        app is not entitled to answer."""
        self.assertIn('Woda z cytryną', OTHER_DRINKS)


class WaterIsTheOnlyOneCountedTests(SimpleTestCase):
    """"Herbata, kawa i napary są zapisywane, ale nie przeliczane na wodę —
    decyzja merytoryczna zostaje po stronie specjalisty." (mockups §08)"""

    def test_the_module_holds_no_conversion_factor_of_any_kind(self):
        source = (Path(__file__).resolve().parent.parent / 'drinks.py').read_text(
            encoding='utf-8')

        for name in OTHER_DRINKS:
            with self.subTest(drink=name):
                # A coefficient would have to name the drink it applies to.
                self.assertNotRegex(
                    source, rf"{re.escape(name)}'\s*:\s*[\d.]",
                    'a per-drink number here would be a conversion the client '
                    'said not to make',
                )

    def test_the_same_holds_on_the_frontend(self):
        source = DRINKS_TS.read_text(encoding='utf-8')

        for name in OTHER_DRINKS:
            with self.subTest(drink=name):
                self.assertNotRegex(source, rf"{re.escape(name)}'\s*:\s*[\d.]")


class AmountTests(SimpleTestCase):
    def test_a_bottle_is_more_than_a_glass(self):
        self.assertGreater(BOTTLE_ML, GLASS_ML)

    def test_both_servings_are_within_the_bounds_a_custom_amount_may_use(self):
        """Otherwise a button on the screen would submit a value the serializer
        refuses."""
        for amount in (GLASS_ML, BOTTLE_ML):
            with self.subTest(amount=amount):
                self.assertGreaterEqual(amount, MIN_AMOUNT_ML)
                self.assertLessEqual(amount, MAX_AMOUNT_ML)

    def test_the_goal_is_reachable_and_the_cap_is_not(self):
        """`MAX_ENTRIES_PER_DAY` is a backstop against a stuck button, not a
        product rule — nobody must be able to meet it by drinking."""
        self.assertLess(DAILY_TARGET_GLASSES, MAX_ENTRIES_PER_DAY)

    def test_the_chart_covers_a_week(self):
        self.assertEqual(WEEK_DAYS, 7)


class FrontendParityTests(SimpleTestCase):
    """The character-for-character agreement with utils/drinks.ts."""

    def source(self):
        return DRINKS_TS.read_text(encoding='utf-8')

    def frontend_water(self):
        match = re.search(r"export const WATER = '([^']+)'", self.source())
        self.assertIsNotNone(match, 'WATER not found in utils/drinks.ts')
        return match.group(1)

    def frontend_others(self):
        block = re.search(
            r'export const OTHER_DRINKS = \[(.*?)\] as const', self.source(), re.S)
        self.assertIsNotNone(block, 'OTHER_DRINKS not found in utils/drinks.ts')
        return tuple(re.findall(r"'([^']+)'", block.group(1)))

    def test_water_is_spelled_the_same_on_both_sides(self):
        self.assertEqual(self.frontend_water(), WATER)

    def test_the_other_drinks_are_the_same_names(self):
        self.assertEqual(set(self.frontend_others()), set(OTHER_DRINKS))

    def test_and_in_the_same_order(self):
        """The chips are drawn in declaration order, and §08 fixes it."""
        self.assertEqual(self.frontend_others(), OTHER_DRINKS)
