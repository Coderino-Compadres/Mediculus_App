"""Give `technique` the shape the catalogue actually has.

The table held four columns — a name, a type, a one-line description — while the
catalogue on screen is a structured document: which tabs a technique appears in,
which DBT group and module it belongs to, an introduction, an ordered list of
component skills with examples, and a flag for whether it may be handed to a
patient without a specialist present (`frontend/src/types/technique.ts`).

A specialist can now write a technique from their panel, and the decision behind
that feature is that what they write is **a catalogue entry like any other**,
visible to every patient. That only means anything if the row can hold the same
content as the entries the app ships with; otherwise a technique written by a
specialist would render as a name and a paragraph next to ones with steps and
examples, and the panel would be a worse copy of the thing it extends.

WHAT THE NEW COLUMNS ARE FOR, in the order they matter:

* `slug` — the identifier the URL carries. Nullable, because the four seeded
  rows predate it and nothing can invent one for them.
* `schools` / `steps` — JSONB, both genuinely lists. A `technique_step` table
  was the alternative and would buy nothing: a step has no identity, nothing
  queries one, and the whole list is written and read as a unit.
* `availability` — the safety flag, defaulting to 'ogolna'.
* `description_ready` — whether there is anything to open. **Defaults to FALSE**,
  which is what keeps the seeded rows out of the patient's catalogue: they carry
  a name and a sentence, not the structure the detail screen renders. A default
  of TRUE would have published four half-rows the moment this migration ran.
* `author_id_specjalist` — a **logical** reference to
  `user_db.specjalist.id_user`, deliberately not a foreign key: `technique` is in
  medical_db and this project never joins across the two databases (the same
  arrangement as `diary.id_medical`). It is not a permission — every patient sees
  every published technique — it says whose panel may edit the row.

`technique` lives in medical_db, so the raw SQL carries
`hints={'target_db': 'medical'}`; unhinted it would also run against user_db,
where the table does not exist.

SeparateDatabaseAndState with `IF NOT EXISTS`, matching 0004/0005/0007/0010/0011:
`scripts/database_setup.sql` declares the same columns and the documented setup
order runs that script first.
"""

from django.db import migrations, models

FORWARD = """
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

-- A slug is what the patient's catalogue merges this table with the built-in
-- one on, so two rows claiming one slug would make which technique opens a
-- matter of row order. Unique rather than checked in the serializer alone;
-- NULLs do not collide in Postgres, so the seeded rows are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS technique_slug_key
    ON technique (slug);

CREATE INDEX IF NOT EXISTS idx_technique_author_id_specjalist
    ON technique (author_id_specjalist);
"""

BACKWARD = """
DROP INDEX IF EXISTS idx_technique_author_id_specjalist;
DROP INDEX IF EXISTS technique_slug_key;

ALTER TABLE technique
    DROP COLUMN IF EXISTS slug,
    DROP COLUMN IF EXISTS subtitle,
    DROP COLUMN IF EXISTS schools,
    DROP COLUMN IF EXISTS dbt_group,
    DROP COLUMN IF EXISTS dbt_module,
    DROP COLUMN IF EXISTS availability,
    DROP COLUMN IF EXISTS intro,
    DROP COLUMN IF EXISTS steps,
    DROP COLUMN IF EXISTS duration_min,
    DROP COLUMN IF EXISTS description_ready,
    DROP COLUMN IF EXISTS author_id_specjalist,
    DROP COLUMN IF EXISTS created_at,
    DROP COLUMN IF EXISTS updated_at;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0012_parent_invitation'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='technique', name='slug',
                    field=models.CharField(blank=True, max_length=64, null=True, unique=True),
                ),
                migrations.AddField(
                    model_name='technique', name='subtitle',
                    field=models.TextField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='technique', name='schools',
                    field=models.JSONField(blank=True, default=list),
                ),
                migrations.AddField(
                    model_name='technique', name='dbt_group',
                    field=models.TextField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='technique', name='dbt_module',
                    field=models.TextField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='technique', name='availability',
                    field=models.TextField(default='ogolna'),
                ),
                migrations.AddField(
                    model_name='technique', name='intro',
                    field=models.TextField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='technique', name='steps',
                    field=models.JSONField(blank=True, default=list),
                ),
                migrations.AddField(
                    model_name='technique', name='duration_min',
                    field=models.IntegerField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='technique', name='description_ready',
                    field=models.BooleanField(default=False),
                ),
                migrations.AddField(
                    model_name='technique', name='author_id_specjalist',
                    field=models.UUIDField(blank=True, db_index=True, null=True),
                ),
                migrations.AddField(
                    model_name='technique', name='created_at',
                    field=models.DateTimeField(auto_now_add=True, blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='technique', name='updated_at',
                    field=models.DateTimeField(auto_now=True, blank=True, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    FORWARD, BACKWARD, hints={'target_db': 'medical'},
                ),
            ],
        ),
    ]
