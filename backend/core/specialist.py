"""The specialist's side of the app: who they treat, in which module, and how
that link is made.

`specjalist_patient` is what the whole specialist view rests on — it decides
whose reports a specialist may open — and letting a specialist write it directly
is exactly what is *not* done here: a form that assigned patients on submit would
let any account holding a `specjalist` row read anybody's reports. Who holds one
is decided by another specialist (`core/colleagues.py`), which raises the bar on
getting into the panel at all — but it is not what protects the reports, and
nothing here leans on it.

So it is an invitation, in the same shape as the guardian one and for the same
reason: naming somebody is a request, and the person whose health data is at
stake is the one who answers it.

    accepted_at IS NULL   the specialist asked; nobody has answered
    accepted_at set       the patient agreed, at that moment
    no row                there is no relationship, and never a recorded "no"

ONE RELATIONSHIP PER MODULE, which is what this module gained when the table
replaced `patient.id_specjalist` (migration 0022). A patient may have a
psychotherapist and a psychodietitian at once — the client's visibility rule
speaks of "the specialists treating the patient" in the plural, and §13 of the
diet mockups draws both, told apart by a coloured dot. Before the table they
shared one column, so accepting the second invitation silently dropped the first
specialist's access.

**A MODULE IS A WALL, NOT A LABEL.** `assigned_patient` takes one and every
report URL passes it: a psychodietitian reads diet reports and cannot reach the
psychotherapy ones, which carry moods, risky-behaviour notes and the safety plan
— data the patient agreed to share with somebody else, in a different room. The
same rule in the other direction, and it is enforced per request rather than by
which screen the browser drew.

WHAT THE PATIENT CAN AND CANNOT DO WITH IT. They accept or refuse an invitation,
and that is where their say ends: **dropping an accepted link is the
specialist's action**. That is the client's rule, not a shortcut — with eating
disorders the tendency to hide information rises, so a patient-side "stop
sharing" would switch the reports off precisely in the cases they exist for (see
the TODO in frontend/src/pages/Reports.tsx, which has survived one attempt to
turn it into an opt-in already). A patient who wants out talks to the specialist,
who drops the link.

Kept out of the views so the rules can be tested without a request, like
core/guardian.py. Every function takes the row the session resolved to; there is
no specialist id on the wire anywhere.
"""

from django.db import transaction
from django.utils import timezone

from .account import build_child_activity, build_child_diet_activity
from .consents import has_active_consents
from .models import Patient, Specjalist, SpecjalistPatient
from .modules import MODULE_DIET, MODULE_PSYCHOTHERAPY, module_label

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
#: guardian account can only be invited for a minor. `consents_active` is here
#: because its absence is why there is nothing else — see `patient_locked`.
#:
#: `module` joined the list with migration 0022: a row is a relationship rather
#: than a person now, so the same patient can appear twice — once per module —
#: and a list that did not say which is which would be unreadable.
PATIENT_SUMMARY_FIELDS = (
    'name', 'surname', 'email', 'is_child', 'accepted_at', 'consents_active',
    'module', 'module_label', 'activity',
)

#: Which figures a row carries, per module.
#:
#: A psychodietitian reading "12 wpisów" about a diary they cannot open would be
#: told something about a patient's psychotherapy and given no way to act on it;
#: what they need is the food diary they *do* read. So the counters follow the
#: relationship, exactly as the reports do — one rule, applied to both halves of
#: the screen.
_ACTIVITY_BUILDERS = {
    MODULE_PSYCHOTHERAPY: build_child_activity,
    MODULE_DIET: build_child_diet_activity,
}


def patient_locked(patient):
    """Whether this patient has withdrawn the consent the app runs on.

    THE SECOND READER IS THE WHOLE REASON THIS EXISTS. `HasActiveConsents`
    (core/permissions.py) gates the account *making* a request, which was the
    only reader this app had: a patient reading their own data. The specialist
    panel introduced a second one, and the gate did not follow — a patient could
    withdraw both consents, watch their own diary answer 403, and their
    specialist would still be served the full weekly report, risky-behaviour note
    included. That is precisely what core/consents.py says withdrawal stops
    ("nothing is read, nothing is written, nothing is shown"), so the gate has to
    apply to the *subject* of the data as well as to the reader of it.

    `has_active_consents` is called rather than reimplemented, for the reason
    that function's own header gives: one comparison, in one place.
    """
    return not has_active_consents(patient.user)


def specjalist_for(user):
    """The `specjalist` row behind a session, or None.

    Specialist-ness is the existence of this row, not the role name on `user` —
    the same convention as `_require_patient`, which asks for a `patient` row
    rather than trusting `user_role`. The role is a nullable text column looked
    up by name from data `mock_data.sql` seeds; the row is what the panel
    actually needs, since every query below is keyed on it.
    """
    return Specjalist.objects.filter(user=user).select_related('user').first()


def _links(**filters):
    """Relationships matching the filter, with both people's rows, in a stable order.

    Takes only the filter, deliberately: `_links(specjalist, specjalist=...)` is
    a name collision waiting to happen, and the callers below are the only
    shapes this is ever asked for.
    """
    return (
        SpecjalistPatient.objects
        .filter(**filters)
        .select_related('patient__user')
        # Stable between requests, and the order a person would look for a name
        # in. The module comes last so one patient's two relationships sit
        # together rather than in two halves of the list.
        .order_by(
            'patient__user__surname', 'patient__user__name',
            'patient__user__email', 'module',
        )
    )


def accepted_links(specjalist, module=None):
    """The relationships this specialist's patients agreed to.

    `module=None` means every module, which is what the panel's own list wants:
    a specialist working in both sees both, each row saying which it is.
    """
    filters = {'specjalist': specjalist, 'accepted_at__isnull': False}
    if module is not None:
        filters['module'] = module
    return list(_links(**filters))


def pending_links(specjalist, module=None):
    """The invitations this specialist has sent that nobody has answered.

    Deliberately a separate list rather than a flag on the one above: a pending
    invitation grants nothing at all, and the panel has to be unable to show a
    report for one by mistake.
    """
    filters = {'specjalist': specjalist, 'accepted_at__isnull': True}
    if module is not None:
        filters['module'] = module
    return list(_links(**filters))


def assigned_patient(specjalist, patient_user_id, module):
    """One accepted patient of this specialist **in `module`**, or None.

    The gate on every report URL, and `module` is not decoration: it is what
    stops a psychodietitian opening a psychotherapy report of a patient they
    genuinely treat. A specialist who treats somebody in both modules holds two
    rows and passes this check twice, once per module — which is the difference
    between "two relationships" and "one relationship meaning everything".

    `specjalist=specjalist` alongside the id is what makes somebody else's
    patient answer exactly like a nonexistent one (404 — a 403 would confirm the
    account is real), the same convention as /api/diary/<id>/. A *pending*
    patient is None here: being asked is not consenting, and a report is the
    thing consent is about.
    """
    link = (
        SpecjalistPatient.objects
        .filter(
            specjalist=specjalist, patient_id=patient_user_id, module=module,
            accepted_at__isnull=False,
        )
        .select_related('patient__user')
        .first()
    )
    return None if link is None else link.patient


def treated_patient(specjalist, patient_user_id, module=None):
    """This specialist's accepted patient, in `module` or in **any** module.

    `assigned_patient` above is the gate on the report URLs and always names a
    module, because a report belongs to one. This is for the flows that do not:
    issuing a guardian code is a fact about a family, not about a diary, and a
    psychodietitian sitting with a parent and a child is as able to vouch for
    them as a psychotherapist is. Requiring a module there would have made the
    code depend on which half of the app the specialist happens to treat the
    child in, which is not what the code is about.
    """
    links = SpecjalistPatient.objects.filter(
        specjalist=specjalist, patient_id=patient_user_id, accepted_at__isnull=False,
    )
    if module is not None:
        links = links.filter(module=module)
    link = links.select_related('patient__user').first()
    return None if link is None else link.patient


def serialize_link(link, *, activity=False):
    """One row of the specialist's patient list. See PATIENT_SUMMARY_FIELDS.

    `id` is the patient's `user` id, which is what the report URLs carry.
    Deliberately **not** `id_medical`: that is the pseudonymized key medical_db
    is keyed on, and putting it on the wire would hand the browser the join the
    two-database split exists to keep apart. Nor is it the link's own id — the
    panel addresses a patient in a module, and an opaque row id would be a second
    way to name the same thing.
    """
    patient = link.patient
    locked = patient_locked(patient)
    return {
        'id': str(patient.user_id),
        'name': patient.user.name,
        'surname': patient.user.surname,
        'email': patient.user.email,
        'is_child': patient.is_child,
        'module': link.module,
        # The module named in words, because this row is read by a person and
        # 'psychotherapy' is not one of the app's words. `core/modules.py` holds
        # the mapping, so the panel and the invitation card cannot disagree.
        'module_label': module_label(link.module),
        'accepted_at': link.accepted_at.isoformat() if link.accepted_at else None,
        # Reported because a specialist who simply saw no new reports would
        # assume the patient had stopped writing. That an account is locked is a
        # fact about the account, not about anybody's health — and it is the
        # answer to "why is there nothing here".
        'consents_active': not locked,
        # None on a pending row (nothing about a diary is reported before its
        # owner has agreed to this specialist) and None on a locked one: the
        # figures are derived from the diary, so producing them would be the
        # processing the withdrawal stopped. Which diary is the module's own —
        # see _ACTIVITY_BUILDERS.
        'activity': (
            _ACTIVITY_BUILDERS[link.module](patient)
            if activity and not locked and link.module in _ACTIVITY_BUILDERS
            else None
        ),
    }


def build_patient_list(specjalist, module=None):
    """The panel's own payload: who is accepted, who has been asked.

    The two halves are separate keys rather than one list with a status, so a
    screen (or a future endpoint) cannot render a pending patient as a treated
    one by forgetting to read a field.
    """
    return {
        'patients': [
            serialize_link(link, activity=True)
            for link in accepted_links(specjalist, module)
        ],
        'pending': [
            serialize_link(link) for link in pending_links(specjalist, module)
        ],
    }


def invite(specjalist, patient, module):
    """Ask `patient` to be treated by `specjalist` in `module`.

    Idempotent on purpose: asking again is the same request arriving twice (a
    double-tapped button, or a specialist who cannot remember whether they
    already did), so an existing invitation is returned rather than duplicated —
    and an *accepted* relationship is left exactly as it is, because re-asking
    must never reset a consent that has already been given.
    """
    link, _ = SpecjalistPatient.objects.get_or_create(
        specjalist=specjalist, patient=patient, module=module,
    )
    return link


def care_for(patient, module):
    """Who is treating `patient` in `module`, as the profile card names them, or None.

    The replacement for reading `patient.specjalist` off the row: with the
    relationship in its own table, "my specialist" is a question that needs the
    module, and the two profile screens each ask for their own. /profile asks
    for the psychotherapy one, /diet/profile for the diet one — which is what
    §13 draws.
    """
    link = (
        SpecjalistPatient.objects
        .filter(patient=patient, module=module, accepted_at__isnull=False)
        .select_related('specjalist__user')
        .first()
    )
    return None if link is None else link.specjalist


def pending_invitations(patient):
    """Every invitation waiting for this patient's answer, newest module first.

    A LIST RATHER THAN THE ONE ROW it used to be, and not only because the table
    allows more: a patient can genuinely be asked by a psychotherapist and a
    psychodietitian in the same week, and a screen that could show one of them
    would leave the other waiting on an answer the patient was never offered.

    Each entry names the specialist the way the care card on "Profil" names them
    — a person, with the specialization they entered at registration — because
    agreeing to be treated by somebody is a decision about a person, and an
    e-mail address alone is not one. It also names the module, because agreeing
    to a psychodietitian is not agreeing to hand over a psychotherapy diary.
    """
    links = (
        SpecjalistPatient.objects
        .filter(patient=patient, accepted_at__isnull=True)
        .select_related('specjalist__user')
        .order_by('module', 'created_at')
    )
    return [serialize_invitation(link) for link in links]


def serialize_invitation(link):
    """One pending invitation, as the patient's own screen shows it."""
    specjalist = link.specjalist
    name = ' '.join(
        part for part in (specjalist.user.name, specjalist.user.surname) if part
    ).strip()
    return {
        'id': str(link.pk),
        # An assigned specialist with no name on their row is a broken record
        # rather than a missing one, so it still reports as an invitation — with
        # the address, which every account has, instead of an empty line.
        'specialist': name or specjalist.user.email,
        'email': specjalist.user.email,
        'approach': specjalist.specjalization or None,
        'module': link.module,
        'module_label': module_label(link.module),
    }


def accept_invitation(patient, invitation_id):
    """The patient agrees to one invitation. False when there is no such one.

    **ACCEPTING REPLACES WHOEVER WAS TREATING THEM IN THAT MODULE**, and nothing
    else: the other module's relationship is untouched, which is the whole point
    of the module column. That replacement is the rule the old single FK enforced
    by accident and the only part of it worth keeping — "kto mnie prowadzi" has
    one answer per module — and the database agrees (`uniq_patient_module_accepted`),
    so it is done here in the open rather than left to a constraint violation.

    Accepting twice is the same answer arriving twice (a double-clicked button),
    not an error — so an already-accepted row succeeds rather than reporting a
    problem the patient cannot do anything about.
    """
    link = SpecjalistPatient.objects.filter(
        pk=invitation_id, patient=patient,
    ).first()
    if link is None:
        return False
    if link.accepted_at is not None:
        return True

    with transaction.atomic(using='default'):
        # The previous specialist in this module loses the link, exactly as they
        # did when accepting overwrote `patient.id_specjalist`. The difference is
        # that it can no longer reach across modules.
        SpecjalistPatient.objects.filter(
            patient=patient, module=link.module, accepted_at__isnull=False,
        ).exclude(pk=link.pk).delete()
        link.accepted_at = timezone.now()
        link.save(update_fields=['accepted_at'])
    return True


def reject_invitation(patient, invitation_id):
    """The patient refuses, and nothing records the refusal. False when there is none.

    The row is deleted and no third state is written, exactly as `parent_child`
    deletes a refused invitation (0007): a stored "no" would be a state nobody in
    the app can act on, while an absent invitation simply lets the specialist ask
    again after talking to them.

    Filtering on `accepted_at__isnull=True` means an accepted relationship is not
    refusable here — it is not the patient's to undo (see the module header).
    """
    deleted, _ = SpecjalistPatient.objects.filter(
        pk=invitation_id, patient=patient, accepted_at__isnull=True,
    ).delete()
    return bool(deleted)


def drop_link(specjalist, patient_user_id, module):
    """The specialist ends the relationship, or withdraws the request. False when
    there is neither.

    Both directions in one call, because from the specialist's side they are one
    gesture ("this is not my patient") and the panel shows the two lists as one
    thing. `module` is required: a specialist treating somebody in both modules
    is ending one of two relationships, and guessing which would be a guess about
    somebody's care.
    """
    deleted, _ = SpecjalistPatient.objects.filter(
        specjalist=specjalist, patient_id=patient_user_id, module=module,
    ).delete()
    return bool(deleted)


def patient_for_user_id(patient_user_id):
    """The `patient` row an invitation is about, or None. A thin helper so the
    serializer does not import the model for one lookup."""
    return Patient.objects.filter(user_id=patient_user_id).first()
