"""`supplement_hour` — a preparation taken more than once a day.

WHAT THIS CLOSES. `supplement.hour` was a single nullable TIME, so a probiotic
taken at 06:45 and again at 12:00 could only be written as two separate
preparations with the same name — two rows on the list, two checkboxes, and a
medicine list that reads as though somebody takes two different probiotics.
§08 draws one row per preparation, and one row is what it has to stay.

WHY A TABLE AND NOT A JSONB COLUMN, given that `technique.schools`/`steps`
(0013) went the other way. The argument there was that a step "has no identity,
nothing queries one, and the list is written and read as a unit by the form
that edits it". The first two are false here. `supplement.reminder_enabled`
exists precisely so that the day a scheduler arrives it reads a value rather
than asking everybody again — and the question that scheduler asks is "which
preparations are due at 06:45", i.e. a query *by hour*. An hour is therefore
the thing being looked up, not an opaque part of a row, which is exactly the
distinction 0013 drew.

`id_supplement` IS A REAL FOREIGN KEY, like `supplement_intake`'s and for the
same reason: both tables are in medical_db, so Postgres can enforce it, and
CASCADE is right because an hour belongs to the preparation it is an hour of.
The pseudonymized, application-only join is the one that crosses databases.

UNIQUE (id_supplement, hour) — the same hour twice on one preparation is not a
second dose, it is a double-submitted form. Which makes a repeated hour
idempotent rather than an error, the same choice `uq_supplement_intake_day`
makes for a double-tapped checkbox.

THE OLD COLUMN IS BACKFILLED AND THEN DROPPED, which makes this the second
destructive migration in the project after `0006_drop_overall_feeling`. Leaving
`supplement.hour` in place next to the new table would be two sources of truth
for one fact, and the reverse is written so nothing is lost by accident: it
recreates the column and puts the *earliest* hour back, which is the one a
single-hour column could hold. A preparation with three hours reversed and
re-applied keeps one of them — stated here rather than discovered, and the
reason the backfill runs before the DROP rather than after it.

medical_db, so each `RunSQL` carries `hints={'target_db': 'medical'}` —
`allow_migrate` receives `model_name=None` for RunSQL, and unhinted it would
also run against user_db, where this table does not belong.

`IF NOT EXISTS` / `IF EXISTS` throughout, matching every migration since 0004:
`scripts/database_setup.sql` declares the same shape and the documented setup
order runs that script first.
"""

from django.db import migrations, models
import django.db.models.deletion

import uuid

FORWARD = """
-- ----------------------------
-- SUPPLEMENT_HOUR
-- The hours one preparation is taken at. Zero rows is "no fixed hour", which
-- is what a NULL in the old column meant.
--
-- A table rather than a JSONB column because a reminder scheduler asks "which
-- preparations are due at 06:45" -- the hour is queried, unlike a technique's
-- step. See the migration docstring.
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

CREATE INDEX IF NOT EXISTS idx_supplement_hour_hour
    ON supplement_hour (hour);

-- Carry every hour already recorded across before the column goes. A NULL
-- there meant "no fixed hour", which is now zero rows -- so the WHERE is the
-- whole of the translation.
INSERT INTO supplement_hour (id_supplement, hour)
SELECT id_supplement, hour FROM supplement WHERE hour IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE supplement DROP COLUMN IF EXISTS hour;
"""

BACKWARD = """
ALTER TABLE supplement ADD COLUMN IF NOT EXISTS hour TIME;

-- The earliest hour, which is the one a single-hour column could hold. A
-- preparation taken three times a day comes back holding one of them.
UPDATE supplement SET hour = earliest.hour
FROM (
    SELECT id_supplement, MIN(hour) AS hour
    FROM supplement_hour GROUP BY id_supplement
) AS earliest
WHERE supplement.id_supplement = earliest.id_supplement;

DROP TABLE IF EXISTS supplement_hour;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0016_diet_meals_supplements'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name='SupplementHour',
                    fields=[
                        ('id_supplement_hour', models.UUIDField(
                            default=uuid.uuid4, editable=False,
                            primary_key=True, serialize=False,
                        )),
                        ('hour', models.TimeField()),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('supplement', models.ForeignKey(
                            db_column='id_supplement',
                            on_delete=django.db.models.deletion.CASCADE,
                            related_name='hours', to='core.supplement',
                        )),
                    ],
                    options={'db_table': 'supplement_hour'},
                ),
                migrations.AddIndex(
                    model_name='supplementhour',
                    index=models.Index(
                        fields=['hour'], name='idx_supplement_hour_hour',
                    ),
                ),
                migrations.AddConstraint(
                    model_name='supplementhour',
                    constraint=models.UniqueConstraint(
                        fields=('supplement', 'hour'),
                        name='uq_supplement_hour',
                    ),
                ),
                migrations.RemoveField(
                    model_name='supplement',
                    name='hour',
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    FORWARD, BACKWARD, hints={'target_db': 'medical'},
                ),
            ],
        ),
    ]
