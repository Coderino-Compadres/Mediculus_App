"""The consent gate, as a permission rather than a helper each view remembers.

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


#: What a view sets to opt out of the gate above.
#:
#: Only four things belong here and each is the gate's own escape hatch: reading
#: the account (`/api/auth/me/`, which is how the frontend learns *why* it was
#: refused), signing out, and the two consent endpoints — gating those would be
#: a deadlock, exactly like gating `/api/auth/guardian/` would be for a minor.
#: Anything else that appears in this list is a bug.
CONSENT_EXEMPT = [IsAuthenticated]
