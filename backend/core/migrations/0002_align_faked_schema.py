"""Align the real columns with the state 0001 was faked into.

scripts/database_setup.sql created `TIMESTAMP` / unbounded `VARCHAR`, while the
faked 0001_initial recorded `timestamptz` / `varchar(255)`. Nothing in
makemigrations can see that drift, so it is corrected here explicitly.
"""

from django.db import migrations

USER_FORWARD = """
ALTER TABLE "user"
    ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC',
    ALTER COLUMN email TYPE varchar(255),
    ALTER COLUMN password_hash TYPE varchar(255);
"""

USER_BACKWARD = """
ALTER TABLE "user"
    ALTER COLUMN created_at TYPE timestamp USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN updated_at TYPE timestamp USING updated_at AT TIME ZONE 'UTC',
    ALTER COLUMN email TYPE varchar,
    ALTER COLUMN password_hash TYPE varchar;
"""

DIARY_FORWARD = """
ALTER TABLE diary
    ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
"""

DIARY_BACKWARD = """
ALTER TABLE diary
    ALTER COLUMN created_at TYPE timestamp USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN updated_at TYPE timestamp USING updated_at AT TIME ZONE 'UTC';
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.RunSQL(
            USER_FORWARD, USER_BACKWARD, hints={'target_db': 'default'},
        ),
        migrations.RunSQL(
            DIARY_FORWARD, DIARY_BACKWARD, hints={'target_db': 'medical'},
        ),
    ]
