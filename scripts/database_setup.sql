\set ON_ERROR_STOP on
\connect postgres

SELECT 'CREATE DATABASE user_db'
WHERE NOT EXISTS (
    SELECT 1 FROM pg_database WHERE datname = 'user_db'
)
\gexec

SELECT 'CREATE DATABASE medical_db'
WHERE NOT EXISTS (
    SELECT 1 FROM pg_database WHERE datname = 'medical_db'
)
\gexec


-- ============================================================
-- USER DATABASE
-- ============================================================

\connect user_db

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------
-- USER_ROLE
-- ----------------------------
CREATE TABLE IF NOT EXISTS user_role (
    id_user_role UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT
);

-- ----------------------------
-- USER
-- ----------------------------
CREATE TABLE IF NOT EXISTS "user" (
    id_user UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_user_role UUID,
    email VARCHAR(255),
    password_hash VARCHAR(255),
    name TEXT,
    surname TEXT,
    date_of_birth DATE,
    -- When each RODO consent was granted; NULL means never. Timestamps rather
    -- than booleans because art. 7(1) puts the burden of proof on us.
    data_consent_at TIMESTAMPTZ,
    services_consent_at TIMESTAMPTZ,
    -- And when each was withdrawn, if it was. Not a reset of the column above:
    -- art. 7(3) makes withdrawal a right, so it is its own fact rather than the
    -- erasure of the fact that consent was given. A consent counts as active
    -- when granted and not withdrawn since -- backend/core/consents.py is the
    -- one place that comparison is written.
    data_consent_withdrawn_at TIMESTAMPTZ,
    services_consent_withdrawn_at TIMESTAMPTZ,
    -- TRUE while the account is still using a password somebody else chose for
    -- it: a specialist account created by another specialist gets a generated
    -- one, handed over in the room. Such an account reaches nothing but the
    -- form that changes it -- backend/core/permissions.py. FALSE everywhere
    -- else, which is why the column is NOT NULL with that default.
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_user_user_role
        FOREIGN KEY (id_user_role)
        REFERENCES user_role (id_user_role)
);

-- ----------------------------
-- SPECJALIST
-- Name preserved from the ERD.
-- ----------------------------
CREATE TABLE IF NOT EXISTS specjalist (
    id_user UUID PRIMARY KEY,
    specjalization TEXT,

    CONSTRAINT fk_specjalist_user
        FOREIGN KEY (id_user)
        REFERENCES "user" (id_user)
);

-- ----------------------------
-- PATIENT
-- id_medical is the pseudonymous identifier used by medical_db.
-- ----------------------------
CREATE TABLE IF NOT EXISTS patient (
    id_user UUID PRIMARY KEY,
    id_medical UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    id_specjalist UUID,
    -- The specialist who has *asked* to take this patient on (NULL = nobody is
    -- asking), and when the patient agreed to id_specjalist above. Accepting
    -- moves the id from the pending column into id_specjalist and stamps the
    -- timestamp; refusing clears the pending column and records nothing, the
    -- same way parent_child deletes a refused invitation.
    -- Mirrors core/migrations/0011_specjalist_patient_invitation.py.
    id_specjalist_pending UUID,
    specjalist_accepted_at TIMESTAMPTZ,
    is_child BOOLEAN,

    CONSTRAINT fk_patient_user
        FOREIGN KEY (id_user)
        REFERENCES "user" (id_user),

    CONSTRAINT fk_patient_specjalist
        FOREIGN KEY (id_specjalist)
        REFERENCES specjalist (id_user),

    CONSTRAINT fk_patient_specjalist_pending
        FOREIGN KEY (id_specjalist_pending)
        REFERENCES specjalist (id_user)
);

-- ----------------------------
-- PARENT_CHILD
-- ----------------------------
CREATE TABLE IF NOT EXISTS parent_child (
    id_parent_child UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_parent UUID,
    id_child UUID,

    CONSTRAINT fk_parent_child_parent
        FOREIGN KEY (id_parent)
        REFERENCES "user" (id_user),

    CONSTRAINT fk_parent_child_child
        FOREIGN KEY (id_child)
        REFERENCES "user" (id_user)
);

-- ----------------------------
-- PARENT_INVITATION
-- A specialist's invitation for a guardian to create an account and be linked
-- to a named child. The guardian link itself is normally started by the child
-- (parent_child); this is the other direction, for a specialist sitting with a
-- family. There is no mail out of this deployment, so the invitation travels as
-- a code handed over in person -- code_hash holds it the way user.password_hash
-- holds a password, and the plaintext exists only in the response that created
-- it. email binds the code to one address; used_at marks a redeemed invitation
-- rather than deleting it, so a code cannot be redeemed twice.
-- ----------------------------
CREATE TABLE IF NOT EXISTS parent_invitation (
    id_parent_invitation UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_specjalist UUID NOT NULL,
    id_child UUID NOT NULL,
    email VARCHAR(255) NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_parent_invitation_specjalist
        FOREIGN KEY (id_specjalist)
        REFERENCES specjalist (id_user),

    CONSTRAINT fk_parent_invitation_child
        FOREIGN KEY (id_child)
        REFERENCES "user" (id_user)
);

-- The CREATE TABLE above is IF NOT EXISTS, so it is a no-op on a database that
-- predates the consent columns. Add them here as well so that re-running this
-- script upgrades such a database instead of silently skipping them. Mirrors
-- core/migrations/0004_user_consents.py, whichever of the two runs first.
ALTER TABLE "user"
    ADD COLUMN IF NOT EXISTS data_consent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS services_consent_at TIMESTAMPTZ;

-- The withdrawal side of the same two consents. Mirrors
-- core/migrations/0010_consent_withdrawal.py.
ALTER TABLE "user"
    ADD COLUMN IF NOT EXISTS data_consent_withdrawn_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS services_consent_withdrawn_at TIMESTAMPTZ;

-- The flag that holds a specialist account on the password form until its owner
-- has replaced the password the colleague who created it generated. Mirrors
-- core/migrations/0014_must_change_password.py. NOT NULL DEFAULT FALSE, so a
-- database full of accounts that chose their own password needs no backfill.
ALTER TABLE "user"
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- Same reasoning for the guardian invitation's answer: NULL means the child has
-- named this guardian and the guardian has not decided yet. Mirrors
-- core/migrations/0007_parent_child_accepted_at.py.
ALTER TABLE parent_child
    ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

-- Same again for the specialist's half of the assignment, added later still.
-- Mirrors core/migrations/0011_specjalist_patient_invitation.py.
ALTER TABLE patient
    ADD COLUMN IF NOT EXISTS id_specjalist_pending UUID,
    ADD COLUMN IF NOT EXISTS specjalist_accepted_at TIMESTAMPTZ;

-- The FK belongs with the column above; on a database that predates it the
-- CREATE TABLE never ran, so add it here too. DO block because Postgres has no
-- ADD CONSTRAINT IF NOT EXISTS.
DO $$
BEGIN
    ALTER TABLE patient
        ADD CONSTRAINT fk_patient_specjalist_pending
        FOREIGN KEY (id_specjalist_pending) REFERENCES specjalist (id_user);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Helpful FK indexes
CREATE INDEX IF NOT EXISTS idx_user_id_user_role
    ON "user" (id_user_role);

CREATE INDEX IF NOT EXISTS idx_patient_id_specjalist
    ON patient (id_specjalist);

CREATE INDEX IF NOT EXISTS idx_parent_child_id_parent
    ON parent_child (id_parent);

CREATE INDEX IF NOT EXISTS idx_parent_child_id_child
    ON parent_child (id_child);

CREATE INDEX IF NOT EXISTS idx_patient_id_specjalist_pending
    ON patient (id_specjalist_pending);

CREATE INDEX IF NOT EXISTS idx_parent_invitation_id_specjalist
    ON parent_invitation (id_specjalist);

CREATE INDEX IF NOT EXISTS idx_parent_invitation_id_child
    ON parent_invitation (id_child);


-- ============================================================
-- MEDICAL DATABASE
-- ============================================================

\connect medical_db

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- IMPORTANT:
-- The id_medical columns below are NOT PostgreSQL foreign keys to user_db.
-- They are logical/application-level references to:
--   user_db.patient.id_medical

-- ----------------------------
-- DIARY
-- ----------------------------
CREATE TABLE IF NOT EXISTS diary (
    id_diary UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Logical relation:
    -- diary.id_medical -> user_db.patient.id_medical
    id_medical UUID NOT NULL,

    current_mood TEXT,
    current_strongest_emotion TEXT,
    -- How strongly 'Stres' was felt. The entry form rates it on the emotion
    -- picker like the other nine emotions; there is no separate stress slider.
    stress_level INT,
    energy_level INT,
    tension_level INT,
    -- The CBT/ABC breakdown. situation_place holds either a suggested place or
    -- the free text typed instead of one.
    situation TEXT,
    situation_place TEXT,
    -- When the situation happened: 'morning' | 'noon' | 'evening' | 'night'.
    -- Not when the entry was written -- that is updated_at. The Polish labels
    -- live on the frontend; the column holds the technical key.
    --
    -- Unconstrained on purpose, and worth knowing exactly how far that goes:
    -- there is no CHECK here, and Django's `choices` in core/models.py is not
    -- one either -- it is validated by forms and by full_clean(), never by
    -- .save() and never by the database. The only thing that actually refuses a
    -- fifth value is DiaryEntrySerializer, i.e. the API. So anything writing
    -- this column directly (a data migration, manage.py shell, a seed script,
    -- a future specialist-side writer) can store text the frontend will silently
    -- drop on read -- add a CHECK, or go through the serializer.
    time_of_day TEXT,
    emotion_note TEXT,
    thought TEXT,
    how_situation_handled TEXT,
    notes TEXT,
    -- Risky behaviour (self-harm, substance use, ...). NULL means none reported.
    risky_behavior_note TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------
-- MOOD_SCALE
-- ----------------------------
CREATE TABLE IF NOT EXISTS mood_scale (
    id_scale BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    id_diary UUID,
    sadness_scale INT,
    anxiety_scale INT,
    anger_scale INT,
    happiness_scale INT,
    guilt_scale INT,
    frustration_scale INT,
    helplessness_scale INT,
    shame_scale INT,
    calm_scale INT,

    CONSTRAINT fk_mood_scale_diary
        FOREIGN KEY (id_diary)
        REFERENCES diary (id_diary)
);

-- ----------------------------
-- TECHNIQUE
-- ----------------------------
CREATE TABLE IF NOT EXISTS technique (
    id_technique SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    name TEXT,
    type TEXT,
    description TEXT,
    -- Everything below is the catalogue's own shape, added so a technique
    -- written by a specialist can hold the same content as the ones the app
    -- ships with (frontend/src/types/technique.ts). Mirrors
    -- core/migrations/0013_technique_catalogue.py.
    --
    -- slug is what the URL carries and what the patient's catalogue merges this
    -- table with the built-in one on; NULL on the seeded rows, which predate it.
    slug VARCHAR(64),
    subtitle TEXT,
    -- Genuinely a list: a technique can belong to two schools at once (paced
    -- breathing is a component of TIPP and a relaxation technique in its own
    -- right), and the alternative is two rows whose descriptions drift apart.
    schools JSONB NOT NULL DEFAULT '[]'::jsonb,
    dbt_group TEXT,
    dbt_module TEXT,
    -- 'ogolna' | 'wymagaSpecjalisty'. A safety flag, not a category: anything
    -- not 'ogolna' is withheld from the self-service catalogue.
    availability TEXT NOT NULL DEFAULT 'ogolna',
    intro TEXT,
    -- The ordered component skills: [{"nazwa": ..., "opis": ..., "przyklady": [...]}].
    -- JSON rather than a technique_step table -- a step has no identity, nothing
    -- queries one, and the list is written and read as a unit.
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    duration_min INT,
    -- Whether there is a description to open. FALSE by default, which is what
    -- keeps the seeded rows out of the patient's catalogue: they carry a name
    -- and a sentence, not the structure the detail screen renders.
    description_ready BOOLEAN NOT NULL DEFAULT FALSE,
    -- Logical relation:
    -- technique.author_id_specjalist -> user_db.specjalist.id_user
    -- NOT a foreign key, for the same reason id_medical is not one. It says
    -- whose panel may edit the row; it is not a visibility rule -- every
    -- published technique is visible to every patient.
    author_id_specjalist UUID,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------
-- HYDRATION
-- The diet module's water counter (mockups §08, "Nawodnienie i suplementy").
-- A row per serving rather than a running total per day: a counter column makes
-- "+1 szklanka" a read-modify-write two taps can lose, and leaves nothing to
-- undo after a mis-tap. Mirrors core/migrations/0015_hydration.py.
-- ----------------------------
CREATE TABLE IF NOT EXISTS hydration (
    id_hydration UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Logical relation:
    -- hydration.id_medical -> user_db.patient.id_medical
    id_medical UUID NOT NULL,

    -- The calendar day this serving belongs to, in settings.TIME_ZONE
    -- (Europe/Warsaw) -- not the UTC date of created_at. core/days.py is where
    -- that boundary is decided.
    entry_date DATE NOT NULL,

    -- One of core.drinks.DRINKS, the Polish name as written. Only 'Woda' counts
    -- towards the daily goal; tea, coffee and infusions are recorded and
    -- deliberately never converted into water -- the client's rule, so that the
    -- judgement stays with the specialist.
    --
    -- Unconstrained on purpose, with the same caveat as diary.time_of_day:
    -- there is no CHECK here and Django's `choices` is not one either, so the
    -- only thing refusing a sixth value is the API serializer.
    drink TEXT NOT NULL DEFAULT 'Woda',

    -- NULL for every drink but water. The "Inne napoje" card offers a chip and
    -- no quantity, and inventing one would put a number nobody entered into a
    -- clinical record.
    amount_ml INT,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------
-- DIET_MEAL
-- The diet module's food diary (mockups §04-§07). A row per meal; a day is the
-- group of them, and there is deliberately no diet_day table -- a day has
-- nothing of its own to store that is not derivable from its meals.
--
-- §04 states the module's scope outright: no product search and no numeric
-- field, a photo and a description being the only two sources of a meal's
-- content. So there is no weight, no portion and no calorie column here, and
-- that is a decision rather than a gap. The photo is not here yet either: it
-- would be the first file this deployment ever stored, and storage, retention
-- and the consent covering it are all unanswered.
--
-- Mirrors core/migrations/0016_diet_meals_supplements.py.
-- ----------------------------
CREATE TABLE IF NOT EXISTS diet_meal (
    id_meal UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Logical relation:
    -- diet_meal.id_medical -> user_db.patient.id_medical
    id_medical UUID NOT NULL,

    -- The calendar day this meal belongs to, in settings.TIME_ZONE
    -- (Europe/Warsaw) -- not the UTC date of created_at. core/days.py is where
    -- that boundary is decided.
    entry_date DATE NOT NULL,

    -- One of core.meals.MEAL_KINDS, the Polish name as written, or NULL for a
    -- meal saved without saying which one it was. Unconstrained on purpose,
    -- with the same caveat as diary.time_of_day: the only thing refusing an
    -- unknown value is the API serializer.
    kind TEXT,

    -- The hour the mockups label a meal with ("Przekąska · 16:20"). NULL is an
    -- hour not given, not a midnight.
    eaten_at TIME,

    -- What the patient typed. '' rather than NULL for a meal saved without a
    -- description: the field was on screen and left empty, so there is no third
    -- state to tell apart (§05: no field blocks a save).
    description TEXT NOT NULL DEFAULT '',

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------
-- SUPPLEMENT
-- "Suplementy i leki" (mockups §08): a list with a dose, a frequency, an hour
-- and start/end dates. Only `name` is required -- somebody who knows they take
-- magnesium and not the dose has to be able to write it down.
--
-- end_date NULL means 'bezterminowo', the artboard's own wording, rather than
-- an unanswered question. There is no third column for its "wg zaleceń
-- lekarza" variant: `frequency` is free text and that is where it goes.
--
-- reminder_enabled is stored although nothing sends a reminder -- this
-- deployment has no push and no mail. It is the patient's answer to a question
-- the screen asks, and the screen says out loud that nothing is sent yet.
-- ----------------------------
CREATE TABLE IF NOT EXISTS supplement (
    id_supplement UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Logical relation:
    -- supplement.id_medical -> user_db.patient.id_medical
    id_medical UUID NOT NULL,

    name TEXT NOT NULL,

    -- '2000 IU', '200 mg' -- free text, deliberately: a unit picker would be a
    -- dictionary to maintain for a line nothing computes from.
    dose TEXT,

    -- 'raz dziennie', 'wg zaleceń lekarza'.
    frequency TEXT,

    -- The hours are their own table (supplement_hour) -- a preparation can be
    -- taken more than once a day, and two rows here would read as two
    -- different preparations.

    start_date DATE,
    end_date DATE,

    reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------
-- SUPPLEMENT_HOUR
-- The hours one preparation is taken at. Zero rows is "no fixed hour".
--
-- A table rather than a JSONB column, unlike technique.schools/steps: the
-- argument there was that a step has no identity and nothing queries one, and
-- both are false here. A reminder scheduler asks "which preparations are due
-- at 06:45", which is a query by hour.
--
-- id_supplement is a real FOREIGN KEY for the same reason supplement_intake's
-- is: both tables live in medical_db, so Postgres can enforce it.
-- ----------------------------
CREATE TABLE IF NOT EXISTS supplement_hour (
    id_supplement_hour UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    id_supplement UUID NOT NULL
        REFERENCES supplement (id_supplement) ON DELETE CASCADE,

    hour TIME NOT NULL,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- The same hour twice is a double-submitted form, not a second dose.
    CONSTRAINT uq_supplement_hour UNIQUE (id_supplement, hour)
);

CREATE INDEX IF NOT EXISTS idx_supplement_hour_hour ON supplement_hour (hour);

-- ----------------------------
-- SUPPLEMENT_INTAKE
-- "Odhacz, kiedy weźmiesz": one tick, for one preparation, on one day.
--
-- A row rather than a boolean on `supplement`, for the same reason hydration
-- stores a row per serving: a column would be a running value two taps can
-- race, it could not be undone per day, and it could not answer "did I take it
-- on Tuesday" at all. The unique constraint makes a double-tapped checkbox one
-- row instead of two.
--
-- An absent row is NOT a record of a missed dose. Unticking deletes, and
-- nothing in this app stores that somebody did not take a medicine -- that
-- would be the column an adherence score gets built from.
--
-- id_supplement is a real FOREIGN KEY, unlike every id_medical in this
-- database: both tables live in medical_db, so Postgres can enforce it. The
-- pseudonymized, application-only join is the one that crosses databases.
-- ----------------------------
CREATE TABLE IF NOT EXISTS supplement_intake (
    id_intake UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    id_supplement UUID NOT NULL REFERENCES supplement (id_supplement) ON DELETE CASCADE,

    -- The calendar day it was taken on, in settings.TIME_ZONE. Only today is
    -- tickable; the API is what decides which day that is.
    entry_date DATE NOT NULL,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_supplement_intake_day UNIQUE (id_supplement, entry_date)
);

-- ----------------------------
-- RAPORT
-- ----------------------------
CREATE TABLE IF NOT EXISTS raport (
    id_raport BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,

    -- Logical relation:
    -- raport.id_medical -> user_db.patient.id_medical
    id_medical UUID NOT NULL,

    id_technique SMALLINT,
    most_frequent_emotion TEXT,
    avg_mood TEXT,
    stress_level INT,
    energy_level INT,
    number_of_bad_days INT,
    most_frequent_emotion_triggers TEXT,
    technique_efficiency INT,

    CONSTRAINT fk_raport_technique
        FOREIGN KEY (id_technique)
        REFERENCES technique (id_technique)
);

-- The CREATE TABLEs above are IF NOT EXISTS, so they are no-ops on a database
-- that predates the "Dodaj wpis" columns. Add them here as well so that
-- re-running this script upgrades such a database instead of silently skipping
-- them. Mirrors core/migrations/0005_diary_entry_fields.py, whichever of the
-- two runs first.
ALTER TABLE diary
    ADD COLUMN IF NOT EXISTS tension_level INT,
    ADD COLUMN IF NOT EXISTS emotion_note TEXT,
    ADD COLUMN IF NOT EXISTS thought TEXT,
    ADD COLUMN IF NOT EXISTS risky_behavior_note TEXT;

ALTER TABLE mood_scale
    ADD COLUMN IF NOT EXISTS shame_scale INT,
    ADD COLUMN IF NOT EXISTS calm_scale INT;

-- Same again for the "pora dnia" question, added later still.
-- Mirrors core/migrations/0009_diary_time_of_day.py.
ALTER TABLE diary
    ADD COLUMN IF NOT EXISTS time_of_day TEXT;

-- Dropped in core.0006: the "jakość samopoczucia" question that would have
-- filled it was cut from the entry form, and `current_mood` already records how
-- the patient says they feel -- so it was a duplicate with no source.
ALTER TABLE diary
    DROP COLUMN IF EXISTS overall_feeling;

-- Same again for the catalogue columns on `technique`, added later still.
-- Mirrors core/migrations/0013_technique_catalogue.py.
ALTER TABLE technique
    ADD COLUMN IF NOT EXISTS slug VARCHAR(64),
    ADD COLUMN IF NOT EXISTS subtitle TEXT,
    ADD COLUMN IF NOT EXISTS schools JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS dbt_group TEXT,
    ADD COLUMN IF NOT EXISTS dbt_module TEXT,
    ADD COLUMN IF NOT EXISTS availability TEXT NOT NULL DEFAULT 'ogolna',
    ADD COLUMN IF NOT EXISTS intro TEXT,
    ADD COLUMN IF NOT EXISTS steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS duration_min INT,
    ADD COLUMN IF NOT EXISTS description_ready BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS author_id_specjalist UUID,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Two rows claiming one slug would make which technique opens a matter of row
-- order, so the database refuses it rather than the serializer alone. NULLs do
-- not collide in Postgres, so the seeded rows are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS technique_slug_key
    ON technique (slug);

-- Helpful FK indexes
CREATE INDEX IF NOT EXISTS idx_mood_scale_id_diary
    ON mood_scale (id_diary);

CREATE INDEX IF NOT EXISTS idx_raport_id_technique
    ON raport (id_technique);

CREATE INDEX IF NOT EXISTS idx_technique_author_id_specjalist
    ON technique (author_id_specjalist);

-- Every hydration query is "this patient, these seven days".
CREATE INDEX IF NOT EXISTS idx_hydration_patient_day
    ON hydration (id_medical, entry_date);

-- The food diary is read a day at a time and grouped by day, always for one
-- patient.
CREATE INDEX IF NOT EXISTS idx_diet_meal_patient_day
    ON diet_meal (id_medical, entry_date);

-- The supplement list is always read whole, for one patient.
CREATE INDEX IF NOT EXISTS idx_supplement_patient
    ON supplement (id_medical);
