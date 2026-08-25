"""Drop `diary.overall_feeling` — a column with no question behind it.

It was meant to hold a "jakość samopoczucia" rating, but that slider was cut
from the entry form: the five-tile "Jak się teraz czujesz?" question above it
asks the same thing and lands in `current_mood`. Since 0005 the column has taken
no writes at all, so keeping it would leave a permanently NULL field that every
later reader has to ask about.

This is destructive in a way the additive migrations before it were not: the
five seed rows in `scripts/mock_data.sql` carried text there ('w porządku',
'dobre', ...) and that text is not recoverable by re-running the reverse
operation. The reverse re-creates the column, empty. `mock_data.sql` no longer
writes the column, so a fresh setup is consistent either way.

Same shape as 0004/0005 — `SeparateDatabaseAndState` with `IF EXISTS`, because
`database_setup.sql` describes the schema too and the documented setup order
runs it first — and the same `hints={'target_db': 'medical'}`, since `diary`
exists only in medical_db.
"""

from django.db import migrations, models

FORWARD = """
ALTER TABLE diary
    DROP COLUMN IF EXISTS overall_feeling;
"""

BACKWARD = """
ALTER TABLE diary
    ADD COLUMN IF NOT EXISTS overall_feeling TEXT;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0005_diary_entry_fields'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RemoveField(
                    model_name='diary',
                    name='overall_feeling',
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    FORWARD, BACKWARD, hints={'target_db': 'medical'},
                ),
            ],
        ),
    ]
