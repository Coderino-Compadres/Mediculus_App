"""The administrator's panel: accounts that may use it, what they did, and the
specialist accounts waiting for them.

THREE CHANGES, ONE FEATURE (core/admin_panel.py):

* `specjalist.approved_at` — when an administrator confirmed the account; NULL
  while it waits. A colleague creating the account vouches for the person, and
  this is the foundation's final word on it. There is no "rejected" value: a
  rejection deletes the account.
* `specjalist.id_created_by` — who created it from the colleagues screen, which
  is what the administrator reads when deciding. SET NULL, not a cascade: the
  creator leaving does not undo the account.
* `administrator` and `admin_audit_log` — who may open the panel, and what each
  of them looked at or decided.

THE BACKFILL IS THE LOAD-BEARING PART. Every specialist that exists when this
runs predates the approval step and is already working with patients, so each is
marked approved as of its own creation. Without it the column would arrive NULL
everywhere and every existing specialist would lose the panel on deploy.

user_db only, so every `RunSQL` carries `hints={'target_db': 'default'}` (see
0022). `IF NOT EXISTS` throughout, because `scripts/database_setup.sql` declares
the same schema and the documented setup order runs that script first.
"""

import uuid

import django.db.models.deletion
from django.db import migrations, models

FORWARD = """
ALTER TABLE specjalist ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE specjalist ADD COLUMN IF NOT EXISTS id_created_by UUID;

DO $$
BEGIN
    ALTER TABLE specjalist
        ADD CONSTRAINT fk_specjalist_created_by
        FOREIGN KEY (id_created_by) REFERENCES "user" (id_user)
        ON DELETE SET NULL;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS administrator (
    id_user UUID PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_administrator_user
        FOREIGN KEY (id_user)
        REFERENCES "user" (id_user)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id_admin_audit_log UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_admin UUID,
    admin_email VARCHAR(255) NOT NULL,
    action TEXT NOT NULL,
    target_id UUID,
    target_label TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_admin_audit_log_admin
        FOREIGN KEY (id_admin)
        REFERENCES "user" (id_user)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
    ON admin_audit_log (created_at);
"""

BACKFILL = """
UPDATE specjalist s
SET approved_at = COALESCE(u.created_at, CURRENT_TIMESTAMP)
FROM "user" u
WHERE u.id_user = s.id_user AND s.approved_at IS NULL;
"""

BACKWARD = """
DROP TABLE IF EXISTS admin_audit_log;
DROP TABLE IF EXISTS administrator;
ALTER TABLE specjalist DROP CONSTRAINT IF EXISTS fk_specjalist_created_by;
ALTER TABLE specjalist DROP COLUMN IF EXISTS id_created_by;
ALTER TABLE specjalist DROP COLUMN IF EXISTS approved_at;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0024_supplement_intake_hour'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='specjalist',
                    name='approved_at',
                    field=models.DateTimeField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='specjalist',
                    name='created_by',
                    field=models.ForeignKey(
                        blank=True, db_column='id_created_by', null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='+', to='core.user',
                    ),
                ),
                migrations.CreateModel(
                    name='Administrator',
                    fields=[
                        ('user', models.OneToOneField(
                            db_column='id_user',
                            on_delete=django.db.models.deletion.CASCADE,
                            primary_key=True, related_name='administrator_profile',
                            serialize=False, to='core.user',
                        )),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                    ],
                    options={'db_table': 'administrator'},
                ),
                migrations.CreateModel(
                    name='AdminAuditLog',
                    fields=[
                        ('id_admin_audit_log', models.UUIDField(
                            default=uuid.uuid4, editable=False,
                            primary_key=True, serialize=False,
                        )),
                        ('admin_email', models.CharField(max_length=255)),
                        ('action', models.TextField()),
                        ('target_id', models.UUIDField(blank=True, null=True)),
                        ('target_label', models.TextField(blank=True, null=True)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('admin', models.ForeignKey(
                            blank=True, db_column='id_admin', null=True,
                            on_delete=django.db.models.deletion.SET_NULL,
                            related_name='+', to='core.user',
                        )),
                    ],
                    options={'db_table': 'admin_audit_log', 'ordering': ['-created_at']},
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql=FORWARD, reverse_sql=BACKWARD,
                    hints={'target_db': 'default'},
                ),
                migrations.RunSQL(
                    sql=BACKFILL, reverse_sql=migrations.RunSQL.noop,
                    hints={'target_db': 'default'},
                ),
            ],
        ),
    ]
