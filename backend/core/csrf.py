"""JSON answer for a rejected CSRF check.

Django's own failure view renders HTML. Every caller of this API is a fetch()
expecting JSON, so it could not read the body at all and fell back to a generic
"something went wrong" — throwing away the one useful piece of information.

Wired up by `CSRF_FAILURE_VIEW` in settings.py. This covers the views protected
by `@csrf_protect` (register and login, which have no session yet); for an
authenticated request the check lives in `SessionUserAuthentication`, and DRF
already answers that one with JSON.
"""

from django.conf import settings
from django.http import JsonResponse

# Deliberately actionable rather than descriptive: by far the most common cause
# is a token the server no longer recognises, and reloading really does fix it.
MESSAGE = 'Weryfikacja bezpieczeństwa nie powiodła się. Odśwież stronę i spróbuj ponownie.'


def csrf_failure(request, reason='', template_name=None):
    """Called by CsrfViewMiddleware in place of the rejected view.

    `template_name` is part of the signature Django expects and is unused here.
    """
    payload = {'detail': MESSAGE, 'code': 'csrf_failed'}

    # Django hides `reason` in production on purpose, and the wording does name
    # configuration ("does not match any trusted origins"). It goes to the log
    # instead — CsrfViewMiddleware already writes it to django.security.csrf,
    # which settings.LOGGING keeps visible with DEBUG off.
    if settings.DEBUG:
        payload['reason'] = reason

    return JsonResponse(payload, status=403)
