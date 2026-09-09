"""`hydration` — what the diet module's §08 screen writes.

The first table this project has added for the diet module. Until now that
module was a mockup plus two screens reading `api/diet.ts`, which returns an
empty day on purpose: nothing could be written, so zero was the true answer
rather than a placeholder. This closes that for one of its counters.

WHY A ROW PER SERVING and not a `glasses` column on some daily row: a counter
column makes "+1 szklanka" a read-modify-write over a shared number, so two taps
in the same second lose one of each other, and it leaves nothing to undo — a
mis-tap on a phone would be uncorrectable because there would be no individual
act to withdraw. Rows also turn "Ostatnie 7 dni" into a GROUP BY instead of a
second table. See the model docstring for the rest.

WHY `entry_date` IS A COLUMN, unlike `diary`, which derives its day from
`created_at`: both answer the same question in `settings.TIME_ZONE`, but the
diary answers it once per row in Python while this table is grouped by day seven
days at a time. The column plus `(id_medical, entry_date)` keeps that one
indexed query. `core/days.py` still decides the boundary; nothing here computes
it.

`hydration` lives in medical_db, so the raw SQL carries
`hints={'target_db': 'medical'}` — `allow_migrate` receives `model_name=None`
for RunSQL, and unhinted it would also run against user_db, where neither this
table nor `diary` exists.

`CREATE TABLE IF NOT EXISTS` inside a SeparateDatabaseAndState, matching
0004/0005/0007/0010/0011/0012/0013: `scripts/database_setup.sql` declares the
same table and the documented setup order runs that script before `migrate`.
"""

from django.db import migrations, models

import uuid

FORWARD = """
CREATE TABLE IF NOT EXISTS hydration (
    id_hydration UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Logical relation:
    -- hydration.id_medical -> user_db.patient.id_medical
    -- Not a foreign key, for the same reason diary.id_medical is not one.
    id_medical UUID NOT NULL,

    -- The calendar day this serving belongs to, in settings.TIME_ZONE.
    entry_date DATE NOT NULL,

    -- One of core.drinks.DRINKS, the Polish name as written. Only 'Woda'
    -- counts towards the daily goal; the rest are recorded and deliberately
    -- never converted into water.
    drink TEXT NOT NULL DEFAULT 'Woda',

    -- NULL for every drink but water: the "Inne napoje" card offers a chip and
    -- no quantity, and inventing one would put a number nobody entered into a
    -- clinical record.
    amount_ml INT,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hydration_patient_day
    ON hydration (id_medical, entry_date);
"""

BACKWARD = """
DROP TABLE IF EXISTS hydration;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0014_must_change_password'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name='Hydration',
                    fields=[
                        ('id_hydration', models.UUIDField(
                            default=uuid.uuid4, editable=False,
                            primary_key=True, serialize=False,
                        )),
                        ('id_medical', models.UUIDField(db_index=True)),
                        ('entry_date', models.DateField()),
                        ('drink', models.TextField(
                            choices=[
                                ('Woda', 'Woda'), ('Herbata', 'Herbata'),
                                ('Kawa', 'Kawa'), ('Napar ziołowy', 'Napar ziołowy'),
                                ('Woda z cytryną', 'Woda z cytryną'),
                                ('Kompot', 'Kompot'),
                            ],
                            default='Woda',
                        )),
                        ('amount_ml', models.IntegerField(blank=True, null=True)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('updated_at', models.DateTimeField(auto_now=True)),
                    ],
                    options={'db_table': 'hydration'},
                ),
                migrations.AddIndex(
                    model_name='hydration',
                    index=models.Index(
                        fields=['id_medical', 'entry_date'],
                        name='idx_hydration_patient_day',
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
