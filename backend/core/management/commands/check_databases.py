"""`manage.py check_databases` — is the database this process points at usable?

The gap this fills is specific. There are three descriptions of the schema and
the suite only compares two of them:

* `scripts/database_setup.sql` vs `core/models.py` — `test_schema_sync.py`.
* `core/models.py` vs Django's migration state — `makemigrations --check`.
* **A real database** vs `core/models.py` — nothing, until this command.

That third edge is the one that breaks, because `0001_initial` is faked and
because there are two databases with two independent migration histories. A
`migrate core` that targets `default` only leaves medical_db behind, everything
imports fine, the tests pass, and the first request to `/api/dashboard/home/`
answers 500 with `column diary.tension_level does not exist`. Nothing before
this said so.

Read-only and safe to run against anything, which is the point: the deployment
is the environment where the drift matters and the one nobody can run the test
suite against. Same command locally, in CI, and against Azure:

    python manage.py check_databases
    DJANGO_ENV_FILE=.env.azure python manage.py check_databases

Exits non-zero on anything that would make the app fail, so it works as a CI
step and as a post-deploy smoke test.
"""

from django.apps import apps
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, router
from django.db.migrations.executor import MigrationExecutor

#: Both halves of the split, in the order the setup docs run them.
ALIASES = ('default', 'medical')


class Command(BaseCommand):
    help = (
        'Checks that both databases are reachable, fully migrated and carry '
        'every column core/models.py declares.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--quiet', action='store_true',
            help='Print only problems. Exit code still says whether there were any.',
        )

    def handle(self, *args, **options):
        self.quiet = options['quiet']
        self.problems = []
        self.warnings = []

        # One pass per database rather than one pass per kind of check, so the
        # output reads as two blocks — which of the two is behind is the whole
        # question this command answers.
        for alias in ALIASES:
            self.section(f'[{alias}] {connections[alias].settings_dict.get("NAME")}')
            if not self.check_connection(alias):
                continue
            self.check_migrations(alias)
            self.check_columns(alias)
            if alias == 'default':
                self.check_cache_table()

        for warning in self.warnings:
            self.stdout.write(self.style.WARNING(f'  ! {warning}'))
        if self.problems:
            raise CommandError(
                '\n'.join(['Baza nie jest gotowa:', *(f'  - {p}' for p in self.problems)])
            )
        if not self.quiet:
            self.stdout.write(self.style.SUCCESS(
                'Obie bazy są osiągalne, zmigrowane i zgodne z modelami.'))

    # -- reporting -----------------------------------------------------------

    def report_ok(self, message):
        if not self.quiet:
            self.stdout.write(self.style.SUCCESS(f'  OK  {message}'))

    def section(self, title):
        if not self.quiet:
            self.stdout.write(self.style.MIGRATE_HEADING(title))

    # -- checks --------------------------------------------------------------

    def check_connection(self, alias):
        """Reachable at all. Everything below needs a cursor, so this gates them.

        Returning False rather than raising keeps a single unreachable database
        from hiding every finding about the other one — which matters most when
        only one of the two is misconfigured, the case that is hardest to read
        off a stack trace.
        """
        try:
            # `ensure_connection` rather than a hand-written `SELECT 1`: it is
            # what Django itself uses to decide whether a database answers, and
            # it keeps this module free of any statement of its own — see the
            # exemption in test_security_guards.SqlInjectionSinkTests.
            connections[alias].ensure_connection()
        except Exception as error:
            # The message carries host and credentials context from psycopg;
            # the password is not in it, but the user and host are, which is
            # what makes a misconfigured .env obvious rather than mysterious.
            self.problems.append(f'[{alias}] brak połączenia: {error}'.strip())
            return False
        self.report_ok('connection')
        return True

    def check_migrations(self, alias):
        """Unapplied migrations, per database rather than in total.

        This is the check that would have caught the medical_db drift: Django's
        own `migrate --check` looks at one database at a time too, but nothing
        in the project ran it for both, and `showmigrations` has to be read by a
        human who remembers there are two.
        """
        executor = MigrationExecutor(connections[alias])
        targets = executor.loader.graph.leaf_nodes()
        plan = executor.migration_plan(targets)
        if plan:
            names = ', '.join(f'{migration.app_label}.{migration.name}'
                              for migration, _backwards in plan)
            self.problems.append(
                f'[{alias}] {len(plan)} niezastosowanych migracji ({names}) — '
                f'uruchom: python manage.py migrate --database={alias}'
            )
            return
        self.report_ok('migrations applied')

    def check_columns(self, alias):
        """Every column the models declare, present in the real database.

        Compared against `information_schema` through Django's introspection
        rather than against the migration state, because a faked `0001` means
        the two can disagree — that disagreement is the entire reason this
        command exists.

        A column the database has and the models do not is a warning, not a
        problem: it is drift worth knowing about (an un-run `0006` looks exactly
        like this), but a query that never names the column still works.
        """
        connection = connections[alias]
        found = []
        with connection.cursor() as cursor:
            existing_tables = set(connection.introspection.table_names(cursor))
            for model in sorted(apps.get_app_config('core').get_models(),
                                key=lambda model: model._meta.db_table):
                if router.db_for_read(model) != alias:
                    continue
                table = model._meta.db_table
                if table not in existing_tables:
                    found.append(
                        f'[{alias}] brak tabeli "{table}" (model {model.__name__}) — '
                        f'uruchom scripts/database_setup.sql, potem '
                        f'python manage.py migrate core --database={alias} --fake-initial'
                    )
                    continue
                actual = {
                    column.name for column
                    in connection.introspection.get_table_description(cursor, table)
                }
                declared = {field.column for field in model._meta.concrete_fields}
                missing = declared - actual
                if missing:
                    # The remedy belongs in the message: whoever reads this is
                    # very likely somebody who has already run `migrate` and
                    # reasonably believes it was applied. Naming the flag is the
                    # difference between a finding and an explanation.
                    found.append(
                        f'[{alias}] "{table}" nie ma kolumn: {", ".join(sorted(missing))} '
                        f'— zapytania z {model.__name__} skończą się błędem 500; '
                        f'uruchom: python manage.py migrate core --database={alias}'
                    )
                extra = actual - declared
                if extra:
                    self.warnings.append(
                        f'[{alias}] "{table}" ma kolumny, których nie ma w modelu: '
                        f'{", ".join(sorted(extra))}'
                    )
        self.problems.extend(found)
        if not found:
            self.report_ok('every model column exists')

    def check_cache_table(self):
        """The throttle counters have somewhere to live.

        Its own check because the failure is silent in the worst way: without
        the table every cache write raises, DRF reads a cache it cannot reach as
        "no history", and the rate limits **fail open** — the login cap stops
        existing and nothing in the logs says the caps are gone.
        """
        configured = settings.CACHES['default']
        if configured['BACKEND'] != 'django.core.cache.backends.db.DatabaseCache':
            # Not a problem the way a missing table is — the app runs — but the
            # caps quietly become per-worker again, which is what this project
            # moved away from on purpose.
            self.warnings.append(
                f'CACHES["default"] to {configured["BACKEND"]}, nie DatabaseCache '
                f'— limity liczą się per proces, czyli per worker gunicorna'
            )
            return
        table = configured['LOCATION']
        connection = connections['default']
        with connection.cursor() as cursor:
            if table not in connection.introspection.table_names(cursor):
                self.problems.append(
                    f'[default] brak tabeli cache "{table}" — limity logowania '
                    f'przestaną działać (fail open); uruchom: '
                    f'python manage.py migrate core --database=default'
                )
                return
        self.report_ok(f'throttle cache table "{table}"')
