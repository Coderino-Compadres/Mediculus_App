"""`patient.diet_week_start` — where a patient's *diet* weeks are counted from.

THE TWO MODULES DISAGREE ABOUT WHAT A WEEK IS, and that is the client's
decision rather than an inconsistency to tidy up. The psychotherapy report
covers a Monday-to-Sunday week (`core/reports.py` `start_of_week`). The diet
module counts seven days from the patient's *first entry*: both of her mockup
sets put the sentence on the artboard ("Tydzień liczony od pierwszego wpisu… a
nie od poniedziałku") and she said it out loud — "jeśli dzienniczki są
rozpoczęte od wtorku, to do następnego wtorku". So a diet week that starts on a
Tuesday runs Tuesday to Monday, and Monday means nothing there.

WHY THE ANCHOR IS STORED RATHER THAN DERIVED. `frontend/src/utils/dietWeeks.ts`
carries the argument as a TODO(backend) and it is exact: derived per request —
a MIN over the diaries, which is what the browser did while there was no
endpoint — every week boundary, and therefore every week *id*, becomes a
function of whatever history happens to be in hand. A diary anchored on 27
August yields 'week-2026-08-27' and 'week-2026-09-10'; one older meal turns
those into 'week-2026-08-26' and 'week-2026-09-09'. Bookmarks break, and once a
specialist can open one of these, so does the identity of a document two people
are discussing. The psychotherapy module has no such problem because Monday is
not derived from anything.

WHY IT IS ON `patient` AND NOT IN medical_db. It is a fact about the patient's
account rather than a clinical record, it is one date, and the views that need
it already hold the `Patient` row (`_require_patient` returns it). So the report
builder is handed the date as an argument and goes on seeing nothing but a UUID
and a day — the arrangement `core/reports.py` has, and the reason `core/
account.py` stays the only module in the project that reads both databases.

**IT IS DELIBERATELY NOT BACKFILLED.** NULL is the honest value for every
existing row: it means "not latched yet", not "no entries". `core/diet_reports.
latch_week_start` fills it on first use from an exact MIN over the four diet
diaries, which is correct for accounts that already have history and costs
nothing for accounts that do not. A backfill here would have had to run the
same query inside a migration, against the *other* database, which
`allow_migrate` cannot express in one operation.

user_db, so the `RunSQL` carries `hints={'target_db': 'default'}` —
`allow_migrate` receives `model_name=None` for RunSQL, and unhinted it would
also run against medical_db, where `patient` does not exist.

`ADD COLUMN IF NOT EXISTS` inside a `SeparateDatabaseAndState`, matching every
migration since 0004: `scripts/database_setup.sql` declares the same column and
the documented setup order runs that script first.
"""

from django.db import migrations, models

FORWARD = """
-- Where this patient's diet weeks are counted from: the day of their first
-- entry in that module, and rarely a Monday. See the migration docstring --
-- the psychotherapy module goes on counting Mondays and the two are meant to
-- differ.
--
-- NULL means "not latched yet". The API fills it once, from the earliest day
-- the patient's diet diaries hold, and nothing moves it afterwards: a derived
-- anchor renumbers every report the moment the oldest entry changes.
ALTER TABLE patient
    ADD COLUMN IF NOT EXISTS diet_week_start DATE;
"""

BACKWARD = """
ALTER TABLE patient
    DROP COLUMN IF EXISTS diet_week_start;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0018_diet_activity_sleep'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='patient',
                    name='diet_week_start',
                    field=models.DateField(blank=True, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    FORWARD, BACKWARD, hints={'target_db': 'default'},
                ),
            ],
        ),
    ]
