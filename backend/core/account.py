"""What the "Profil" screen shows about the account behind the session.

The one module here that deliberately spans **both** databases, and the reason
it exists as a module rather than as a view: the counters are medical_db
(`patient.id_medical`) and the care relationship is user_db (`patient.specjalist`),
so somewhere the two halves have to meet, and the project's rule is that they
meet in application code rather than in a query. Keeping that meeting point in
one named place makes it reviewable — `core/dashboard.py`, `core/reports.py` and
`core/frequency.py` all still see nothing but a UUID.

Neither counter is computed here. `entry_count` is `diary.count_entries` and
`streak_days` is `dashboard.streak_days`, i.e. the same functions behind
`GET /api/diary/` and `GET /api/dashboard/home/`. That is the whole point of
reaching for them instead of writing two more queries: the profile is a summary
of screens the patient can open, and a summary that disagrees with the screen it
summarises is worse than no summary. The frontend used to hardcode `8 wpisów`
and `6 dni z rzędu` from the mockup's example patient.
"""

from .dashboard import streak_days
from .diary import count_entries


def _care(patient):
    """Who is treating this patient, or None when nobody is assigned yet.

    `patient.specjalist` is nullable (SET_NULL), and an unassigned patient is a
    perfectly ordinary state — an account can be registered before the first
    appointment. None rather than a row of blanks, so the screen can say so in
    words instead of drawing an empty card.

    WHAT THE COLUMNS ACTUALLY ARE. The frontend's `CareDetails` was written
    against the mockup and wants a name, a therapeutic approach ('CBT / DBT') and
    a phone number. Only the first exists as such. `approach` is mapped onto
    `specjalist.specjalization`, which is the closest thing the schema holds and
    is the detail line the safety plan prints under the therapist's name — it is
    *a* description of the specialist, not necessarily the nurt the mockup meant,
    so treat a difference there as a schema question rather than a mapping bug.
    There is no phone column anywhere; see the note on `phone` below.
    """
    specjalist = patient.specjalist
    if specjalist is None:
        return None

    # The name lives on the specialist's own `user` row, which is why this is
    # select_related in the caller rather than three queries.
    name = ' '.join(
        part for part in (specjalist.user.name, specjalist.user.surname) if part
    ).strip()

    return {
        # An assigned specialist with no name on their row is a broken record
        # rather than a missing relationship, so it is still reported as care —
        # with the e-mail, which every account has, instead of an empty line.
        'specialist': name or specjalist.user.email,
        'approach': specjalist.specjalization or None,
        # Always None: no table in this schema holds a specialist's phone
        # number. It is in the payload because the safety plan asks for it and
        # renders "bez numeru w planie" when it is absent — a key that is
        # honestly null beats a key the frontend has to guess the absence of.
        # Where that number should live (on `specjalist`, or on the plan the
        # specialist writes) is a decision for the specialist panel.
        'phone': None,
    }


def build_account_profile(patient):
    """The profile screen's own data, as JSON-ready primitives.

    Takes the `Patient` row rather than a UUID, because unlike every other
    aggregation in this project it needs the user_db half too. The caller has
    already resolved it from the session (`_require_patient`), so there is no
    patient id in the URL here either.
    """
    return {
        'activity': {
            'entry_count': count_entries(patient.id_medical),
            'streak_days': streak_days(patient.id_medical),
        },
        'care': _care(patient),
    }
