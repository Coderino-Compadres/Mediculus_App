"""A specialist's qualification: university, field of study, diploma number.

Asked for by the colleagues form when an account is created and read by the
administrator before approving it (core/admin_panel.py). The specialist never
edits it — a change after approval would bypass the check it was approved on;
only an administrator may correct it.

All three are nullable in the schema although the form requires them: every
specialist that exists when this runs was created without being asked, and
there is nothing true to backfill them with.

user_db only, so every `RunSQL` carries `hints={'target_db': 'default'}` (see
0022). `IF NOT EXISTS` throughout, because `scripts/database_setup.sql` declares
the same schema and the documented setup order runs that script first.
"""

from django.db import migrations, models

FORWARD = """
ALTER TABLE specjalist ADD COLUMN IF NOT EXISTS university TEXT;
ALTER TABLE specjalist ADD COLUMN IF NOT EXISTS field_of_study TEXT;
ALTER TABLE specjalist ADD COLUMN IF NOT EXISTS diploma_number TEXT;
"""

BACKWARD = """
ALTER TABLE specjalist DROP COLUMN IF EXISTS diploma_number;
ALTER TABLE specjalist DROP COLUMN IF EXISTS field_of_study;
ALTER TABLE specjalist DROP COLUMN IF EXISTS university;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0025_admin_panel'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='specjalist',
                    name='university',
                    field=models.TextField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='specjalist',
                    name='field_of_study',
                    field=models.TextField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='specjalist',
                    name='diploma_number',
                    field=models.TextField(blank=True, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql=FORWARD, reverse_sql=BACKWARD,
                    hints={'target_db': 'default'},
                ),
            ],
        ),
    ]
