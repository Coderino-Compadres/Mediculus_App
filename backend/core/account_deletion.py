"""Deleting an account for good — shared by the account's owner and the admin.

Two doors, one deletion. The owner closes their own account from the profile
(`AccountDeleteView`, POST /api/account/delete/), and an administrator deletes
any account but their own from the panel (`admin_panel.delete_account`). Both
end here, so "what goes when an account is deleted" is answered once — two
copies of it would be two lists free to disagree about somebody's health data.

A HARD DELETE. Rows are removed, not flagged: RODO art. 17 is the reason the
feature exists, and a `deleted_at` column would be a promise the data is gone
kept by every query remembering to filter on it.

What goes, by kind:

* **patient** — every medical_db row under their `id_medical` (diary and its
  mood scales, meals and their emotions, hydration, supplements and their
  intakes, activity, sleep, health profile — the rows hanging off those go by
  cascade), then the account itself, their care links and their guardian links.
  Reports are computed on the fly and never stored, so the diary going is the
  reports going;
* **specialist** — the account and their care links: their patients keep their
  own records and lose only this person's access. The techniques they published
  stay in the catalogue with no author, like the app's own — patients may be in
  the middle of one;
* **guardian** — the account and their links. A minor whose only accepted
  guardian this was is locked again (RODO art. 8) until another accepts;
* **administrator** — the `administrator` row with the account. Only the panel
  may do this, and never to its own account (see `admin_panel`).

THE ORDER ACROSS THE TWO DATABASES IS DELIBERATE. Nothing can make the two one
transaction, so medical_db goes first: if the user_db half then fails, what is
left is an account with no records, which the next attempt finishes deleting.
The other way round, a failure would leave health data that no account points at
any more — unreachable, and impossible to delete on request because nothing says
whose it is.
"""

from django.apps import apps
from django.db import transaction

from .authentication import end_all_sessions
from .models import Patient, Technique
from .routers import MEDICAL_MODELS


def medical_models():
    """Every medical_db model that files rows under a patient's `id_medical`.

    Found rather than listed, so a table added later is deleted with the rest
    instead of silently surviving the account: a list here would be one more
    place to forget.
    """
    return [
        model for model in apps.get_app_config('core').get_models()
        if model._meta.model_name in MEDICAL_MODELS
        and any(field.name == 'id_medical' for field in model._meta.fields)
    ]


def delete_account(user, before_user_delete=None):
    """Remove `user` and everything that is only about them.

    `before_user_delete` runs inside the user_db transaction, just before the
    row goes — the admin panel writes its audit entry there, so the entry and the
    deletion commit or fail together.
    """
    patient = Patient.objects.filter(user=user).first()
    if patient is not None:
        with transaction.atomic(using='medical'):
            for model in medical_models():
                model.objects.filter(id_medical=patient.id_medical).delete()

    # A no-op for anybody who never wrote a technique, so it needs no check of
    # the account's kind first.
    Technique.objects.filter(author_id_specjalist=user.pk).update(
        author_id_specjalist=None,
    )

    with transaction.atomic(using='default'):
        if before_user_delete is not None:
            before_user_delete()
        end_all_sessions(user)
        user.delete()
