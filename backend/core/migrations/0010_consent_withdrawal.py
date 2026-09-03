"""Record that a consent was *withdrawn*, without losing that it was given.

RODO art. 7(1) puts the burden of proving consent on us, and 0004 answered that
by storing the moment each consent was granted rather than a boolean. Withdrawal
has the same problem in the other direction: art. 7(3) makes withdrawal a right,
and a user who exercises it is entitled to have that recorded too — so clearing
`data_consent_at` back to NULL would be the wrong fix. It would destroy the proof
that the consent ever existed, and make "never granted" and "granted then
withdrawn" the same row.

Two more columns instead. A consent is **active** when it has been granted and
not withdrawn since:

    granted_at is not None and (withdrawn_at is None or withdrawn_at <= granted_at)

Re-granting writes a new `granted_at`, which is therefore later than the
withdrawal and turns the comparison back on; the withdrawal moment stays where it
is. That keeps the *last* cycle of each consent, which is what the profile shows
and what a data-subject request would be answered from. It is not a full audit
log — a user who withdraws and restores twice keeps only the most recent
withdrawal — and a table would be the answer if one is ever needed.

`"user"` lives in user_db, so the raw SQL carries `hints={'target_db': 'default'}`:
`allow_migrate` receives `model_name=None` for RunSQL, and without the hint this
would also run against medical_db, where the table does not exist.

SeparateDatabaseAndState with `IF NOT EXISTS`, matching 0004/0005/0007 —
`scripts/database_setup.sql` declares the same columns and the documented setup
order runs that script before `migrate`.
"""

from django.db import migrations, models

FORWARD = """
ALTER TABLE "user"
    ADD COLUMN IF NOT EXISTS data_consent_withdrawn_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS services_consent_withdrawn_at TIMESTAMPTZ;
"""

BACKWARD = """
ALTER TABLE "user"
    DROP COLUMN IF EXISTS data_consent_withdrawn_at,
    DROP COLUMN IF EXISTS services_consent_withdrawn_at;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0009_diary_time_of_day'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='user',
                    name='data_consent_withdrawn_at',
                    field=models.DateTimeField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='user',
                    name='services_consent_withdrawn_at',
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
