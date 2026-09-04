"""The specialist's invitation for a guardian to create an account.

A guardian could already register from the public form, but nothing there could
*link* the new account to a child: that link is started by the child naming an
address (`parent_child`, core/guardian.py). A specialist sitting with a family
needs the other direction, and needs it to work in a deployment that sends no
mail — so the invitation is a code handed over in the consulting room, and this
table is what a code is checked against.

WHY THE ROW HOLDS A HASH. `code_hash` is the code the way `user.password_hash`
is a password: the plaintext exists only in the response that created the
invitation, and nowhere afterwards. An invitation carries the right to attach a
guardian account to a named minor's account, so a database dump full of readable
codes would be a set of usable keys. A specialist who loses one revokes it and
issues another; there is deliberately no endpoint that reads a code back.

`email` binds the invitation to the address the specialist named, so the code
alone is not enough. `expires_at` stops an unredeemed one working forever.
`used_at` marks a redeemed invitation instead of deleting the row — the
specialist needs to see that the parent did register, and a used code must not be
redeemable a second time.

Created with `CREATE TABLE IF NOT EXISTS` inside a SeparateDatabaseAndState,
matching every other schema change here (0004/0005/0007/0010/0011):
`scripts/database_setup.sql` declares the same table and the documented setup
order runs that script before `migrate`. `parent_invitation` lives in user_db, so
the raw SQL carries `hints={'target_db': 'default'}` — `allow_migrate` receives
`model_name=None` for RunSQL, and unhinted it would also run against medical_db.
"""

from django.db import migrations, models

import django.db.models.deletion
import uuid

FORWARD = """
CREATE TABLE IF NOT EXISTS parent_invitation (
    id_parent_invitation UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_specjalist UUID NOT NULL,
    id_child UUID NOT NULL,
    email VARCHAR(255) NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_parent_invitation_specjalist
        FOREIGN KEY (id_specjalist)
        REFERENCES specjalist (id_user),

    CONSTRAINT fk_parent_invitation_child
        FOREIGN KEY (id_child)
        REFERENCES "user" (id_user)
);

CREATE INDEX IF NOT EXISTS idx_parent_invitation_id_specjalist
    ON parent_invitation (id_specjalist);

CREATE INDEX IF NOT EXISTS idx_parent_invitation_id_child
    ON parent_invitation (id_child);
"""

BACKWARD = """
DROP TABLE IF EXISTS parent_invitation;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0011_specjalist_patient_invitation'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name='ParentInvitation',
                    fields=[
                        ('id_parent_invitation', models.UUIDField(
                            default=uuid.uuid4, editable=False,
                            primary_key=True, serialize=False,
                        )),
                        ('email', models.CharField(max_length=255)),
                        ('code_hash', models.CharField(max_length=255)),
                        ('expires_at', models.DateTimeField()),
                        ('used_at', models.DateTimeField(blank=True, null=True)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('updated_at', models.DateTimeField(auto_now=True)),
                        ('child', models.ForeignKey(
                            db_column='id_child',
                            on_delete=django.db.models.deletion.CASCADE,
                            related_name='parent_invitations', to='core.user',
                        )),
                        ('specjalist', models.ForeignKey(
                            db_column='id_specjalist',
                            on_delete=django.db.models.deletion.CASCADE,
                            related_name='parent_invitations', to='core.specjalist',
                        )),
                    ],
                    options={'db_table': 'parent_invitation'},
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    FORWARD, BACKWARD, hints={'target_db': 'default'},
                ),
            ],
        ),
    ]
