"""`diet_meal_emotion` — the emotions felt at a meal (mockups §04/§05).

WHAT THIS UNBLOCKS. §05 names three sections a psychodietetic report would
hold, and `core/diet_reports.py` refuses all three with one sentence: they
"read the psychodietetic context of a meal, and *none of those columns
exists*". This is the first of those columns. The food diary could already say
what was eaten and when; it could not say anything about what was felt around
it, which is the half the module is actually for ("nie liczy jedzenia — opisuje
je i to, co dzieje się wokół niego").

THE SAME TEN EMOTIONS AS THE PSYCHOTHERAPY DIARY, rated on the same 0-10 scale
(`core/emotions.py`, `frontend/src/utils/emotions.ts`). Not a second vocabulary
for the diet module: a patient who marks 'Lęk' at supper and 'Lęk' in the
evening's diary entry has named one thing twice, and two lists would make those
two different words that happen to be spelled alike.

A ROW PER EMOTION RATHER THAN COLUMNS, which is where this parts company with
`diary`'s nine `mood_scale` columns — and deliberately. A NULL in one of those
means *the chip was never picked*, so a chip picked and left unrated has
nowhere to live and the form sends 0 for one; `diary.EmotionRatingSerializer`
documents the cost (0 reads as "wcale" and pulls that emotion's average down)
and closes by saying the honest version "needs somewhere to put the picked-set —
a schema change, and a question for the client before the diet module's four
0-10 sliders repeat it". This table is that schema change, made before the
repeat rather than after it: the *row* records the picking, `intensity` records
only the rating, and it is therefore NULLABLE. CLAUDE.md's rule that an
untouched slider is null rather than 0 is storable here.

`id_meal` IS A REAL FOREIGN KEY with ON DELETE CASCADE, unlike every
`id_medical` in this database: both ends live in medical_db, so Postgres can
enforce it — the same exception `supplement_hour` and `supplement_intake` are.
An emotion belongs to the meal it was felt at and has no meaning without it, so
deleting today's mistyped meal takes its emotions with it rather than leaving
them orphaned.

NO `id_medical` COLUMN, for the same reason `supplement_hour` has none: the
patient is reachable through the meal, and a copy here would be a second answer
to whose emotion it is — free to disagree with the first.

`CREATE TABLE IF NOT EXISTS` inside a `SeparateDatabaseAndState`, matching every
migration since 0004: `scripts/database_setup.sql` declares the same table and
the documented setup order runs that script before `migrate`. The `RunSQL`
carries `hints={'target_db': 'medical'}` because `allow_migrate` receives
`model_name=None` for RunSQL, and unhinted it would also run against user_db.
"""

from django.db import migrations, models

import django.db.models.deletion
import uuid

FORWARD = """
-- ----------------------------
-- DIET_MEAL_EMOTION
-- One emotion picked next to one meal, and the 0-10 number on it.
--
-- The vocabulary is core.emotions.EMOTIONS -- the same ten the psychotherapy
-- diary uses, so 'Lęk' at supper and 'Lęk' in the evening's entry are one word.
-- Unconstrained in the database, with the same caveat as diet_meal.kind: the
-- only thing refusing an unknown value is the API serializer.
--
-- intensity IS NULLABLE, and that is the point of a table rather than columns.
-- The row says the chip was picked; intensity says only how strongly. NULL is
-- a slider nobody moved, which is not a 0 -- the distinction diary's mood_scale
-- columns cannot express (see the module docstring).
-- ----------------------------
CREATE TABLE IF NOT EXISTS diet_meal_emotion (
    id_meal_emotion UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- A real foreign key, unlike every id_medical here: both tables live in
    -- medical_db. An emotion has no meaning without its meal, so it goes when
    -- the meal does.
    id_meal UUID NOT NULL
        REFERENCES diet_meal (id_meal) ON DELETE CASCADE,

    emotion TEXT NOT NULL,

    -- 0-10, or NULL for a chip picked and left unrated.
    intensity SMALLINT,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- The same emotion twice on one meal is a double-submitted form, not a
    -- second feeling.
    -- Its btree also serves the only query this table has -- every emotion of
    -- one meal -- so there is no separate index on id_meal, the same as
    -- supplement_hour.
    CONSTRAINT uq_diet_meal_emotion UNIQUE (id_meal, emotion)
);
"""

BACKWARD = """
DROP TABLE IF EXISTS diet_meal_emotion;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0019_diet_week_start'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name='DietMealEmotion',
                    fields=[
                        ('id_meal_emotion', models.UUIDField(
                            default=uuid.uuid4, editable=False,
                            primary_key=True, serialize=False,
                        )),
                        ('emotion', models.TextField()),
                        ('intensity', models.SmallIntegerField(blank=True, null=True)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('meal', models.ForeignKey(
                            db_column='id_meal',
                            on_delete=django.db.models.deletion.CASCADE,
                            related_name='emotions', to='core.dietmeal',
                        )),
                    ],
                    options={'db_table': 'diet_meal_emotion'},
                ),
                migrations.AddConstraint(
                    model_name='dietmealemotion',
                    constraint=models.UniqueConstraint(
                        fields=('meal', 'emotion'),
                        name='uq_diet_meal_emotion',
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
