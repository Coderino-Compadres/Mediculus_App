"""Invitations a specialist issues for a guardian's account.

WHY THIS EXISTS AND WHY IT LOOKS LIKE THIS. A guardian can already register from
the public form, but nothing there links the new account to a child — that link
is started by the child, who names an address and waits (`core/guardian.py`). A
specialist sitting with a family needs the other direction: name the parent, name
the child, and let the parent finish. And it has to work in a deployment that
**sends no mail at all**, so there is no activation link and no "we e-mailed
you"; the invitation is a code, given to the parent in the room.

The code is the whole security boundary, so three things are true of it:

* it is **stored hashed**, the way `user.password_hash` is (`make_password`), and
  the plaintext exists only in the response that created it. An invitation
  carries the right to attach a guardian account to a named minor's account, so a
  database dump of readable codes would be a set of usable keys. There is
  deliberately no endpoint that reads one back — a specialist who loses it
  revokes the invitation and issues another;
* it is **bound to one address**. The parent has to register with the address the
  specialist named, so a code overheard by somebody else is not an account;
* it **expires** (`INVITATION_TTL_DAYS`). An unredeemed invitation that worked
  forever is a key left under a doormat for a year.

WHAT REDEEMING DOES. The `parent_child` row is created **already accepted**,
which is the one place this flow differs from the child-initiated one, so it is
worth being explicit: in that flow the guardian accepts *because* nobody else
can give the art. 8 consent for a minor, and here the guardian does exactly the
same thing — they hold a code handed to them personally and they complete the
registration with it. The acceptance *is* the registration. What the specialist
supplies is the fact that these two people are a family, which is precisely what
the app cannot check for itself and a clinician in the room can.

Kept out of the views so the rules can be tested without a request, like
core/guardian.py and core/specialist.py.
"""

import datetime
import secrets

from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone

from .models import ParentInvitation

#: How long a code stays usable. Long enough that a family can finish the
#: registration at home in the evening, short enough that a code written on a
#: card in a drawer stops working. Not a legal requirement — a policy constant,
#: like ADULT_AGE.
INVITATION_TTL_DAYS = 14

#: The code's alphabet: upper-case letters and digits, minus every pair that is
#: read wrong off a handwritten card (O/0, I/1, L, S/5, Z/2). This code is
#: dictated and copied by hand, so ambiguity here becomes a support call rather
#: than a typo.
CODE_ALPHABET = 'ABCDEFGHJKMNPQRTUVWXY3467889'

#: 12 characters in three groups of four. ~57 bits over that alphabet, which is
#: far past guessable given that a guess also has to name the right address.
CODE_GROUPS = 3
CODE_GROUP_LENGTH = 4

#: What a listed invitation is doing, computed rather than stored: 'used' and
#: 'expired' are both readable off the two timestamps, and a status column would
#: be a third thing to keep in step with them.
STATUS_PENDING = 'pending'
STATUS_USED = 'used'
STATUS_EXPIRED = 'expired'


def generate_code():
    """A fresh code, in the form 'ABCD-EFGH-JKMN'.

    `secrets`, not `random`: this is a credential. The dashes are separators for
    the eye only — `normalize_code` strips them, so a parent typing the code
    without them is not turned away for it.
    """
    groups = [
        ''.join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_GROUP_LENGTH))
        for _ in range(CODE_GROUPS)
    ]
    return '-'.join(groups)


def normalize_code(raw):
    """What a typed code becomes before it is compared.

    Upper-cased with dashes and spaces removed, because the code is read off a
    card and typed by hand: 'abcd efgh jkmn' is the same invitation as
    'ABCD-EFGH-JKMN', and refusing it would be refusing the right answer for
    being punctuated differently.
    """
    return ''.join((raw or '').split()).replace('-', '').upper()


def create_invitation(specjalist, child, email, *, now=None):
    """Issue one invitation. Returns (row, plaintext code).

    The caller has to hand the code to the specialist in the response and then
    forget it: nothing here, and nothing anywhere else, can read it again.
    """
    now = now or timezone.now()
    code = generate_code()
    invitation = ParentInvitation.objects.create(
        specjalist=specjalist,
        child=child,
        email=email.lower(),
        code_hash=make_password(normalize_code(code)),
        expires_at=now + datetime.timedelta(days=INVITATION_TTL_DAYS),
    )
    return invitation, code


def invitation_status(invitation, *, now=None):
    """'used', 'expired' or 'pending' — in that order of precedence.

    Used outranks expired: an invitation that was redeemed before it ran out is
    a parent who has an account, and reporting it as expired would send the
    specialist to issue a second one for somebody who does not need it.
    """
    if invitation.used_at is not None:
        return STATUS_USED
    if invitation.expires_at <= (now or timezone.now()):
        return STATUS_EXPIRED
    return STATUS_PENDING


def serialize_invitation(invitation, *, now=None):
    """One invitation as the specialist's panel lists it.

    No code, and that is not an omission — see the module header. The address and
    the child are what identify it; `status` is what the specialist acts on.
    """
    child = invitation.child
    return {
        'id': str(invitation.pk),
        'email': invitation.email,
        'child_id': str(invitation.child_id),
        'child_name': child.name,
        'child_surname': child.surname,
        'child_email': child.email,
        'created_at': invitation.created_at.isoformat() if invitation.created_at else None,
        'expires_at': invitation.expires_at.isoformat(),
        'used_at': invitation.used_at.isoformat() if invitation.used_at else None,
        'status': invitation_status(invitation, now=now),
    }


def list_invitations(specjalist, *, now=None):
    """This specialist's invitations, newest first.

    Filtered by `specjalist` with no permission of its own, the same convention
    as the guardian lists: an account that has issued none gets an empty list,
    and there is no id in the URL pointing at somebody else's.

    Redeemed and expired ones stay in the list. A specialist needs to see that a
    parent did register — otherwise the only evidence is the parent saying so —
    and an expired invitation is the answer to "why can they not log in".
    """
    invitations = (
        ParentInvitation.objects
        .filter(specjalist=specjalist)
        .select_related('child')
        .order_by('-created_at')
    )
    return [serialize_invitation(invitation, now=now) for invitation in invitations]


def live_for(email, *, now=None):
    """Invitations for that address that could still be redeemed.

    Used by the form that issues one, so a second live code for the same address
    is refused rather than silently replacing the first — the parent may already
    be holding it. Unredeemed and unexpired: a used or expired invitation is a
    record, not an obstacle.
    """
    return ParentInvitation.objects.filter(
        email=(email or '').lower(),
        used_at__isnull=True,
        expires_at__gt=(now or timezone.now()),
    )


def revoke(specjalist, invitation_id):
    """Withdraw an unredeemed invitation. False when there is none to withdraw.

    `used_at__isnull=True` is the load-bearing half: a redeemed invitation is the
    record of an account that exists, and deleting it would not un-create the
    account — it would only lose the trail. Unlinking that guardian is a
    different action, on `parent_child`, and it does not exist yet (see the
    guardian notes in CLAUDE.md).
    """
    deleted, _ = ParentInvitation.objects.filter(
        pk=invitation_id, specjalist=specjalist, used_at__isnull=True,
    ).delete()
    return bool(deleted)


def redeem(email, code, *, now=None):
    """The invitation this (address, code) pair opens, or None.

    Both halves have to match, and the address is what narrows the search: the
    hash cannot be looked up (that is the point of hashing it), so candidates are
    the live invitations for that address and each is checked in turn. In practice
    that is one row — a specialist cannot have two live invitations for the same
    address (see the serializer) — and it is bounded by that regardless.

    Does not mark anything: the caller redeems inside the transaction that
    creates the account, so an invitation is never spent on a registration that
    then fails.
    """
    now = now or timezone.now()
    normalized = normalize_code(code)
    if not normalized:
        return None

    candidates = ParentInvitation.objects.filter(
        email=(email or '').lower(), used_at__isnull=True, expires_at__gt=now,
    ).select_related('child')
    for invitation in candidates:
        if check_password(normalized, invitation.code_hash):
            return invitation
    return None


def mark_used(invitation, *, now=None):
    """Spend the invitation, so a code cannot be redeemed twice."""
    invitation.used_at = now or timezone.now()
    invitation.save(update_fields=['used_at', 'updated_at'])
    return invitation
