"""Make `patient.id_specjalist` something the patient agreed to.

Until now the column was set by `mock_data.sql` and by nothing else: there was
no way for a specialist to take a patient on, and therefore no specialist view
worth having. The obvious fix — let a specialist write the column — is the one
this migration deliberately does not enable. Registration is self-service (see
0011's sibling change in core/serializers.py, which adds the `specialist`
account type), so a form that assigned patients on the spot would let any
account that called itself a specialist read anybody's weekly reports.

So the assignment is an invitation, in the same shape as the guardian one:

    id_specjalist_pending  the specialist who asked; NULL means nobody is asking
    id_specjalist          the specialist treating this patient
    specjalist_accepted_at when the patient agreed to the column above

Accepting moves the id from the first column into the second and stamps the
third; refusing clears the first. A refusal leaves no row saying "no" for the
same reason `parent_child` deletes one (0007): nothing in the app can undo an
assignment, so a recorded refusal would be a state nobody can act on, while an
absent invitation simply lets the specialist ask again after talking to them.

`specjalist_accepted_at` is a timestamp rather than a boolean because it is the
same kind of fact as the consent columns on `"user"` (0004/0010) and
`parent_child.accepted_at` (0007): the report visibility rule says a patient
cannot cut their specialist off, which makes the moment they agreed to that
specialist the only record of how the access began.

`patient` lives in user_db, so the raw SQL carries `hints={'target_db':
'default'}` — `allow_migrate` receives `model_name=None` for RunSQL, and without
the hint this would also run against medical_db, where the table does not exist.

SeparateDatabaseAndState with `IF NOT EXISTS`, matching 0004/0005/0007/0010:
`scripts/database_setup.sql` declares the same columns and the documented setup
order runs that script before `migrate`.
"""

from django.db import migrations, models

import django.db.models.deletion

FORWARD = """
ALTER TABLE patient
    ADD COLUMN IF NOT EXISTS id_specjalist_pending UUID,
    ADD COLUMN IF NOT EXISTS specjalist_accepted_at TIMESTAMPTZ;

DO $$
BEGIN
    ALTER TABLE patient
        ADD CONSTRAINT fk_patient_specjalist_pending
        FOREIGN KEY (id_specjalist_pending) REFERENCES specjalist (id_user);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_patient_id_specjalist_pending
    ON patient (id_specjalist_pending);
"""

BACKWARD = """
DROP INDEX IF EXISTS idx_patient_id_specjalist_pending;

ALTER TABLE patient
    DROP CONSTRAINT IF EXISTS fk_patient_specjalist_pending;

ALTER TABLE patient
    DROP COLUMN IF EXISTS id_specjalist_pending,
    DROP COLUMN IF EXISTS specjalist_accepted_at;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0010_consent_withdrawal'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='patient',
                    name='specjalist_pending',
                    field=models.ForeignKey(
                        blank=True, db_column='id_specjalist_pending', null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='pending_patients', to='core.specjalist',
                    ),
                ),
                migrations.AddField(
                    model_name='patient',
                    name='specjalist_accepted_at',
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
