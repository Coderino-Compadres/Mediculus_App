"""`specjalist_patient` — who treats a patient, **per module**.

WHAT THIS REPLACES. Three columns on `patient`, added by 0011: `id_specjalist`,
`id_specjalist_pending` and `specjalist_accepted_at`. They gave a patient one
treating specialist, which was already written down as a known limitation (see
the header of core/specialist.py, which names this table as the fix) and which
the second module turned from a limitation into a defect:

    accepting a psychodietitian's invitation overwrote `id_specjalist`,
    and the psychotherapist silently lost the reports of a patient
    neither of them had been asked about.

The client's own visibility rule speaks of "the specialists treating the
patient" in the plural, and §13 of the diet mockups draws two cards told apart
by a coloured dot. This table is that plural, and `module` is the dot.

WHAT A ROW MEANS is exactly what a `parent_child` row means, deliberately: the
row *is* the link and `accepted_at` is its state — NULL for an invitation nobody
has answered, set for the moment the patient agreed. A refusal deletes the row
rather than writing a third state (0007's argument: a stored "no" is a state
nothing can act on, an absent row lets the specialist ask again).

TWO CONSTRAINTS, AND THE SECOND IS THE RULE WORTH KEEPING FROM THE OLD SHAPE.
`uniq_specjalist_patient_module` makes asking twice the same request arriving
twice. `uniq_patient_module_accepted` is partial — only accepted rows — and it
is the old single FK's one useful property: "kto Cię prowadzi" has one answer
per module. Two specialists may have *asked* at once and the patient picks.

THE BACKFILL IS THE DELICATE PART. Every existing relationship is a
psychotherapy one — the diet module has never had a specialist — so every row
is inserted with `module = 'psychotherapy'`, accepted rows first and pending
ones after. Two details worth knowing:

  * It is guarded by a lookup in `information_schema`, because this migration
    has to survive **both** orders. On an existing database the columns are
    there and hold data; on a fresh one `scripts/database_setup.sql` has already
    run and no longer creates them, so the SELECT would fail on a column that
    was never there. The guard is what makes `setup_dev.sh` work on both.

  * A row whose `specjalist_accepted_at` is NULL but whose `id_specjalist` is
    set predates 0011 (it was written by `mock_data.sql`, which is the only
    thing that ever set the column directly). Its date is not recoverable, and
    the two honest options are both imperfect: carry it over as *pending*, which
    revokes an access the patient may well have agreed to and which no screen
    explains, or date it from the account's own creation. This takes the second
    and says so here rather than inventing `now()`, which would claim the
    consent was given during a deployment.

REVERSIBLE, BUT NOT LOSSLESS, and that is stated rather than hidden: reversing
re-creates the three columns and copies back the psychotherapy relationships.
Any diet relationship simply has nowhere to go in the old schema — reversing
drops it, which is what "this schema cannot express two specialists" means.

user_db, so every `RunSQL` carries `hints={'target_db': 'default'}` —
`allow_migrate` receives `model_name=None` for RunSQL, and unhinted it would
also run against medical_db, where none of these tables exist.

`IF NOT EXISTS` throughout inside `SeparateDatabaseAndState`, matching every
migration since 0004: `scripts/database_setup.sql` declares the same table and
the documented setup order runs that script first.
"""

from django.db import migrations, models

import django.db.models.deletion
import uuid

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS specjalist_patient (
    id_specjalist_patient UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_specjalist UUID NOT NULL,
    id_user UUID NOT NULL,
    module TEXT NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_specjalist_patient_specjalist
        FOREIGN KEY (id_specjalist)
        REFERENCES specjalist (id_user)
        ON DELETE CASCADE,

    CONSTRAINT fk_specjalist_patient_patient
        FOREIGN KEY (id_user)
        REFERENCES patient (id_user)
        ON DELETE CASCADE,

    CONSTRAINT uniq_specjalist_patient_module
        UNIQUE (id_specjalist, id_user, module),

    CONSTRAINT specjalist_patient_module_known
        CHECK (module IN ('psychotherapy', 'diet'))
);

-- One *accepted* specialist per patient per module. Partial, so a patient may
-- hold two pending invitations in one module and choose between them.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_patient_module_accepted
    ON specjalist_patient (id_user, module)
    WHERE accepted_at IS NOT NULL;

-- The panel's own lookup: "this patient, in this module".
CREATE INDEX IF NOT EXISTS idx_specjalist_patient_module
    ON specjalist_patient (id_user, module);
"""

DROP_TABLE = """
DROP TABLE IF EXISTS specjalist_patient;
"""

# Every existing relationship is a psychotherapy one; see the module header for
# the `information_schema` guard and for what happens to a row with no date.
BACKFILL = """
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patient' AND column_name = 'id_specjalist'
    ) THEN
        INSERT INTO specjalist_patient
            (id_specjalist, id_user, module, accepted_at)
        SELECT
            p.id_specjalist, p.id_user, 'psychotherapy',
            COALESCE(p.specjalist_accepted_at, u.created_at, now())
        FROM patient p
        JOIN "user" u ON u.id_user = p.id_user
        WHERE p.id_specjalist IS NOT NULL
        ON CONFLICT DO NOTHING;

        INSERT INTO specjalist_patient
            (id_specjalist, id_user, module, accepted_at)
        SELECT p.id_specjalist_pending, p.id_user, 'psychotherapy', NULL
        FROM patient p
        WHERE p.id_specjalist_pending IS NOT NULL
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
"""

# The other direction. Only the psychotherapy rows can travel back — the old
# schema has no column a diet relationship would fit in.
RESTORE = """
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patient' AND column_name = 'id_specjalist'
    ) THEN
        UPDATE patient p
        SET id_specjalist = sp.id_specjalist,
            specjalist_accepted_at = sp.accepted_at
        FROM specjalist_patient sp
        WHERE sp.id_user = p.id_user
          AND sp.module = 'psychotherapy'
          AND sp.accepted_at IS NOT NULL;

        UPDATE patient p
        SET id_specjalist_pending = sp.id_specjalist
        FROM specjalist_patient sp
        WHERE sp.id_user = p.id_user
          AND sp.module = 'psychotherapy'
          AND sp.accepted_at IS NULL;
    END IF;
END $$;
"""

DROP_COLUMNS = """
DROP INDEX IF EXISTS idx_patient_id_specjalist;
DROP INDEX IF EXISTS idx_patient_id_specjalist_pending;

ALTER TABLE patient
    DROP CONSTRAINT IF EXISTS fk_patient_specjalist,
    DROP CONSTRAINT IF EXISTS fk_patient_specjalist_pending;

ALTER TABLE patient
    DROP COLUMN IF EXISTS id_specjalist,
    DROP COLUMN IF EXISTS id_specjalist_pending,
    DROP COLUMN IF EXISTS specjalist_accepted_at;
"""

RESTORE_COLUMNS = """
ALTER TABLE patient
    ADD COLUMN IF NOT EXISTS id_specjalist UUID,
    ADD COLUMN IF NOT EXISTS id_specjalist_pending UUID,
    ADD COLUMN IF NOT EXISTS specjalist_accepted_at TIMESTAMPTZ;

DO $$
BEGIN
    ALTER TABLE patient
        ADD CONSTRAINT fk_patient_specjalist
        FOREIGN KEY (id_specjalist) REFERENCES specjalist (id_user);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE patient
        ADD CONSTRAINT fk_patient_specjalist_pending
        FOREIGN KEY (id_specjalist_pending) REFERENCES specjalist (id_user);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_patient_id_specjalist
    ON patient (id_specjalist);

CREATE INDEX IF NOT EXISTS idx_patient_id_specjalist_pending
    ON patient (id_specjalist_pending);
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0021_health_profile'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name='SpecjalistPatient',
                    fields=[
                        ('id_specjalist_patient', models.UUIDField(
                            default=uuid.uuid4, editable=False,
                            primary_key=True, serialize=False,
                        )),
                        ('module', models.TextField()),
                        ('accepted_at', models.DateTimeField(blank=True, null=True)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('patient', models.ForeignKey(
                            db_column='id_user',
                            on_delete=django.db.models.deletion.CASCADE,
                            related_name='specjalist_links', to='core.patient',
                        )),
                        ('specjalist', models.ForeignKey(
                            db_column='id_specjalist',
                            on_delete=django.db.models.deletion.CASCADE,
                            related_name='patient_links', to='core.specjalist',
                        )),
                    ],
                    options={'db_table': 'specjalist_patient'},
                ),
                migrations.AddIndex(
                    model_name='specjalistpatient',
                    index=models.Index(
                        fields=['patient', 'module'],
                        name='idx_specjalist_patient_module',
                    ),
                ),
                migrations.AddConstraint(
                    model_name='specjalistpatient',
                    constraint=models.UniqueConstraint(
                        fields=('specjalist', 'patient', 'module'),
                        name='uniq_specjalist_patient_module',
                    ),
                ),
                migrations.AddConstraint(
                    model_name='specjalistpatient',
                    constraint=models.UniqueConstraint(
                        condition=models.Q(('accepted_at__isnull', False)),
                        fields=('patient', 'module'),
                        name='uniq_patient_module_accepted',
                    ),
                ),
                migrations.AddConstraint(
                    model_name='specjalistpatient',
                    constraint=models.CheckConstraint(
                        condition=models.Q(('module__in', ('psychotherapy', 'diet'))),
                        name='specjalist_patient_module_known',
                    ),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    CREATE_TABLE, DROP_TABLE, hints={'target_db': 'default'},
                ),
            ],
        ),
        # Data, not state: the rows move before the columns they came from go.
        migrations.RunSQL(BACKFILL, RESTORE, hints={'target_db': 'default'}),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RemoveField(model_name='patient', name='specjalist'),
                migrations.RemoveField(model_name='patient', name='specjalist_pending'),
                migrations.RemoveField(
                    model_name='patient', name='specjalist_accepted_at',
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    DROP_COLUMNS, RESTORE_COLUMNS, hints={'target_db': 'default'},
                ),
            ],
        ),
    ]
