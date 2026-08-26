"""Make a `parent_child` row a decision, not just a claim.

The child names a guardian by e-mail; until now that alone created the link, so
the guardian was never asked — which is exactly what a consent to process a
minor's health data cannot rest on (RODO art. 8). `accepted_at` NULL is the
invitation waiting for an answer; set, it is the moment the guardian accepted.

A refusal deletes the row rather than filling a third column. Nothing in the app
can undo an accepted link, and a refused invitation left in place would leave
the child blocked forever with no way to ask a different guardian — so "no" is
better recorded as the absence of a link than as a row nobody can act on.

`parent_child` lives in user_db, so the raw SQL carries
`hints={'target_db': 'default'}` — `allow_migrate` receives `model_name=None`
for RunSQL, and without the hint it would also run against medical_db, where
the table does not exist.

SeparateDatabaseAndState with `IF NOT EXISTS`, matching 0004/0005:
`scripts/database_setup.sql` declares the same column and the documented setup
order runs that script before `migrate`.
"""

from django.db import migrations, models

FORWARD = """
ALTER TABLE parent_child
    ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
"""

BACKWARD = """
ALTER TABLE parent_child
    DROP COLUMN IF EXISTS accepted_at;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0006_drop_overall_feeling'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='parentchild',
                    name='accepted_at',
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
