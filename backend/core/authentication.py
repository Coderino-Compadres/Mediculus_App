"""Session-cookie authentication for `core.User`.

`core.User` is the domain user table and is deliberately unconnected to Django's
own `auth_user` (see CLAUDE.md), so `django.contrib.auth.login()` cannot log
these users in — it would write an `auth_user` primary key into the session.

What we do borrow is the session framework itself: `start_session()` stores the
domain user's id under our own session key, and `SessionUserAuthentication`
turns it back into a `core.User` on the next request. The cookie stays HttpOnly,
so the credential is never reachable from JavaScript.
"""

from django.core.exceptions import ValidationError
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
