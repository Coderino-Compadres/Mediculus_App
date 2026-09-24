"""`specjalist.module` — which module a specialist account works in.

WHY THE ACCOUNT NEEDS ONE. Until now a module existed only on a relationship
(`specjalist_patient.module`, 0022), so the app could not tell a
psychodietitian from a psychotherapist before either had a patient — and every
specialist got the psychotherapy panel, the DBT technique editor included. This
column is the account's own answer. It shapes the specialist's panel and
nothing else: which patients' reports an account may read is still decided per
accepted invitation, by `specjalist_patient.module`.

THE BACKFILL, and why it reads two sources. A specialist whose only accepted or
pending relationships are diet ones is a psychodietitian by what they already
do. One with no relationships at all is judged by the specialization they typed
("Psychodietetyka", "Dietetyka"), which is the only other trace the schema
holds. Everybody else stays `psychotherapy`, the module the app started as.
The text match runs once, here — nothing at runtime reads the specialization to
decide anything.

user_db, so every `RunSQL` carries `hints={'target_db': 'default'}` (see 0022).
`IF NOT EXISTS` and a guarded constraint, because `scripts/database_setup.sql`
declares the same column and the documented setup order runs that script first.
"""

from django.db import migrations, models

ADD_COLUMN = """
ALTER TABLE specjalist
    ADD COLUMN IF NOT EXISTS module TEXT NOT NULL DEFAULT 'psychotherapy';

DO $$
BEGIN
    ALTER TABLE specjalist
        ADD CONSTRAINT specjalist_module_known
        CHECK (module IN ('psychotherapy', 'diet'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
"""

BACKFILL = """
UPDATE specjalist s
SET module = 'diet'
WHERE s.module = 'psychotherapy'
  AND (
        (
            EXISTS (
                SELECT 1 FROM specjalist_patient sp
                WHERE sp.id_specjalist = s.id_user AND sp.module = 'diet'
            )
            AND NOT EXISTS (
                SELECT 1 FROM specjalist_patient sp
                WHERE sp.id_specjalist = s.id_user AND sp.module = 'psychotherapy'
            )
        )
        OR (
            NOT EXISTS (
                SELECT 1 FROM specjalist_patient sp
                WHERE sp.id_specjalist = s.id_user
            )
            AND s.specjalization ILIKE '%dietet%'
        )
  );
"""

DROP_COLUMN = """
ALTER TABLE specjalist DROP CONSTRAINT IF EXISTS specjalist_module_known;
ALTER TABLE specjalist DROP COLUMN IF EXISTS module;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0022_specjalist_patient_module'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='specjalist',
                    name='module',
                    field=models.TextField(default='psychotherapy'),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql=ADD_COLUMN,
                    reverse_sql=DROP_COLUMN,
                    hints={'target_db': 'default'},
                ),
                migrations.RunSQL(
                    sql=BACKFILL,
                    reverse_sql=migrations.RunSQL.noop,
                    hints={'target_db': 'default'},
                ),
            ],
        ),
    ]
