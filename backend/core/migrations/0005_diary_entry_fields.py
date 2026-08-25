"""Give the "Dodaj wpis" form somewhere to put every answer it collects.

The entry screen asks for more than `diary` and `mood_scale` could hold. What
was missing, and where it now goes:

- the tension slider              -> `diary.tension_level`
- "Co poczułeś?" / "Co pomyślałeś?" (the middle two steps of the CBT/ABC
  breakdown; "Sytuacja" and "Zachowanie" already had `situation` and
  `how_situation_handled`)
                                  -> `diary.emotion_note`, `diary.thought`
- the risky-behaviour description -> `diary.risky_behavior_note`
- 'Wstyd' and 'Spokój', the two emotions the picker offers that had no numeric
  column, so their intensity could previously only survive as free text
                                  -> `mood_scale.shame_scale`, `mood_scale.calm_scale`

Three things deliberately did *not* change:

- `diary.stress_level` keeps its meaning. The form no longer has a separate
  "poziom stresu" slider competing with the 'Stres' emotion chip, so the column
  is unambiguously that emotion's intensity — which is how `emotions.py` and
  `dashboard.py` have always read it. No `stress_scale` column is needed.
- `diary.overall_feeling` is left alone. The "jakość samopoczucia" slider that
  would have filled it was dropped from the form, so converting the column to
  INT would only destroy the text `mock_data.sql` seeds, for nothing.
- No `entry_date`. An entry can only be edited on the day it was created and
  historical entries are read-only, so `created_at` *is* the day the entry is
  about; a second date column could only ever drift from it.

Written as SeparateDatabaseAndState so the columns are added with
`IF NOT EXISTS`, matching 0004: `scripts/database_setup.sql` declares them too,
and the documented setup order runs that script before `migrate`.

Both tables live in medical_db, so the raw SQL carries
`hints={'target_db': 'medical'}` — without it `allow_migrate` (which receives
`model_name=None` for RunSQL) would let it run against user_db as well, where
neither table exists.
"""

from django.db import migrations, models

FORWARD = """
ALTER TABLE diary
    ADD COLUMN IF NOT EXISTS tension_level INT,
    ADD COLUMN IF NOT EXISTS emotion_note TEXT,
    ADD COLUMN IF NOT EXISTS thought TEXT,
    ADD COLUMN IF NOT EXISTS risky_behavior_note TEXT;

ALTER TABLE mood_scale
    ADD COLUMN IF NOT EXISTS shame_scale INT,
    ADD COLUMN IF NOT EXISTS calm_scale INT;
"""

BACKWARD = """
ALTER TABLE diary
    DROP COLUMN IF EXISTS tension_level,
    DROP COLUMN IF EXISTS emotion_note,
    DROP COLUMN IF EXISTS thought,
    DROP COLUMN IF EXISTS risky_behavior_note;

ALTER TABLE mood_scale
    DROP COLUMN IF EXISTS shame_scale,
    DROP COLUMN IF EXISTS calm_scale;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0004_user_consents'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='diary',
                    name='tension_level',
                    field=models.IntegerField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='diary',
                    name='emotion_note',
                    field=models.TextField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='diary',
                    name='thought',
                    field=models.TextField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='diary',
                    name='risky_behavior_note',
                    field=models.TextField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='moodscale',
                    name='shame_scale',
                    field=models.IntegerField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='moodscale',
                    name='calm_scale',
                    field=models.IntegerField(blank=True, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    FORWARD, BACKWARD, hints={'target_db': 'medical'},
                ),
            ],
        ),
    ]
