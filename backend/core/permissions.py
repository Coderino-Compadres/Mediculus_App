"""The two gates that hold an account on one screen, as default permissions.

The consent gate is the first of them; the password gate below it is the second.
Both follow the same shape and for the same reason — see WHY A DEFAULT
PERMISSION.

An account whose consents are not in force may reach exactly one thing: the
screen offering them back. Not the diary, not the reports, not the profile, not
the guardian's list of children — the app has no lawful basis to process
anything for them, and "nothing" has to mean nothing rather than "the screens
somebody thought to check".

WHY A DEFAULT PERMISSION AND NOT A SHARED HELPER. The guardian gate lives inside
`_require_patient` because it applies to *clinical* endpoints, and every one of
them already calls that helper. This gate applies to **everything**, including
endpoints that touch no patient row at all, so there is no single funnel to put
it in — and an opt-in check is one a new endpoint forgets. It goes in
`DEFAULT_PERMISSION_CLASSES` next to `IsAuthenticated`, for the same reason that
one is there: a view that declares nothing is closed.

THE EXEMPTIONS ARE THE PART TO READ. Setting `permission_classes` on a view
replaces the defaults wholesale, so any view that overrides them escapes this
gate silently. That is a real trap, and the answer is that every exemption uses
the named constant below rather than spelling `[IsAuthenticated]` out — so the
exempt set is one grep, and `test_consent_gate.py` sweeps every registered URL to
prove nothing else slipped out.
"""

from rest_framework.permissions import BasePermission, IsAuthenticated

from .consents import has_active_consents

#: Shown instead of the generic "not allowed", because the account is not
#: forbidden from the app — it is waiting on a decision only its owner can make,
#: and the frontend's route guard reads /api/auth/me/ to learn which.
CONSENT_GATE_REFUSAL = (
    'Bez zgód na przetwarzanie danych i na korzystanie z usług fundacji '
    'aplikacja nie może przetwarzać Twoich danych. Przywróć zgody w profilu, '
    'aby korzystać z konta.'
)


class HasActiveConsents(BasePermission):
    """Both RODO consents in force, or nothing but the way back."""

    message = CONSENT_GATE_REFUSAL

    def has_permission(self, request, view):
        user = request.user
        # AnonymousUser never reaches here in practice — IsAuthenticated runs
        # first — but a permission that assumed a user would 500 on the one
        # request that got the order wrong.
        if user is None or not getattr(user, 'is_authenticated', False):
            return False
        return has_active_consents(user)


#: What a view sets to opt out of **both** gates.
#:
#: Only four things belong here and each is an escape hatch one of the gates
#: needs: reading the account (`/api/auth/me/`, which is how the frontend learns
#: *why* it was refused), signing out, and the two consent endpoints — gating
#: those would be a deadlock, exactly like gating `/api/auth/guardian/` would be
#: for a minor. Anything else that appears in this list is a bug.
#:
#: The consent endpoints are exempt from the password gate as well, and that is
#: the ordering decision written down: a specialist account created by a
#: colleague arrives holding *both* refusals, and the consents come first. It
#: cannot be the other way round — `POST /api/account/password/` is behind
#: `HasActiveConsents` (below), so an account asked for its password before its
#: consents would have no reachable screen at all.
CONSENT_EXEMPT = [IsAuthenticated]


#: Shown instead of the generic "not allowed", for the same reason as the consent
#: refusal above: the account is not forbidden the app, it is one form away from
#: it, and the frontend reads `must_change_password` on /api/auth/me/ to know
#: which form.
PASSWORD_GATE_REFUSAL = (
    'To konto korzysta jeszcze z hasła nadanego przy jego utworzeniu. '
    'Ustaw własne hasło, aby korzystać z aplikacji.'
)


class HasOwnPassword(BasePermission):
    """The account's password is one its owner chose, or nothing but the form.

    `user.must_change_password` is set in exactly one place: core/colleagues.py,
    where a specialist creates another specialist's account. That password is
    *generated* rather than chosen — it comes back once in the creating
    response, is read off a note and typed by hand — so until it is replaced,
    the credential belongs as much to whoever created the account as to whoever
    holds it. Everything the account could otherwise reach is a patient's
    clinical data.

    A permission rather than a check inside `_require_specialist`, although
    today only a specialist account can carry the flag: the column is on
    `"user"`, so anything that ever hands out a password would set it, and a
    gate that only covered the specialist panel would then be a gate over one
    corner of the app. Same argument as the consent gate above.
    """

    message = PASSWORD_GATE_REFUSAL

    def has_permission(self, request, view):
        user = request.user
        if user is None or not getattr(user, 'is_authenticated', False):
            return False
        return not user.must_change_password


#: What a view sets to opt out of the password gate while staying behind the
#: consent one.
#:
#: Exactly one view: `POST /api/account/password/`, which is the way out. Note
#: what it still is behind — `IsAuthenticated` and `HasActiveConsents` — so an
#: account whose consents are withdrawn is sent to the consent screen first,
#: which is the order the two gates are meant to be answered in.
PASSWORD_CHANGE_EXEMPT = [IsAuthenticated, HasActiveConsents]
