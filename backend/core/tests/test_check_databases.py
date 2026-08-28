"""Tests for `manage.py check_databases` — the command that answers "is this
database actually usable", which nothing else in the project asks.

Every test here breaks the schema on purpose and checks that the command says
so, because a checker that cannot fail is worse than no checker: it reports
green and everybody stops looking. The DDL runs inside the test's transaction,
so it is rolled back with everything else.

Needs both databases — telling them apart is the point of the command.
"""

from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connections
from django.test import TestCase, override_settings

LOCMEM = 'django.core.cache.backends.locmem.LocMemCache'
DB_CACHE = 'django.core.cache.backends.db.DatabaseCache'


class CheckDatabasesTestCase(TestCase):
    databases = {'default', 'medical'}

    def run_command(self, **options):
        """The command's output, or its CommandError message.

        Returns `(ok, text)` rather than raising, because almost every test here
        cares about both halves: that it failed, and that the message names what
        to do about it.
        """
        out, err = StringIO(), StringIO()
        try:
            call_command('check_databases', stdout=out, stderr=err, **options)
        except CommandError as error:
            return False, str(error)
        return True, out.getvalue()

    def drop_column(self, alias, table, column):
        with connections[alias].cursor() as cursor:
            cursor.execute(f'ALTER TABLE "{table}" DROP COLUMN "{column}"')

    def add_column(self, alias, table, column):
        with connections[alias].cursor() as cursor:
            cursor.execute(f'ALTER TABLE "{table}" ADD COLUMN "{column}" integer')

    def drop_table(self, alias, table):
        with connections[alias].cursor() as cursor:
            cursor.execute(f'DROP TABLE "{table}" CASCADE')


class HealthyDatabaseTests(CheckDatabasesTestCase):
    def test_a_fully_migrated_pair_passes(self):
        ok, output = self.run_command()

        self.assertTrue(ok, output)

    def test_it_names_both_databases(self):
        """A command that silently checked one of the two would be the exact bug
        it exists to catch."""
        _ok, output = self.run_command()

        self.assertIn('[default]', output)
        self.assertIn('[medical]', output)

    def test_quiet_prints_nothing_when_all_is_well(self):
        """So it can be a CI step or a post-deploy hook without adding noise."""
        _ok, output = self.run_command(quiet=True)

        self.assertEqual(output.strip(), '')


class MissingColumnTests(CheckDatabasesTestCase):
    """The failure that actually happened, in both databases' worth of shapes.

    `column diary.tension_level does not exist` — a 500 on the first request to
    the home dashboard, with nothing before the request having said a word.
    """

    def test_a_column_missing_from_medical_db_is_reported(self):
        self.drop_column('medical', 'diary', 'tension_level')

        ok, message = self.run_command()

        self.assertFalse(ok)
        self.assertIn('tension_level', message)
        self.assertIn('diary', message)

    def test_the_message_names_the_database_the_column_is_missing_from(self):
        """With two databases, "a column is missing" is half an answer."""
        self.drop_column('medical', 'diary', 'tension_level')

        _ok, message = self.run_command()

        self.assertIn('[medical]', message)
        self.assertNotIn('[default]', message)

    def test_a_column_missing_from_user_db_is_reported(self):
        self.drop_column('default', 'patient', 'is_child')

        ok, message = self.run_command()

        self.assertFalse(ok)
        self.assertIn('[default]', message)
        self.assertIn('is_child', message)

    def test_several_missing_columns_are_all_listed(self):
        """Reported together rather than one per run: fixing them is one
        `migrate`, so stopping at the first would make the operator run the
        command, migrate, run it again and find another."""
        self.drop_column('medical', 'diary', 'tension_level')
        self.drop_column('medical', 'diary', 'thought')

        _ok, message = self.run_command()

        self.assertIn('tension_level', message)
        self.assertIn('thought', message)

    def test_quiet_still_reports_a_problem(self):
        """--quiet suppresses the OK lines, never the findings."""
        self.drop_column('medical', 'diary', 'tension_level')

        ok, message = self.run_command(quiet=True)

        self.assertFalse(ok)
        self.assertIn('tension_level', message)


class MissingTableTests(CheckDatabasesTestCase):
    def test_a_missing_domain_table_is_reported(self):
        self.drop_table('medical', 'mood_scale')

        ok, message = self.run_command()

        self.assertFalse(ok)
        self.assertIn('mood_scale', message)

    def test_a_missing_cache_table_is_reported(self):
        """The one failure that is silent rather than loud: with no table every
        cache write raises, DRF reads an unreachable cache as "no history", and
        the login caps stop existing without a line in the log."""
        self.drop_table('default', 'throttle_cache')

        ok, message = self.run_command()

        self.assertFalse(ok)
        self.assertIn('throttle_cache', message)


class DriftTheOtherWayTests(CheckDatabasesTestCase):
    """A column the database has and the models do not.

    An un-run `0006_drop_overall_feeling` looks exactly like this. Worth saying
    out loud, but not worth failing on: no query names the column, so the app
    works. Failing here would make the command unusable on any database that is
    mid-migration.
    """

    def test_an_extra_column_is_a_warning_rather_than_a_failure(self):
        self.add_column('medical', 'diary', 'overall_feeling')

        ok, output = self.run_command()

        self.assertTrue(ok, output)
        self.assertIn('overall_feeling', output)

    def test_the_warning_survives_quiet(self):
        self.add_column('medical', 'diary', 'overall_feeling')

        ok, output = self.run_command(quiet=True)

        self.assertTrue(ok, output)
        self.assertIn('overall_feeling', output)


class RoutingTests(CheckDatabasesTestCase):
    """Each model is looked for in the database the router puts it in.

    Otherwise the command would report every medical model as missing from
    user_db and vice versa — nine false findings, which is the same as none.
    """

    def test_a_medical_table_is_not_expected_in_user_db(self):
        self.assertNotIn(
            'diary', connections['default'].introspection.table_names())

        ok, output = self.run_command()

        self.assertTrue(ok, output)

    def test_a_user_db_table_is_not_expected_in_medical_db(self):
        self.assertNotIn(
            'patient', connections['medical'].introspection.table_names())

        ok, output = self.run_command()

        self.assertTrue(ok, output)


class CacheBackendTests(CheckDatabasesTestCase):
    @override_settings(CACHES={'default': {'BACKEND': LOCMEM}})
    def test_a_per_process_cache_backend_is_a_warning(self):
        """Local-memory is what the throttle counters used to live in, and the
        reason every cap was worth as much as the number of gunicorn workers.
        A warning rather than a failure: the app runs, the limits just do not
        limit — and a developer running against locmem on purpose should not be
        stopped by a schema checker."""
        ok, output = self.run_command()

        self.assertTrue(ok, output)
        self.assertIn('per worker', output)

    @override_settings(CACHES={'default': {'BACKEND': DB_CACHE, 'LOCATION': 'nie_ma_takiej'}})
    def test_a_cache_table_named_in_settings_but_absent_is_a_failure(self):
        ok, message = self.run_command()

        self.assertFalse(ok)
        self.assertIn('nie_ma_takiej', message)


class ActionableMessageTests(CheckDatabasesTestCase):
    """The command is read by somebody who does not yet know about the split.

    Today's incident was a developer on a second machine who had run `migrate`
    and reasonably believed the migrations were applied. The message has to
    carry the `--database=` flag, or it just restates the confusion.
    """

    def test_a_missing_column_message_says_what_to_run(self):
        self.drop_column('medical', 'diary', 'tension_level')

        _ok, message = self.run_command()

        self.assertIn('migrate', message)
        self.assertIn('--database=', message)
