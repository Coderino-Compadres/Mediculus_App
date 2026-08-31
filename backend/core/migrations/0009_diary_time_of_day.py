"""Give the entry form's "pora dnia" question a column to land in.

The form has been sending `time_of_day` for a while and `DiaryEntrySerializer`
was dropping it on the floor: an unknown key on a plain `serializers.Serializer`
is discarded without an error, so the patient picked "Wieczór", saw a saved
confirmation, reopened the entry and found the question blank. Silent data loss
rather than a missing feature, which is why this is a column and a validated
field rather than something to schedule.

Optional and **not backfilled**. Every entry written until now has NULL here and
that is the correct value, not a gap: nothing in the row says what time of day
the situation it describes happened at, and a default would be a guess printed
in a document a therapist reads.

`choices` lives on the model and in the serializer, so no CHECK constraint is
added: Django's `choices` emits none either, and the API is the only writer.
Four buckets of literal ASCII keys -- the Polish labels stay on the frontend.

`diary` lives in medical_db, so the raw SQL carries
`hints={'target_db': 'medical'}` -- `allow_migrate` receives `model_name=None`
for RunSQL, and without the hint it would also run against user_db, where the
table does not exist.

SeparateDatabaseAndState with `IF NOT EXISTS`, matching 0004/0005/0007:
`scripts/database_setup.sql` declares the same column and the documented setup
order runs that script before `migrate`.
"""

from django.db import migrations, models

FORWARD = """
ALTER TABLE diary
    ADD COLUMN IF NOT EXISTS time_of_day TEXT;
"""

BACKWARD = """
ALTER TABLE diary
    DROP COLUMN IF EXISTS time_of_day;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0008_throttle_cache_table'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='diary',
                    name='time_of_day',
                    field=models.TextField(
                        blank=True,
                        # Written out rather than imported from
                        # `core.time_of_day`: a migration's field is a snapshot
                        # of what the model looked like *then*. Referencing the
                        # live tuple would let a fifth bucket rewrite this
                        # migration's history retroactively -- and because the
                        # historical state would then already equal the model,
                        # `makemigrations --check` would report no changes and
                        # the new value would never be recorded anywhere.
                        choices=[
                            ('morning', 'morning'),
                            ('noon', 'noon'),
                            ('evening', 'evening'),
                            ('night', 'night'),
                        ],
                        null=True,
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
