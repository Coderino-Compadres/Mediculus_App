"""The drift `makemigrations` cannot see, part two: the diagram.

test_schema_sync.py already compares `scripts/database_setup.sql` with
`core.models`. The third description of the same schema is `ERD/DIAGRAM.drawio`,
and CLAUDE.md says plainly why it needs a guard of its own: the file and its
.png/.pdf exports are edited and generated **by hand** — there is no drawio CLI
on the dev machine — so nothing at all notices when a migration adds a column
and the picture is left behind.

The .drawio file is uncompressed XML, so it can be read the same way the SQL
script is: tables are the cells sitting directly on the canvas, and a column is
any cell two levels below one of them whose label reads "NAME : TYPE".

Nothing here touches a database.
"""

import html
import pathlib
import re
import xml.etree.ElementTree as ET

from django.test import SimpleTestCase

from core import models

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
ERD_PATH = REPO_ROOT / 'ERD' / 'DIAGRAM.drawio'

#: Every model whose table the diagram is meant to describe.
DIAGRAMMED_MODELS = [
    models.UserRole, models.User, models.Specjalist, models.Patient,
    models.ParentChild, models.Diary, models.MoodScale, models.Technique,
    models.Raport,
]

#: Columns the diagram is known to be missing, as of the last time this test was
#: updated. This is a to-do list, not a blessing: the assertion below is exact
#: equality, so adding a column to the diagram fails the test until its entry is
#: deleted from here, and adding one to the models fails it until either the
#: diagram or this list catches up. An empty dict is the goal.
#:
#: `user`'s two consent columns arrived with migration 0004, `parent_child`'s
#: with 0007. `patient.id_medical` and `raport.id_technique` have simply never
#: been drawn — the first of the two is the pseudonymized join the whole
#: two-database split is built on, so it is the one worth drawing first.
KNOWN_ERD_GAPS = {
    'user': {'data_consent_at', 'services_consent_at'},
    'patient': {'id_medical'},
    'parent_child': {'accepted_at'},
    'raport': {'id_technique'},
}


def clean(raw):
    """A cell's label as text: drawio stores it as HTML, and hand-editing shows.

    Entities, <br>, <span style=...> wrappers and non-breaking spaces all turn
    up in this file because the labels were typed in the editor rather than
    generated.
    """
    text = html.unescape(raw or '')
    text = re.sub(r'<br\s*/?>', ' ', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    return re.sub(r'\s+', ' ', text.replace('\xa0', ' ')).strip()


def parse_erd(path):
    """{table name: {column names}} as the diagram draws them.

    Table labels are upper-case identifiers sitting directly on the canvas
    (parent '1'); a column is a cell whose grandparent is one of those, labelled
    "COLUMN : TYPE". Whitespace inside a name is folded to an underscore, so the
    diagram's "UPDATED AT" answers to `updated_at` — a typo worth tolerating
    rather than reporting as missing.
    """
    cells = {cell.get('id'): cell for cell in ET.parse(path).getroot().iter('mxCell')}
    parent_of = {key: cell.get('parent') for key, cell in cells.items()}

    tables = {
        key: clean(cell.get('value')).lower()
        for key, cell in cells.items()
        if parent_of.get(key) == '1'
        and re.fullmatch(r'[A-Z_]{3,}', clean(cell.get('value')))
    }

    columns = {name: set() for name in tables.values()}
    for key, cell in cells.items():
        label = clean(cell.get('value'))
        if ':' not in label:
            continue
        table_id = parent_of.get(parent_of.get(key))
        if table_id not in tables:
            continue
        name = re.sub(r'\s+', '_', label.split(':')[0].strip()).lower()
        columns[tables[table_id]].add(name)
    return columns


def model_columns(model):
    return {field.column for field in model._meta.concrete_fields}


class ErdParsingTests(SimpleTestCase):
    """If the parser stops finding things, the drift tests below go quiet."""

    def test_the_diagram_is_where_we_think_it_is(self):
        self.assertTrue(ERD_PATH.exists(), f'brak {ERD_PATH}')

    def test_every_table_the_models_declare_appears_in_the_diagram(self):
        drawn = parse_erd(ERD_PATH)

        for model in DIAGRAMMED_MODELS:
            with self.subTest(table=model._meta.db_table):
                self.assertIn(model._meta.db_table, drawn)

    def test_the_parser_reads_columns_and_not_the_pk_fk_markers(self):
        """Each column sits next to a 'PK'/'FK' badge in its own cell; those
        carry no colon and must not be counted as columns."""
        drawn = parse_erd(ERD_PATH)

        self.assertNotIn('pk', drawn['user'])
        self.assertNotIn('fk', drawn['user'])
        self.assertIn('id_user', drawn['user'])

    def test_the_parser_survives_labels_that_were_hand_formatted(self):
        """`user.updated_at` is drawn as "UPDATED AT" (a space, not an
        underscore) and `parent_child`'s columns carry a <span> wrapper. Both
        are typos in the picture, not missing columns."""
        drawn = parse_erd(ERD_PATH)

        self.assertIn('updated_at', drawn['user'])
        self.assertIn('id_parent', drawn['parent_child'])


class ErdDriftTests(SimpleTestCase):
    """Column-for-column, per table, in both directions."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.drawn = parse_erd(ERD_PATH)

    def assert_table_matches(self, model):
        table = model._meta.db_table
        expected = model_columns(model)
        drawn = self.drawn[table]

        self.assertEqual(
            expected - drawn, KNOWN_ERD_GAPS.get(table, set()),
            f'{table}: diagram i modele rozjechały się — zaktualizuj '
            f'ERD/DIAGRAM.drawio (i eksporty .png/.pdf) albo KNOWN_ERD_GAPS',
        )
        self.assertEqual(
            drawn - expected, set(),
            f'{table}: diagram rysuje kolumny, których nie ma w modelach',
        )

    def test_user_matches(self):
        self.assert_table_matches(models.User)

    def test_user_role_matches(self):
        self.assert_table_matches(models.UserRole)

    def test_specjalist_matches(self):
        self.assert_table_matches(models.Specjalist)

    def test_patient_matches(self):
        self.assert_table_matches(models.Patient)

    def test_parent_child_matches(self):
        self.assert_table_matches(models.ParentChild)

    def test_diary_matches(self):
        self.assert_table_matches(models.Diary)

    def test_mood_scale_matches(self):
        self.assert_table_matches(models.MoodScale)

    def test_technique_matches(self):
        self.assert_table_matches(models.Technique)

    def test_raport_matches(self):
        self.assert_table_matches(models.Raport)

    def test_the_dropped_column_is_gone_from_the_diagram_too(self):
        """0006 removed diary.overall_feeling; CLAUDE.md says the diagram was
        brought back in step for that one, so this is the half that is done."""
        self.assertNotIn('overall_feeling', self.drawn['diary'])


class KnownGapsTests(SimpleTestCase):
    """The baseline has to stay a list of real, current gaps."""

    def test_every_listed_gap_names_a_table_the_diagram_draws(self):
        drawn = parse_erd(ERD_PATH)

        for table in KNOWN_ERD_GAPS:
            with self.subTest(table=table):
                self.assertIn(table, drawn)

    def test_every_listed_gap_names_a_column_the_models_really_have(self):
        by_table = {model._meta.db_table: model for model in DIAGRAMMED_MODELS}

        for table, columns in KNOWN_ERD_GAPS.items():
            with self.subTest(table=table):
                self.assertLessEqual(columns, model_columns(by_table[table]))

    def test_the_exports_are_shipped_alongside_the_source(self):
        """The .png/.pdf are what anybody who does not have drawio actually
        looks at, so a diagram updated without them is still out of step."""
        for suffix in ('.drawio.png', '.drawio.pdf'):
            with self.subTest(export=suffix):
                self.assertTrue((ERD_PATH.parent / f'DIAGRAM{suffix}').exists())
