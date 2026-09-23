"""Session-cookie authentication for `core.User`.

`core.User` is the domain user table and is deliberately unconnected to Django's
own `auth_user` (see CLAUDE.md), so `django.contrib.auth.login()` cannot log
these users in — it would write an `auth_user` primary key into the session.

What we do borrow is the session framework itself: `start_session()` stores the
domain user's id under our own session key, and `SessionUserAuthentication`
turns it back into a `core.User` on the next request. The cookie stays HttpOnly,
so the credential is never reachable from JavaScript.
"""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework.authentication import SessionAuthentication

from .models import User

# Namespaced so it cannot collide with `_auth_user_id`, the key
# django.contrib.auth uses for the unrelated /admin/ login.
SESSION_USER_KEY = 'core_user_id'


def start_session(request, user):
    """Log `user` in for subsequent requests on this session."""
    # A brand-new key for the authenticated session: if an attacker managed to
    # fixate a session id before login, it stops being the one that is logged in.
    request.session.cycle_key()
    request.session[SESSION_USER_KEY] = str(user.pk)


def end_session(request):
    """Log the current user out and discard the server-side session."""
    request.session.flush()


def end_all_sessions(user):
    """Sign `user` out everywhere. Returns how many sessions were dropped.

    WHY THIS HAS TO SCAN. Django's own answer to "sign the other devices out" is
    `update_session_auth_hash`, which works because its sessions carry a hash of
    the password and go stale the moment it changes. Ours carry
    `SESSION_USER_KEY` and nothing else (see the module header), so there is
    nothing in them to go stale — and the session table is keyed by session id,
    with the user id buried inside an encoded payload no index can reach. The
    only way to find an account's sessions is to decode the live ones and look.

    That is affordable here and would not be everywhere: `django_session` holds
    one row per browser that has visited, expired rows are pruned by
    `clearsessions`, and this runs on one endpoint that a person reaches when
    they have lost their password. It is not a call to add to a hot path.

    ONLY THE DATABASE BACKEND. `settings.SESSION_ENGINE` is Django's default
    (`...sessions.backends.db`) in this deployment, and a session store with no
    table — signed cookies, say — cannot be enumerated at all. Rather than
    pretend otherwise this returns 0 for any other engine, and the caller says
    nothing about devices it did not sign out.
    """
    if settings.SESSION_ENGINE != 'django.contrib.sessions.backends.db':
        return 0

    from django.contrib.sessions.models import Session

    wanted = str(user.pk)
    doomed = [
        row.session_key
        for row in Session.objects.filter(expire_date__gt=timezone.now()).iterator()
        # An unreadable session (tampered with, or signed under a rotated key)
        # decodes to {} rather than raising, so it simply matches nobody.
        if row.get_decoded().get(SESSION_USER_KEY) == wanted
    ]
    Session.objects.filter(session_key__in=doomed).delete()
    return len(doomed)


class SessionUserAuthentication(SessionAuthentication):
    """Resolves `request.session[SESSION_USER_KEY]` into a `core.User`."""

    def authenticate(self, request):
        user_id = request.session.get(SESSION_USER_KEY)
        if not user_id:
            return None

        try:
            user = User.objects.select_related('user_role').get(pk=user_id)
        except (User.DoesNotExist, ValidationError, ValueError):
            # A cookie pointing at a user that has since been deleted (or an id
            # we can no longer parse). Drop the session instead of 500-ing on
            # every request the stale cookie is sent with.
            end_session(request)
            return None

        # Inherited from SessionAuthentication: a cookie-borne credential is sent
        # by the browser automatically, so the request also has to prove it was
        # not forged by another site.
        self.enforce_csrf(request)
        return (user, None)
