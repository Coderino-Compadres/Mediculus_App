#!/usr/bin/env bash
#
# Brings a checkout's databases up to date, on both of them, and then verifies
# it worked.
#
# Why this exists: there are two databases with two independent migration
# histories, and `python manage.py migrate` targets only `default`. Every
# developer on a second machine has therefore, at least once, migrated
# "everything", started the server, and been met with
# `column diary.tension_level does not exist` on the first request — because
# medical_db was still several migrations behind. One command that cannot forget
# the second database is cheaper than remembering.
#
# Idempotent and safe on an existing database: it migrates and checks, and never
# touches data. It does NOT create the databases or seed them — that needs the
# container and the SQL scripts, and it is destructive; `markdown/serwery.md`
# has that sequence under "Odtworzenie lokalnej bazy od zera".
#
# Usage:
#   scripts/setup_dev.sh                          # against .env.local (the default)
#   DJANGO_ENV_FILE=.env.azure scripts/setup_dev.sh
#
# `--fake-initial` is passed because `scripts/database_setup.sql` creates the
# schema, not `0001_initial` — see CLAUDE.md. It is a no-op on a database that is
# already migrated, which is what makes this safe to re-run.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$REPO_ROOT/backend"
VENV_PYTHON="$REPO_ROOT/.venv/bin/python"

# Prefer the checkout's own venv over whatever is on PATH: the usual failure is
# a shell that never activated it, where `python` is the system interpreter and
# Django is simply absent.
if [[ -x "$VENV_PYTHON" ]]; then
    PYTHON="$VENV_PYTHON"
elif [[ -n "${VIRTUAL_ENV:-}" ]]; then
    PYTHON="$VIRTUAL_ENV/bin/python"
else
    echo "Nie znalazłem interpretera: brak $VENV_PYTHON i brak aktywnego venv." >&2
    echo "Uruchom: python -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
    exit 1
fi

ENV_FILE="${DJANGO_ENV_FILE:-.env.local}"
echo "== Mediculus: setup bazy"
echo "   python:   $PYTHON"
echo "   env file: $ENV_FILE"

# settings.py reads its config through os.environ[...] with no defaults, so a
# missing file is a stack trace at import time rather than a clear message.
if [[ ! -f "$REPO_ROOT/$ENV_FILE" && -z "${USER_DB_NAME:-}" ]]; then
    echo "Brak $ENV_FILE i brak USER_DB_* w środowisku — skopiuj .env.example." >&2
    exit 1
fi

cd "$BACKEND"

# No app label: this applies Django's own built-in apps (auth/admin/sessions,
# which /admin/ needs) as well as `core`. The router keeps the built-ins out of
# medical_db on its own, so the second call only writes django_migrations rows
# there for them — see the note in markdown/serwery.md.
for alias in default medical; do
    echo
    echo "== migrate --database=$alias"
    "$PYTHON" manage.py migrate --database="$alias" --fake-initial
done

echo
echo "== weryfikacja"
# The point of the script. Migrating twice without checking would still let a
# faked 0001 hide real drift, which is the failure this whole file is about.
"$PYTHON" manage.py check_databases
