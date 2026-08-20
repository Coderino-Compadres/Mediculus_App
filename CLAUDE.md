# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Mediculus is a mental-health / wellbeing tracking platform (emotion diary, DBT technique tracking, mood scales) aimed at patients (including minors, via a parent/guardian account), specialists (psychotherapists, dietitians), and their supervising organization. The project is early-stage: the domain model is designed (see `ERD/DIAGRAM.drawio*`), but almost no application code (Django apps, API endpoints, frontend views) exists yet — both `backend/` and `frontend/` are still close to scaffolds.

Repo layout:
- `backend/` — Django project (`config/` settings/urls) plus one app, `core/`, holding all domain models across both databases (see Architecture).
- `frontend/` — Vite + React PWA scaffold (`vite-plugin-pwa`).
- `scripts/` — hand-written SQL that defines and seeds the actual database schema (see below — this is not Django migrations).
- `ERD/` — entity-relationship diagram for the two databases.
- `markdown/` — internal planning/requirements notes (Polish); not code documentation.

## Architecture

**Two independently-managed Postgres databases**, both configured in `backend/config/settings.py` `DATABASES`:
- `default` → `user_db` — identity/PII data: `user`, `user_role`, `specjalist`, `patient`, `parent_child`.
- `medical` → `medical_db` — pseudonymized clinical data: `diary`, `mood_scale`, `technique`, `raport`.

The split is intentional (data pseudonymization): `medical_db` rows reference patients only via `patient.id_medical`, a UUID that is **not** a real foreign key across databases — it's a logical/application-level join only (see comments in `scripts/database_setup.sql`). Never assume Postgres will enforce referential integrity between the two DBs; that has to be handled in application code.

**Domain schema lives in Django models + migrations (app `core`).** `backend/core/models.py` mirrors `scripts/database_setup.sql` (same table/column names via `db_table`/`db_column`). All models live in a single app spanning both databases, and `core/routers.py` (`CoreDatabaseRouter`, wired via `DATABASE_ROUTERS`) maps them by name: everything in `MEDICAL_MODELS` goes to `medical`, the rest to `default`. The router implements `db_for_read`/`db_for_write`, so `Diary.objects.all()` reaches `medical_db` on its own — `.using('medical')` is no longer required (it still works, and is harmless to keep).

Data migrations in `core` need care: `allow_migrate` receives `model_name=None` for `RunPython`/`RunSQL`, so pass `hints={'target_db': 'default'}` (or `'medical'`) on those operations to pin them to one database. Without a hint they run against **both**, which fails loudly rather than being silently skipped — see `core/migrations/0002_align_faked_schema.py` for the pattern.

Two DBs mean two independent migration histories: run `python manage.py migrate core --database=default` for the `user_db` models and `python manage.py migrate core --database=medical` for the `medical_db` models — a plain `migrate core` only targets `default`.

`0001_initial` is applied as **faked** everywhere, because `scripts/database_setup.sql` had already created the tables. Consequences worth knowing:

- Setting up a new environment means running `database_setup.sql` + `mock_data.sql` first, then `migrate --fake-initial` on both databases (`markdown/serwery.md` has the exact sequence). Letting migrations create the schema from scratch instead would work, but then `mock_data.sql` fails — its INSERTs omit `created_at`/`updated_at`, which only have database defaults in the SQL script, not in the Django-generated schema.
- Faking means Django cannot see drift between the two "sources of truth". `0002_align_faked_schema` exists precisely because `database_setup.sql` had shipped `TIMESTAMP`/unbounded `VARCHAR` where the faked state recorded `timestamptz`/`varchar(255)`. If you change one of the two, check the other by hand — `makemigrations` will not warn you.

As of 2026-08-20 both Azure databases are still at `0001` (faked); `0002` and `0003` have only been applied locally and need `migrate` on Azure.

Also be aware there will be two parallel notions of "user" in `user_db`: Django's own `auth_user` (created by `manage.py migrate` for the built-in apps, used only for `/admin/` login) and `core.User` (the hand-mirrored `"user"` table, the actual domain/app user). They are intentionally not connected — don't conflate them.

A few `on_delete` choices in `core/models.py` are a deliberate improvement over the raw SQL, which specifies no `ON DELETE` action (i.e. Postgres `NO ACTION` everywhere): `User.user_role` and `Raport.technique`/`Patient.specjalist` use `PROTECT`/`SET_NULL` instead, chosen per-relationship for sane application behavior rather than mirrored verbatim.

**Env-var-driven settings, no defaults for required values.** `settings.py` reads `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, and all `USER_DB_*` / `MEDICAL_DB_*` DB credentials via `os.environ[...]` (not `.get`), so the process will hard-fail at import time if any are missing — always ensure `.env` is populated (see `.env.example` for the full list) before running anything backend-related. `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` and `DJANGO_ALLOWED_HOSTS` are optional comma-separated lists (whitespace around entries is stripped; origins must include a scheme). Two optional flags default to their Azure-safe value, so the deployment needs no App Setting for either: `DB_SSLMODE` (default `require`; set `disable` for the local container) and `DJANGO_USE_PROXY_SSL_HEADER` (default `true`; set `false` for a directly-reachable server, since otherwise a client can spoof `X-Forwarded-Proto` and make `request.is_secure()` lie).

**Backend/frontend are decoupled and not yet wired together** — no DRF, no API endpoints, no frontend fetch calls exist yet. `frontend/src/App.jsx` is just a placeholder page.

## Commands

### Backend (Django)
```bash
source .venv/bin/activate
cd backend
python manage.py runserver
python manage.py createsuperuser        # requires auth_user table -> run migrate first
python manage.py migrate                # applies Django's own built-in app migrations (auth/admin/sessions/contenttypes) to 'default' only
python manage.py makemigrations core    # after changing backend/core/models.py
python manage.py makemigrations --check --dry-run   # verify models.py and migrations are in sync (safe, no DB needed)
```
`migrate core --database=default` / `migrate core --database=medical` create the actual domain tables — see the reconciliation caveat above before running either against a real database. No test suite currently exists in the repo.

### Database schema/seed (raw SQL, run against Postgres directly)
```bash
psql -h <host> -U <admin_user> -d postgres -f scripts/database_setup.sql   # creates user_db + medical_db and all domain tables
psql -h <host> -U <admin_user> -d postgres -f scripts/mock_data.sql        # seeds sample data into both
```

### Frontend (Vite + React PWA)
```bash
cd frontend
npm install
npm run dev       # vite dev server
npm run build     # vite build (also generates the PWA service worker via vite-plugin-pwa)
npm run lint      # oxlint (NOT eslint — see .oxlintrc.json)
npm run preview   # preview a production build
```

### Docker
```bash
docker build -t mediculus-backend .
```
The `Dockerfile` only packages `backend/` (installs `requirements.txt`, copies `backend/` in, runs `gunicorn config.wsgi:application` on port 8000 as a non-root `django` user). The frontend is not part of this image.

## Infrastructure

Backend dev deployment runs on Azure App Service (`mediculus-dev`), backed by Azure Postgres (two databases as above), with credentials/registry info supplied via `.env`-style App Settings (`DJANGO_REGISTRY_NAME`, `DJANGO_LOGIN_SERVER`, `DJANGO_USERNAME`, `DJANGO_PASSWORD` are ACR credentials, not app credentials). Treat DB and ACR passwords as live secrets — they are not meant to be pasted into chat/commits.
