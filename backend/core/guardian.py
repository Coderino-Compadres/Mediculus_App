"""The guardian invitation: a minor names an adult, the adult decides.

A `parent_child` row is the link *and* its state: `accepted_at` NULL is an
invitation the guardian has not answered, set is the moment they accepted. A
refusal deletes the row — see 0007_parent_child_accepted_at for why "no" is
recorded as the absence of a link rather than as a third state.

Kept out of the views so the rules can be tested (and reused by the parent
panel, once it exists) without a request. Every function takes the `core.User`
the session resolved to: there is no id on the wire for either side of the link,
so a request can only ever act on the account making it.
"""

from django.utils import timezone

from .models import ParentChild

# What a minor's account can be, from the frontend's point of view. 'accepted'
# is the only one that unblocks the app.
STATUS_NONE = 'none'
STATUS_PENDING = 'pending'
STATUS_ACCEPTED = 'accepted'


def guardian_status(child):
    """Where `child` stands: no guardian named, one waiting, or one accepted."""
    answers = list(
        ParentChild.objects.filter(child=child).values_list('accepted_at', flat=True)
    )
    if not answers:
        return STATUS_NONE
    # An accepted link outranks a pending one. The invitation rules stop a child
    # from holding both, but reading the database as the authority means a row
    # written by hand (or by a future parent panel) cannot lock a linked child
    # out of the app.
    if any(accepted_at is not None for accepted_at in answers):
        return STATUS_ACCEPTED
    return STATUS_PENDING


def serialize_invitation(link):
    """One pending invitation, as the guardian's home screen shows it.

    The child's name and address are the only way the guardian can tell whose
    request this is, so they are the whole payload. Nothing clinical is in here:
    accepting is a decision about a person, not a look at their diary.
    """
    child = link.child
    return {
        'id': str(link.pk),
        'child_name': child.name,
        'child_surname': child.surname,
        'child_email': child.email,
    }


def pending_invitations(guardian):
    """Invitations waiting for `guardian`'s decision.

    Naturally empty for an account nobody named — a patient, a specialist — so
    this needs no permission of its own beyond being signed in.
    """
    links = (
        ParentChild.objects
        .filter(parent=guardian, accepted_at__isnull=True)
        .select_related('child')
        # `parent_child` has no created_at, so "oldest first" is not available;
        # ordering by the child keeps the list stable between requests.
        .order_by('child__name', 'child__surname', 'child__email')
    )
    return [serialize_invitation(link) for link in links]


def accepted_children(guardian):
    """The children this guardian has actually vouched for, with their `user` row.

    `accepted_at__isnull=False` is load-bearing rather than tidy: a pending
    invitation is a request nobody has answered, and letting one through here
    would hand an adult a report on a child's account before that child's
    guardian — possibly a different adult — had agreed to anything. The gate on
    the child's own side reads the same column, so the two cannot disagree about
    what "linked" means.

    Ordered like `pending_invitations`, and for the same reason: `parent_child`
    has no created_at, so the child's own name is what keeps the list stable
    between requests.
    """
    return list(
        ParentChild.objects
        .filter(parent=guardian, accepted_at__isnull=False)
        .select_related('child')
        .order_by('child__name', 'child__surname', 'child__email')
    )


def accept_invitation(guardian, invitation_id):
    """Accept one invitation. False when this guardian has no such invitation.

    Accepting twice is the same answer arriving twice (a double-clicked button),
    not an error — so an already-accepted row succeeds rather than reporting a
    problem the guardian cannot do anything about.
    """
    link = ParentChild.objects.filter(pk=invitation_id, parent=guardian).first()
    if link is None:
        return False
    if link.accepted_at is None:
        link.accepted_at = timezone.now()
        link.save(update_fields=['accepted_at'])
    return True


def reject_invitation(guardian, invitation_id):
    """Refuse one invitation, dropping the row. False when there is none to refuse.

    Filtering on `accepted_at__isnull=True` as well as on `parent` means an
    invitation already accepted is not refusable here: withdrawing an accepted
    link is a different decision (with a child's account behind it) and belongs
    to the parent panel, not to this button.
    """
    deleted, _ = ParentChild.objects.filter(
        pk=invitation_id, parent=guardian, accepted_at__isnull=True,
    ).delete()
    return bool(deleted)


def cancel_invitation(child):
    """Withdraw the invitation `child` sent, so a typo is not a dead end.

    Only a pending one: an accepted link is not the child's to undo, or the
    guardian's oversight would last exactly as long as the child allowed it.
    """
    deleted, _ = ParentChild.objects.filter(
        child=child, accepted_at__isnull=True,
    ).delete()
    return bool(deleted)
