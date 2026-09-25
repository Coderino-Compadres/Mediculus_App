"""`supplement_intake.hour` — each dose ticked off on its own.

WHAT THIS CLOSES. A tick was a fact about a *day* (`uq_supplement_intake_day`),
so a probiotic taken at 06:45 and 12:00 had one checkbox for both: ticking it
after breakfast said the midday dose was taken too. The hour badges on the
list are now the checkboxes, one per hour, and a tick names the hour it is for.

A PREPARATION WITH NO FIXED HOUR still has one dose a day, and its tick is the
row with a NULL `hour`. The constraint is `NULLS NOT DISTINCT` (Postgres 15+)
so a double-tapped NULL is one row as well — a plain UNIQUE would treat every
NULL as different and let the taps pile up.

NOT A FOREIGN KEY to `supplement_hour`: `replace_hours` deletes and rewrites a
preparation's hours on every edit, and today's ticks must not vanish with them.
A tick for an hour that is no longer on the row is simply not shown.

EXISTING TICKS keep a NULL hour. On a preparation that has hours that row
matches none of them, so today's tick on a twice-daily probiotic is lost once —
a day's worth of one checkbox, stated here rather than guessed at by a backfill
that would have to invent which dose it was.

medical_db, so the `RunSQL` carries `hints={'target_db': 'medical'}` (see 0017).
`IF NOT EXISTS` / `IF EXISTS`, because `scripts/database_setup.sql` declares the
same shape and the documented setup order runs that script first.
"""

from django.db import migrations, models

FORWARD = """
ALTER TABLE supplement_intake ADD COLUMN IF NOT EXISTS hour TIME;

ALTER TABLE supplement_intake
    DROP CONSTRAINT IF EXISTS uq_supplement_intake_day;

DO $$
BEGIN
    ALTER TABLE supplement_intake
        ADD CONSTRAINT uq_supplement_intake_dose
        UNIQUE NULLS NOT DISTINCT (id_supplement, entry_date, hour);
EXCEPTION
    WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
"""

BACKWARD = """
ALTER TABLE supplement_intake
    DROP CONSTRAINT IF EXISTS uq_supplement_intake_dose;

-- One tick per day again: keep the earliest of a day's ticks.
DELETE FROM supplement_intake a
USING supplement_intake b
WHERE a.id_supplement = b.id_supplement
  AND a.entry_date = b.entry_date
  AND (a.created_at, a.id_intake) > (b.created_at, b.id_intake);

ALTER TABLE supplement_intake DROP COLUMN IF EXISTS hour;

ALTER TABLE supplement_intake
    ADD CONSTRAINT uq_supplement_intake_day UNIQUE (id_supplement, entry_date);
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0023_specjalist_module'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RemoveConstraint(
                    model_name='supplementintake',
                    name='uq_supplement_intake_day',
                ),
                migrations.AddField(
                    model_name='supplementintake',
                    name='hour',
                    field=models.TimeField(blank=True, null=True),
                ),
                migrations.AddConstraint(
                    model_name='supplementintake',
                    constraint=models.UniqueConstraint(
                        fields=('supplement', 'entry_date', 'hour'),
                        name='uq_supplement_intake_dose',
                        nulls_distinct=False,
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
