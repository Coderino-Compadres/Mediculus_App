"""Whether this account's consents are in force, and how they change.

Two consents, collected separately at registration and withdrawable separately
(art. 7(3): consent is per purpose). Each is a pair of columns on `"user"` — the
moment it was granted and the moment it was withdrawn — and **one comparison,
written here and nowhere else**, decides whether it currently holds:

    granted and not withdrawn since

Restoring writes a new `granted_at`, later than the withdrawal, which turns the
comparison back on without erasing the record of either event. See
`0010_consent_withdrawal` for why withdrawal is not a reset of the grant.

WITHDRAWING DOES NOT END THE ACCOUNT. It used to be described that way — the
health-data consent is the app's only lawful basis, so losing it means the app
cannot process anything — and the conclusion drawn from that was deletion. That
is one way to stop processing and the harshest one: it makes an act the user is
entitled to perform (art. 7(3)) indistinguishable from destroying their record,
and it is not reversible if they change their mind an hour later. Locking the
account is the other way, and it is the one this app takes: nothing is read,
nothing is written, nothing is shown, and the only screen that answers is the one
offering the consent back. Deleting the account stays available as its own
separate decision, which is where irreversibility belongs.

Kept out of the views so the rules can be tested without a request, like
`core/guardian.py` — and because the permission class, the serializer and both
endpoints all have to agree about what "has consents" means.
"""

from django.utils import timezone

#: Which consents exist, in the order both screens list them, and the column
#: pair behind each. The names match `CONSENT_IDS` in src/utils/consents.ts and
#: the `data_consent` / `services_consent` fields on the registration form.
CONSENTS = (
    ('data', 'data_consent_at', 'data_consent_withdrawn_at'),
    ('services', 'services_consent_at', 'services_consent_withdrawn_at'),
)

#: What a withdrawal request may cover. 'all' is its own scope rather than two
#: requests, because consenting to both was one gesture and art. 7(3) asks for
#: withdrawal to be as easy as consenting.
SCOPE_ALL = 'all'
SCOPES = tuple(name for name, _, _ in CONSENTS) + (SCOPE_ALL,)


def _scoped(scope):
    """The (granted, withdrawn) column pairs one scope covers."""
    return [
        (granted, withdrawn)
        for name, granted, withdrawn in CONSENTS
        if scope in (SCOPE_ALL, name)
    ]


def is_active(user, granted_field, withdrawn_field):
    """One consent: granted, and not withdrawn since.

    `<=` rather than `<` on the comparison so that a withdrawal and a restore
    landing in the same microsecond resolve as *restored* — the later request is
    the user's more recent intent, and a tie that fell the other way would leave
    them locked out by a clock.
    """
    granted = getattr(user, granted_field)
    withdrawn = getattr(user, withdrawn_field)
    if granted is None:
        return False
    return withdrawn is None or withdrawn <= granted


def consent_state(user):
    """Every consent's state, as the profile screen and /api/auth/me/ report it."""
    return {
        name: {
            'granted_at': getattr(user, granted),
            'withdrawn_at': getattr(user, withdrawn),
            'active': is_active(user, granted, withdrawn),
        }
        for name, granted, withdrawn in CONSENTS
    }


def has_active_consents(user):
    """Whether this account may use the app at all.

    **Both** consents, not either: they were collected separately because they
    cover different purposes, and the app has no mode that runs on one of them.
    Mirrored character for character by `needsConsents` in src/api/auth.ts —
    change the two together.

    An account that never granted a consent is treated exactly like one that
    withdrew it. That is not only tidiness: rows seeded by `mock_data.sql` have
    neither column set, and they should meet the same screen rather than slip
    past a check keyed on withdrawal alone.
    """
    return all(
        is_active(user, granted, withdrawn) for _, granted, withdrawn in CONSENTS
    )


def withdraw(user, scope, when=None):
    """Withdraw one consent or both. Returns the fields actually written.

    Idempotent: withdrawing an already-withdrawn consent leaves the original
    moment alone rather than moving it forward, so the record says when the user
    decided rather than when they last pressed the button.
    """
    when = when or timezone.now()
    written = []
    for granted, withdrawn in _scoped(scope):
        if is_active(user, granted, withdrawn):
            setattr(user, withdrawn, when)
            written.append(withdrawn)
    if written:
        user.save(update_fields=[*written, 'updated_at'])
    return written


def restore(user, scope, when=None):
    """Grant one consent or both again. Returns the fields actually written.

    Writes a fresh `granted_at` and leaves `withdrawn_at` where it is: the new
    grant is later, so `is_active` turns back on, and the withdrawal stays on the
    record as something that happened. Idempotent for the same reason as
    `withdraw` — re-granting a consent that already holds must not overwrite the
    date the user is shown as the day they gave it.
    """
    when = when or timezone.now()
    written = []
    for granted, withdrawn in _scoped(scope):
        if not is_active(user, granted, withdrawn):
            setattr(user, granted, when)
            written.append(granted)
    if written:
        user.save(update_fields=[*written, 'updated_at'])
    return written
