# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Mediculus is a mental-health / wellbeing tracking platform (emotion diary, DBT technique tracking, mood scales) aimed at patients (including minors, via a parent/guardian account), specialists (psychotherapists, dietitians), and their supervising organization. The project is early-stage: the domain model is designed (see `ERD/DIAGRAM.drawio*`) and registration/login work end to end (DRF endpoints under `/api/auth/`, wired to the React pages), but nothing of the actual product — diary entries, mood scales, techniques, reports — has any API or UI yet.

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

As of 2026-08-21 both Azure databases are still at `0001` (faked); `0002`–`0004` have only been applied locally and need `migrate` on Azure. `0004_user_consents` adds the two RODO consent timestamps to `"user"`; it is written as `SeparateDatabaseAndState` with `ADD COLUMN IF NOT EXISTS`, because `database_setup.sql` declares those columns as well and the documented setup order runs that script first.

Also be aware there will be two parallel notions of "user" in `user_db`: Django's own `auth_user` (created by `manage.py migrate` for the built-in apps, used only for `/admin/` login) and `core.User` (the hand-mirrored `"user"` table, the actual domain/app user). They are intentionally not connected — don't conflate them.

A few `on_delete` choices in `core/models.py` are a deliberate improvement over the raw SQL, which specifies no `ON DELETE` action (i.e. Postgres `NO ACTION` everywhere): `User.user_role` and `Raport.technique`/`Patient.specjalist` use `PROTECT`/`SET_NULL` instead, chosen per-relationship for sane application behavior rather than mirrored verbatim.

**Env-var-driven settings, no defaults for required values.** `settings.py` reads `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, and all `USER_DB_*` / `MEDICAL_DB_*` DB credentials via `os.environ[...]` (not `.get`), so the process will hard-fail at import time if any are missing — always ensure `.env` is populated (see `.env.example` for the full list) before running anything backend-related. `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` and `DJANGO_ALLOWED_HOSTS` are optional comma-separated lists (whitespace around entries is stripped; origins must include a scheme). Two optional flags default to their Azure-safe value, so the deployment needs no App Setting for either: `DB_SSLMODE` (default `require`; set `disable` for the local container) and `DJANGO_USE_PROXY_SSL_HEADER` (default `true`; set `false` for a directly-reachable server, since otherwise a client can spoof `X-Forwarded-Proto` and make `request.is_secure()` lie).

**Authentication: DRF endpoints under `/api/auth/`, session cookie, custom user table.** `core/urls.py` (mounted at `api/` by `config/urls.py`) exposes `csrf/`, `register/`, `login/`, `logout/`, `me/`. The pieces worth knowing before touching them:

- **`core.User` is not an auth user.** `django.contrib.auth.login()` would write an `auth_user` primary key into the session, so it is unusable here. `core/authentication.py` borrows only the session framework: `start_session()` stores the domain user's id under `core_user_id`, and `SessionUserAuthentication` (the project-wide `DEFAULT_AUTHENTICATION_CLASSES`) reads it back. `core.User` carries an `is_authenticated = True` class attribute purely so DRF's `IsAuthenticated` can duck-type it.
- **`IsAuthenticated` is the default permission** and `UNAUTHENTICATED_USER` is `None`, so a new endpoint that declares no `permission_classes` is closed rather than accidentally public. `CsrfView`/`RegisterView`/`LoginView` opt out explicitly.
- **CSRF applies to `register/` and `login/` too**, via a hand-applied `@csrf_protect` — DRF marks every `APIView` csrf_exempt, and the usual enforcement lives in the authentication class, which does nothing for a caller who has no session yet. `GET /api/auth/csrf/` both sets the cookie and returns the token in its body; the body copy is what a frontend on another site uses, since it cannot read the API's cookies.
- **Login answers identically for a wrong password and an unknown address**, and spends the same time on both (`_get_unmatchable_hash` in `core/serializers.py`) — for a mental-health service, who has an account is itself sensitive. `_password_matches` also survives the literal `'mock_hash_placeholder'` that `mock_data.sql` seeds, which would otherwise make `check_password` raise.
- **Registration creates a `Patient` row** (so the user has an `id_medical` to file diary entries against) and assigns the `patient` role, looked up by name — that row comes from `mock_data.sql`, not from a migration, so a database without it yields a user with `role: null` rather than a failure. `is_child` is left NULL because the form collects no date of birth.
- **`LANGUAGE_CODE = 'pl'`**, so Django's own messages (password validators, DRF's "not authenticated") reach the Polish UI in Polish.
- **Rate limiting** on `login/`/`register/` is `10/min` per IP, counted in the default local-memory cache — i.e. per gunicorn worker. A shared cache backend is what would make it a real limit.

**Frontend/backend wiring.** `frontend/src/api/client.ts` is the only place that knows about `credentials: 'include'` and the `X-CSRFToken` header (including one silent retry with a fresh token on a 403, for when the server restarted). `frontend/src/api/auth.ts` is the single translation point between the form's camelCase field names and the API's snake_case columns, in both directions — including `REGISTER_FIELDS`, which is what lets a Django field error land under the right input. `src/auth/` holds the session context that `App.tsx`'s route guards wait on.

In development the frontend talks to `/api` on its own origin and `vite.config.ts` proxies that to `http://127.0.0.1:8000` (override the target with `API_PROXY_TARGET` in `frontend/.env.local` if Django listens elsewhere). That keeps the session cookie first-party and avoids CORS entirely, but **not** Django's CSRF origin check: the proxy rewrites `Host` to the target, so `http://localhost:5173` has to be in `CSRF_TRUSTED_ORIGINS` or every POST comes back 403 with "Origin checking failed". Pointing `VITE_API_BASE_URL` at a backend on another origin instead makes every call cross-site, which needs `DJANGO_CROSS_SITE_COOKIES=true` on the backend plus the frontend's origin in both `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS`.

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
python manage.py test core --noinput               # full suite (creates test_user_db + test_medical_db)
python manage.py test core.tests.test_routers      # router/env-config tests only, no database touched
```
`migrate core --database=default` / `migrate core --database=medical` create the actual domain tables — see the reconciliation caveat above before running either against a real database.

**Tests** live in `backend/core/tests/` and use Django's own runner (no pytest, no extra dependency):

- `test_routers.py` — `CoreDatabaseRouter` placement and `allow_migrate` rules, including that operation hints arrive spread as kwargs (`target_db=...`, not `hints={...}`), and that `0002`'s hints still match what the router reads. `SimpleTestCase`, no database.
- `test_models.py` — routing per model, the pseudonymized `id_medical` join (unknown ids accepted, no cascade across databases), the deliberate `PROTECT`/`SET_NULL`/`CASCADE` choices, the `parent_child` constraints, and that `created_at`/`updated_at` come from `auto_now*` rather than DB defaults. Needs both databases.
- `test_env_config.py` — imports `config/settings.py` in a subprocess to check that `DJANGO_ENV_FILE` selects the file, real env vars override it, a missing file is survivable (the App Service case), a missing required key hard-fails, `DB_SSLMODE` defaults to `require`, and that no local env file pairs an `azure.com` host with `sslmode=disable`.
- `test_auth_api.py` — the `/api/auth/` endpoints: what registration writes (hash not password, consent timestamps, `Patient` row, `patient` role, and that a missing role row is survivable), that login is case-insensitive on e-mail and indistinguishable between a wrong password and an unknown address, that a non-hash `password_hash` fails cleanly rather than 500-ing, the session lifecycle including a cookie pointing at a deleted user, throttling, and that CSRF is actually required on login/register/logout. `default` only.

Always pass `--noinput`: an aborted run leaves `test_user_db` behind and the next run then blocks on an interactive "delete it?" prompt, producing no output at all. Test databases are built from migrations (not `database_setup.sql`), so `0001` runs for real there rather than faked.

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
npm run typecheck # tsc -b, no emit
npm run preview   # preview a production build
```

### Docker
```bash
docker build -t mediculus-backend .
```
The `Dockerfile` only packages `backend/` (installs `requirements.txt`, copies `backend/` in, runs `gunicorn config.wsgi:application` on port 8000 as a non-root `django` user). The frontend is not part of this image.

## Infrastructure

Backend dev deployment runs on Azure App Service (`mediculus-dev`), backed by Azure Postgres (two databases as above), with credentials/registry info supplied via `.env`-style App Settings (`DJANGO_REGISTRY_NAME`, `DJANGO_LOGIN_SERVER`, `DJANGO_USERNAME`, `DJANGO_PASSWORD` are ACR credentials, not app credentials). Treat DB and ACR passwords as live secrets — they are not meant to be pasted into chat/commits.
