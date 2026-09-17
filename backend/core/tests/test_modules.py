"""Tests for `core.modules` — the vocabulary `specjalist_patient.module` holds.

Like `core.emotions` and `core.time_of_day`, the risky thing here is not a
function but an **agreement**: the same two values are declared a second time in
`frontend/src/utils/modules.ts`, and nothing but this file stops the two from
drifting. What drift costs here is concrete: the invite form is a `ChoiceField`,
so a value the frontend spells differently is a 400 with no screen to explain
it, and a label that disagrees is a patient reading one module's name on the
card and another's on the tile they tapped.

The labels are duplicated too, unlike `time_of_day` before §10's PDF: the panel
and the invitation card print them from the API (`module_label` travels on the
wire), *and* the frontend prints its own for the badge and the radio group. So
both sides are asserted, value for value and label for label.

Nothing here touches a database.
"""

import pathlib
import re

from django.test import SimpleTestCase

from core.modules import (MODULE_DIET, MODULE_LABELS, MODULE_PSYCHOTHERAPY,
                          MODULES, module_label)

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
MODULES_TS = REPO_ROOT / 'frontend' / 'src' / 'utils' / 'modules.ts'


class VocabularyTests(SimpleTestCase):

    def test_there_are_exactly_two_and_they_are_distinct(self):
        self.assertEqual(len(MODULES), 2)
        self.assertEqual(len(set(MODULES)), 2)

    def test_psychotherapy_comes_first(self):
        """The order the app presents them in, and the order migration 0022's
        backfill assumes: everything that existed before the table was a
        psychotherapy relationship."""
        self.assertEqual(MODULES[0], MODULE_PSYCHOTHERAPY)
        self.assertEqual(MODULES[1], MODULE_DIET)

    def test_the_values_are_technical_keys_rather_than_polish_labels(self):
        """What goes in the column and on the wire. 'Dietetyka' is what a screen
        prints, never what it sends."""
        for value in MODULES:
            with self.subTest(value=value):
                self.assertRegex(value, r'^[a-z]+$')

    def test_the_diet_value_is_spelled_the_way_the_urls_are(self):
        """`/api/diet/…`, `/diet/reports`, `MODULE_DIET` — one word, so a value
        read out of the database and a path read out of a log say the same
        thing."""
        self.assertEqual(MODULE_DIET, 'diet')

    def test_every_module_has_a_label(self):
        self.assertEqual(set(MODULE_LABELS), set(MODULES))

    def test_an_unknown_module_falls_back_to_its_own_value(self):
        """Display text: a row holding something unexpected should show up on
        the screen to be noticed, not turn a panel into a 500."""
        self.assertEqual(module_label('astrologia'), 'astrologia')


class FrontendAgreementTests(SimpleTestCase):
    """`frontend/src/utils/modules.ts` holds the same two, with the same names.

    Read rather than imported, obviously — there is no TypeScript here. The
    parse is deliberately narrow: if the file is restructured so these patterns
    stop matching, the test fails loudly instead of quietly checking nothing.
    """

    def frontend_values(self):
        source = MODULES_TS.read_text(encoding='utf-8')
        return dict(re.findall(
            r"export const MODULE_([A-Z_]+) = '([^']+)'", source,
        ))

    def frontend_labels(self):
        source = MODULES_TS.read_text(encoding='utf-8')
        block = re.search(
            r'export const MODULE_LABELS[^=]*= \{(.*?)\n\}', source, re.S,
        )
        self.assertIsNotNone(block, 'MODULE_LABELS not found — did the file move?')
        return dict(re.findall(
            r"\[MODULE_([A-Z_]+)\]:\s*'([^']+)'", block.group(1),
        ))

    def test_the_frontend_file_is_where_we_think_it_is(self):
        self.assertTrue(MODULES_TS.exists(), f'{MODULES_TS} is missing')

    def test_both_sides_declare_the_same_two_values(self):
        values = self.frontend_values()

        self.assertEqual(values.get('PSYCHOTHERAPY'), MODULE_PSYCHOTHERAPY)
        self.assertEqual(values.get('DIET'), MODULE_DIET)

    def test_both_sides_declare_the_same_labels(self):
        """The wire carries `module_label` from Python and the badge is drawn
        from TypeScript, so a patient can genuinely see both in one session."""
        labels = self.frontend_labels()

        self.assertEqual(labels.get('PSYCHOTHERAPY'), MODULE_LABELS[MODULE_PSYCHOTHERAPY])
        self.assertEqual(labels.get('DIET'), MODULE_LABELS[MODULE_DIET])

    def test_the_frontend_list_holds_exactly_these_two(self):
        source = MODULES_TS.read_text(encoding='utf-8')
        listed = re.search(r'export const MODULES = \[(.*?)\] as const', source, re.S)

        self.assertIsNotNone(listed, 'MODULES not found — did the file move?')
        names = re.findall(r'MODULE_([A-Z_]+)', listed.group(1))
        self.assertEqual(names, ['PSYCHOTHERAPY', 'DIET'])
