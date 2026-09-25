"""The administrator's panel: the final word on a specialist account, and a
read-only look at who is in the database.

TWO JOBS, AND NOTHING ELSE.

1. **Approving a specialist account.** A colleague creating the account
   (core/colleagues.py) vouches for the person; the administrator is the
   foundation's own confirmation. Until `specjalist.approved_at` is set the
   account signs in, grants its consents and replaces its generated password —
   the gates it has to clear anyway — and then meets `_require_specialist`,
   which refuses it the whole panel: no patients, no invitations, no guardian
   codes, no techniques, no new colleagues. Approving sets the column. Rejecting
   **deletes the account**, signs it out everywhere, and leaves one trace: the
   entry in the audit log, which keeps the name and address as text.

2. **Looking at the data**, read-only, and only user_db's. Accounts, roles, who
   treats whom and who vouches for whom — the identity half of the schema. From
   medical_db the panel reads **counts and dates only** (how many diary entries,
   when the last meal was written), never a single entry's content: the
   pseudonymisation between the two databases is what keeps clinical data
   unreadable to anybody who is not treating the patient, and an administrator is
   not. Nothing here writes to medical_db at all.

WHO IS AN ADMINISTRATOR. Whoever has an `administrator` row, the same convention
as `specjalist` and `patient`: the role name on `user` is for display. No
endpoint creates one — `manage.py create_admin` does, from the server's shell,
for the reason core/colleagues.py gives about the first specialist: an endpoint
that could mint the first administrator could mint the tenth. An administrator
is nobody else; the command refuses an account that is a patient, a specialist
or a guardian.

THE AUDIT LOG (`admin_audit_log`). Every read of personal data and every
decision is recorded with who, what, about whom, and when — RODO art. 5(2) makes
us able to show who has seen a person's account, and the minors in this
database make that more than a formality. Decisions are always written; reads
are written once per administrator, action and account within
`AUDIT_READ_WINDOW`, so opening the same screen twice in a minute is one entry
rather than a log nobody can read.

Kept out of the views so the rules can be tested without a request, like
core/guardian.py and core/colleagues.py.
"""

import datetime

from django.db import transaction
from django.db.models import Count, Max
from django.utils import timezone

from .authentication import end_all_sessions
from .consents import has_active_consents
from .guardian import STATUS_ACCEPTED, STATUS_NONE, STATUS_PENDING
from .models import (Administrator, AdminAuditLog, DietActivity, DietMeal,
                     DietSleep, Diary, HealthProfile, Hydration, ParentChild,
                     Patient, Specjalist, SpecjalistPatient, Supplement, User)
from .modules import MODULE_DIET, MODULE_PSYCHOTHERAPY, module_label

#: The role name an administrator account carries. Display only — see the
#: module header.
ADMIN_ROLE = 'admin'

#: Mirrors GUARDIAN_ROLE in core/serializers.py, spelled here rather than
#: imported so this module does not depend on the serializers.
GUARDIAN_ROLE = 'rodzic'

#: What kind of account a row is, as the panel files it. One word per account,
#: asked in this order: the side tables first, because they are what authorizes,
#: and the role last, because a guardian has no side table.
KIND_ADMIN = 'admin'
KIND_SPECIALIST = 'specialist'
KIND_PATIENT = 'patient'
KIND_GUARDIAN = 'guardian'
KIND_OTHER = 'other'
KINDS = (KIND_ADMIN, KIND_SPECIALIST, KIND_PATIENT, KIND_GUARDIAN, KIND_OTHER)

#: What the audit log records. The frontend has the labels
#: (src/api/admin.ts `AUDIT_ACTION_LABELS`); keep the two lists in step.
ACTION_VIEW_OVERVIEW = 'view_overview'
ACTION_VIEW_ACCOUNTS = 'view_accounts'
ACTION_VIEW_ACCOUNT = 'view_account'
ACTION_VIEW_PENDING = 'view_pending_specialists'
ACTION_APPROVE = 'approve_specialist'
ACTION_REJECT = 'reject_specialist'
AUDIT_ACTIONS = (
    ACTION_VIEW_OVERVIEW, ACTION_VIEW_ACCOUNTS, ACTION_VIEW_ACCOUNT,
    ACTION_VIEW_PENDING, ACTION_APPROVE, ACTION_REJECT,
)
READ_ACTIONS = frozenset({
    ACTION_VIEW_OVERVIEW, ACTION_VIEW_ACCOUNTS, ACTION_VIEW_ACCOUNT,
    ACTION_VIEW_PENDING,
})

#: How long one read counts as the same read. Long enough that a screen
#: re-fetching after a decision is not a second entry; short enough that coming
#: back to an account later in the day is.
AUDIT_READ_WINDOW = datetime.timedelta(minutes=10)

#: How many entries the log screen gets. The table keeps everything; this is
#: what one screen can usefully show.
AUDIT_LOG_LIMIT = 200


# --- who is an administrator ------------------------------------------------

def admin_for(user):
    """The `administrator` row behind a session, or None."""
    return Administrator.objects.filter(user=user).first()


def is_admin(user):
    return Administrator.objects.filter(user=user).exists()


def is_approved(specjalist):
    return specjalist.approved_at is not None


# --- the audit log ----------------------------------------------------------

def record(admin_user, action, target=None):
    """Write one audit entry — or, for a repeated read, nothing.

    `target` is the `user` the action was about, if any. Its label is copied
    into the row as text, because a rejected specialist's row is deleted
    straight afterwards and the entry has to keep saying whose account it was.
    """
    target_id = target.pk if target is not None else None
    if action in READ_ACTIONS:
        recent = AdminAuditLog.objects.filter(
            admin=admin_user, action=action, target_id=target_id,
            created_at__gte=timezone.now() - AUDIT_READ_WINDOW,
        )
        if recent.exists():
            return None
    return AdminAuditLog.objects.create(
        admin=admin_user,
        admin_email=admin_user.email or str(admin_user.pk),
        action=action,
        target_id=target_id,
        target_label=_label(target) if target is not None else None,
    )


def _label(user):
    name = ' '.join(part for part in (user.name, user.surname) if part)
    if name and user.email:
        return f'{name} <{user.email}>'
    return name or user.email or str(user.pk)


def audit_log(limit=AUDIT_LOG_LIMIT):
    return [
        {
            'id': str(entry.pk),
            'admin_email': entry.admin_email,
            'action': entry.action,
            'target_id': str(entry.target_id) if entry.target_id else None,
            'target_label': entry.target_label,
            'created_at': _iso(entry.created_at),
        }
        for entry in AdminAuditLog.objects.order_by('-created_at')[:limit]
    ]


# --- specialist approval ----------------------------------------------------

def _person(user):
    """The smallest thing that names an account in a list: who, and how to find
    them. Never more than user_db's identity columns."""
    if user is None:
        return None
    return {
        'id': str(user.pk),
        'name': user.name,
        'surname': user.surname,
        'email': user.email,
    }


def serialize_pending(specjalist):
    user = specjalist.user
    return {
        **_person(user),
        'specialization': specjalist.specjalization,
        'module': specjalist.module,
        'module_label': module_label(specjalist.module),
        'created_at': _iso(user.created_at),
        'created_by': _person(specjalist.created_by),
        # Whether its owner has already been through the first login: granted
        # the consents and replaced the generated password. Not a condition for
        # approving — the administrator may decide either way — but it is what
        # tells "the person has seen the account" from "a colleague typed an
        # address".
        'consents_active': has_active_consents(user),
        'password_set': not user.must_change_password,
    }


def pending_specialists():
    """Every specialist account still waiting for an administrator, oldest first
    — the one that has waited longest is the one to answer first."""
    rows = (
        Specjalist.objects
        .filter(approved_at__isnull=True)
        .select_related('user', 'created_by')
        .order_by('user__created_at')
    )
    return [serialize_pending(specjalist) for specjalist in rows]


def _pending(specialist_id):
    return (
        Specjalist.objects
        .filter(user_id=specialist_id, approved_at__isnull=True)
        .select_related('user', 'created_by')
        .first()
    )


def approve(admin_user, specialist_id):
    """Approve a waiting specialist account. Returns it, or None if there is no
    such account waiting — an approved one is not approved twice."""
    specjalist = _pending(specialist_id)
    if specjalist is None:
        return None
    with transaction.atomic(using='default'):
        specjalist.approved_at = timezone.now()
        specjalist.save(update_fields=['approved_at'])
        record(admin_user, ACTION_APPROVE, specjalist.user)
    return specjalist


def reject(admin_user, specialist_id):
    """Reject a waiting specialist account: delete it. Returns True if one was.

    Only a *waiting* account can be rejected, and that is what makes deleting it
    safe: `_require_specialist` refused it everything, so it has no patients, no
    guardian codes, no techniques and no colleagues of its own to leave behind.
    An approved specialist is a different question — their patients' care would
    go with them — and this panel does not answer it.

    Signed out everywhere first, so a browser that is on the "czeka na
    weryfikację" screen right now does not keep a session for an account that no
    longer exists.
    """
    specjalist = _pending(specialist_id)
    if specjalist is None:
        return False
    user = specjalist.user
    with transaction.atomic(using='default'):
        record(admin_user, ACTION_REJECT, user)
        end_all_sessions(user)
        # The `user` row, not only the `specjalist` one: the account exists for
        # this role alone, and a user row left behind would be an account that
        # can sign in as nobody.
        user.delete()
    return True


# --- the read-only view of the data -----------------------------------------

def _iso(moment):
    # In settings.TIME_ZONE, the way DRF renders every declared DateTimeField:
    # one payload mixing '+00:00' and '+02:00' renderings of instants is the
    # trap `UserSerializer.get_consents` documents.
    return timezone.localtime(moment).isoformat() if moment else None


def _kind_sets():
    return (
        set(Administrator.objects.values_list('user_id', flat=True)),
        set(Specjalist.objects.values_list('user_id', flat=True)),
        set(Patient.objects.values_list('user_id', flat=True)),
    )


def _kind(user, admins, specialists, patients):
    if user.pk in admins:
        return KIND_ADMIN
    if user.pk in specialists:
        return KIND_SPECIALIST
    if user.pk in patients:
        return KIND_PATIENT
    if user.user_role_id and user.user_role.name == GUARDIAN_ROLE:
        return KIND_GUARDIAN
    return KIND_OTHER


def overview():
    """How many of everything — counts, and nothing that names anybody."""
    admins, specialists, patients = _kind_sets()
    users = list(User.objects.select_related('user_role'))
    kinds = {kind: 0 for kind in KINDS}
    for user in users:
        kinds[_kind(user, admins, specialists, patients)] += 1

    specialist_rows = Specjalist.objects.all()
    patient_rows = Patient.objects.all()
    return {
        'accounts': {'total': len(users), **kinds},
        'patients': {
            'adults': patient_rows.exclude(is_child=True).count(),
            'minors': patient_rows.filter(is_child=True).count(),
        },
        'specialists': {
            'approved': specialist_rows.filter(approved_at__isnull=False).count(),
            'pending': specialist_rows.filter(approved_at__isnull=True).count(),
            MODULE_PSYCHOTHERAPY: specialist_rows.filter(module=MODULE_PSYCHOTHERAPY).count(),
            MODULE_DIET: specialist_rows.filter(module=MODULE_DIET).count(),
        },
        'care_links': {
            'accepted': SpecjalistPatient.objects.filter(accepted_at__isnull=False).count(),
            'pending': SpecjalistPatient.objects.filter(accepted_at__isnull=True).count(),
        },
        'guardian_links': {
            'accepted': ParentChild.objects.filter(accepted_at__isnull=False).count(),
            'pending': ParentChild.objects.filter(accepted_at__isnull=True).count(),
        },
        # medical_db, as totals only: how much the app is used, not by whom.
        'records': {
            'diary_entries': Diary.objects.count(),
            'meals': DietMeal.objects.count(),
            'hydration_entries': Hydration.objects.count(),
            'supplements': Supplement.objects.count(),
            'activities': DietActivity.objects.count(),
            'sleep_nights': DietSleep.objects.count(),
            'health_profiles': HealthProfile.objects.count(),
        },
    }


def serialize_account_row(user, kind, specjalist=None, patient=None):
    row = {
        **_person(user),
        'kind': kind,
        'role': user.user_role.name if user.user_role_id else None,
        'created_at': _iso(user.created_at),
        'consents_active': has_active_consents(user),
        'must_change_password': user.must_change_password,
        # Kind-specific, and None where the question does not apply — the same
        # convention as `guardian_status` on /api/auth/me/.
        'specialist_approved': is_approved(specjalist) if specjalist else None,
        'specialist_module': specjalist.module if specjalist else None,
        'is_child': patient.is_child if patient else None,
    }
    return row


def list_accounts(kind=None):
    """Every account, newest first, optionally only one `kind`.

    Identity and account state only. Everything is returned at once: pagination
    is the client's (hooks/usePagination.ts), like every other list here, and
    user_db holds people, not events — it does not grow the way the diaries do.
    """
    admins, specialists, patients = _kind_sets()
    specjalist_rows = {row.user_id: row for row in Specjalist.objects.all()}
    patient_rows = {row.user_id: row for row in Patient.objects.all()}
    rows = []
    for user in User.objects.select_related('user_role').order_by('-created_at'):
        user_kind = _kind(user, admins, specialists, patients)
        if kind and user_kind != kind:
            continue
        rows.append(serialize_account_row(
            user, user_kind,
            specjalist=specjalist_rows.get(user.pk),
            patient=patient_rows.get(user.pk),
        ))
    return rows


def _activity(id_medical):
    """How much a patient has written, table by table — counts and last dates.

    The whole of what the panel reads from medical_db about one person. No row's
    content leaves this function: `Count` and `Max` over a date are the only
    things asked of each table.
    """
    def summary(model, date_field):
        result = model.objects.filter(id_medical=id_medical).aggregate(
            count=Count('pk'), last=Max(date_field),
        )
        last = result['last']
        if isinstance(last, datetime.datetime):
            last = timezone.localdate(last)
        return {'count': result['count'], 'last': last.isoformat() if last else None}

    return {
        'diary_entries': summary(Diary, 'created_at'),
        'meals': summary(DietMeal, 'entry_date'),
        'hydration_entries': summary(Hydration, 'entry_date'),
        'activities': summary(DietActivity, 'entry_date'),
        'sleep_nights': summary(DietSleep, 'entry_date'),
        'supplements': Supplement.objects.filter(id_medical=id_medical).count(),
        'health_profile': HealthProfile.objects.filter(id_medical=id_medical).exists(),
    }


def _guardian_status(links):
    if not links:
        return STATUS_NONE
    if any(link.accepted_at is not None for link in links):
        return STATUS_ACCEPTED
    return STATUS_PENDING


def account_detail(user_id):
    """One account, with the relationships it is part of, and its `user` row —
    or (None, None) if there is no such account.

    Every name in here is a user_db identity row the administrator could equally
    reach from the list; every number about a patient's records comes from
    `_activity`, which reads no content.
    """
    user = User.objects.select_related('user_role').filter(pk=user_id).first()
    if user is None:
        return None, None
    admins, specialists, patients = _kind_sets()
    kind = _kind(user, admins, specialists, patients)
    specjalist = (
        Specjalist.objects.select_related('created_by').filter(user=user).first()
    )
    patient = Patient.objects.filter(user=user).first()

    detail = {
        **serialize_account_row(user, kind, specjalist=specjalist, patient=patient),
        'date_of_birth': user.date_of_birth.isoformat() if user.date_of_birth else None,
        'updated_at': _iso(user.updated_at),
        'specialist': None,
        'patient': None,
        'guardian': None,
    }

    if specjalist is not None:
        links = (
            SpecjalistPatient.objects.filter(specjalist=specjalist)
            .select_related('patient__user')
            .order_by('patient__user__surname', 'patient__user__name', 'module')
        )
        detail['specialist'] = {
            'specialization': specjalist.specjalization,
            'module': specjalist.module,
            'module_label': module_label(specjalist.module),
            'approved_at': _iso(specjalist.approved_at),
            'created_by': _person(specjalist.created_by),
            'patients': [
                {
                    **_person(link.patient.user),
                    'module': link.module,
                    'module_label': module_label(link.module),
                    'accepted': link.accepted_at is not None,
                }
                for link in links
            ],
        }

    if patient is not None:
        care = (
            SpecjalistPatient.objects.filter(patient=patient)
            .select_related('specjalist__user')
            .order_by('module')
        )
        guardians = list(
            ParentChild.objects.filter(child=user).select_related('parent')
            .order_by('parent__surname', 'parent__name')
        )
        detail['patient'] = {
            'is_child': patient.is_child,
            'guardian_status': _guardian_status(guardians) if patient.is_child else None,
            'guardians': [
                {**_person(link.parent), 'accepted': link.accepted_at is not None}
                for link in guardians if link.parent is not None
            ],
            'specialists': [
                {
                    **_person(link.specjalist.user),
                    'module': link.module,
                    'module_label': module_label(link.module),
                    'accepted': link.accepted_at is not None,
                }
                for link in care
            ],
            'activity': _activity(patient.id_medical),
        }

    if kind == KIND_GUARDIAN:
        children = (
            ParentChild.objects.filter(parent=user).select_related('child')
            .order_by('child__surname', 'child__name')
        )
        detail['guardian'] = {
            'children': [
                {**_person(link.child), 'accepted': link.accepted_at is not None}
                for link in children if link.child is not None
            ],
        }

    return detail, user
