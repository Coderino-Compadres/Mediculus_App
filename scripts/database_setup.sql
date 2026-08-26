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
    is_child BOOLEAN,

    CONSTRAINT fk_patient_user
        FOREIGN KEY (id_user)
        REFERENCES "user" (id_user),

    CONSTRAINT fk_patient_specjalist
        FOREIGN KEY (id_specjalist)
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

-- The CREATE TABLE above is IF NOT EXISTS, so it is a no-op on a database that
-- predates the consent columns. Add them here as well so that re-running this
-- script upgrades such a database instead of silently skipping them. Mirrors
-- core/migrations/0004_user_consents.py, whichever of the two runs first.
ALTER TABLE "user"
    ADD COLUMN IF NOT EXISTS data_consent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS services_consent_at TIMESTAMPTZ;

-- Same reasoning for the guardian invitation's answer: NULL means the child has
-- named this guardian and the guardian has not decided yet. Mirrors
-- core/migrations/0007_parent_child_accepted_at.py.
ALTER TABLE parent_child
    ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

-- Helpful FK indexes
CREATE INDEX IF NOT EXISTS idx_user_id_user_role
    ON "user" (id_user_role);

CREATE INDEX IF NOT EXISTS idx_patient_id_specjalist
    ON patient (id_specjalist);

CREATE INDEX IF NOT EXISTS idx_parent_child_id_parent
    ON parent_child (id_parent);

CREATE INDEX IF NOT EXISTS idx_parent_child_id_child
    ON parent_child (id_child);


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
    description TEXT
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

-- Dropped in core.0006: the "jakość samopoczucia" question that would have
-- filled it was cut from the entry form, and `current_mood` already records how
-- the patient says they feel -- so it was a duplicate with no source.
ALTER TABLE diary
    DROP COLUMN IF EXISTS overall_feeling;

-- Helpful FK indexes
CREATE INDEX IF NOT EXISTS idx_mood_scale_id_diary
    ON mood_scale (id_diary);

CREATE INDEX IF NOT EXISTS idx_raport_id_technique
    ON raport (id_technique);
