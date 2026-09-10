"""Suplementy i leki — the other half of §08, and the rules behind it.

Out of the views like `core/hydration.py`, so the rules can be tested without a
request, and like it this module sees nothing but an `id_medical`: no name, no
e-mail, no user id.

WHAT §08 DECIDES, and what is therefore not open here:

* **A list, not a counter.** "Suplementy i leki to lista z dawką,
  częstotliwością, godziną oraz datami rozpoczęcia i zakończenia." Every one of
  those is a column below, and none of them is computed from anything.
* **"Odhacz, kiedy weźmiesz."** The checkbox is the whole of the recording, so a
  tick is a row in `supplement_intake` for that supplement and that day — which
  makes unticking a delete, and makes ticking twice (a double-tapped checkbox)
  land on one row rather than two. The same argument `hydration` makes for a row
  per serving: a boolean column on the supplement would be a running value two
  taps can race, and it could not answer "did I take it on Tuesday" at all.
* **The goal is never a verdict**, which is stated about the water counter and
  applies here with more force: nothing in this module counts missed doses,
  computes adherence, or says a day fell short. There is no such field in the
  payload and there must not be one — a "took 3 of 5" figure on a screen a
  patient with an eating disorder opens every morning is precisely the kind of
  score this whole module is built to not have.

TWO THINGS ON THE ARTBOARD ARE NOT IMPLEMENTED AS DRAWN, both deliberately:

1. **Silent reminders.** §08 draws one toggle and describes "jedno powiadomienie
   o wyznaczonej godzinie, bez ponawiania". This deployment has no push and no
   mail of any kind, so a switch promising a notification would promise
   something nothing can send — the same mistake as the home screen's technique
   card, which could only ever show seed data and was removed rather than left
   looking like a feature. `reminder_enabled` is stored per supplement (it is
   the patient's answer, and it is theirs to give before the transport exists),
   the form asks for it, and the screen says out loud that nothing is sent yet.
   When push arrives, the scheduler reads this column and no schema changes.
2. **The mockup's third period wording**, "od 3 marca, wg zaleceń lekarza".
   `end_date` NULL means "bezterminowo" and there is no third column for a
   free-text end: `frequency` is free text ("Pola opisowe, nie słownikowe" is
   §13's rule for the health profile and the right one here), so somebody who
   takes a medicine as instructed writes that there.

THE OPEN QUESTION §08 STATES ITSELF is whether this list is the same data as the
health profile's "przyjmowane leki" or a second entry. It cannot be answered
here, because the health profile (§13) is not built and nothing in this app
holds a medicine today. So this table is the only place a medicine lives, and
when §13 arrives the decision is which of the two reads the other — not a third
copy.
"""

from django.db import transaction
from django.db.models import F
from rest_framework import serializers

from .models import Supplement, SupplementIntake

#: A backstop on rows per patient, in the spirit of
#: `hydration.MAX_ENTRIES_PER_DAY`: this is a table a patient can grow by
#: pressing a button, so a stuck finger (or a script) must not be able to fill
#: it. Comfortably above any real regimen — nobody is on 60 preparations — so
#: nobody meets it by using the app.
MAX_SUPPLEMENTS = 60

#: Refusals the screen renders verbatim.
LIST_IS_FULL = (
    'Na liście jest już maksymalna liczba pozycji. '
    'Usuń którąś, żeby dodać nową.'
)
END_BEFORE_START = 'Data zakończenia nie może być wcześniejsza niż data rozpoczęcia.'


class SupplementSerializer(serializers.Serializer):
    """What the "+ Dodaj suplement lub lek" form sends, and what an edit sends.

    ONLY `name` IS REQUIRED, which is §05's rule about a meal applied to this
    form: a patient who knows they take magnesium and not the dose should be
    able to write it down. Everything else is `allow_null`/`allow_blank`, and a
    blank string is normalised to NULL by `_clean` so "no answer" has one
    representation in the column rather than two the screen has to tell apart.

    `end_date` NULL is "bezterminowo" — the artboard's own wording for the
    vitamin D row — rather than a missing answer, which is why nothing here
    treats it as incomplete.

    PUT replaces rather than merges, the same rule as `/api/diary/today/` and
    the technique form: the form submits its whole state, so a field left out is
    an answer taken back rather than one left unchanged. A merge would make a
    cleared dose indistinguishable from an untouched one.
    """

    name = serializers.CharField(max_length=120)
    dose = serializers.CharField(
        max_length=120, required=False, allow_blank=True, allow_null=True)
    frequency = serializers.CharField(
        max_length=120, required=False, allow_blank=True, allow_null=True)
    hour = serializers.TimeField(required=False, allow_null=True)
    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)
    reminder_enabled = serializers.BooleanField(required=False, default=True)

    def validate(self, attrs):
        start = attrs.get('start_date')
        end = attrs.get('end_date')
        # The one refusal in this form, and it is about a pair rather than a
        # field: either date alone is fine (a regimen that started before the
        # app existed, one with no end), and only the two together can be
        # nonsense. Named under `end_date`, which is the input the patient just
        # answered.
        if start and end and end < start:
            raise serializers.ValidationError({'end_date': END_BEFORE_START})
        return attrs

    def _clean(self, data):
        """The validated form as columns: '' becomes NULL, text is trimmed."""
        def text(key):
            value = (data.get(key) or '').strip()
            return value or None

        return {
            'name': data['name'].strip(),
            'dose': text('dose'),
            'frequency': text('frequency'),
            'hour': data.get('hour'),
            'start_date': data.get('start_date'),
            'end_date': data.get('end_date'),
            'reminder_enabled': data.get('reminder_enabled', True),
        }

    def create(self, validated_data):
        id_medical = self.context['id_medical']
        # Counted inside the transaction, so two submissions racing each other
        # cannot both see 59 rows and both write. Same shape as
        # `hydration.add_entry`.
        with transaction.atomic(using='medical'):
            if Supplement.objects.filter(id_medical=id_medical).count() >= MAX_SUPPLEMENTS:
                # A list, so the body has the same shape as every other
                # request-level refusal in this API — `firstMessage` in
                # src/api/client.ts reads a list's first entry.
                raise serializers.ValidationError({'detail': [LIST_IS_FULL]})
            return Supplement.objects.create(
                id_medical=id_medical, **self._clean(validated_data),
            )

    def update(self, instance, validated_data):
        for field, value in self._clean(validated_data).items():
            setattr(instance, field, value)
        instance.save()
        return instance


def serialize_supplement(supplement, *, taken_today):
    """One row, as `frontend/src/types/diet.ts`'s `Supplement` reads it.

    `taken_today` is passed in rather than looked up per row: the screen draws
    the whole list at once, so the taken set is one query for the day (see
    `list_supplements`) instead of one per supplement.

    The hour and the two dates travel as they are stored — 'HH:MM' and
    'YYYY-MM-DD' — and the *wording* ("od 12 marca, bezterminowo") is composed
    in `frontend/src/utils/supplements.ts`. Composing it here would put Polish
    declensions in two places, and a period line is a label rather than data.

    `id_medical` deliberately never travels, like everywhere else in this API.
    """
    return {
        'id': str(supplement.id_supplement),
        'name': supplement.name,
        'dose': supplement.dose or None,
        'frequency': supplement.frequency or None,
        'hour': supplement.hour.strftime('%H:%M') if supplement.hour else None,
        'start_date': supplement.start_date.isoformat() if supplement.start_date else None,
        'end_date': supplement.end_date.isoformat() if supplement.end_date else None,
        'reminder_enabled': supplement.reminder_enabled,
        'taken_today': taken_today,
    }


def _order(queryset):
    """The order §08 draws the list in: by hour, then by name.

    `nulls_last`, because a preparation with no hour would otherwise open a list
    whose whole shape is "what to take, and when" — Postgres puts NULLs first on
    an ASC ordering unless told otherwise.
    """
    return queryset.order_by(F('hour').asc(nulls_last=True), 'name', 'created_at')


def list_supplements(id_medical, today):
    """The whole list, each row saying whether it was ticked off today.

    Two queries: the rows, and today's ticks. The second is a set of ids rather
    than a join, so the payload's `taken_today` is decided in one place and a
    supplement with no tick today is False rather than absent — the checkbox is
    always drawn, and a missing key would make the screen decide what an unknown
    means.
    """
    supplements = list(_order(Supplement.objects.filter(id_medical=id_medical)))
    taken = set(
        SupplementIntake.objects
        .filter(supplement__id_medical=id_medical, entry_date=today)
        .values_list('supplement_id', flat=True)
    )
    return [
        serialize_supplement(s, taken_today=s.id_supplement in taken)
        for s in supplements
    ]


def find(id_medical, id_supplement):
    """One of this patient's rows, or None.

    Filtered on `id_medical` alongside the id, so somebody else's supplement
    answers exactly like a nonexistent one — the same convention as
    `diary.load_entry` and `hydration.remove_entry`, and the reason the view can
    turn a None into a plain 404 without leaking whether the row exists.
    """
    return Supplement.objects.filter(
        id_medical=id_medical, id_supplement=id_supplement,
    ).first()


def mark_taken(supplement, day):
    """Tick one supplement off for one day. Idempotent.

    `get_or_create` against the `(supplement, entry_date)` unique constraint, so
    a double-tapped checkbox is one row and the second tap is not an error — the
    same decision as accepting a guardian invitation twice.

    ONLY TODAY IS TICKABLE, and the view is what passes today in. That is the
    diary's rule applied to a third kind of row: "did I take it on Tuesday" is a
    fact about Tuesday, and letting it be answered on Friday would make the
    record of a medicine no more reliable than a memory of one.
    """
    _, created = SupplementIntake.objects.get_or_create(
        supplement=supplement, entry_date=day,
    )
    return created


def unmark_taken(supplement, day):
    """Untick it. True if there was a tick to remove.

    A delete rather than a stored "not taken", which is the same choice
    `parent_child` makes for a refused invitation: an absent row is a question
    nobody answered, and there is no third state on a checkbox. It also means
    this module holds no record that somebody *did not* take a medicine — which
    is not the app's judgement to record.
    """
    deleted, _ = SupplementIntake.objects.filter(
        supplement=supplement, entry_date=day,
    ).delete()
    return deleted > 0
