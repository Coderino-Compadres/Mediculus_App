"""Guards on the security properties nothing else in the suite would notice.

Three different kinds of "nothing else notices":

* Django knows a list of deployment settings that matter and will report them —
  but only if somebody runs `check --deploy` by hand, which nobody does.
* SQL injection and XSS are absent from this codebase today because there is no
  sink to inject into: every query goes through the ORM and every string
  reaches the screen through JSX. No test can assert the absence of a bug, but
  a test *can* assert the absence of the sink, which is what would have to be
  added first.
* Both properties are one careless line away from changing, and neither
  `makemigrations` nor `oxlint` says a word about it.

Nothing here touches a database.
"""

import json
import pathlib
import re
import subprocess
import sys

from django.conf import settings
from django.test import SimpleTestCase

BASE_DIR = pathlib.Path(settings.BASE_DIR)
REPO_ROOT = BASE_DIR.parent

PRODUCTION_ENV = {
    'DJANGO_SETTINGS_MODULE': 'config.settings',
    'DJANGO_DEBUG': 'False',
    # Long and varied enough not to trip security.W009 on its own (Django wants
    # 50+ characters and at least 5 distinct ones); the point of the probe is
    # the settings we chose, not the placeholder it runs with.
    'DJANGO_SECRET_KEY': 'probe-key-do-testow-checka-deploy-nie-jest-sekretem-0123456789',
    'DJANGO_ALLOWED_HOSTS': 'mediculus-dev.azurewebsites.net',
    'USER_DB_NAME': 'user_db', 'USER_DB_USER': 'u', 'USER_DB_PASSWORD': 'p',
    'USER_DB_HOST': 'example.postgres.database.azure.com',
    'MEDICAL_DB_NAME': 'medical_db', 'MEDICAL_DB_USER': 'u', 'MEDICAL_DB_PASSWORD': 'p',
    'MEDICAL_DB_HOST': 'example.postgres.database.azure.com',
}

DEPLOY_PROBE = """
import json
import django
django.setup()
from django.core.checks import registry, Tags
messages = registry.registry.run_checks(
    tags=[Tags.security], include_deployment_checks=True)
print(json.dumps(sorted({message.id for message in messages})))
"""

#: What `check --deploy` still reports, and why each one is tolerated for now.
#: Exact equality below, so this fails in both directions: a new warning appears,
#: or a listed one is fixed and its entry is left behind. Neither is noise —
#: both mean somebody has to look.
#:
#: W004 SECURE_HSTS_SECONDS — no HSTS, so a browser that has only ever been told
#:      "https" by a redirect can still be talked into a plaintext first request.
#: W008 SECURE_SSL_REDIRECT — App Service terminates TLS but nothing refuses a
#:      plaintext request that reaches the app.
#:
#: Both are one setting each and belong in settings.py; until then this records
#: the decision rather than letting it disappear.
KNOWN_DEPLOYMENT_WARNINGS = {'security.W004', 'security.W008'}


def run_deployment_checks():
    """Django's own security checks, on settings evaluated as they are in production.

    A subprocess for the same reason test_env_config uses one: settings.py
    derives SESSION_COOKIE_SECURE and friends from DEBUG *at import time*, so
    override_settings(DEBUG=False) in this process would leave them as the dev
    run computed them and the answer would be about the test run, not about the
    deployment.
    """
    proc = subprocess.run(
        [sys.executable, '-c', DEPLOY_PROBE], cwd=BASE_DIR,
        capture_output=True, text=True,
        env={'PATH': '/usr/bin:/bin', 'PYTHONPATH': str(BASE_DIR), **PRODUCTION_ENV},
    )
    if proc.returncode != 0:
        raise AssertionError(f'nie udało się uruchomić check --deploy:\n{proc.stderr}')
    return set(json.loads(proc.stdout))


def source_files(root, suffixes, skip_parts=()):
    for path in sorted(root.rglob('*')):
        if path.suffix not in suffixes or not path.is_file():
            continue
        if any(part in skip_parts for part in path.parts):
            continue
        yield path


class DeploymentCheckTests(SimpleTestCase):
    def test_no_deployment_warning_appears_that_we_have_not_looked_at(self):
        self.assertEqual(
            run_deployment_checks(), KNOWN_DEPLOYMENT_WARNINGS,
            'check --deploy zmienił wynik: napraw nowe ostrzeżenie albo, jeśli '
            'któreś zostało naprawione, usuń je z KNOWN_DEPLOYMENT_WARNINGS',
        )

    def test_debug_is_off_when_the_environment_says_so(self):
        """security.W018 (DEBUG on in production) must never be tolerated —
        a traceback names settings, file paths and part of the configuration."""
        self.assertNotIn('security.W018', KNOWN_DEPLOYMENT_WARNINGS)
        self.assertNotIn('security.W018', run_deployment_checks())

    def test_the_session_and_csrf_cookies_are_https_only_in_production(self):
        """W012/W016. settings.py derives both from `not DEBUG`, which is easy
        to lose in a refactor and invisible until a cookie leaks."""
        reported = run_deployment_checks()

        self.assertNotIn('security.W012', reported)
        self.assertNotIn('security.W016', reported)

    def test_the_host_header_is_not_left_open(self):
        """W020: an empty ALLOWED_HOSTS with DEBUG off."""
        self.assertNotIn('security.W020', run_deployment_checks())


class SqlInjectionSinkTests(SimpleTestCase):
    """There is no raw SQL in the application, and that is worth keeping.

    Every query in `core` goes through the ORM, which parameterises. The only
    raw SQL in the project lives in migrations (static DDL, no interpolation)
    and in scripts/*.sql, both of which are covered by test_migrations.py and
    test_schema_sync.py.
    """

    #: Running a statement of your own making. No module may do this.
    STATEMENT_SINKS = (
        r'\.raw\(',
        r'\.extra\(',
        r'RawSQL',
        r'\.execute\(',
    )

    #: Holding a cursor. A prerequisite for the above, and refused by default so
    #: that reaching for one is a decision rather than a habit — but not itself a
    #: way to inject anything.
    CURSOR_SINKS = (
        r'connection\.cursor\(',
        r'connections\[[^\]]+\]\.cursor\(',
    )

    SINKS = STATEMENT_SINKS + CURSOR_SINKS

    #: Modules allowed to hold a cursor, and why. Deliberately not a general
    #: exemption: `test_an_exempt_module_runs_no_statement_of_its_own` keeps each
    #: entry to handing a cursor to Django's own introspection, so an exempt
    #: module still cannot build SQL. Checked for exact equality below, so a
    #: stale entry fails as loudly as a missing one.
    CURSOR_ONLY = {
        'check_databases.py': (
            'compares a real database with core/models.py, which is exactly the '
            'drift a faked 0001_initial hides; '
            'connection.introspection.get_table_description takes a cursor'
        ),
    }

    def application_sources(self):
        """`core` and `config`, minus migrations and this suite."""
        return source_files(
            BASE_DIR, {'.py'}, skip_parts=('migrations', 'tests', '__pycache__'),
        )

    def test_no_application_module_builds_sql_by_hand(self):
        for path in self.application_sources():
            body = path.read_text()
            exempt = path.name in self.CURSOR_ONLY
            sinks = self.STATEMENT_SINKS if exempt else self.SINKS
            for sink in sinks:
                with self.subTest(file=path.relative_to(REPO_ROOT), sink=sink):
                    self.assertIsNone(
                        re.search(sink, body),
                        f'{path.name}: surowy SQL. Jeśli naprawdę jest potrzebny, '
                        f'użyj parametrów (nie f-stringa) i dopisz go tutaj świadomie '
                        f'(CURSOR_ONLY, jeśli chodzi tylko o introspekcję).',
                    )

    def test_an_exempt_module_runs_no_statement_of_its_own(self):
        """What keeps CURSOR_ONLY from being a hole rather than an exemption.

        An exempt module may hold a cursor and hand it to Django; the moment it
        calls `.execute(` it is writing SQL, and the reason for the exemption no
        longer describes it. Covered by the loop above too — this states it as a
        property so the intent survives a refactor of that loop.
        """
        by_name = {path.name: path for path in self.application_sources()}

        for name in self.CURSOR_ONLY:
            with self.subTest(module=name):
                self.assertIn(name, by_name, f'{name}: wpis w CURSOR_ONLY bez pliku')
                self.assertNotIn('.execute(', by_name[name].read_text())

    def test_no_module_is_exempt_by_accident(self):
        """Exact equality, so an entry left behind after a module stopped needing
        a cursor fails as loudly as a missing one — otherwise the allowlist
        grows quietly and stops meaning anything."""
        holding_a_cursor = {
            path.name for path in self.application_sources()
            if any(re.search(sink, path.read_text()) for sink in self.CURSOR_SINKS)
        }

        self.assertEqual(holding_a_cursor, set(self.CURSOR_ONLY))

    def test_the_scan_actually_looks_at_the_modules_that_query(self):
        """A guard that scans nothing passes forever."""
        scanned = {path.name for path in self.application_sources()}

        for module in ('diary.py', 'dashboard.py', 'guardian.py', 'serializers.py'):
            self.assertIn(module, scanned)

    def test_the_patterns_would_actually_catch_something(self):
        """Proves the regexes match the shape they are meant to reject."""
        offending = "Diary.objects.raw('SELECT * FROM diary WHERE id = ' + wanted)"

        self.assertTrue(any(re.search(sink, offending) for sink in self.SINKS))


class CrossSiteScriptingSinkTests(SimpleTestCase):
    """React escapes what it renders; these are the ways out of that.

    A patient's diary text and a user's name are stored raw on purpose — a
    therapist's note is not ours to mangle — so the escaping is the only thing
    between them and the page. Nothing in the frontend currently opts out of it.
    """

    FRONTEND_SRC = REPO_ROOT / 'frontend' / 'src'

    SINKS = (
        'dangerouslySetInnerHTML',
        '.innerHTML',
        '.outerHTML',
        'insertAdjacentHTML',
        'document.write',
        'srcdoc',
        'eval(',
        'new Function(',
    )

    def frontend_sources(self):
        for path in source_files(self.FRONTEND_SRC, {'.ts', '.tsx'}):
            if '.test.' not in path.name:
                yield path

    def test_nothing_renders_unescaped_html(self):
        for path in self.frontend_sources():
            body = path.read_text()
            for sink in self.SINKS:
                with self.subTest(file=path.relative_to(REPO_ROOT), sink=sink):
                    self.assertNotIn(sink, body)

    def test_the_scan_actually_looks_at_the_screens_that_show_patient_text(self):
        scanned = {path.name for path in self.frontend_sources()}

        for module in ('JournalDetail.tsx', 'DiaryEntry.tsx', 'GuardianInvitations.tsx'):
            self.assertIn(module, scanned)

    def test_no_dependency_renders_markdown_or_html(self):
        """The escaping argument holds only while nothing turns a string into
        markup on the way to the DOM. A markdown or sanitiser package arriving
        in package.json is the moment this class stops being sufficient."""
        manifest = json.loads((REPO_ROOT / 'frontend' / 'package.json').read_text())
        installed = set(manifest.get('dependencies', {}))

        for renderer in ('marked', 'markdown-it', 'react-markdown', 'dompurify',
                         'sanitize-html', 'html-react-parser'):
            with self.subTest(package=renderer):
                self.assertNotIn(renderer, installed)
