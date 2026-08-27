"""Rate limits for the endpoints where making a request is itself a question.

Both caps exist for the same reason: asking once whether an address has an
account here is a question about a person you know, asking a thousand times is
a way to read the user table. The rates themselves live in
`settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']`.

Kept out of `views.py` because what these classes key on is a privacy decision
rather than a routing one — see `HashedIdent`.
"""

from django.utils.crypto import salted_hmac
from rest_framework.throttling import (AnonRateThrottle, SimpleRateThrottle,
                                       UserRateThrottle)

# Namespaces these digests, so the same address hashes to something different
# here than it would under any other salted_hmac use in the project. The two
# salts are separate on purpose: an address and an e-mail must not produce
# comparable digests just because they happened to be the same string.
IDENT_KEY_SALT = 'core.throttling.ident'
ACCOUNT_KEY_SALT = 'core.throttling.account'

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


def _digest(key_salt, value):
    """HMAC-SHA256, for the same reasons `HashedIdent` gives."""
    return salted_hmac(key_salt, value, algorithm='sha256').hexdigest()


def submitted_email(request):
    """The address the login form carried, normalized, or None.

    Normalized the same way `LoginSerializer` normalizes it — lowercased, and
    DRF's EmailField trims whitespace — or varying the case would be enough to
    walk straight past the cap.

    Read from the raw request body rather than from a validated serializer,
    because the counter has to move *before* anything is known about the
    address. An attempt against an address nobody registered must cost exactly
    what an attempt against a real account costs, or the cap becomes the
    account-enumeration oracle that the login response deliberately is not.
    """
    if not isinstance(request.data, dict):
        return None
    email = request.data.get('email')
    if not isinstance(email, str) or not email.strip():
        return None
    return email.strip().lower()


class LoginAccountThrottle(SimpleRateThrottle):
    """Per-account cap on password attempts, keyed on the address submitted.

    The per-IP cap does not stop password guessing: a botnet gives every attempt
    its own address and its own budget. What actually bounds it is a counter on
    the account being attacked, which no amount of client diversity can spread.

    Keyed on the *submitted* address, not on a user that was found — see
    `submitted_email`. The digest is there for the same reason the ident is
    hashed, and more so: an e-mail identifies a person directly, and the cache
    key may end up in a table.
    """

    scope = 'login_account'

    def get_cache_key(self, request, view):
        email = submitted_email(request)
        if email is None:
            # Nothing to count against; the malformed body is rejected anyway
            # and the per-IP cap still applies.
            return None
        return self.cache_format % {
            'scope': self.scope, 'ident': _digest(ACCOUNT_KEY_SALT, email),
        }

    def reset(self, request):
        """Forget the attempts against this address.

        Called once a password has actually matched: the counter exists to bound
        *guessing*, and someone who knows the password was never guessing.
        Without this, a person logging in from several devices in one hour would
        be locked out of their own account.
        """
        key = self.get_cache_key(request, None)
        if key is not None:
            self.cache.delete(key)


# How many attempts have to be left before the response starts saying so. Below
# this the warning is worth more than the silence: a person who has forgotten
# which password they used gets a chance to stop and think, and there is no
# password reset in this deployment to rescue them afterwards.
WARN_AT_ATTEMPTS_LEFT = 5


def login_attempts_left(request):
    """Attempts left in the window for this address, without consuming one.

    Reads the counter `LoginAccountThrottle` has already written for this
    request. None when there was no address to count.
    """
    throttle = LoginAccountThrottle()
    key = throttle.get_cache_key(request, None)
    if key is None:
        return None
    cutoff = throttle.timer() - throttle.duration
    history = [stamp for stamp in throttle.cache.get(key, []) if stamp > cutoff]
    return max(throttle.num_requests - len(history), 0)


def attempts_warning(request):
    """The sentence to append to a refused login, or None while it is early.

    Says nothing about whether the address has an account: the counter moves for
    an address nobody registered exactly as it does for a real one, so the
    warning arrives at the same attempt either way.
    """
    left = login_attempts_left(request)
    if left is None or left > WARN_AT_ATTEMPTS_LEFT:
        return None
    if left == 0:
        # The wall is the *next* request. Silence here would make the 429 that
        # follows arrive with no warning at all, which is the one place the user
        # can still do something about it.
        return 'To była ostatnia próba logowania w tej godzinie.'
    if left == 1:
        return 'Pozostała 1 próba logowania w tej godzinie.'
    if left < 5:
        return f'Pozostały {left} próby logowania w tej godzinie.'
    return f'Pozostało {left} prób logowania w tej godzinie.'
