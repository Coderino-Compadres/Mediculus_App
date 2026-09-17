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
* **Every drink counts, water and everything else alike.** `liquid_ml` sums
  every serving of the day whatever its `drink`, so a cup of tea moves the bar
  exactly as far as the same volume of water does. The figure is a volume of
  liquid drunk, which is why it is `liquid_ml` and not `water_ml`, and why the
  report says "Płyny" rather than "Woda".

  **THIS REVERSES §08 OF THE MOCKUPS**, which said "Herbata, kawa i napary są
  zapisywane, ale nie przeliczane na wodę — decyzja merytoryczna zostaje po
  stronie specjalisty", and it is a product decision rather than a refactor: it
  was taken deliberately (2026-09-17) and the wording here is the record of it,
  because the old rule is written down in enough places that somebody will
  otherwise read one of them and "fix" this back. `WATER` survives as a drink
  *name* — the "+ Szklanka" button still records water — and means nothing to
  the total any more. Two places compute the figure, `build_hydration_day` and
  `liquid_by_day`; do not add a third.
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

from .drinks import (BOTTLE_ML, DAILY_TARGET_GLASSES, DEFAULT_SERVING_ML,
                     DRINK_NAME_REQUIRED, GLASS_ML, MAX_DRINK_NAME,
                     normalize_drink,
                     MAX_AMOUNT_ML, MAX_ENTRIES_PER_DAY, MIN_AMOUNT_ML, WATER,
                     WEEK_DAYS)
from .models import Hydration

import datetime

#: Refusals the screen renders verbatim. Named because they are raised from a
#: serializer and asserted in tests.
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

    `drink` defaults to water so the commonest call is `{"amount_ml": 250}`.

    **EVERY DRINK MAY CARRY AN AMOUNT, AND NONE BUT WATER HAS TO.** An amount on
    anything but water used to be a 400, and lifting that was what made
    recording the size of a cup of tea possible at all. It also removed the
    structure the old "nie przeliczamy na wodę" rule leaned on — with no number
    on a tea there was nothing that *could* be added — and since that rule is
    gone too (see the module header), what is left here is the plain reading:
    an amount is how much was drunk, of whatever it was.

    Water still *requires* an amount, because a glass of water of no size moves
    the one figure this screen exists for by nothing. Every other drink falls
    back to `DEFAULT_SERVING_ML`, so a chip tapped once is a serving with a size
    rather than a row the total has to skip.

    **`drink` IS FREE TEXT, NOT A `ChoiceField`**, so a patient can record a
    drink the artboard does not list — §08's chips turned out to be the
    commonest drinks rather than all of them. Nothing about the total depends on
    the name any more: a drink a patient invents counts like any other, which is
    the point.

    A typed name goes through `normalize_drink`, which folds it onto the
    canonical spelling when it matches a chip — otherwise a list would show
    "herbata" and "Herbata" as two drinks. Water's own name is folded like any
    other: typing "woda" here records exactly what "+ Szklanka" records. The one
    name refused is the empty one — a blank `drink` means the custom form was
    submitted with nothing in it, and the refusal lands under `drink`, the input
    that produced it, rather than under `amount_ml`, which that form does not
    render. (This paragraph used to say water's name was refused. It was not
    true after the rule in the module header was reversed; see `validate_drink`
    below, which has said so all along.)
    """

    drink = serializers.CharField(
        required=False, allow_blank=True, max_length=MAX_DRINK_NAME)
    amount_ml = serializers.IntegerField(
        required=False, allow_null=True,
        min_value=MIN_AMOUNT_ML, max_value=MAX_AMOUNT_ML,
    )

    def validate_drink(self, value):
        """A name the column should hold, or a refusal on this field.

        Only the two things that can be wrong with the *name itself*: it is
        blank, or it needs folding onto a canonical spelling. Water is no longer
        a special case here or anywhere else on the write path — a serving of it
        with no size given is a glass, like every other drink.

        An *absent* `drink` is water (the "+ Szklanka" call); this never runs
        for a key that was not sent. A blank string is a different thing from an
        omitted one — somebody submitted the custom form empty — which is why
        the field is `allow_blank` and refused here rather than by DRF.
        """
        name = normalize_drink(value)
        if name is None:
            raise serializers.ValidationError(DRINK_NAME_REQUIRED)
        return name

    # No `validate` of its own any more. Nothing about the *pair* of fields can
    # be wrong: any drink may carry an amount, and one that carries none is a
    # glass (`DEFAULT_SERVING_ML`, applied in `add_entry`). Both refusals that
    # used to live here are gone with the rule that produced them —
    # `AMOUNT_REQUIRED`, because water no longer needs a size given, and
    # `DRINK_IS_WATER`, because typing "woda" in the custom form now records
    # exactly what "+ Szklanka" records and there is nothing left to refuse.


def serialize_entry(entry):
    """One serving, as both the list and the answer to a write render it."""
    return {
        'id': str(entry.id_hydration),
        'drink': entry.drink,
        'amount_ml': entry.amount_ml,
        'at': entry.created_at.isoformat() if entry.created_at else None,
    }


def glasses_for(liquid_ml):
    """Millilitres as glasses, to one decimal.

    One decimal rather than a whole number because "Własna ilość" exists: 400 ml
    is 1,6 glasses and rounding it to 2 would report back more than was entered.
    The screen drops a trailing ",0" itself.

    Public because `core/diet_reports.py` renders the same figure for a day
    inside a weekly report: a report and the hydration screen must not be able
    to disagree about how much Tuesday held.
    """
    return round(liquid_ml / GLASS_ML, 1)


def _week_start(today):
    """The first of the seven days the chart covers, today being the last."""
    return today - datetime.timedelta(days=WEEK_DAYS - 1)


def build_hydration_day(id_medical, today):
    """Everything `pages/DietHydration.tsx` draws, for one patient's today.

    Two queries: today's servings (which the screen lists and can undo) and the
    total per day over the last seven (which is the chart). The chart is
    aggregated in the database rather than by loading a week of rows — nothing
    on screen needs an individual serving from Tuesday.
    """
    entries = list(
        Hydration.objects.filter(id_medical=id_medical, entry_date=today)
        .order_by('-created_at', '-id_hydration')
    )
    # Every serving, whatever it was: the total is a volume of liquid drunk (see
    # the module header). `entries` is already exactly that list, because the
    # screen lists every serving under the bar, so the sum has nothing to
    # filter out.
    liquid_ml = sum(e.amount_ml or 0 for e in entries)

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
        'liquid_ml': liquid_ml,
        'glasses': glasses_for(liquid_ml),
        # Capped for the bar and uncapped in `glasses`: past the goal the bar is
        # simply full, and the day still says what it was.
        'progress': min(1.0, round(liquid_ml / (DAILY_TARGET_GLASSES * GLASS_ML), 3)),
        'entries': [serialize_entry(e) for e in entries],
        'week': _week(id_medical, today),
    }


def liquid_by_day(id_medical, start, end):
    """Liquid drunk per calendar day over a range, as `{date: millilitres}`.

    **ONE OF THE TWO PLACES IN THIS MODULE THAT COMPUTE THE FIGURE**, the other
    being `build_hydration_day`; nothing else may sum `amount_ml`. There is no
    `drink` filter and that is the rule rather than an omission — see the module
    header, and `test_hydration_api.EveryDrinkCountsTests`, which is written
    with litre-sized amounts of tea so a filter creeping back would be
    unmissable rather than a rounding.

    Days with nothing recorded are **absent** rather than zero, unlike `_week`
    below. The chart needs seven columns and a missing key would shift its
    labels; a weekly report needs to tell "nobody wrote it down" from "drank
    nothing", and an absent key is how it does. `core/diet_reports.py` is the
    caller.

    Aggregated in the database rather than by loading the rows: a report spans
    every completed week the patient has, which is a year of servings for an
    account a year old.
    """
    return {
        row['entry_date']: row['total'] or 0
        for row in (
            Hydration.objects
            .filter(
                id_medical=id_medical,
                entry_date__gte=start, entry_date__lte=end,
            )
            .values('entry_date')
            .annotate(total=Sum('amount_ml'))
        )
    }


def first_entry_date(id_medical):
    """The earliest day this patient recorded any serving on, or None.

    Any drink, which is no longer the exception it once was here: the question
    is when the patient started keeping this diary, and somebody whose first act
    was to log a coffee started then. `firstEntryDate` in `utils/dietReport.ts`
    reads the same way — see `core/diet_reports.py`, which latches the week
    anchor from this.

    An exact `MIN` rather than a scan, for the reason that module gives: the
    anchor must not depend on how much history happens to be in hand.
    """
    return (
        Hydration.objects
        .filter(id_medical=id_medical)
        .order_by('entry_date')
        .values_list('entry_date', flat=True)
        .first()
    )


def _week(id_medical, today):
    """The last seven days' totals, oldest first, with the empty ones present.

    A day nobody drank on is `0`, not a gap: the chart draws seven columns and a
    missing key would silently shift the labels. Every drink counts here for the
    same reason the day's own figure counts them — the chart and the number
    above it are the same measurement over different spans, and the two
    disagreeing is the bug this shape exists to prevent.
    """
    start = _week_start(today)
    totals = liquid_by_day(id_medical, start, today)
    days = []
    for offset in range(WEEK_DAYS):
        day = start + datetime.timedelta(days=offset)
        liquid_ml = totals.get(day) or 0
        days.append({
            'date': day.isoformat(),
            'liquid_ml': liquid_ml,
            'glasses': glasses_for(liquid_ml),
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
        # A SERVING WITH NO SIZE GIVEN IS A GLASS. One tap on a chip means "I
        # drank a glass of tea", which is what the "+ Szklanka" button has meant
        # for water all along — so the two acts now write the same number.
        #
        # BE CLEAR THAT THIS IS A NUMBER NOBODY TYPED. It goes into a clinical
        # record and it moves the goal bar — for every drink now, not only for
        # water — so it is the sort of default this project is otherwise
        # careful not to invent (see the
        # diary's sliders, which wrote a 0 nobody chose). It is defensible only
        # because a *serving* is the unit the screen is built in and the patient
        # is told: `pages/DietHydration.tsx` says "Bez podanej ilości zapisujemy
        # szklankę" above the chips. If that line ever goes, this default has to
        # go with it.
        #
        # `None` is still what an *older* row holds — nothing is backfilled, and
        # `serialize_entry` renders a null amount as a drink with no size.
        amount_ml=data.get('amount_ml') or DEFAULT_SERVING_ML,
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
