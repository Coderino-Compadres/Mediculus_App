"""`diet_meal`, `supplement`, `supplement_intake` — the rest of the diet module.

WHAT THIS CLOSES. Until now the diet module had exactly one table (`hydration`,
0015) and two screens reading an empty shape out of `api/diet.ts`: nothing could
record a meal, so "no meals, no streak" was the true answer rather than a
placeholder. These three tables are the food diary and §08's second half, so the
home screen, the history and the new "Suplementy i leki" screen all read rows
instead of zeros.

WHY THREE TABLES AND NOT FOUR. There is no `diet_day`: a day has nothing of its
own to store that is not derivable from its meals, and a row for one would only
be a second answer to "how many meals did Tuesday hold". `supplement_intake` is
separate from `supplement` for the opposite reason — a tick is a fact about a
day, and a boolean on the preparation could neither be undone per day nor answer
"did I take it on Tuesday".

WHY `supplement_intake.id_supplement` IS A REAL FOREIGN KEY, unlike every
`id_medical` in medical_db: both tables are in the *same* database, so Postgres
can enforce it. The pseudonymized, application-only join is the one that crosses
databases (`patient.id_medical` in user_db), and nothing here crosses.

All three live in medical_db, so each `RunSQL` carries
`hints={'target_db': 'medical'}` — `allow_migrate` receives `model_name=None`
for RunSQL, and unhinted it would also run against user_db, where none of these
tables belongs.

`CREATE TABLE IF NOT EXISTS` inside a SeparateDatabaseAndState, matching
0004/0005/0007/0010/0011/0012/0013/0015: `scripts/database_setup.sql` declares
the same tables and the documented setup order runs that script before
`migrate`.
"""

from django.db import migrations, models
import django.db.models.deletion

import uuid

FORWARD = """
-- ----------------------------
-- DIET_MEAL
-- One meal in the food diary (mockups §04-§07). A day is the group of them --
-- there is deliberately no diet_day table.
--
-- §04 states the module's scope outright: no product search and no numeric
-- field, a photo and a description being the only two sources of a meal's
-- content. So there is no weight, no portion and no calorie column here, and
-- their absence is a decision rather than a gap. The photo itself is not here
-- yet: it would be the first file this deployment ever stored, and storage,
-- retention and the consent covering it are all unanswered.
-- ----------------------------
CREATE TABLE IF NOT EXISTS diet_meal (
    id_meal UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Logical relation:
    -- diet_meal.id_medical -> user_db.patient.id_medical
    -- Not a foreign key, for the same reason diary.id_medical is not one.
    id_medical UUID NOT NULL,

    -- The calendar day this meal belongs to, in settings.TIME_ZONE
    -- (Europe/Warsaw) -- not the UTC date of created_at. core/days.py is where
    -- that boundary is decided.
    entry_date DATE NOT NULL,

    -- One of core.meals.MEAL_KINDS, the Polish name as written, or NULL for a
    -- meal saved without saying which one it was. Unconstrained on purpose,
    -- with the same caveat as diary.time_of_day: there is no CHECK here and
    -- Django's `choices` is not one either, so the only thing refusing an
    -- unknown value is the API serializer.
    kind TEXT,

    -- The hour the mockups label a meal with ("Przekąska · 16:20"). NULL is an
    -- hour not given, not a midnight.
    eaten_at TIME,

    -- What the patient typed. '' rather than NULL for a meal saved without a
    -- description: the field was on screen and left empty, so there is no third
    -- state to tell apart. §05's rule is that no field blocks a save.
    description TEXT NOT NULL DEFAULT '',

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_diet_meal_patient_day
    ON diet_meal (id_medical, entry_date);

-- ----------------------------
-- SUPPLEMENT
-- "Suplementy i leki" (mockups §08): a list with a dose, a frequency, an hour
-- and start/end dates. Only `name` is required -- somebody who knows they take
-- magnesium and not the dose has to be able to write it down.
--
-- end_date NULL means 'bezterminowo', the artboard's own wording, rather than an
-- unanswered question.
--
-- reminder_enabled is stored although nothing sends a reminder: this deployment
-- has no push and no mail. It is the patient's answer to a question the screen
-- asks, and the screen says out loud that nothing is sent yet.
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

    -- The hour it is meant to be taken at, which is what a reminder would fire
    -- on. NULL for a preparation with no fixed hour.
    hour TIME,

    start_date DATE,
    end_date DATE,

    reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_supplement_patient
    ON supplement (id_medical);

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
-- A real FOREIGN KEY, unlike every id_medical in this database: both tables are
-- in medical_db, so Postgres can enforce it. CASCADE because a tick belongs to
-- the preparation it ticks off.
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
"""

BACKWARD = """
DROP TABLE IF EXISTS supplement_intake;
DROP TABLE IF EXISTS supplement;
DROP TABLE IF EXISTS diet_meal;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0015_hydration'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name='DietMeal',
                    fields=[
                        ('id_meal', models.UUIDField(
                            default=uuid.uuid4, editable=False,
                            primary_key=True, serialize=False,
                        )),
                        ('id_medical', models.UUIDField(db_index=True)),
                        ('entry_date', models.DateField()),
                        ('kind', models.TextField(blank=True, null=True)),
                        ('eaten_at', models.TimeField(blank=True, null=True)),
                        ('description', models.TextField(blank=True, default='')),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('updated_at', models.DateTimeField(auto_now=True)),
                    ],
                    options={'db_table': 'diet_meal'},
                ),
                migrations.CreateModel(
                    name='Supplement',
                    fields=[
                        ('id_supplement', models.UUIDField(
                            default=uuid.uuid4, editable=False,
                            primary_key=True, serialize=False,
                        )),
                        ('id_medical', models.UUIDField(db_index=True)),
                        ('name', models.TextField()),
                        ('dose', models.TextField(blank=True, null=True)),
                        ('frequency', models.TextField(blank=True, null=True)),
                        ('hour', models.TimeField(blank=True, null=True)),
                        ('start_date', models.DateField(blank=True, null=True)),
                        ('end_date', models.DateField(blank=True, null=True)),
                        ('reminder_enabled', models.BooleanField(default=True)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('updated_at', models.DateTimeField(auto_now=True)),
                    ],
                    options={'db_table': 'supplement'},
                ),
                migrations.CreateModel(
                    name='SupplementIntake',
                    fields=[
                        ('id_intake', models.UUIDField(
                            default=uuid.uuid4, editable=False,
                            primary_key=True, serialize=False,
                        )),
                        ('entry_date', models.DateField()),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('supplement', models.ForeignKey(
                            db_column='id_supplement',
                            on_delete=django.db.models.deletion.CASCADE,
                            related_name='intakes', to='core.supplement',
                        )),
                    ],
                    options={'db_table': 'supplement_intake'},
                ),
                migrations.AddIndex(
                    model_name='dietmeal',
                    index=models.Index(
                        fields=['id_medical', 'entry_date'],
                        name='idx_diet_meal_patient_day',
                    ),
                ),
                migrations.AddIndex(
                    model_name='supplement',
                    index=models.Index(
                        fields=['id_medical'], name='idx_supplement_patient',
                    ),
                ),
                migrations.AddConstraint(
                    model_name='supplementintake',
                    constraint=models.UniqueConstraint(
                        fields=('supplement', 'entry_date'),
                        name='uq_supplement_intake_day',
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
