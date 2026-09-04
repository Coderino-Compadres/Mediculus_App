"""Keeps `scripts/*.sql` and `core.models` from drifting apart.

The project has two descriptions of the same schema. `database_setup.sql` is
what actually builds a database (and what `mock_data.sql` inserts against);
`core/models.py` is what Django queries through. `0001_initial` is applied as
faked everywhere, so Django cannot see the difference between them and
`makemigrations` will never warn about one — which is exactly why
`0002_align_faked_schema` had to exist.

These tests are that missing warning. They parse the SQL rather than talking to
a database, so they run without one.
"""

import re
from pathlib import Path

from django.apps import apps
from django.test import SimpleTestCase

SCRIPTS = Path(__file__).resolve().parent.parent.parent.parent / 'scripts'
SETUP_SQL = SCRIPTS / 'database_setup.sql'
MOCK_SQL = SCRIPTS / 'mock_data.sql'

#: Lines inside CREATE TABLE that declare something other than a column.
_NOT_A_COLUMN = re.compile(r'^\s*(CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK)\b', re.I)


def sql_columns(source):
    """table -> ordered column names, as `database_setup.sql` would create them.

    Applies the ALTER blocks too: the script re-runs against existing databases,
    so a column added or dropped there is as real as one in the CREATE TABLE.
    """
    tables = {}

    for match in re.finditer(
        r'CREATE TABLE IF NOT EXISTS\s+("?[a-z_]+"?)\s*\((.*?)\n\);', source, re.S | re.I
    ):
        name = match.group(1).strip('"')
        columns = []
        for line in match.group(2).splitlines():
            line = line.strip()
            if not line or line.startswith('--') or _NOT_A_COLUMN.match(line):
                continue
            column = re.match(r'([a-z_]+)\s', line)
            if column:
                columns.append(column.group(1))
        tables[name] = columns

    for match in re.finditer(r'ALTER TABLE\s+("?[a-z_]+"?)(.*?);', source, re.S | re.I):
        name = match.group(1).strip('"')
        body = match.group(2)
        for column in re.findall(r'ADD COLUMN IF NOT EXISTS\s+([a-z_]+)', body, re.I):
            if column not in tables.setdefault(name, []):
                tables[name].append(column)
        for column in re.findall(r'DROP COLUMN IF EXISTS\s+([a-z_]+)', body, re.I):
            if column in tables.get(name, []):
                tables[name].remove(column)

    return tables


def model_columns():
    """table -> column names, as Django believes them to be."""
    result = {}
    for model in apps.get_app_config('core').get_models():
        result[model._meta.db_table] = [
            field.column for field in model._meta.concrete_fields
        ]
    return result


class SetupScriptParsingTests(SimpleTestCase):
    def test_the_script_is_where_we_think_it_is(self):
        self.assertTrue(SETUP_SQL.exists(), f'{SETUP_SQL} is missing')

    def test_the_parser_finds_every_table_the_models_declare(self):
        parsed = sql_columns(SETUP_SQL.read_text(encoding='utf-8'))

        for table in model_columns():
            with self.subTest(table=table):
                self.assertIn(table, parsed)

    def test_the_parser_does_not_mistake_a_constraint_for_a_column(self):
        parsed = sql_columns(SETUP_SQL.read_text(encoding='utf-8'))

        self.assertNotIn('constraint', parsed['diary'])
        self.assertNotIn('foreign', parsed['mood_scale'])


class SchemaDriftTests(SimpleTestCase):
    """Every column has to exist on both sides, per table."""

    def assert_table_matches(self, table):
        parsed = sql_columns(SETUP_SQL.read_text(encoding='utf-8'))
        sql_side = set(parsed[table])
        model_side = set(model_columns()[table])

        self.assertEqual(
            model_side - sql_side, set(),
            f'{table}: in core/models.py but not in database_setup.sql',
        )
        self.assertEqual(
            sql_side - model_side, set(),
            f'{table}: in database_setup.sql but not in core/models.py',
        )

    def test_diary_matches(self):
        self.assert_table_matches('diary')

    def test_mood_scale_matches(self):
        self.assert_table_matches('mood_scale')

    def test_user_matches(self):
        self.assert_table_matches('user')

    def test_patient_matches(self):
        self.assert_table_matches('patient')

    def test_raport_matches(self):
        self.assert_table_matches('raport')

    def test_technique_matches(self):
        self.assert_table_matches('technique')

    def test_user_role_matches(self):
        self.assert_table_matches('user_role')

    def test_specjalist_matches(self):
        self.assert_table_matches('specjalist')

    def test_parent_child_matches(self):
        self.assert_table_matches('parent_child')

    def test_parent_invitation_matches(self):
        self.assert_table_matches('parent_invitation')

    def test_the_dropped_column_is_gone_from_both_sides(self):
        # core.0006 removed it; if either side kept it, a fresh setup and a
        # migrated database would no longer be the same schema.
        parsed = sql_columns(SETUP_SQL.read_text(encoding='utf-8'))

        self.assertNotIn('overall_feeling', parsed['diary'])
        self.assertNotIn('overall_feeling', model_columns()['diary'])


class MockDataTests(SimpleTestCase):
    def test_every_column_the_seed_writes_actually_exists(self):
        """An INSERT naming a dropped column fails the whole seed run."""
        parsed = sql_columns(SETUP_SQL.read_text(encoding='utf-8'))
        source = MOCK_SQL.read_text(encoding='utf-8')

        for match in re.finditer(r'INSERT INTO\s+("?[a-z_]+"?)\s*\(([^)]*)\)', source, re.I):
            table = match.group(1).strip('"')
            columns = [c.strip() for c in match.group(2).split(',') if c.strip()]
            with self.subTest(table=table):
                self.assertLessEqual(set(columns), set(parsed[table]))

    def test_the_seed_never_leaves_a_password_that_could_authenticate_by_accident(self):
        """Placeholder rows must stay unusable; the demo account must be real."""
        source = MOCK_SQL.read_text(encoding='utf-8')

        self.assertIn('mock_hash_placeholder', source)
        self.assertRegex(source, r"'pbkdf2_sha256\$\d+\$[^']+'")
