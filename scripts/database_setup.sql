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
