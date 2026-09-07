"""Specialist accounts, created by a specialist.

WHY THIS EXISTS. A specialist used to register from the public form like anybody
else, and that was safe only because of what the role does *not* grant: every
patient-facing endpoint refuses them, and the reports they may read are the
reports of patients who accepted their invitation. It was still wrong for a
different reason — a professional account is a claim about a person's
qualifications, and the app has no way to check one. So the claim is now made by
somebody who can: an existing specialist creates the account, exactly as they
already vouch that two people are a family (core/parent_invitations.py).

The public form therefore has no "konto specjalisty" choice at all, and
`ACCOUNT_TYPES` in core/serializers.py no longer maps one — a hand-made
`account_type: 'specialist'` is a 400, not a specialist.

WHERE THE FIRST ONE COMES FROM. Nothing in the app can create the first
specialist account, by construction: creating one needs a `specjalist` row and
the only way to get one is from a `specjalist` row. `scripts/mock_data.sql`
seeds it, and on a real deployment it is one INSERT by hand. That is a property
worth keeping rather than a gap to close — an endpoint that could mint the first
professional account would be an endpoint that can mint the tenth.

THE PASSWORD IS SHOWN ONCE AND THE SCREEN SAYS SO, the same shape as a guardian
invitation code and for the same reason: this deployment sends no mail at all,
so a credential travels as something handed over in the room. It is stored as a
hash (`make_password`, like every other `user.password_hash`), so nothing can
read it back — a specialist who loses it has no way to recover it, and the new
account has no password reset either. That is the one rough edge of this flow
and it is deliberate: the alternative is storing a readable credential.

THE CONSENTS ARE NOT PRE-GRANTED, and this is the load-bearing half. Registration
writes `data_consent_at`/`services_consent_at` because the person ticking the
boxes *is* the person consenting; here they are not. RODO art. 7 makes consent an
act of the data subject, so a colleague cannot give it on their behalf — the two
columns stay NULL, `HasActiveConsents` refuses the new account everything, and
its owner meets `pages/ConsentsRequired.tsx` at first login and grants them
there. Which means the account also cannot be used to read anything before its
owner has agreed to anything, and that is the correct order.

Kept out of the views so the rules can be tested without a request, like
core/guardian.py, core/specialist.py and core/parent_invitations.py.
"""

import secrets

from django.contrib.auth.hashers import make_password
from django.db import transaction

from .consents import has_active_consents
from .models import Specjalist, User, UserRole
from .parent_invitations import CODE_ALPHABET

#: The role name a specialist account carries.
#:
#: Nothing *authorizes* on this string: a specialist is recognised by their
#: `specjalist` row (`core.specialist.specjalist_for`), the way a patient is
#: recognised by their `patient` row. The role is what the UI prints, and it is
#: looked up by name because `user_role` is seeded by SQL rather than by a
#: migration — a database missing the row yields `role: null`, not a failure.
SPECIALIST_ROLE = 'specjalista'

#: The alphabet the temporary password is drawn from — the invitation code's,
#: imported rather than copied. Same reason it exists there: this credential is
#: read off a note and typed by hand, so O/0, I/1/L, S/5 and Z/2 are characters
#: that turn a working password into a support call.
PASSWORD_ALPHABET = CODE_ALPHABET

#: 16 characters in four groups of four — ~77 bits over that alphabet. The
#: dashes are for the eye only; nothing strips them, so they are part of the
#: password and the person typing it has to include them.
PASSWORD_GROUPS = 4
PASSWORD_GROUP_LENGTH = 4

#: What the roster reports about each specialist account, spelled out because
#: the line is the design rather than an accident of what was handy.
#:
#: Identity and status, and **nothing about anybody's care**: who this is, what
#: they do, and whether their account is usable yet. A colleague's caseload is
#: the clinical relationship of patients who agreed to *them* — listing it here
#: would hand every specialist the patient lists of every other one, which no
#: patient consented to. There is deliberately no counter of any kind.
#:
#: `consents_active` is here because its absence is the answer to "why can they
#: not log in": a freshly created account has granted nothing yet (see the module
#: header), and silence would read as the account never having been created.
COLLEAGUE_SUMMARY_FIELDS = (
    'name', 'surname', 'email', 'specialization', 'created_at', 'consents_active',
)


def generate_password():
    """A fresh temporary password, in the form 'ABCD-EFGH-JKMN-PQRT'.

    `secrets`, not `random`: this is a credential. Long enough that the readable
    alphabet costs nothing, and it is typed exactly once — the account changes it
    from "Profil" afterwards.
    """
    groups = [
        ''.join(secrets.choice(PASSWORD_ALPHABET) for _ in range(PASSWORD_GROUP_LENGTH))
        for _ in range(PASSWORD_GROUPS)
    ]
    return '-'.join(groups)


def create_account(*, email, name, surname, date_of_birth, specialization):
    """Create a specialist account. Returns (specjalist row, plaintext password).

    The plaintext exists in this return value and nowhere else — the caller hands
    it to the specialist in the response and then forgets it.

    **No consent timestamps are written**: see the module header. The new account
    is locked by `HasActiveConsents` until its owner grants them, which is the
    only person who can.

    Both writes land in user_db, so one transaction covers them. Nothing here
    touches medical_db: a specialist is not a clinical subject, gets no
    `patient` row and therefore no `id_medical`, so nothing in medical_db can
    ever refer to them.
    """
    password = generate_password()
    role = UserRole.objects.filter(name=SPECIALIST_ROLE).first()

    with transaction.atomic(using='default'):
        user = User.objects.create(
            user_role=role,
            email=email.lower(),
            password_hash=make_password(password),
            name=name,
            surname=surname,
            date_of_birth=date_of_birth,
        )
        specjalist = Specjalist.objects.create(
            user=user, specjalization=specialization,
        )
    return specjalist, password


def serialize_colleague(specjalist):
    """One specialist account as the panel lists it — COLLEAGUE_SUMMARY_FIELDS.

    Never the password (it is a hash by now and unreadable even here), and
    nothing about who this person treats.
    """
    user = specjalist.user
    return {
        'id': str(user.pk),
        'name': user.name,
        'surname': user.surname,
        'email': user.email,
        # Spelled correctly on the wire although the column is
        # `specjalist.specjalization`: /api/account/profile/ already sends it as
        # `approach`, so the wire has never mirrored that typo.
        'specialization': specjalist.specjalization,
        'created_at': user.created_at.isoformat() if user.created_at else None,
        'consents_active': has_active_consents(user),
    }


def list_colleagues():
    """Every specialist account, newest first.

    NOT filtered to the accounts the signed-in specialist created, and that is a
    decision rather than a missing column. Two reasons: the roster is what stops
    a second account being created for somebody who already has one (the form
    can otherwise only answer "ten adres jest już zajęty", which is the same
    disclosure with none of the use), and it is how a specialist confirms the
    account they just created exists. What it carries is professional identity
    and no patient's data at all — see COLLEAGUE_SUMMARY_FIELDS.

    Ordered by the `user` row's creation, so the account just created is at the
    top of the list the response comes back with.
    """
    specjalists = (
        Specjalist.objects
        .select_related('user')
        .order_by('-user__created_at')
    )
    return [serialize_colleague(specjalist) for specjalist in specjalists]
