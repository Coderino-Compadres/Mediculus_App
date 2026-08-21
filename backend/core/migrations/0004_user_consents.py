"""Store when each RODO consent was granted.

The registration form has always collected the two consents; `"user"` had
nowhere to put them. Timestamps rather than booleans, because RODO art. 7(1)
requires us to be able to demonstrate that consent was given.

Written as SeparateDatabaseAndState so that the columns are added with
`IF NOT EXISTS`: `scripts/database_setup.sql` declares them too (it has to stay
a faithful description of the schema), and the documented setup order is that
script first, then `migrate` — so on a fresh database the columns already exist
by the time this runs, while an existing database gets them here.
"""

from django.db import migrations, models

FORWARD = """
ALTER TABLE "user"
    ADD COLUMN IF NOT EXISTS data_consent_at timestamptz,
    ADD COLUMN IF NOT EXISTS services_consent_at timestamptz;
"""

BACKWARD = """
ALTER TABLE "user"
    DROP COLUMN IF EXISTS data_consent_at,
    DROP COLUMN IF EXISTS services_consent_at;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_alter_diary_id_medical_alter_raport_id_medical_and_more'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='user',
                    name='data_consent_at',
                    field=models.DateTimeField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='user',
                    name='services_consent_at',
                    field=models.DateTimeField(blank=True, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    FORWARD, BACKWARD, hints={'target_db': 'default'},
                ),
            ],
        ),
    ]
