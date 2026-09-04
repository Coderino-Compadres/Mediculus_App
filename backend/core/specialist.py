"""The specialist's side of the app: who they treat, and how that link is made.

`patient.id_specjalist` is what the whole specialist view rests on — it decides
whose weekly reports a specialist may open — and until this module existed it
was written by `scripts/mock_data.sql` and by nothing else. Letting a specialist
write it directly was the obvious next step and is exactly what is *not* done
here: registration is self-service (`ACCOUNT_TYPE_SPECIALIST` in
core/serializers.py), so a form that assigned patients on submit would let any
account calling itself a specialist read anybody's reports.

So it is an invitation, in the same shape as the guardian one and for the same
reason: naming somebody is a request, and the person whose health data is at
stake is the one who answers it.

    id_specjalist_pending   the specialist who asked
    id_specjalist           the specialist treating this patient
    specjalist_accepted_at  when the patient agreed to the column above

WHAT THE PATIENT CAN AND CANNOT DO WITH IT. They accept or refuse an invitation,
and that is where their say ends: **dropping an accepted link is the
specialist's action**. That is the client's rule, not a shortcut — with eating
disorders the tendency to hide information rises, so a patient-side "stop
sharing" would switch the reports off precisely in the cases they exist for (see
the TODO in frontend/src/pages/Reports.tsx, which has survived one attempt to
turn it into an opt-in already). A patient who wants out talks to the specialist,
who drops the link.

ONE SPECIALIST PER PATIENT, because `id_specjalist` is a single foreign key.
That is a real limitation rather than a decision: the app has two modules
(psychotherapy and psychodietetics) and the visibility rule the client gave
speaks of "the specialists treating the patient" in the plural, so a patient
seeing a psychotherapist and a dietitian cannot be expressed today. Making it
many-to-many is a schema change (a `specjalist_patient` table) plus a rewrite of
the care card on "Profil", and it is the first thing to do here if the client
confirms the plural.

Kept out of the views so the rules can be tested without a request, like
core/guardian.py. Every function takes the row the session resolved to; there is
no specialist id on the wire anywhere.
"""

from django.utils import timezone

from .account import build_child_activity
from .models import Patient, Specjalist

#: What the specialist's patient list reports about each patient, spelled out
#: because the line is the design rather than an accident of what was handy.
#:
#: Identity and engagement, and no clinical content: who this is, whether they
#: are writing, when they last did. The content lives one screen further in, in
#: the weekly reports — which the specialist is entitled to read (the client's
#: rule) but which are a document you open deliberately, not a figure sitting in
#: a list next to nine other patients' figures.
#:
#: `is_child` is here because it changes what the specialist can do next: a
#: guardian account can only be invited for a minor.
PATIENT_SUMMARY_FIELDS = (
    'name', 'surname', 'email', 'is_child', 'accepted_at', 'activity',
)


def specjalist_for(user):
    """The `specjalist` row behind a session, or None.

    Specialist-ness is the existence of this row, not the role name on `user` —
    the same convention as `_require_patient`, which asks for a `patient` row
    rather than trusting `user_role`. The role is a nullable text column looked
    up by name from data `mock_data.sql` seeds; the row is what the panel
    actually needs, since every query below is keyed on it.
    """
    return Specjalist.objects.filter(user=user).select_related('user').first()


def _patients(**filters):
    """Patients matching one of the two specialist columns, in a stable order.

    Takes only the filter, deliberately: `_patients(specjalist, specjalist=...)`
    is a name collision waiting to happen, and the callers below are the only
    two shapes this is ever asked for.
    """
    return (
        Patient.objects
        .filter(**filters)
        .select_related('user')
        # Stable between requests, and the order a person would look for a name
        # in. `patient` has no created_at to order by.
        .order_by('user__surname', 'user__name', 'user__email')
    )


def accepted_patients(specjalist):
    """The patients who agreed to be treated by this specialist."""
    return list(_patients(specjalist=specjalist))


def pending_patients(specjalist):
    """The patients this specialist has asked, who have not answered.

    Deliberately a separate list rather than a flag on the one above: a pending
    invitation grants nothing at all, and the panel has to be unable to show a
    report for one by mistake.
    """
    return list(_patients(specjalist_pending=specjalist))


def assigned_patient(specjalist, patient_user_id):
    """One accepted patient of this specialist, or None.

    The gate on every report URL. `specjalist=specjalist` alongside the id is
    what makes somebody else's patient answer exactly like a nonexistent one
    (404 — a 403 would confirm the account is real), the same convention as
    /api/diary/<id>/. A *pending* patient is None here: being asked is not
    consenting, and a report is the thing consent is about.
    """
    return (
        Patient.objects
        .filter(user_id=patient_user_id, specjalist=specjalist)
        .select_related('user')
        .first()
    )


def serialize_patient(patient, *, activity=None):
    """One row of the specialist's patient list. See PATIENT_SUMMARY_FIELDS.

    `id` is the patient's `user` id, which is what the report URLs carry.
    Deliberately **not** `id_medical`: that is the pseudonymized key medical_db
    is keyed on, and putting it on the wire would hand the browser the join the
    two-database split exists to keep apart.
    """
    return {
        'id': str(patient.user_id),
        'name': patient.user.name,
        'surname': patient.user.surname,
        'email': patient.user.email,
        'is_child': patient.is_child,
        'accepted_at': (
            patient.specjalist_accepted_at.isoformat()
            if patient.specjalist_accepted_at else None
        ),
        # None on a pending row: nothing about a diary is reported before its
        # owner has agreed to this specialist.
        'activity': build_child_activity(patient) if activity else None,
    }


def build_patient_list(specjalist):
    """The panel's own payload: who is accepted, who has been asked.

    The two halves are separate keys rather than one list with a status, so a
    screen (or a future endpoint) cannot render a pending patient as a treated
    one by forgetting to read a field.
    """
    return {
        'patients': [
            serialize_patient(patient, activity=True)
            for patient in accepted_patients(specjalist)
        ],
        'pending': [
            serialize_patient(patient) for patient in pending_patients(specjalist)
        ],
    }


def pending_invitation(patient):
    """The invitation waiting for this patient's answer, or None.

    What the patient's own screen shows. The specialist is named the way the
    care card on "Profil" names them — a person, with the specialization they
    entered at registration — because agreeing to be treated by somebody is a
    decision about a person, and an e-mail address alone is not one.
    """
    specjalist = patient.specjalist_pending
    if specjalist is None:
        return None
    name = ' '.join(
        part for part in (specjalist.user.name, specjalist.user.surname) if part
    ).strip()
    return {
        # An assigned specialist with no name on their row is a broken record
        # rather than a missing one, so it still reports as an invitation — with
        # the address, which every account has, instead of an empty line.
        'specialist': name or specjalist.user.email,
        'email': specjalist.user.email,
        'approach': specjalist.specjalization or None,
    }


def accept_invitation(patient):
    """The patient agrees. False when there is nothing to agree to.

    Moves the id out of the pending column rather than copying it, so the two
    columns can never both be set: "asked" and "treating" are phases, not
    parallel facts. Accepting an invitation from the specialist a patient already
    has is the same answer arriving twice (a double-tapped button) — the row ends
    up the same either way.
    """
    specjalist_id = patient.specjalist_pending_id
    if specjalist_id is None:
        return False
    patient.specjalist_id = specjalist_id
    patient.specjalist_pending = None
    patient.specjalist_accepted_at = timezone.now()
    patient.save(update_fields=[
        'specjalist', 'specjalist_pending', 'specjalist_accepted_at',
    ])
    return True


def reject_invitation(patient):
    """The patient refuses, and nothing records the refusal. False when there is none.

    The pending column is cleared and no third state is written, exactly as
    `parent_child` deletes a refused invitation (0007): a stored "no" would be a
    state nobody in the app can act on, while an absent invitation simply lets
    the specialist ask again after talking to them. An accepted link is
    untouched by this — it is not the patient's to undo (see the module header).
    """
    if patient.specjalist_pending_id is None:
        return False
    patient.specjalist_pending = None
    patient.save(update_fields=['specjalist_pending'])
    return True


def drop_link(specjalist, patient_user_id):
    """The specialist ends the relationship, or withdraws the request. False when
    there is neither.

    Both directions in one call, because from the specialist's side they are one
    gesture ("this is not my patient") and the panel shows the two lists as one
    thing. `specjalist_accepted_at` is cleared with the link: it is the moment
    the patient agreed to *this* specialist, so leaving it behind would date an
    assignment that no longer exists.
    """
    patient = Patient.objects.filter(user_id=patient_user_id).first()
    if patient is None:
        return False

    fields = []
    if patient.specjalist_id == specjalist.pk:
        patient.specjalist = None
        patient.specjalist_accepted_at = None
        fields += ['specjalist', 'specjalist_accepted_at']
    if patient.specjalist_pending_id == specjalist.pk:
        patient.specjalist_pending = None
        fields.append('specjalist_pending')

    if not fields:
        return False
    patient.save(update_fields=fields)
    return True
