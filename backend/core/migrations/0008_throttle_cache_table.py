"""Creates the table `CACHES['default']` counts throttle hits in.

A migration rather than a documented `manage.py createcachetable` step, because
a setup step nobody runs is how the cap silently goes back to being per-worker:
without the table every cache write raises, and DRF's throttle treats a cache it
cannot read as "no history" — i.e. it fails open. Running `migrate` is already
in the setup sequence for both databases, so this rides along with it.

The table is deliberately absent from `scripts/database_setup.sql`, which is
otherwise the other source of truth for `user_db`: it holds no domain data and
has no model, and `test_schema_sync.py` compares that script against
`core.models` table by table.

`hints={'target_db': 'default'}` for the usual reason (see 0002): `allow_migrate`
receives `model_name=None` for RunPython and has nothing else to route on, so an
unhinted operation runs against medical_db as well.
"""

from django.core.management import call_command
from django.db import migrations

# Kept in step with settings.THROTTLE_CACHE_TABLE by
# test_migrations.ThrottleCacheTableTests — a migration should not read settings
# that can change under it, so the name is written out here and checked there.
TABLE = 'throttle_cache'


def create_cache_table(apps, schema_editor):
    """Idempotent: `createcachetable` returns early when the table exists.

    That matters because the test runner calls the same command on its own while
    building each test database, and because re-running a migration on a
    database that predates it must not fail.
    """
    call_command(
        'createcachetable', TABLE,
        database=schema_editor.connection.alias, verbosity=0,
    )


def drop_cache_table(apps, schema_editor):
    schema_editor.execute(f'DROP TABLE IF EXISTS "{TABLE}"')


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0007_parent_child_accepted_at'),
    ]

    operations = [
        migrations.RunPython(
            create_cache_table, drop_cache_table, hints={'target_db': 'default'},
        ),
    ]
