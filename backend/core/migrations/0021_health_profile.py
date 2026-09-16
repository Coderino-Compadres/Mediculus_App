"""`health_profile` and `health_condition` — §13's "Profil zdrowotny".

WHAT THIS UNBLOCKS. The screen has existed since the diet profile branch and
saves nothing: `frontend/src/api/healthProfile.ts` is two stubs that perform no
request, because — in its own words — "there is no table, no column, no model,
no migration and no serializer for any field on this screen". This is that
table, and the stubs become real requests in the same change.

**IT LANDS IN medical_db, AGAINST THAT FILE'S OWN TODO**, which asks for
user_db on the grounds that a body and a diagnosis are PII about a named
person. Half of that is right and the conclusion does not follow. The argument
it gives — "putting a weight next to a pseudonymous key would put identity into
the database whose whole point is not having any" — has it backwards: a weight
identifies nobody, and `id_medical` is exactly as pseudonymous with a height
beside it as it is with a night's sleep beside it. The risk runs the other way.
'eating-disorder', 'depression' and 'adhd' stored next to the surname and the
e-mail address in user_db is the pairing the two-database split exists to
prevent, and CLAUDE.md's rule decides it in one line: clinical data goes in
medical_db. Seventeen diagnoses are clinical data of the plainest kind. The
gate the TODO asks for is honoured exactly as written — `_require_patient` on
both verbs, so a guardian and a specialist are refused rather than handed
somebody's allergies.

A ROW PER CONDITION, which is the third item on that TODO and the reason to
follow it: the vocabulary stays a closed set, and
`core/tests/test_health_profile.py` compares it against
`frontend/src/utils/healthProfile.ts` in both directions — the cross-language
rule CLAUDE.md states for `emotions.ts`/`emotions.py`. A text column would make
that comparison impossible and "ilu pacjentów ma Hashimoto" a LIKE query.

NO `entry_date`, NO SECOND ROW WHEN A NUMBER CHANGES. One profile per patient,
enforced by `UNIQUE (id_medical)` rather than by convention. §13 rules out the
weight chart by name and says why; a dated row here would be the first half of
it, waiting in the schema.

`CREATE TABLE IF NOT EXISTS` inside a `SeparateDatabaseAndState`, matching every
migration since 0004: `scripts/database_setup.sql` declares the same two tables
and the documented setup order runs that script before `migrate`. The `RunSQL`
carries `hints={'target_db': 'medical'}` because `allow_migrate` receives
`model_name=None` for RunSQL, and unhinted it would also run against user_db.
"""

from django.db import migrations, models

import django.db.models.deletion
import uuid

FORWARD = """
-- ----------------------------
-- HEALTH_PROFILE
-- §13's "Profil zdrowotny": one row per patient, and never a second.
--
-- ONE ROW, NO HISTORY. There is no entry_date and nothing unique on a day: a
-- weight series is what a chart is made of, and §13 rules the chart out by name
-- ("te dwie liczby są danymi dla specjalisty, nie celem pokazywanym
-- codziennie"). updated_at says when the row last changed; nothing says what it
-- said before.
--
-- NO BMI COLUMN, derived or stored. weight_kg and target_weight_kg are two
-- independent numbers that happen to sit next to each other.
--
-- EVERY COLUMN NULLABLE -- §05's rule for the whole diet module: no field
-- blocks a save.
--
-- NUMERIC(4,1) rather than a float: a figure somebody typed about their own
-- body has to read back exactly as typed, and the precision doubles as the
-- bound (999.9), which is the same limit the frontend's own field applies.
-- ----------------------------
CREATE TABLE IF NOT EXISTS health_profile (
    id_health_profile UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- health_profile.id_medical -> user_db.patient.id_medical
    -- Logical only, like every id_medical here: the tables are in different
    -- databases and Postgres cannot enforce it.
    -- UNIQUE, so the one-row rule belongs to the schema rather than to the API.
    id_medical UUID UNIQUE NOT NULL,

    height_cm NUMERIC(4,1),
    weight_kg NUMERIC(4,1),
    target_weight_kg NUMERIC(4,1),

    -- One of core.health_profile.ACTIVITY_LEVELS, or NULL for unanswered.
    -- Unconstrained in the database, with the same caveat as diet_meal.kind:
    -- the only thing refusing an unknown value is the API serializer.
    activity_level TEXT,

    -- Free text on §13's own instruction ("Pola opisowe, nie słownikowe"): a
    -- closed list leaves somebody allergic to something outside it nowhere to
    -- write it down.
    allergies TEXT,
    intolerances TEXT,
    dietary_preferences TEXT,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------
-- HEALTH_CONDITION
-- One jednostka chorobowa on a profile: a key from §13's seventeen, or a
-- diagnosis somebody typed in themselves.
--
-- TWO COLUMNS, EXACTLY ONE FILLED (ck_health_condition). A single column
-- holding both would make a hand-typed 'hashimoto' indistinguishable from the
-- chip, and a renamed key indistinguishable from a diagnosis the list lacks.
--
-- The psychiatric diagnoses share this table with the somatic ones, with no
-- column, flag or second table between them -- §13: "Rozpoznania psychiatryczne
-- stoją w tej samej liście, co somatyczne — bez osobnej sekcji."
--
-- A real foreign key with ON DELETE CASCADE, unlike every id_medical here:
-- both ends live in medical_db, so Postgres can enforce it -- the same
-- exception diet_meal_emotion, supplement_hour and supplement_intake are.
-- ----------------------------
CREATE TABLE IF NOT EXISTS health_condition (
    id_health_condition UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    id_health_profile UUID NOT NULL
        REFERENCES health_profile (id_health_profile) ON DELETE CASCADE,

    -- One of core.health_profile.CONDITIONS, or NULL on a hand-written row.
    condition TEXT,
    -- Somebody's own words, or NULL on a picked chip.
    own_label TEXT,

    -- Index within its own list, so hand-typed entries come back in the order
    -- they were written. The picked chips carry one and ignore it: the API
    -- sorts those by the vocabulary.
    position SMALLINT NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Exactly one of the two is filled. A row with neither says nothing; a row
    -- with both says two things about one diagnosis.
    CONSTRAINT ck_health_condition CHECK (num_nonnulls(condition, own_label) = 1),

    -- The same condition twice on one profile is a double-submitted form, not a
    -- second diagnosis. NULLs are distinct in Postgres, so this constrains the
    -- picked chips and leaves the hand-written rows alone -- which is right:
    -- somebody may well write two things the list does not have.
    -- Its btree also serves the only query this table has -- every condition of
    -- one profile -- so there is no separate index on id_health_profile, the
    -- same as supplement_hour and diet_meal_emotion.
    CONSTRAINT uq_health_condition UNIQUE (id_health_profile, condition)
);
"""

BACKWARD = """
DROP TABLE IF EXISTS health_condition;
DROP TABLE IF EXISTS health_profile;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0020_diet_meal_emotion'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name='HealthProfile',
                    fields=[
                        ('id_health_profile', models.UUIDField(
                            default=uuid.uuid4, editable=False,
                            primary_key=True, serialize=False,
                        )),
                        ('id_medical', models.UUIDField(unique=True)),
                        ('height_cm', models.DecimalField(
                            blank=True, decimal_places=1, max_digits=4, null=True,
                        )),
                        ('weight_kg', models.DecimalField(
                            blank=True, decimal_places=1, max_digits=4, null=True,
                        )),
                        ('target_weight_kg', models.DecimalField(
                            blank=True, decimal_places=1, max_digits=4, null=True,
                        )),
                        ('activity_level', models.TextField(blank=True, null=True)),
                        ('allergies', models.TextField(blank=True, null=True)),
                        ('intolerances', models.TextField(blank=True, null=True)),
                        ('dietary_preferences', models.TextField(blank=True, null=True)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('updated_at', models.DateTimeField(auto_now=True)),
                    ],
                    options={'db_table': 'health_profile'},
                ),
                migrations.CreateModel(
                    name='HealthCondition',
                    fields=[
                        ('id_health_condition', models.UUIDField(
                            default=uuid.uuid4, editable=False,
                            primary_key=True, serialize=False,
                        )),
                        ('condition', models.TextField(blank=True, null=True)),
                        ('own_label', models.TextField(blank=True, null=True)),
                        ('position', models.SmallIntegerField(default=0)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('profile', models.ForeignKey(
                            db_column='id_health_profile',
                            on_delete=django.db.models.deletion.CASCADE,
                            related_name='conditions', to='core.healthprofile',
                        )),
                    ],
                    options={
                        'db_table': 'health_condition',
                        'ordering': ['position', 'created_at'],
                    },
                ),
                migrations.AddConstraint(
                    model_name='healthcondition',
                    constraint=models.CheckConstraint(
                        condition=(
                            models.Q(condition__isnull=False, own_label__isnull=True)
                            | models.Q(condition__isnull=True, own_label__isnull=False)
                        ),
                        name='ck_health_condition',
                    ),
                ),
                migrations.AddConstraint(
                    model_name='healthcondition',
                    constraint=models.UniqueConstraint(
                        fields=('profile', 'condition'),
                        name='uq_health_condition',
                    ),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    FORWARD, BACKWARD, hints={'target_db': 'medical'},
                ),
            ],
        ),
    ]
