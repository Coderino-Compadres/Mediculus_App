"""The administrator's panel: the final word on a specialist account, a look
at who is in the database, and correcting or deleting an account.

THREE JOBS, AND NOTHING ELSE.

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
   medical_db the panel reads **app-wide totals only** (how many diary entries
   exist in all), never anything about one patient — not a count, not a date,
   not a single entry's content. The pseudonymisation between the two databases
   is what keeps clinical data unreadable to anybody who is not treating the
   patient, and an administrator is not; how active one named patient is would
   already be health data about them. Reading never writes to medical_db.

3. **Correcting a specialist, deleting any account** (`edit_account`,
   `delete_account`). Only a specialist's account is edited here — identity and
   professional details, the account the foundation vouches for; a patient's,
   a guardian's or an administrator's data is theirs to change, not the
   panel's. Any account may be deleted except the administrator's own, and
   deleting is the one place the panel writes to medical_db: a deleted patient
   takes every row under their `id_medical` with them (RODO art. 17), because
   rows left behind would be health data about nobody that nobody could ever be
   asked about.

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
from django.utils import timezone
from rest_framework import serializers

from . import account_deletion
from .authentication import end_all_sessions
from .colleagues import qualifications
from .consents import has_active_consents
from .guardian import STATUS_ACCEPTED, STATUS_NONE, STATUS_PENDING
from .models import (Administrator, AdminAuditLog, DietActivity, DietMeal,
                     DietSleep, Diary, HealthProfile, Hydration, ParentChild,
                     Patient, Specjalist, SpecjalistPatient, Supplement,
                     Technique, User)
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
ACTION_EDIT_ACCOUNT = 'edit_account'
ACTION_DELETE_ACCOUNT = 'delete_account'
AUDIT_ACTIONS = (
    ACTION_VIEW_OVERVIEW, ACTION_VIEW_ACCOUNTS, ACTION_VIEW_ACCOUNT,
    ACTION_VIEW_PENDING, ACTION_APPROVE, ACTION_REJECT,
    ACTION_EDIT_ACCOUNT, ACTION_DELETE_ACCOUNT,
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
        # What the administrator is actually checking before approving.
        **qualifications(specjalist),
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
    reach from the list. Nothing comes from medical_db: not even how many
    records a patient has — see the module header.
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
            **qualifications(specjalist),
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


# --- correcting and deleting an account -------------------------------------

class NotEditable(Exception):
    """An account the panel does not edit: anybody's but a specialist's.

    A specialist's account is the one the foundation vouches for, and its
    details are what the approval was decided on — so the foundation may
    correct them. A patient's, a guardian's or an administrator's data is the
    person's own to change from their profile.
    """


class OwnAccount(Exception):
    """The administrator's own account, which the panel does not delete.

    The request would end the very session making it, and the last
    administrator deleting themselves would leave nobody to open the panel;
    `manage.py` on the server is where that decision is made.
    """


#: user_db identity columns an administrator may correct.
EDITABLE_USER_FIELDS = ('name', 'surname', 'email', 'date_of_birth')

#: `specjalist` columns, keyed by the name the API uses for each.
EDITABLE_SPECIALIST_FIELDS = {
    'specialization': 'specjalization',
    'university': 'university',
    'field_of_study': 'field_of_study',
    'diploma_number': 'diploma_number',
    'module': 'module',
}

#: The 400 on `module` while the specialist authors techniques in the old one.
MODULE_HAS_TECHNIQUES = (
    'Ten specjalista ma opublikowane techniki w obecnym module. Po zmianie '
    'modułu nikt nie mógłby ich edytować, więc moduł zostaje bez zmian.'
)


def _target(user_id):
    """(user, kind) for an account, or None if there is no such account."""
    user = User.objects.select_related('user_role').filter(pk=user_id).first()
    if user is None:
        return None
    admins, specialists, patients = _kind_sets()
    return user, _kind(user, admins, specialists, patients)


def editable_specialist(user_id):
    """The `user` of a specialist account the panel may edit, None if there is
    no such account — or raises NotEditable for any other kind."""
    target = _target(user_id)
    if target is None:
        return None
    user, kind = target
    if kind != KIND_SPECIALIST:
        raise NotEditable()
    return user


def edit_account(admin_user, user_id, changes):
    """Apply already validated `changes` to one specialist's account. Returns
    the user, or None if there is no such account; raises NotEditable for any
    account that is not a specialist's.

    `changes` holds only what the form sent — see AdminAccountEditSerializer.

    A changed address signs the account out everywhere. The address is the
    login and where a password-reset link goes, so a session opened under the
    old one should not outlive the correction.

    Nothing that differs from the stored values means nothing is saved and
    nothing is recorded. A module change raises ValidationError (a 400 on
    `module`) while the specialist authors techniques in the current module.
    """
    user = editable_specialist(user_id)
    if user is None:
        return None
    specjalist = Specjalist.objects.get(user=user)

    # Only what actually differs. A PATCH repeating the stored values (or one
    # the serializer normalized back to them, e.g. an address's case) changes
    # nothing and is not an edit for the audit log to report.
    user_fields = [
        name for name in EDITABLE_USER_FIELDS
        if name in changes and changes[name] != getattr(user, name)
    ]
    specialist_fields = [
        column for key, column in EDITABLE_SPECIALIST_FIELDS.items()
        if key in changes and changes[key] != getattr(specjalist, column)
    ]
    if not user_fields and not specialist_fields:
        return user

    # A technique is edited only from its own module's panel, by its author
    # (`_require_technique_author`, core/diet_techniques.py) — moved to the
    # other module, the specialist's techniques would be published with nobody
    # able to correct them. Refused while any exist rather than orphaned.
    if 'module' in specialist_fields and Technique.objects.filter(
        author_id_specjalist=specjalist.pk, module=specjalist.module,
    ).exists():
        raise serializers.ValidationError({'module': [MODULE_HAS_TECHNIQUES]})

    email_changed = 'email' in user_fields
    for name in user_fields:
        setattr(user, name, changes[name])
    for key, column in EDITABLE_SPECIALIST_FIELDS.items():
        if column in specialist_fields:
            setattr(specjalist, column, changes[key])

    with transaction.atomic(using='default'):
        if user_fields:
            user.save(update_fields=[*user_fields, 'updated_at'])
        if specialist_fields:
            specjalist.save(update_fields=specialist_fields)
        if email_changed:
            end_all_sessions(user)
        record(admin_user, ACTION_EDIT_ACCOUNT, user)
    return user


def delete_account(admin_user, user_id):
    """Delete one account, and everything that is only about it. Returns the
    kind of account deleted, or None if there was none.

    What goes, by kind:

    * **patient** — every medical_db row under their `id_medical` (diary,
      reports, meals, hydration, supplements, activity, sleep, health profile;
      the rows hanging off those go by cascade), then the account itself, their
      care links and their guardian links;
    * **specialist** — the account and their care links: their patients keep
      their own records and lose only this person's access. The techniques they
      published stay in the catalogue, with no author, like the app's own —
      patients may be in the middle of one;
    * **guardian** — the account and their links. A minor whose only accepted
      guardian this was is locked again (RODO art. 8) until another accepts;
    * **administrator** — another one's account and their `administrator` row.
      Their audit entries stay, with their address as text. An administrator's
      own account raises OwnAccount instead.

    THE ORDER ACROSS THE TWO DATABASES IS DELIBERATE. Nothing can make the two
    one transaction, so medical_db goes first: if the user_db half then fails,
    what is left is an account with no records, which the next attempt finishes
    deleting. The other way round, a failure would leave health data that no
    account points at any more — unreachable, and impossible to delete on
    request because nothing says whose it is.

    The audit entry is written with the `user` row's removal, in the same
    transaction, and keeps the name and address as text (see `record`).
    """
    target = _target(user_id)
    if target is None:
        return None
    user, kind = target
    if user.pk == admin_user.pk:
        raise OwnAccount()

    # The deletion itself is shared with the owner's own "Usuń konto" — see
    # core/account_deletion.py for what goes and why medical_db goes first. The
    # audit entry is written inside the user_db transaction, with the row's
    # removal.
    account_deletion.delete_account(
        user,
        before_user_delete=lambda: record(admin_user, ACTION_DELETE_ACCOUNT, user),
    )
    return kind
