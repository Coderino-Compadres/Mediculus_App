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

from django.utils import timezone

from .consents import has_active_consents
from .dashboard import streak_days
from .diary import count_entries, last_entry_date
from .reports import build_weekly_reports


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


#: What the guardian's summary reports about a linked child.
#:
#: SPELLED OUT AS A LIST BECAUSE THE OMISSIONS ARE THE DESIGN. A guardian sees
#: whether their child is using the app — how much has been written, whether
#: there is a run going, when the last entry was — and nothing about what any of
#: it says. No mood, no emotions, no stress or energy, no risky-behaviour flag,
#: no report figures, no entry text, and no `id_medical`.
#:
#: That split is not squeamishness, it is the feature. The diary is health data a
#: minor writes about themselves, and a minor who knows a parent reads it writes
#: a different diary — which is the failure mode this app can least afford, in
#: the same way the client described for eating disorders when she refused to let
#: a patient cut the specialist off (see pages/Reports.tsx). Engagement is what a
#: guardian needs in order to do their job: notice that their child has stopped,
#: and ask. Content is a clinical decision nobody has made yet, and the day it is
#: made this is the list to change.
CHILD_SUMMARY_FIELDS = ('entry_count', 'streak_days', 'last_entry_date')

#: How many flagged days in one weekly report put an attention marker on the
#: child's card. Client's number.
#:
#: A threshold rather than an exact count: a week with five flagged days must
#: not be quieter than a week with three, which would be the worst way for this
#: feature to be wrong.
RISKY_DAYS_FOR_ATTENTION = 3

#: THE ONE THING THE GUARDIAN'S CARD SAYS ABOUT CONTENT, and the exception to
#: everything written above CHILD_SUMMARY_FIELDS. Decided by the client:
#: a marker next to the child's name when their **most recent weekly report**
#: flagged `RISKY_DAYS_FOR_ATTENTION` days or more with a risky behaviour.
#:
#: WHY IT IS A BOOLEAN ON THE WIRE. The count is deliberately not sent, and
#: neither is the reason: the payload carries "this report wants your attention"
#: and nothing that says what happened, how often, or on which days. So the
#: panel *cannot* start rendering "3 dni z zachowaniem ryzykownym" without a
#: backend change and a decision to go with it — which is the point, because
#: every step past this line is a decision about how much of a minor's diary a
#: parent reads, and the client has taken exactly one of them.
#:
#: WHY IT IS RISKY DAYS AND NOT "HARDER DAYS". A flagged day is one the patient
#: described as a risky behaviour in their own words; harder days are the two
#: lowest moods of the week, computed. Three hard days out of seven is an
#: ordinary bad week, and a marker that fired on one would stop meaning
#: anything — which is the failure mode of every alert.
#:
#: WHAT IT COSTS. `build_weekly_reports` derives every report to hand back the
#: newest one, per child. That is deliberate: "the last report" has to mean the
#: same week here, on the patient's own Raporty screen and on the specialist's
#: copy, and the only way to guarantee that is to ask the same function. A
#: guardian has a handful of children and the history is capped
#: (MAX_HISTORY_ENTRIES), so the cost is bounded; if this ever needs to be
#: cheaper, the fix is a narrower function in core/reports.py that both callers
#: use, never a second definition of which week is last.
CHILD_ATTENTION_FIELD = 'needs_attention'


def build_child_activity(patient):
    """How much a child has been writing — never what.

    None when the linked account has no `patient` row at all. That should not
    happen (a minor registers as a patient), but `parent_child` will hold a link
    to any user, and zeroes would be a claim about a diary that does not exist
    rather than one that is empty.
    """
    if patient is None:
        return None
    last = last_entry_date(patient.id_medical)
    return {
        'entry_count': count_entries(patient.id_medical),
        'streak_days': streak_days(patient.id_medical),
        'last_entry_date': None if last is None else last.isoformat(),
    }


def last_report_needs_attention(patient, today=None):
    """Whether this child's newest weekly report flagged enough days to say so.

    False for a child with no `patient` row, and False when no week has ended
    with entries in it — there is no report, so there is nothing to be quiet or
    loud about. See CHILD_ATTENTION_FIELD for why this answers with a boolean
    and nothing else.
    """
    if patient is None:
        return False
    reports = build_weekly_reports(patient.id_medical, today or timezone.localdate())
    if not reports:
        return False
    # [0] is the newest: build_weekly_reports returns them newest first.
    return len(reports[0]['risky_days']) >= RISKY_DAYS_FOR_ATTENTION


def build_linked_children(links, patients_by_user):
    """One summary per accepted link, for the parent panel's home screen.

    Takes the rows rather than fetching them, so the caller can resolve every
    child's `patient` row in one query instead of one per child — and so this
    stays a shaping function with no idea who is asking.

    The identity half comes from the child's `user` row and the activity half
    from medical_db; like `build_account_profile` above, the two only meet here.

    **A CHILD WHOSE CONSENTS ARE WITHDRAWN GETS NO FIGURES.** `HasActiveConsents`
    gates the account making a request, and a guardian is a *second* reader of
    somebody else's data — so without this check the app went on deriving a
    locked account's entry count and streak from its diary and showing them to
    another person, which is exactly the processing withdrawal stops (see the
    header of core/consents.py). `consents_active` travels so the screen can say
    why the figures are missing: "to konto nie prowadzi dzienniczka" would be a
    false statement about an account that has one and has stopped it.

    The same hole existed on the specialist's side and is closed the same way —
    see `specialist.patient_locked`, which calls the same `has_active_consents`.
    """
    return [_linked_child(link, patients_by_user) for link in links]


def _linked_child(link, patients_by_user):
    """One row of the list above. Its own function so the consent check is read
    once per child rather than twice in one dict literal."""
    active = has_active_consents(link.child)
    patient = patients_by_user.get(link.child_id)
    return {
        'id': str(link.pk),
        'child_name': link.child.name,
        'child_surname': link.child.surname,
        'child_email': link.child.email,
        # When this guardian accepted, which is the moment the link (and the
        # art. 8 consent behind it) started — not when the account was made.
        'linked_at': link.accepted_at.isoformat() if link.accepted_at else None,
        'consents_active': active,
        'activity': build_child_activity(patient) if active else None,
        # Withdrawn consents mean the app has stopped reading this diary at all,
        # so there is nothing to raise a marker from either — the same rule as
        # the figures above, and for a stronger reason: this one is about content.
        CHILD_ATTENTION_FIELD: last_report_needs_attention(patient) if active else False,
    }
