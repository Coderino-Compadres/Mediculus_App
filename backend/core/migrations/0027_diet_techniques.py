"""The psychodietetic catalogue's database half: a `module` on `technique`.

A psychodietitian writes techniques into the diet module's catalogue the way a
psychotherapist writes into the DBT one, and both go into the same table —
`module` says which catalogue a row belongs to (see core/diet_techniques.py).
Every row that exists when this runs was written through the DBT panel, so the
default is its true value rather than a guess.

`example` and `note` are the two parts of a diet technique the DBT shape does
not have: the "Przykład" card and the sentence closing the step list.

medical_db only, so the `RunSQL` carries `hints={'target_db': 'medical'}` (see
0013). `IF NOT EXISTS` throughout, because `scripts/database_setup.sql` declares
the same schema and the documented setup order runs that script first.
"""

from django.db import migrations, models

FORWARD = """
ALTER TABLE technique
    ADD COLUMN IF NOT EXISTS module TEXT NOT NULL DEFAULT 'psychotherapy',
    ADD COLUMN IF NOT EXISTS example TEXT,
    ADD COLUMN IF NOT EXISTS note TEXT;
"""

BACKWARD = """
ALTER TABLE technique
    DROP COLUMN IF EXISTS note,
    DROP COLUMN IF EXISTS example,
    DROP COLUMN IF EXISTS module;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0026_specjalist_qualifications'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='technique', name='module',
                    field=models.TextField(default='psychotherapy'),
                ),
                migrations.AddField(
                    model_name='technique', name='example',
                    field=models.TextField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='technique', name='note',
                    field=models.TextField(blank=True, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    FORWARD, BACKWARD, hints={'target_db': 'medical'},
                ),
            ],
        ),
    ]
