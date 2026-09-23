"""Setting a new password from a link mailed to the account's own address.

WHY THIS EXISTS. Until now nothing in the app could recover a forgotten
password: `core/colleagues.py` says so in its own header — a specialist whose
generated password was lost had no way back in, and neither had anybody else.
Every credential this deployment issues travelled by hand because there was no
mail; this module is the first thing that sends any, and it sends exactly one
kind of message.

THE TOKEN IS NOT STORED ANYWHERE, which is the design decision to read first.
Its sibling flow — a specialist's invitation for a guardian
(`core/parent_invitations.py`) — keeps a hashed code in a table with
`expires_at` and `used_at`, and this one deliberately does not:

* it is a **signed value**, not a secret we have to recognise later.
  `django.core.signing` proves the payload came from us and how old it is, so
  the "does this token exist" question needs no row to answer.
* **single use is cryptographic rather than a column.** The payload carries a
  fingerprint of the account's *current* `password_hash`, so the moment the
  password changes every token issued against the old one stops verifying. A
  `used_at` that somebody forgets to set is a token that works twice; there is
  nothing here to forget.
* nothing about "who asked to reset their password, and when" lands in
  `user_db` next to the PII. That is a record of a person's trouble with their
  account which nobody needs kept, and the cheapest way not to keep it is not
  to have the table.

What that costs, honestly: an issued token cannot be revoked one by one, and a
second request does not invalidate the first — both stay valid until they age
out or the password changes. `TOKEN_TTL` is short for that reason. If the day
comes that "unieważnij wszystkie linki" is a feature somebody wants, it needs
the table this module does without, and `parent_invitation` is the shape to
copy.

WHAT THE LINK IS BUILT FROM. `settings.FRONTEND_BASE_URL`, and never the
request's `Host` header. A reset link assembled from `Host` is a link an
attacker can point at their own server by sending one request with a forged
header — the classic host-header injection, and the one place in this app where
it would hand over an account.

WHO MAY ASK. Anybody, for any address, and the answer is always the same 204 —
see `SILENT_RESPONSE` in core/views.py. The gates the rest of the app is behind
(consents, the guardian link, `must_change_password`) deliberately do not apply:
this is account administration rather than anything clinical, exactly like
logging out, and an account that is locked on one of those screens still has to
be able to get back into it.
"""

import datetime
import hashlib
import logging

from django.conf import settings
from django.core import mail, signing
from django.template.loader import render_to_string

from .models import User

logger = logging.getLogger(__name__)

#: Namespaces the signature, so a token minted here can never be mistaken for
#: any other signed value this project produces (and vice versa) — the same
#: reason core/throttling.py keeps two separate HMAC salts.
TOKEN_SALT = 'core.password_reset'

#: How long a link works for.
#:
#: An hour rather than Django's own three days. The token is the whole
#: credential — holding it *is* being the account for as long as it lives — and
#: the person who asked for it is reading their mail right now. A long window
#: buys nobody convenience and costs exactly what a leaked mailbox costs.
TOKEN_TTL = datetime.timedelta(hours=1)

#: Where the frontend's confirmation screen lives, appended to
#: `settings.FRONTEND_BASE_URL`. Mirrors `ROUTES.passwordResetConfirm` in
#: src/routes.ts; the token travels in the path, as that route expects.
RESET_PATH = '/password-reset/'

SUBJECT = 'Mediculus — ustawienie nowego hasła'


def _fingerprint(user):
    """A short digest of the account's current password hash.

    Of the **hash**, not the password: this value goes inside a token that
    travels by e-mail, and a digest of a password would be a guessable one. A
    digest of an already-salted hash is neither reversible nor comparable with
    anything.

    16 hex characters is plenty for what it is asked to do — notice that the
    stored hash has changed since the token was minted — and keeps the link
    short enough to survive a mail client wrapping it.

    An account with no usable hash (NULL, or the literal 'mock_hash_placeholder'
    that scripts/mock_data.sql writes) fingerprints as the empty string. That is
    deliberate rather than an oversight: such a row has no password to reset
    *back to*, and refusing it here would leave a seeded account with no way in
    at all.
    """
    return hashlib.sha256((user.password_hash or '').encode()).hexdigest()[:16]


def issue_token(user):
    """A signed, time-limited token that stands for "this account, right now"."""
    return signing.dumps(
        {'u': str(user.pk), 'p': _fingerprint(user)}, salt=TOKEN_SALT,
    )


def resolve_token(token):
    """The account a token was minted for, or None when it no longer stands.

    None covers every way a token can fail, and they are deliberately not told
    apart: a forged signature, a token older than `TOKEN_TTL`, an account
    deleted since, and a password changed since all produce one refusal. The
    caller has one message for the lot (`PasswordResetConfirmSerializer`), which
    is what stops the screen from explaining to a stranger *which* part of a
    token they got right.
    """
    if not isinstance(token, str) or not token:
        return None

    try:
        payload = signing.loads(token, salt=TOKEN_SALT, max_age=TOKEN_TTL)
    except signing.BadSignature:
        # Covers SignatureExpired too, which subclasses it.
        return None

    if not isinstance(payload, dict):
        return None

    user = User.objects.filter(pk=payload.get('u')).first()
    if user is None:
        return None

    # The password has changed since this link was sent — most often because the
    # link itself was already used. See the module header: this is what makes a
    # token single-use without a `used_at` column.
    if payload.get('p') != _fingerprint(user):
        return None

    return user


def user_for_email(email):
    """The account at that address, or None.

    Matched the way `LoginSerializer` matches it — lowercased — so that the same
    address does or does not have an account here regardless of how it was
    typed.
    """
    if not isinstance(email, str) or not email.strip():
        return None
    return User.objects.filter(email=email.strip().lower()).first()


def reset_url(token):
    """The link that goes in the message. See the module header on `Host`."""
    return f'{settings.FRONTEND_BASE_URL.rstrip("/")}{RESET_PATH}{token}'


def build_message(user, token):
    """The e-mail itself, as a plain-text `EmailMessage`.

    PLAIN TEXT AND NOTHING ELSE. No HTML part, no logo, no tracking pixel: this
    message is sent by a mental-health service to an address that may be read on
    a shared device, and every byte of it is visible in the notification banner
    of whatever client receives it. It also carries no name — "Dzień dobry" and
    not "Dzień dobry, Anno" — because the address already identifies the person
    to whoever holds the mailbox, and a name in the subject or body identifies
    them to whoever is looking over their shoulder.

    What it says about the account is nothing at all. Not the role, not a
    specialist, not that a diary exists: only that somebody asked to set a new
    password here.
    """
    body = render_to_string(
        'core/password_reset_email.txt',
        {
            'reset_url': reset_url(token),
            'ttl_minutes': int(TOKEN_TTL.total_seconds() // 60),
        },
    )
    return mail.EmailMessage(subject=SUBJECT, body=body, to=[user.email])


def send_reset(user):
    """Mints a token for `user` and mails it. True when the mailer took it.

    Failures are logged and swallowed rather than raised, because the view above
    answers 204 either way (see `SILENT_RESPONSE`): a mail server that is down
    must not turn into a response that says "this address does have an account
    here, we just could not write to it". The token itself is never logged — it
    is the credential, and a log is one more place it would sit readable.
    """
    message = build_message(user, issue_token(user))
    try:
        mail.mailers['default'].send_messages([message])
    except Exception:
        logger.exception('Nie udało się wysłać wiadomości z linkiem do resetu hasła')
        return False
    return True


def request_reset(email):
    """The whole request half: find the account, send the link if there is one.

    Answers nothing. The caller must not be able to tell the two cases apart
    even by accident, so there is deliberately no return value to branch on —
    the one thing this function is *for* is that an address with an account and
    an address without one leave exactly the same trace in the response.

    An unknown address is therefore cheaper than a known one, which is a timing
    difference and the one leak this design does not close. What bounds it is
    `PasswordResetAccountThrottle`: five attempts an hour against one address is
    a person who cannot find the mail, not a sweep of the user table.
    """
    user = user_for_email(email)
    if user is None or not user.email:
        return
    send_reset(user)
