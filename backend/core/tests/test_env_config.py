"""Tests for the env-file split (.env.local.local / .env.local.azure) and DJANGO_ENV_FILE.

settings.py is imported in a subprocess so each case gets a clean environment —
the settings module of the running test process must not be re-evaluated.
"""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase

BASE_DIR = Path(settings.BASE_DIR)
REPO_ROOT = BASE_DIR.parent

REQUIRED = {
    'DJANGO_SECRET_KEY': 'test-key',
    'DJANGO_DEBUG': 'False',
    'USER_DB_NAME': 'user_db',
    'USER_DB_USER': 'u',
    'USER_DB_PASSWORD': 'p',
    'USER_DB_HOST': 'host-from-env',
    'MEDICAL_DB_NAME': 'medical_db',
    'MEDICAL_DB_USER': 'u',
    'MEDICAL_DB_PASSWORD': 'p',
    'MEDICAL_DB_HOST': 'host-from-env',
}

PROBE = """
import json
from config import settings as s
print(json.dumps({
    'default_host': s.DATABASES['default']['HOST'],
    'default_port': s.DATABASES['default']['PORT'],
    'medical_host': s.DATABASES['medical']['HOST'],
    'sslmode': s.DATABASES['default']['OPTIONS']['sslmode'],
    'allowed_hosts': s.ALLOWED_HOSTS,
    'csrf': s.CSRF_TRUSTED_ORIGINS,
    'proxy_header': getattr(s, 'SECURE_PROXY_SSL_HEADER', None),
    'debug': s.DEBUG,
}))
"""


def load_settings(env, expect_ok=True):
    """Import config.settings in a subprocess with exactly `env` set."""
    proc = subprocess.run(
        [sys.executable, '-c', PROBE], cwd=BASE_DIR, capture_output=True, text=True,
        env={'PATH': '/usr/bin:/bin', 'PYTHONPATH': str(BASE_DIR), **env},
    )
    if expect_ok and proc.returncode != 0:
        raise AssertionError(f'settings import failed:\n{proc.stderr}')
    return proc


def parse_env_file(path):
    values = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, _, value = line.partition('=')
            values[key.strip()] = value.strip()
    return values


class EnvFileSelectionTests(SimpleTestCase):
    """DJANGO_ENV_FILE picks the file; real env vars still win over it."""

    def setUp(self):
        handle = tempfile.NamedTemporaryFile(
            mode='w', dir=REPO_ROOT, prefix='.env.local.selftest-', delete=False)
        handle.write('\n'.join(f'{k}={v}' for k, v in REQUIRED.items())
                     .replace('host-from-env', 'host-from-file'))
        handle.write('\nDB_SSLMODE=disable\nDJANGO_ALLOWED_HOSTS= a.example.com , b.example.com \n')
        handle.close()
        self.env_file = Path(handle.name)
        self.addCleanup(self.env_file.unlink)

    def probe(self, **env):
        return json.loads(load_settings(env).stdout)

    def test_named_file_is_loaded(self):
        result = self.probe(DJANGO_ENV_FILE=self.env_file.name)
        self.assertEqual(result['default_host'], 'host-from-file')
        self.assertEqual(result['sslmode'], 'disable')

    def test_real_environment_variables_win_over_the_file(self):
        result = self.probe(DJANGO_ENV_FILE=self.env_file.name, USER_DB_HOST='host-from-env')
        self.assertEqual(result['default_host'], 'host-from-env')
        self.assertEqual(result['medical_host'], 'host-from-file')

    def test_missing_file_is_not_fatal_when_the_environment_is_complete(self):
        """The Azure App Service case: no file, values come from App Settings."""
        result = self.probe(DJANGO_ENV_FILE='.env.local.does-not-exist', **REQUIRED)
        self.assertEqual(result['default_host'], 'host-from-env')

    def test_missing_required_variable_fails_at_import(self):
        incomplete = dict(REQUIRED)
        del incomplete['USER_DB_NAME']
        proc = load_settings({'DJANGO_ENV_FILE': '.env.local.does-not-exist', **incomplete},
                             expect_ok=False)
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn('USER_DB_NAME', proc.stderr)

    def test_csv_values_are_split_and_stripped(self):
        result = self.probe(DJANGO_ENV_FILE=self.env_file.name)
        self.assertEqual(result['allowed_hosts'], ['a.example.com', 'b.example.com'])
        self.assertEqual(result['csrf'], [])

    def test_sslmode_defaults_to_require(self):
        """No DB_SSLMODE, and the empty value shipped in .env.local.example, both mean SSL."""
        for value in (None, ''):
            with self.subTest(DB_SSLMODE=value):
                env = {'DJANGO_ENV_FILE': '.env.local.does-not-exist', **REQUIRED}
                if value is not None:
                    env['DB_SSLMODE'] = value
                self.assertEqual(self.probe(**env)['sslmode'], 'require')

    def test_proxy_ssl_header_defaults_on_and_can_be_disabled(self):
        env = {'DJANGO_ENV_FILE': '.env.local.does-not-exist', **REQUIRED}
        self.assertEqual(self.probe(**env)['proxy_header'],
                         ['HTTP_X_FORWARDED_PROTO', 'https'])
        self.assertIsNone(self.probe(**env, DJANGO_USE_PROXY_SSL_HEADER='false')['proxy_header'])


class EnvFileContentTests(SimpleTestCase):
    """Guards on the two checked-out env files (skipped where they don't exist)."""

    example = REPO_ROOT / '.env.local.example'
    local = REPO_ROOT / '.env.local.local'
    azure = REPO_ROOT / '.env.local.azure'

    @unittest.skipUnless(local.exists() and example.exists(), '.env.local.local not present')
    def test_local_file_covers_every_documented_key(self):
        self.assertEqual(parse_env_file(self.example).keys() - parse_env_file(self.local).keys(),
                         set())

    @unittest.skipUnless(azure.exists() and example.exists(), '.env.local.azure not present')
    def test_azure_file_covers_every_documented_key(self):
        self.assertEqual(parse_env_file(self.example).keys() - parse_env_file(self.azure).keys(),
                         set())

    @unittest.skipUnless(local.exists(), '.env.local.local not present')
    def test_local_file_points_at_the_container(self):
        values = parse_env_file(self.local)
        self.assertEqual(values['USER_DB_HOST'], 'localhost')
        self.assertEqual(values['MEDICAL_DB_HOST'], 'localhost')
        self.assertEqual(values['USER_DB_PORT'], '5433')
        self.assertEqual(values['DB_SSLMODE'], 'disable')

    @unittest.skipUnless(azure.exists(), '.env.local.azure not present')
    def test_azure_file_points_at_azure_with_ssl(self):
        values = parse_env_file(self.azure)
        self.assertTrue(values['USER_DB_HOST'].endswith('.postgres.database.azure.com'))
        self.assertEqual(values['USER_DB_PORT'], '5432')
        self.assertEqual(values['DB_SSLMODE'], 'require')

    def test_no_env_file_pairs_an_azure_host_with_ssl_disabled(self):
        """Azure Postgres drops plaintext connections — this pairing times out."""
        for path in sorted(REPO_ROOT.glob('.env.local*')):
            if path.name == '.env.local.example':
                continue
            values = parse_env_file(path)
            host = values.get('USER_DB_HOST', '')
            with self.subTest(file=path.name):
                if 'azure.com' in host:
                    self.assertNotEqual(values.get('DB_SSLMODE'), 'disable')
