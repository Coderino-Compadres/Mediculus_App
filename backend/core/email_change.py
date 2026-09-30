"""Changing an account's e-mail address, confirmed from the new address.

TWO HALVES, AND THE ADDRESS CHANGES ONLY IN THE SECOND. The signed-in owner asks
for the change with their current password (POST /api/account/email/); a link
goes to the **new** address; clicking it and pressing "Potwierdź" on the page it
opens (POST /api/auth/email-change/confirm/) is what writes the address. The
reason for the round trip is the address itself: it is how the account is
recovered (core/password_reset.py mails the reset link there), so a typo written
straight to the row would lock the owner out of their own recovery, and a
session left open on a borrowed phone would be enough to move the account to an
address somebody else controls. Proving the password proves the person; the
link proves the mailbox.

THE TOKEN IS NOT STORED, for the reasons core/password_reset.py gives for its
own — a signed value carries the account, the new address and its age, and no
table records who wanted to move their account where. It is single-use without
a column: the payload carries a fingerprint of the account's *current* address,
so once the address has changed every link minted against the old one stops
verifying. A second request does not invalidate the first; `TOKEN_TTL` is short
for that reason.

CONFIRMED BY A BUTTON, NOT BY OPENING THE LINK. Mail clients and corporate
scanners fetch links to preview them, and a GET that changed the address would
be triggered by the scanner rather than the person. The page the link opens
asks, and only its POST writes.

WHAT ENDS. Every session of the account, on confirmation — the same rule the
admin panel applies to an address it changes (`admin_panel.edit_account`) and
password reset applies to a password: whoever was signed in under the old
address signs in again under the new one.

The link is built from `settings.FRONTEND_BASE_URL`, never from `Host` — see
core/password_reset.py for why that matters.
"""

import datetime
import hashlib
import logging

from django.conf import settings
from django.core import mail, signing
from django.db import transaction
from django.template.loader import render_to_string

from .authentication import end_all_sessions
from .models import User

logger = logging.getLogger(__name__)

TOKEN_SALT = 'core.email_change'
TOKEN_TTL = datetime.timedelta(hours=1)
CONFIRM_PATH = '/email-change/'
SUBJECT = 'Mediculus — potwierdzenie nowego adresu e-mail'


def _fingerprint(email):
    """A short digest of the address the account has now — see the module header."""
    return hashlib.sha256((email or '').lower().encode()).hexdigest()[:16]


def issue_token(user, new_email):
    return signing.dumps(
        {'u': str(user.pk), 'e': new_email, 'c': _fingerprint(user.email)},
        salt=TOKEN_SALT,
    )


def resolve_token(token):
    """(user, new_email) a token stands for, or None when it no longer does.

    One None for every way a token fails — forged, too old, account gone,
    address already changed — so the page cannot tell a stranger which part
    they got right.
    """
    if not isinstance(token, str) or not token:
        return None
    try:
        payload = signing.loads(token, salt=TOKEN_SALT, max_age=TOKEN_TTL)
    except signing.BadSignature:
        return None
    if not isinstance(payload, dict) or not isinstance(payload.get('e'), str):
        return None
    user = User.objects.filter(pk=payload.get('u')).first()
    if user is None or payload.get('c') != _fingerprint(user.email):
        return None
    return user, payload['e']


def confirm_url(token):
    return f'{settings.FRONTEND_BASE_URL.rstrip("/")}{CONFIRM_PATH}{token}'


def build_message(new_email, token):
    """Plain text, no name, nothing about the account — as the reset mail."""
    body = render_to_string(
        'core/email_change_email.txt',
        {
            'confirm_url': confirm_url(token),
            'ttl_minutes': int(TOKEN_TTL.total_seconds() // 60),
        },
    )
    return mail.EmailMessage(subject=SUBJECT, body=body, to=[new_email])


def request_change(user, new_email):
    """Mails the confirmation link to `new_email`. True when the mailer took it.

    Unlike the password reset, a failure here is reported: the person asking is
    signed in and has already been told the address is free, so saying "we could
    not send it" discloses nothing and saves them waiting for a mail that is not
    coming. The token is never logged.
    """
    message = build_message(new_email, issue_token(user, new_email))
    try:
        mail.mailers['default'].send_messages([message])
    except Exception:
        logger.exception('Nie udało się wysłać wiadomości z potwierdzeniem nowego adresu')
        return False
    return True


class AddressTaken(Exception):
    """The address was free when the link was sent and is not any more."""


def confirm_change(user, new_email):
    """Write the new address and sign the account out everywhere."""
    with transaction.atomic(using='default'):
        if User.objects.filter(email=new_email).exclude(pk=user.pk).exists():
            raise AddressTaken()
        user.email = new_email
        user.save(update_fields=['email', 'updated_at'])
        end_all_sessions(user)
