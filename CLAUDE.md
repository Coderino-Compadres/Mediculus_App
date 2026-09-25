# CLAUDE.md (Zoptymalizowany)

This file provides critical guidance when working with code in this repository[cite: 1].

## 1. Project Overview & Architecture
* **Mediculus**: A mental-health tracking platform for patients (including minors), specialists, and guardians[cite: 1].
* **Repo Layout**: `backend/` (Django), `frontend/` (Vite+React), `scripts/` (SQL setups), `ERD/` (schemas)[cite: 1].
* **Two Postgres Databases**:
  * `default` (`user_db`): Identity/PII (user, roles, specialists, patients, parents)[cite: 1].
  * `medical` (`medical_db`): Pseudonymized clinical data (diary, reports, diet, techniques)[cite: 1].
* **Cross-DB Joins**: `patient.id_medical` connects the databases[cite: 1]. This is a logical join only; Postgres cannot enforce referential integrity across DBs[cite: 1].
* **Migrations**: `0001_initial` is faked everywhere because `database_setup.sql` handles initial table creation[cite: 1]. You must migrate databases separately: `python manage.py migrate core --database=default` and `python manage.py migrate core --database=medical`[cite: 1].

## 2. Authentication & Access Gates
* **Session Auth**: Uses `core_user_id` in sessions, not Django's built-in `auth_user`[cite: 1]. `IsAuthenticated` is the default DRF permission[cite: 1].
* **Guardian Gate (RODO Art. 8)**: Minors cannot access clinical endpoints until a guardian accepts the link[cite: 1]. Enforced via `_require_patient`[cite: 1].
* **Consent Gate**: Users must grant both RODO consents to use the app (`HasActiveConsents` permission)[cite: 1].
* **Password Gate**: Accounts with generated passwords (e.g., specialists created by colleagues) must change them on first login[cite: 1].
* **Password Reset** (`core/password_reset.py`): `POST /api/auth/password-reset/` always answers 204 — it must never reveal whether an address has an account — and mails a signed, one-hour token; `/confirm/` sets the new password, clears `must_change_password` and closes every session of that account. The token is stateless and stored nowhere: it carries a fingerprint of the current `password_hash`, so changing the password is what makes it single-use. Links are built from `FRONTEND_BASE_URL`, never from the `Host` header. This is the only mail the app sends; with `EMAIL_HOST` unset it goes to the console.
* **Admin Panel** (`core/admin_panel.py`, `/api/admin/`, frontend `/panel-admina`): an `administrator` row (never the role name) opens it; created only by `python manage.py create_admin <email>`, and an admin is never also a patient/specialist/guardian. Two jobs: (1) **specialist approval gate** — a colleague-created specialist has `specjalist.approved_at` NULL and `_require_specialist` refuses the whole panel (`/specialist/pending` screen) until an admin approves; rejecting **deletes** the account and ends its sessions; (2) **read-only data view** — user_db identity and links, medical_db **counts and dates only, never content**. Every read and decision goes to `admin_audit_log` (reads deduplicated per 10 min). Test fixtures creating a `Specjalist` must set `approved_at`.
* **Role Restrictions**: Being a specialist or guardian grants no automatic access to patient data; permissions are granted strictly via accepted invitations[cite: 1].
* **Specialist Module**: `specjalist.module` (`psychotherapy`/`diet`, chosen when a colleague creates the account) only picks the specialist's own panel — a psychodietitian gets the read-only diet catalogue instead of the DBT editor, whose writes the API refuses them. Access to patients is still `specjalist_patient.module`, per accepted invitation.

## 3. Core Modules & Business Logic
* **Reports**: Generated dynamically once a week from diary entries; never stored in the database[cite: 1]. Psychotherapy weeks run Monday-Sunday[cite: 1].
* **Diet Module**: Strictly qualitative (no calorie counting, no food measuring)[cite: 1]. Diet weeks count from the patient's first entry (not Monday) and use `patient.diet_week_start` as the anchor[cite: 1].
* **Meal Emotions**: Adding a meal offers the psychotherapy form's own picker — the same ten `core/emotions.py` names on the same 0-10 sliders — stored a row per chip in `diet_meal_emotion`. Unlike the diary's `mood_scale` columns, `intensity` is nullable: the row records that a chip was picked and the column records only the rating, so an untouched slider stays NULL instead of becoming a 0 nobody chose. A number here rates a feeling, never the food.
* **Techniques**: Specialist-created techniques have no draft state; they are published to all patients immediately upon saving[cite: 1]. Slugs are derived automatically and immutable[cite: 1].
* **Timezones**: The `settings.TIME_ZONE` is `Europe/Warsaw`, which dictates calendar day boundaries for entries regardless of UTC storage[cite: 1].

## 4. Frontend Rules
* **API Calls**: All endpoint paths passed to the client must start with `/api/`[cite: 1]. 
* **State Handling**: Failed loads should not be displayed as empty lists/diaries (distinguish 404/empty vs. network error)[cite: 1]. Untouched optional sliders/controls should be `null`, not `0`[cite: 1].
* **Styling**: `box-sizing: border-box` is global[cite: 1]. Use `styles/theme.css` for design tokens and `styles/panel.css` for specialist/parent dashboard layouts[cite: 1].
* **Pagination**: Fixed at 7 items per page (`hooks/usePagination.ts`) and is handled client-side[cite: 1].

## 5. Key Commands
* **Dev Setup**: Run `scripts/setup_dev.sh` to safely migrate both databases after a `git pull`[cite: 1].
* **Seeding**: Use `python manage.py seed_demo_diary <email>=<flagged_days>` to generate realistic past entries for report testing[cite: 1]. Do not use on real patient accounts[cite: 1].
* **Database Check**: `python manage.py check_databases` verifies if real DB schemas match Django models[cite: 1].
* **Frontend Tests**: `npm run test` (Vitest/jsdom)[cite: 1]. Tests strictly enforce cross-language vocabulary matching (e.g., `emotions.ts` vs `emotions.py`)[cite: 1].