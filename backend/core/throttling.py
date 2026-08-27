"""Rate limits for the endpoints where making a request is itself a question.

Both caps exist for the same reason: asking once whether an address has an
account here is a question about a person you know, asking a thousand times is
a way to read the user table. The rates themselves live in
`settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']`.

Kept out of `views.py` because what these classes key on is a privacy decision
rather than a routing one — see `HashedIdent`.
"""

from django.utils.crypto import salted_hmac
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

# Namespaces these digests, so the same address hashes to something different
# here than it would under any other salted_hmac use in the project.
IDENT_KEY_SALT = 'core.throttling.ident'

# Length of a sha256 hexdigest; the cache key is this plus 'throttle_auth_',
# well inside the 250-character limit every cache backend imposes.
IDENT_LENGTH = 64


class HashedIdent:
    """Keys the throttle on a digest of the caller's address, not the address.

    DRF puts `get_ident`'s return value straight into the cache key, so with the
    default local-memory cache the client's IP sits in the worker's memory, and
    with a database-backed cache — the shared-counter option that needs no Redis
    — it would sit in a table in `user_db`, next to the PII. An IP is personal
    data under RODO, and request metadata belongs in the server log, not in the
    application's own database. A throttle never needs the address itself: the
    only question it asks is whether two requests came from the same caller, and
    a digest answers that just as well.

    HMAC keyed on `SECRET_KEY` rather than a bare SHA-256: IPv4 is 2**32 values,
    so an unkeyed digest is exhaustible in seconds and would pseudonymize
    nothing at all.

    Mixed in *before* the throttle class so this `get_ident` wins and `super()`
    still reaches DRF's, which is what reads NUM_PROXIES.
    """

    def get_ident(self, request):
        ident = super().get_ident(request)
        if ident is None:
            # No REMOTE_ADDR and no usable X-Forwarded-For. There is nothing to
            # hash, and DRF is content to bucket these callers together.
            return None
        return salted_hmac(IDENT_KEY_SALT, ident, algorithm='sha256').hexdigest()


class AuthThrottle(HashedIdent, AnonRateThrottle):
    """Per-IP cap on the credential-accepting endpoints (rate in settings.py)."""

    scope = 'auth'


class GuardianLinkThrottle(HashedIdent, UserRateThrottle):
    """Per-account cap on the guardian-linking endpoint.

    Not AuthThrottle: AnonRateThrottle deliberately exempts requests that carry
    a session, so it would count nothing here. The cap matters because a request
    reveals whether an address belongs to a guardian account — one answer at a
    time is a question about a person you know, a thousand is an address list.

    The hashed ident is inherited rather than needed: UserRateThrottle keys on
    the account's primary key whenever there is a session, and here there always
    is one. It matters if this view ever stops requiring authentication.
    """

    scope = 'auth'
