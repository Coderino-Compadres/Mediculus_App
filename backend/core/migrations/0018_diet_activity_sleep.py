"""`diet_activity`, `diet_activity_day`, `diet_sleep` — §09, the last diary.

WHAT THIS CLOSES. "Aktywność i sen" was **the one screen in the diet module with
no backend of any kind**: both panels held their entries in component state, a
reload lost them, and three separate pieces of wording existed on the screen to
admit it (`NOT_STORED_NOTE`, the sleep panel's "na razie tylko na tej karcie",
and the `stored` flag on `dayLockNotice`). Those three go in the commit that
wires these tables, and not before — that ordering is stated in CLAUDE.md and
pinned by `utils/dayLock.test.ts` and `DietActivitySleep.test.tsx`.

It also unblocks the weekly report (§10): a report's day carries all four
diaries, and two of the four did not exist. See `core/diet_reports.py`.

WHY THREE TABLES AND NOT TWO. `diet_activity_day` exists for exactly one
column — the day's step count — and that is the distinction `0016` drew when it
refused a `diet_day` table for meals: "a day has nothing of its own to store
that is not derivable from its meals". A step count is precisely that. It is one
number copied off a phone once, attached to no walk in particular, and
derivable from nothing, so the day is the only thing it can hang on.

A ROW IN `diet_activity_day` MEANS A COUNT WAS TYPED, so `steps` is NOT NULL and
clearing the field deletes the row — the shape `supplement_intake` gives a tick.
That is what keeps "nobody typed a step count" and "this person took no steps"
apart, which is the module's own rule about an unanswered question, and which a
nullable `steps` would have lost: a row would then mean nothing at all.

`diet_sleep.entry_date` IS THE MORNING THE NIGHT ENDED ON. Filled in on Friday,
a row describes the night from Thursday to Friday. Nothing in the data says so —
23:40 and 06:50 read equally well as either day — and the two answers put one
night in two different weekly reports, which is why the convention is written
here, on the model, and on the frontend's own type. It is also why
`UNIQUE (id_medical, entry_date)` is the right constraint: one night per
morning, so a second save is an edit rather than a second night.

NO FOREIGN KEYS AT ALL in these three, unlike `supplement_intake`'s: every
reference here crosses into user_db (`patient.id_medical`), which is the
pseudonymized, application-only join Postgres cannot enforce. `supplement_hour`
and `supplement_intake` are the exception precisely because both of their ends
sit in medical_db.

All three live in medical_db, so each `RunSQL` carries
`hints={'target_db': 'medical'}` — `allow_migrate` receives `model_name=None`
for RunSQL, and unhinted it would also run against user_db, where none of these
belongs.

`CREATE TABLE IF NOT EXISTS` inside a `SeparateDatabaseAndState`, matching every
migration since 0004: `scripts/database_setup.sql` declares the same tables and
the documented setup order runs that script before `migrate`.
"""

from django.db import migrations, models

import uuid

FORWARD = """
-- ----------------------------
-- DIET_ACTIVITY
-- One activity somebody wrote down (mockups §09). A day is the group of them,
-- the same shape diet_meal has -- except for the step count, which is a fact
-- about the day and lives in diet_activity_day below.
--
-- §09 asks three questions and this module answers no others: what it was, how
-- long it lasted, how the person felt afterwards. There is deliberately no
-- calorie column, no intensity, no pace and no heart rate -- the module records
-- what somebody chose to note, not what a device measured, and syncing with a
-- wearable is outside the project's scope.
--
-- Nothing but the hour is NOT NULL (§05, "żadne pole nie blokuje zapisu"), and
-- the hour is not typed: it is stamped from the server's clock when the entry
-- is written, which is why it is the one column that cannot be absent.
-- ----------------------------
CREATE TABLE IF NOT EXISTS diet_activity (
    id_activity UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Logical relation:
    -- diet_activity.id_medical -> user_db.patient.id_medical
    -- Not a foreign key, for the same reason diary.id_medical is not one.
    id_medical UUID NOT NULL,

    -- The calendar day this activity belongs to, in settings.TIME_ZONE.
    entry_date DATE NOT NULL,

    -- 'HH:MM', stamped from the clock rather than typed -- what the row is
    -- headed with in the list.
    logged_at TIME NOT NULL,

    -- One of core.activity.ACTIVITY_KINDS, or 'Inne' with the free text in
    -- kind_other. NULL is an activity saved without saying what it was.
    kind TEXT,
    kind_other TEXT,

    -- Minutes. NULL is the question left unanswered, which is not a zero.
    duration_minutes INTEGER,

    -- One of core.activity.FEELING_AFTER: how the person felt *after*, not how
    -- hard it was.
    feeling_after TEXT,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_diet_activity_day
    ON diet_activity (id_medical, entry_date);

-- ----------------------------
-- DIET_ACTIVITY_DAY
-- The step count for one day -- the one thing a day holds that an entry cannot.
--
-- This is the table 0016 refused to create for meals, and the reason it is
-- right here is the reason it was wrong there: a day of meals has nothing of
-- its own to store, while a step count is one number belonging to the day and
-- to no activity in it.
--
-- A ROW MEANS THE COUNT WAS TYPED. steps is NOT NULL and clearing the field
-- deletes the row, so "nobody typed one" is an absent row and "no steps taken"
-- is a row holding 0 -- two different claims, which a nullable column could not
-- have told apart.
-- ----------------------------
CREATE TABLE IF NOT EXISTS diet_activity_day (
    id_activity_day UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Logical relation:
    -- diet_activity_day.id_medical -> user_db.patient.id_medical
    id_medical UUID NOT NULL,

    entry_date DATE NOT NULL,

    steps INTEGER NOT NULL,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- One count per day, rather than a history of edits to one.
    CONSTRAINT uq_diet_activity_day UNIQUE (id_medical, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_diet_activity_day_patient
    ON diet_activity_day (id_medical);

-- ----------------------------
-- DIET_SLEEP
-- One night of the sleep diary (mockups §09).
--
-- entry_date IS THE MORNING THE NIGHT ENDED ON: a row filled in on Friday
-- describes the night from Thursday to Friday. Nothing in the data itself says
-- so, and the two readings put one night in two different weekly reports, so
-- the convention is recorded here and on the model.
--
-- The LENGTH of the night is deliberately not a column: it is the distance
-- between the two hours, wrapping midnight, and one place computes it
-- (frontend/src/utils/sleep.ts). A stored length would be a second answer free
-- to disagree with the hours beside it.
--
-- awakenings is the one field in this module that cannot say "not answered":
-- the stepper starts at 0 and has no empty state. The screens handle that by
-- not printing the row at zero rather than by claiming either reading.
-- ----------------------------
CREATE TABLE IF NOT EXISTS diet_sleep (
    id_sleep UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Logical relation:
    -- diet_sleep.id_medical -> user_db.patient.id_medical
    id_medical UUID NOT NULL,

    -- The morning the night ended on -- see above.
    entry_date DATE NOT NULL,

    -- 'HH:MM' in the patient's own clock. woke_up_at earlier than
    -- fell_asleep_at is the ordinary case, not an error: the night crosses
    -- midnight.
    fell_asleep_at TIME,
    woke_up_at TIME,

    -- 1-5, or NULL when the question went unanswered.
    quality SMALLINT,

    awakenings INTEGER NOT NULL DEFAULT 0,

    -- One of core.sleep.WAKE_FEELINGS.
    wake_feeling TEXT,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- One night per morning: a second save is an edit, not a second night.
    CONSTRAINT uq_diet_sleep_night UNIQUE (id_medical, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_diet_sleep_patient
    ON diet_sleep (id_medical);
"""

BACKWARD = """
DROP TABLE IF EXISTS diet_sleep;
DROP TABLE IF EXISTS diet_activity_day;
DROP TABLE IF EXISTS diet_activity;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0017_supplement_hours'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name='DietActivity',
                    fields=[
                        ('id_activity', models.UUIDField(
                            default=uuid.uuid4, editable=False,
                            primary_key=True, serialize=False,
                        )),
                        ('id_medical', models.UUIDField(db_index=True)),
                        ('entry_date', models.DateField()),
                        ('logged_at', models.TimeField()),
                        ('kind', models.TextField(blank=True, null=True)),
                        ('kind_other', models.TextField(blank=True, null=True)),
                        ('duration_minutes', models.IntegerField(blank=True, null=True)),
                        ('feeling_after', models.TextField(blank=True, null=True)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('updated_at', models.DateTimeField(auto_now=True)),
                    ],
                    options={'db_table': 'diet_activity'},
                ),
                migrations.CreateModel(
                    name='DietActivityDay',
                    fields=[
                        ('id_activity_day', models.UUIDField(
                            default=uuid.uuid4, editable=False,
                            primary_key=True, serialize=False,
                        )),
                        ('id_medical', models.UUIDField(db_index=True)),
                        ('entry_date', models.DateField()),
                        ('steps', models.IntegerField()),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('updated_at', models.DateTimeField(auto_now=True)),
                    ],
                    options={'db_table': 'diet_activity_day'},
                ),
                migrations.CreateModel(
                    name='DietSleep',
                    fields=[
                        ('id_sleep', models.UUIDField(
                            default=uuid.uuid4, editable=False,
                            primary_key=True, serialize=False,
                        )),
                        ('id_medical', models.UUIDField(db_index=True)),
                        ('entry_date', models.DateField()),
                        ('fell_asleep_at', models.TimeField(blank=True, null=True)),
                        ('woke_up_at', models.TimeField(blank=True, null=True)),
                        ('quality', models.SmallIntegerField(blank=True, null=True)),
                        ('awakenings', models.IntegerField(default=0)),
                        ('wake_feeling', models.TextField(blank=True, null=True)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('updated_at', models.DateTimeField(auto_now=True)),
                    ],
                    options={'db_table': 'diet_sleep'},
                ),
                migrations.AddIndex(
                    model_name='dietactivity',
                    index=models.Index(
                        fields=['id_medical', 'entry_date'],
                        name='idx_diet_activity_day',
                    ),
                ),
                migrations.AddConstraint(
                    model_name='dietactivityday',
                    constraint=models.UniqueConstraint(
                        fields=('id_medical', 'entry_date'),
                        name='uq_diet_activity_day',
                    ),
                ),
                migrations.AddConstraint(
                    model_name='dietsleep',
                    constraint=models.UniqueConstraint(
                        fields=('id_medical', 'entry_date'),
                        name='uq_diet_sleep_night',
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
