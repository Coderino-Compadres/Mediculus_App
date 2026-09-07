"""Hold an account that is still using a password somebody else chose for it.

A specialist account is created by another specialist (core/colleagues.py), and
its first password is *generated* rather than chosen: it comes back once in the
creating response, gets read off a note and typed by hand. That is the right
shape for a deployment that sends no mail, and it leaves two facts true of the
new account that are true of no other one — its owner did not choose the
credential, and somebody else knows it.

So the account is held on one screen until it sets its own. `must_change_password`
is what says so, `core.permissions.HasOwnPassword` is what enforces it, and
`PasswordChangeSerializer.save` is the only thing that clears it.

NOT NULL DEFAULT FALSE, and no backfill: every account that existed before this
migration chose its own password at registration, so FALSE is the correct value
for all of them rather than an approximation. A boolean rather than a moment,
unlike the consent columns 0004/0010 added — nothing has to be proved about this
afterwards, and `updated_at` already records when the password last changed.

`"user"` lives in user_db, so the raw SQL carries `hints={'target_db': 'default'}`:
`allow_migrate` receives `model_name=None` for RunSQL, and without the hint this
would also run against medical_db, where the table does not exist.

SeparateDatabaseAndState with `IF NOT EXISTS`, matching 0004/0005/0007/0010 —
`scripts/database_setup.sql` declares the same column and the documented setup
order runs that script before `migrate`.
"""

from django.db import migrations, models

FORWARD = """
ALTER TABLE "user"
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
"""

BACKWARD = """
ALTER TABLE "user"
    DROP COLUMN IF EXISTS must_change_password;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0013_technique_catalogue'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='user',
                    name='must_change_password',
                    field=models.BooleanField(default=False),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    FORWARD, BACKWARD, hints={'target_db': 'default'},
                ),
            ],
        ),
    ]
