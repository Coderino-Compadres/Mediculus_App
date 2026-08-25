"""Guards on the migrations that carry raw SQL.

Two things go wrong quietly here and neither shows up as a failing query:

* A `RunSQL` without a `target_db` hint runs against **both** databases, because
  `allow_migrate` receives `model_name=None` and has nothing to route on. On the
  wrong database the statement fails loudly, which is survivable — but the hint
  is easy to forget and impossible to notice by reading the model.
* A `SeparateDatabaseAndState` whose state half and database half disagree
  leaves Django's idea of the schema out of step with the real one, and
  `makemigrations` will happily build the next migration on top of the wrong
  picture.

No database is touched: the migration modules are imported and inspected.
"""

import importlib
import re

from django.db import migrations
from django.test import SimpleTestCase

from core.routers import CoreDatabaseRouter

RAW_SQL_MIGRATIONS = {
    'core.migrations.0004_user_consents': 'default',
    'core.migrations.0005_diary_entry_fields': 'medical',
    'core.migrations.0006_drop_overall_feeling': 'medical',
}


def operations_of(module_path):
    return importlib.import_module(module_path).Migration.operations


def run_sql_operations(module_path):
    found = []
    for operation in operations_of(module_path):
        if isinstance(operation, migrations.RunSQL):
            found.append(operation)
        elif isinstance(operation, migrations.SeparateDatabaseAndState):
            found.extend(
                inner for inner in operation.database_operations
                if isinstance(inner, migrations.RunSQL)
            )
    return found


class RawSqlHintTests(SimpleTestCase):
    def setUp(self):
        self.router = CoreDatabaseRouter()

    def test_every_raw_sql_operation_names_its_database(self):
        for module_path in RAW_SQL_MIGRATIONS:
            with self.subTest(migration=module_path):
                operations = run_sql_operations(module_path)
                self.assertTrue(operations, f'{module_path} declares no RunSQL')
                for operation in operations:
                    self.assertIn('target_db', operation.hints)

    def test_the_hint_points_at_the_database_the_tables_live_in(self):
        for module_path, expected in RAW_SQL_MIGRATIONS.items():
            with self.subTest(migration=module_path):
                for operation in run_sql_operations(module_path):
                    self.assertEqual(operation.hints['target_db'], expected)

    def test_the_router_lets_each_one_through_on_exactly_one_database(self):
        for module_path, expected in RAW_SQL_MIGRATIONS.items():
            other = 'medical' if expected == 'default' else 'default'
            with self.subTest(migration=module_path):
                for operation in run_sql_operations(module_path):
                    hints = operation.hints
                    self.assertTrue(
                        self.router.allow_migrate(expected, 'core', model_name=None, **hints))
                    self.assertFalse(
                        self.router.allow_migrate(other, 'core', model_name=None, **hints))

    def test_every_raw_sql_operation_is_reversible(self):
        # Without reverse SQL the migration cannot be rolled back at all, which
        # matters most for 0006 — the one that drops a column.
        for module_path in RAW_SQL_MIGRATIONS:
            with self.subTest(migration=module_path):
                for operation in run_sql_operations(module_path):
                    self.assertIsNotNone(operation.reverse_sql)


class IdempotencyTests(SimpleTestCase):
    """`database_setup.sql` runs before `migrate` in the documented setup order.

    On a fresh database the columns therefore already exist by the time these
    migrations run, so every statement has to tolerate that.
    """

    def test_adding_columns_tolerates_them_already_existing(self):
        for module_path in ('core.migrations.0004_user_consents',
                            'core.migrations.0005_diary_entry_fields'):
            with self.subTest(migration=module_path):
                for operation in run_sql_operations(module_path):
                    self.assertRegex(operation.sql, r'ADD COLUMN IF NOT EXISTS')
                    self.assertRegex(operation.reverse_sql, r'DROP COLUMN IF EXISTS')

    def test_dropping_a_column_tolerates_it_being_gone(self):
        for operation in run_sql_operations('core.migrations.0006_drop_overall_feeling'):
            self.assertRegex(operation.sql, r'DROP COLUMN IF EXISTS')
            self.assertRegex(operation.reverse_sql, r'ADD COLUMN IF NOT EXISTS')


class StateAndDatabaseAgreeTests(SimpleTestCase):
    """The two halves of a SeparateDatabaseAndState must describe one change."""

    def state_and_sql(self, module_path):
        for operation in operations_of(module_path):
            if isinstance(operation, migrations.SeparateDatabaseAndState):
                sql = ' '.join(
                    inner.sql for inner in operation.database_operations
                    if isinstance(inner, migrations.RunSQL)
                )
                return operation.state_operations, sql
        self.fail(f'{module_path} has no SeparateDatabaseAndState')

    def test_0005_adds_the_same_columns_to_state_and_to_the_database(self):
        state_ops, sql = self.state_and_sql('core.migrations.0005_diary_entry_fields')
        added = {op.name for op in state_ops if isinstance(op, migrations.AddField)}
        in_sql = set(re.findall(r'ADD COLUMN IF NOT EXISTS (\w+)', sql))

        self.assertEqual(added, in_sql)
        self.assertEqual(added, {
            'tension_level', 'emotion_note', 'thought', 'risky_behavior_note',
            'shame_scale', 'calm_scale',
        })

    def test_0006_removes_the_same_column_from_state_and_from_the_database(self):
        state_ops, sql = self.state_and_sql('core.migrations.0006_drop_overall_feeling')
        removed = {op.name for op in state_ops if isinstance(op, migrations.RemoveField)}

        self.assertEqual(removed, set(re.findall(r'DROP COLUMN IF EXISTS (\w+)', sql)))
        self.assertEqual(removed, {'overall_feeling'})

    def test_0004_adds_the_same_consent_columns_on_both_halves(self):
        state_ops, sql = self.state_and_sql('core.migrations.0004_user_consents')
        added = {op.name for op in state_ops if isinstance(op, migrations.AddField)}

        self.assertEqual(added, set(re.findall(r'ADD COLUMN IF NOT EXISTS (\w+)', sql)))
        self.assertEqual(added, {'data_consent_at', 'services_consent_at'})
