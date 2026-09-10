"""The hydration screen's numbers — read, written and undone.

Out of the views like `core/dashboard.py` and `core/reports.py`, so the rules
can be tested without a request, and like them it sees nothing but an
`id_medical`: no name, no e-mail, no user id. The session is the only identity
input and it is resolved in the view.

WHAT §08 OF THE MOCKUPS DECIDES, and what is therefore not open here:

* The goal is a **point of reference, never a verdict**. "Po przekroczeniu celu
  pasek po prostu jest pełny. Nie ma gratulacji, serii ani komunikatu o
  niedoborze." So nothing in this module returns a flag, a streak or a
  judgement — the payload is the amount, the goal, and the last seven days.
  `progress` is capped at 1.0 for the bar's sake and the raw `glasses` is sent
  alongside it, so a day over the goal still says what it actually was.
* **Other drinks are recorded and never converted.** `water_ml` sums only
  `drink == WATER`; a serving of tea appears in `entries` and in nothing else.
* The screen shows **today**, and today alone, plus a seven-day bar chart. There
  is no history screen for hydration and no way to write into a past day.

WHAT IS EDITABLE IS TODAY, which is the diary's rule applied to a second kind of
row rather than a new one: `remove_entry` refuses anything but the current
calendar day. A "+1" with no undo is a counter that cannot be corrected, and a
figure a specialist may one day read has to be correctable by the person it
describes on the day they wrote it — but not afterwards, or the last seven days
stop describing the seven days that happened.
"""

from django.db import transaction
from django.db.models import Sum
from rest_framework import serializers

from .drinks import (BOTTLE_ML, DAILY_TARGET_GLASSES, DRINK_IS_WATER,
                     DRINK_NAME_REQUIRED, GLASS_ML, MAX_DRINK_NAME,
                     normalize_drink,
                     MAX_AMOUNT_ML, MAX_ENTRIES_PER_DAY, MIN_AMOUNT_ML, WATER,
                     WEEK_DAYS)
from .models import Hydration

import datetime

#: Refusals the screen renders verbatim. Named because two of them are raised
#: from a serializer and asserted in tests.
AMOUNT_REQUIRED = 'Podaj ilość wody w mililitrach.'
AMOUNT_NOT_FOR_DRINK = (
    'Inne napoje zapisujemy bez ilości — nie przeliczamy ich na wodę.'
)
DAY_IS_FULL = (
    'Na dziś zapisano już maksymalną liczbę porcji. '
    'Jeśli to pomyłka, usuń któryś wpis.'
)


class HydrationEntrySerializer(serializers.Serializer):
    """What "+ Szklanka", "+ Butelka", "Własna ilość" and a drink chip send.

    One serializer for all four, because they are one act: a serving was drunk.
    The buttons differ only in the number they submit, and putting the two fixed
    amounts in the request rather than in an `action` enum is what keeps
    `GLASS_ML`/`BOTTLE_ML` a single definition — `core/drinks.py` on the server,
    `utils/drinks.ts` on the client, pinned to each other by `test_drinks.py`.

    `drink` defaults to water so the commonest call is `{"amount_ml": 250}`, and
    the two amount rules are refused rather than silently applied: a body asking
    to record 400 ml of coffee is asking for something the module does not do,
    and quietly dropping the number is how `time_of_day` lost a patient's answer
    for weeks (see CLAUDE.md).

    **`drink` IS FREE TEXT, NOT A `ChoiceField`**, so a patient can record a
    drink the artboard does not list. It was a closed vocabulary until §08's
    chips turned out to be the commonest drinks rather than all of them, and
    opening it is safe for a specific reason: what keeps the client's "nie
    przeliczamy na wodę" rule true is the **amount** rule below, not the name
    list. Anything that is not `WATER` may carry no amount, so no name a patient
    invents can reach `water_ml`, which sums amounts on water alone.

    A typed name goes through `normalize_drink`, which folds it onto the
    canonical spelling when it matches a chip — otherwise a list would show
    "herbata" and "Herbata" as two drinks. The one name it refuses is water's
    own, because this form asks for no amount and water is meaningless without
    one; the refusal lands under `drink`, the input that produced it, rather
    than under `amount_ml`, which the custom-drink form does not render.
    """

    drink = serializers.CharField(
        required=False, allow_blank=True, max_length=MAX_DRINK_NAME)
    amount_ml = serializers.IntegerField(
        required=False, allow_null=True,
        min_value=MIN_AMOUNT_ML, max_value=MAX_AMOUNT_ML,
    )

    def validate_drink(self, value):
        """A name the column should hold, or a refusal on this field.

        Only the two things that are wrong with the *name itself*: it is blank,
        or it needs folding onto a canonical spelling. Whether water is allowed
        depends on the amount, which is a second field — so that rule lives in
        `validate` below, not here.

        An *absent* `drink` is water (the "+ Szklanka" call); this never runs
        for a key that was not sent. A blank string is a different thing from an
        omitted one — somebody submitted the custom form empty — which is why
        the field is `allow_blank` and refused here rather than by DRF.
        """
        name = normalize_drink(value)
        if name is None:
            raise serializers.ValidationError(DRINK_NAME_REQUIRED)
        return name

    def validate(self, attrs):
        drink = attrs.get('drink', WATER)
        amount = attrs.get('amount_ml')
        if drink == WATER and amount is None:
            # WHICH FIELD CARRIES THIS DEPENDS ON WHICH FORM ASKED, and that is
            # the point rather than a nicety. "+ Szklanka" sends an amount and
            # no name, so a missing amount is genuinely about `amount_ml`. The
            # custom-drink form sends a *typed name* and renders no amount input
            # at all — so somebody who typed "woda" there must be answered on
            # the box they typed into, and told where the amount is asked for.
            # The other way round is a save that fails under an invisible field,
            # which is the failure `Register.tsx` had with `invitation_code`.
            if 'drink' in (getattr(self, 'initial_data', None) or {}):
                raise serializers.ValidationError({'drink': DRINK_IS_WATER})
            raise serializers.ValidationError({'amount_ml': AMOUNT_REQUIRED})
        if drink != WATER and amount is not None:
            raise serializers.ValidationError({'amount_ml': AMOUNT_NOT_FOR_DRINK})
        return attrs


def serialize_entry(entry):
    """One serving, as both the list and the answer to a write render it."""
    return {
        'id': str(entry.id_hydration),
        'drink': entry.drink,
        'amount_ml': entry.amount_ml,
        'at': entry.created_at.isoformat() if entry.created_at else None,
    }


def _glasses(water_ml):
    """Millilitres as glasses, to one decimal.

    One decimal rather than a whole number because "Własna ilość" exists: 400 ml
    is 1,6 glasses and rounding it to 2 would report back more than was entered.
    The screen drops a trailing ",0" itself.
    """
    return round(water_ml / GLASS_ML, 1)


def _week_start(today):
    """The first of the seven days the chart covers, today being the last."""
    return today - datetime.timedelta(days=WEEK_DAYS - 1)


def build_hydration_day(id_medical, today):
    """Everything `pages/DietHydration.tsx` draws, for one patient's today.

    Two queries: today's servings (which the screen lists and can undo) and the
    water total per day over the last seven (which is the chart). The chart is
    aggregated in the database rather than by loading a week of rows — nothing
    on screen needs an individual serving from Tuesday.
    """
    entries = list(
        Hydration.objects.filter(id_medical=id_medical, entry_date=today)
        .order_by('-created_at', '-id_hydration')
    )
    water_ml = sum(e.amount_ml or 0 for e in entries if e.drink == WATER)

    return {
        'date': today.isoformat(),
        # The scale and the goal travel so no screen hardcodes "6" or "250" --
        # a per-patient goal later is then a change to one payload, not to a
        # component. See core/drinks.py on why the goal is not clinical advice.
        'glass_ml': GLASS_ML,
        'bottle_ml': BOTTLE_ML,
        'target_glasses': DAILY_TARGET_GLASSES,
        'min_amount_ml': MIN_AMOUNT_ML,
        'max_amount_ml': MAX_AMOUNT_ML,
        # Travels for the same reason the bounds above do: the "Inny napój"
        # input caps itself at what the serializer will accept, rather than the
        # screen holding its own 40 and finding out by a 400.
        'max_drink_name': MAX_DRINK_NAME,
        'water_ml': water_ml,
        'glasses': _glasses(water_ml),
        # Capped for the bar and uncapped in `glasses`: past the goal the bar is
        # simply full, and the day still says what it was.
        'progress': min(1.0, round(water_ml / (DAILY_TARGET_GLASSES * GLASS_ML), 3)),
        'entries': [serialize_entry(e) for e in entries],
        'week': _week(id_medical, today),
    }


def _week(id_medical, today):
    """The last seven days' water, oldest first, with the empty ones present.

    A day nobody drank on is `0`, not a gap: the chart draws seven columns and a
    missing key would silently shift the labels. Only water is counted, for the
    same reason the total is — the client's rule is that other drinks are not
    converted, and a chart that added them would be doing exactly that.
    """
    start = _week_start(today)
    totals = {
        row['entry_date']: row['total']
        for row in (
            Hydration.objects
            .filter(
                id_medical=id_medical, drink=WATER,
                entry_date__gte=start, entry_date__lte=today,
            )
            .values('entry_date')
            .annotate(total=Sum('amount_ml'))
        )
    }
    days = []
    for offset in range(WEEK_DAYS):
        day = start + datetime.timedelta(days=offset)
        water_ml = totals.get(day) or 0
        days.append({
            'date': day.isoformat(),
            'water_ml': water_ml,
            'glasses': _glasses(water_ml),
        })
    return days


@transaction.atomic(using='medical')
def add_entry(id_medical, data, today):
    """Record one serving against today, or refuse because the day is full.

    Atomic and counting inside the transaction, so two taps racing each other
    cannot both see 39 rows and both write. The cap is a backstop against a
    stuck button rather than a product rule — see `MAX_ENTRIES_PER_DAY`.
    """
    written = Hydration.objects.filter(id_medical=id_medical, entry_date=today).count()
    if written >= MAX_ENTRIES_PER_DAY:
        # A list, so the body has the same shape as every other
        # request-level refusal in this API (see core/serializers.py) --
        # `firstMessage` in src/api/client.ts reads a list's first entry.
        raise serializers.ValidationError({'detail': [DAY_IS_FULL]})

    entry = Hydration.objects.create(
        id_medical=id_medical,
        entry_date=today,
        drink=data.get('drink', WATER),
        amount_ml=data.get('amount_ml'),
    )
    return entry


def remove_entry(id_medical, id_hydration, today):
    """Undo one of today's servings. True if there was one to undo.

    Filtered on `id_medical` as well as on the id, so another patient's row
    answers exactly like a nonexistent one — the same convention as
    `diary.load_entry`, and the reason the view can turn a False into a plain
    404 without leaking whether the row exists.

    Filtered on `entry_date` too: yesterday's servings are as immutable as
    yesterday's diary entry.
    """
    deleted, _ = Hydration.objects.filter(
        id_medical=id_medical, id_hydration=id_hydration, entry_date=today,
    ).delete()
    return deleted > 0
