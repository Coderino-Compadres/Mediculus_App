"""`safety_plan` — the patient's own safety plan, one row per patient.

The screen showed a hardcoded example plan to every account and had no write
path; this is the table it writes to now, and the patient is who writes it
(see `core.models.SafetyPlan` and core/safety_plan.py).

medical_db only, like `health_profile` (0021), and for the same reason: it is
clinical content filed under the pseudonymous `id_medical`. `CREATE TABLE IF NOT
EXISTS` inside a `SeparateDatabaseAndState`, and the `RunSQL` carries
`hints={'target_db': 'medical'}` — unhinted, `allow_migrate` would also run it
against user_db.
"""

import uuid

from django.db import migrations, models

FORWARD = """
CREATE TABLE IF NOT EXISTS safety_plan (
    id_safety_plan UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- safety_plan.id_medical -> user_db.patient.id_medical (logical only).
    -- UNIQUE: one plan per patient belongs to the schema, not to the API.
    id_medical UUID UNIQUE NOT NULL,
    warning_signs JSONB NOT NULL DEFAULT '[]'::jsonb,
    coping_strategies JSONB NOT NULL DEFAULT '[]'::jsonb,
    trusted_people JSONB NOT NULL DEFAULT '[]'::jsonb,
    professional_contact JSONB,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""

BACKWARD = """
DROP TABLE IF EXISTS safety_plan;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0027_diet_techniques'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name='SafetyPlan',
                    fields=[
                        ('id_safety_plan', models.UUIDField(
                            default=uuid.uuid4, editable=False,
                            primary_key=True, serialize=False,
                        )),
                        ('id_medical', models.UUIDField(unique=True)),
                        ('warning_signs', models.JSONField(blank=True, default=list)),
                        ('coping_strategies', models.JSONField(blank=True, default=list)),
                        ('trusted_people', models.JSONField(blank=True, default=list)),
                        ('professional_contact', models.JSONField(blank=True, null=True)),
                        ('notes', models.TextField(blank=True, null=True)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('updated_at', models.DateTimeField(auto_now=True)),
                    ],
                    options={'db_table': 'safety_plan'},
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    FORWARD, BACKWARD, hints={'target_db': 'medical'},
                ),
            ],
        ),
    ]
