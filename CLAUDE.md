# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Mediculus is a mental-health / wellbeing tracking platform (emotion diary, DBT technique tracking, mood scales) aimed at patients (including minors, via a parent/guardian account), specialists (psychotherapists, dietitians), and their supervising organization. The project is early-stage: the domain model is designed (see `ERD/DIAGRAM.drawio*`), registration/login work end to end (DRF endpoints under `/api/auth/`, wired to the React pages), and the patient home screen now reads the signed-in patient's real diary data (`/api/dashboard/home/`). What is still missing is everything that *writes* clinical data — there is no way to create a diary entry, rate a mood scale, or produce a report through the app; those rows only arrive via `scripts/mock_data.sql`.

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

As of 2026-08-25 both Azure databases are still at `0001` (faked); `0002`–`0006` have only been applied locally and need `migrate` on Azure. Two of them are written as `SeparateDatabaseAndState` with `ADD COLUMN IF NOT EXISTS`, because `database_setup.sql` declares the same columns and the documented setup order runs that script first: `0004_user_consents` adds the two RODO consent timestamps to `"user"`, and `0005_diary_entry_fields` adds the columns the "Dodaj wpis" form needs — `tension_level`, `emotion_note`, `thought`, `risky_behavior_note` on `diary`, plus `shame_scale`/`calm_scale` on `mood_scale`. `0005` targets medical_db only, so its `RunSQL` carries `hints={'target_db': 'medical'}`. `0006_drop_overall_feeling` then removes `diary.overall_feeling`: the "jakość samopoczucia" slider that would have filled it was cut from the entry form and `current_mood` already records how the patient says they feel, so it was a duplicate with no source. It is the first destructive migration — the text `mock_data.sql` used to seed there is not recoverable by reversing it. **The ERD (`ERD/DIAGRAM.drawio`) still shows the pre-`0005` `diary`/`mood_scale`**: it lists `OVERALL_FEELING` and lacks `TENSION_LEVEL`, `EMOTION_NOTE`, `THOUGHT`, `RISKY_BEHAVIOR_NOTE`, `SHAME_SCALE` and `CALM_SCALE`. Treat the SQL script and the models as the truth until someone redraws it.

Also be aware there will be two parallel notions of "user" in `user_db`: Django's own `auth_user` (created by `manage.py migrate` for the built-in apps, used only for `/admin/` login) and `core.User` (the hand-mirrored `"user"` table, the actual domain/app user). They are intentionally not connected — don't conflate them.

A few `on_delete` choices in `core/models.py` are a deliberate improvement over the raw SQL, which specifies no `ON DELETE` action (i.e. Postgres `NO ACTION` everywhere): `User.user_role` and `Raport.technique`/`Patient.specjalist` use `PROTECT`/`SET_NULL` instead, chosen per-relationship for sane application behavior rather than mirrored verbatim.

**Env-var-driven settings, no defaults for required values.** `settings.py` reads `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, and all `USER_DB_*` / `MEDICAL_DB_*` DB credentials via `os.environ[...]` (not `.get`), so the process will hard-fail at import time if any are missing — always ensure `.env` is populated (see `.env.example` for the full list) before running anything backend-related. `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` and `DJANGO_ALLOWED_HOSTS` are optional comma-separated lists (whitespace around entries is stripped; origins must include a scheme). Two optional flags default to their Azure-safe value, so the deployment needs no App Setting for either: `DB_SSLMODE` (default `require`; set `disable` for the local container) and `DJANGO_USE_PROXY_SSL_HEADER` (default `true`; set `false` for a directly-reachable server, since otherwise a client can spoof `X-Forwarded-Proto` and make `request.is_secure()` lie).

**Authentication: DRF endpoints under `/api/auth/`, session cookie, custom user table.** `core/urls.py` (mounted at `api/` by `config/urls.py`) exposes `csrf/`, `register/`, `login/`, `logout/`, `me/`. The pieces worth knowing before touching them:

- **`core.User` is not an auth user.** `django.contrib.auth.login()` would write an `auth_user` primary key into the session, so it is unusable here. `core/authentication.py` borrows only the session framework: `start_session()` stores the domain user's id under `core_user_id`, and `SessionUserAuthentication` (the project-wide `DEFAULT_AUTHENTICATION_CLASSES`) reads it back. `core.User` carries an `is_authenticated = True` class attribute purely so DRF's `IsAuthenticated` can duck-type it.
- **`IsAuthenticated` is the default permission** and `UNAUTHENTICATED_USER` is `None`, so a new endpoint that declares no `permission_classes` is closed rather than accidentally public. `CsrfView`/`RegisterView`/`LoginView` opt out explicitly.
- **CSRF applies to `register/` and `login/` too**, via a hand-applied `@csrf_protect` — DRF marks every `APIView` csrf_exempt, and the usual enforcement lives in the authentication class, which does nothing for a caller who has no session yet. `GET /api/auth/csrf/` both sets the cookie and returns the token in its body; the body copy is what a frontend on another site uses, since it cannot read the API's cookies.
- **A rejected CSRF check answers in JSON** (`CSRF_FAILURE_VIEW` → `core/csrf.py`), because Django's own failure view renders HTML that a `fetch()` cannot read — the frontend was falling back to a generic "something went wrong" and discarding the only useful detail. The technical `reason` is included only when `DEBUG`; in production it goes to the log instead, which is also why `settings.LOGGING` exists: Django's default console handler carries a `require_debug_true` filter and the only other one mails admins about `ERROR`s, so a CSRF rejection (a `WARNING`) reached **nothing at all** with `DEBUG=False`.
- **Login answers identically for a wrong password and an unknown address**, and spends the same time on both (`_get_unmatchable_hash` in `core/serializers.py`) — for a mental-health service, who has an account is itself sensitive. `_password_matches` also survives the literal `'mock_hash_placeholder'` that `mock_data.sql` seeds, which would otherwise make `check_password` raise.
- **The registration form's "account type" choice drives the schema**, via `ACCOUNT_TYPES` in `core/serializers.py`: `patient` → role `patient` + `Patient(is_child=False)`, `minor_patient` → role `patient` + `Patient(is_child=True)`, `parent` → role `rodzic` and **no `Patient` row at all** (a guardian is not a clinical subject, so they get no `id_medical` and nothing in `medical_db` can refer to them). `is_child` comes from that choice, not computed from `date_of_birth`, but `_check_age_matches_account_type` refuses the two combinations where they would contradict each other (an adult date on a `minor_patient`, a minor's date on a `patient`) — otherwise a later feature trusting one column over the other would silently be wrong about some records. The boundary lives in `ADULT_AGE`, a policy constant rather than a fact: RODO art. 8 uses 16 for consent to digital services, so it may need revisiting. A `parent` is deliberately not age-checked. Roles are looked up by name and come from `mock_data.sql`, not a migration, so a database missing the row yields `role: null` rather than a failure.
- **Nothing links a minor's account to a guardian yet.** `parent_child` exists in the schema but there is no endpoint or UI that writes to it, so a `minor_patient` account is currently an orphan. Worth resolving before this reaches real users: a consent to process health data ticked by a minor is not valid consent under RODO.
- **`LANGUAGE_CODE = 'pl'`**, so Django's own messages (password validators, DRF's "not authenticated") reach the Polish UI in Polish.
- **Rate limiting** on `login/`/`register/` is `10/min` per IP, counted in the default local-memory cache — i.e. per gunicorn worker. A shared cache backend is what would make it a real limit.

**The home screen's data: `GET /api/dashboard/home/`.** `core/views.py` `HomeDashboardView` answers with everything `frontend/src/pages/Home.tsx` draws — streak, today's entry, the 7-day chart, the stress/energy averages, the technique suggestion. The aggregation itself is in `core/dashboard.py`, kept out of the view so it can be tested (and reused by the analysis/report screens) without a request.

- **The session is the only identity input.** The view resolves `request.user` → `Patient.id_medical` (user_db) and passes that UUID to `build_home_dashboard`, which touches nothing but medical_db. There is no patient id in the URL, so one account cannot ask for another's numbers, and the aggregation code never sees a name or an e-mail.
- **An account with no `patient` row is refused, not answered with zeroes** — a guardian or a specialist is not a clinical subject, so an empty diary would be a misleading answer rather than a true one. Guardians get to a child's data through the parent panel, which does not exist yet (`parent_child` is still unwritten — see the note above).
- **`core/emotions.py` is the shared vocabulary**, and `frontend/src/utils/emotions.ts` holds the same ten names plus a colour for each. The strings have to match character for character: the API sends names and the chart looks up colours by them. Nothing enforces that — `api/dashboard.ts` treats a name it does not recognise as "no colour" rather than drawing an invisible bar.
- **One of the ten emotions has no scale column.** `mood_scale` covers nine (`shame_scale`/`calm_scale` were added by `0005`) and `diary.stress_level` supplies 'Stres'. A day can still legitimately have a named emotion and no intensity — rows written before `0005`, or an emotion named in `diary.current_strongest_emotion` that was never rated — which the chart draws as a fixed-height bar in that emotion's colour.
- **`current_strongest_emotion` wins over the sliders** when `normalize_emotion` can read it, with its height taken from the matching slider. Unmappable text — the seed data alone contains 'zmęczenie' — falls back to the highest rating instead of being forced into the nearest name. The column was designed to hold the patient's own answer to "what did you feel most strongly", but the entry form never asks that question, so `core/diary.py` derives it from the highest rating on save (`strongest_emotion`, sharing `dashboard._ratings`' tie-break order so the two can never disagree). Rows written before that, and the seed data, are the only ones where the column means anything else. If the form ever grows the question, that is the line that should start trusting the answer instead.
- **The technique suggestion is read from `raport`, not computed here.** Whatever produces the reports is where that judgement belongs; a second opinion invented on the dashboard would quietly disagree with the one in the reports screen. No report yet means no card.
- **`settings.TIME_ZONE` is `Europe/Warsaw`** (rows are still stored in UTC). It decides which calendar day a `created_at` belongs to, so under UTC an entry written at 00:30 would have counted towards the previous day.

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
- `test_dashboard_api.py` — `/api/dashboard/home/`: that only the signed-in patient's own rows are aggregated and a non-patient account is refused, how a day's dominant emotion and bar height are chosen (declared emotion first, highest rating as fallback, stress competing with the mood scales), the 7-day window and its averages, the streak's tolerance for an unwritten today, and that an `id_medical` with no rows is an empty dashboard rather than an error. Needs both databases.
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
