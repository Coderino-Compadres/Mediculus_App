"""The food diary's own rows: what a day holds, and how far the run goes back.

Out of the views like `core/hydration.py` and `core/dashboard.py`, and like them
it sees nothing but an `id_medical` — no name, no e-mail, no user id. The session
is the only identity input and it is resolved in the view.

WHAT THE MODULE IS, in the mockups' own words: "dzienniczek żywieniowy, który
**nie liczy jedzenia** — opisuje je i to, co dzieje się wokół niego". §04 states
the scope outright: no product search and no numeric field, a photo and a
description being the only two sources of a meal's content. So there is nothing
in this module that sums, scores or compares a day, and nothing here could:
`diet_meal` holds a kind, an hour and what the patient typed, and that is the
whole of it.

THE WRITE HALF IS HERE NOW, AND IT IS §04 MINUS THE PHOTO. Reading came first:
the two screens built before it (`pages/DietHome.tsx`, `pages/DietJournals.tsx`)
used to draw `api/diet.ts`'s hardcoded empty day, because nothing could write a
meal and zero was therefore the true answer rather than a placeholder. What held
the write half back afterwards was **one field**: §04 names a photo and a
description as the two sources of a meal's content, and the photo would be the
first file this deployment ever stored — storage, retention and the consent it
falls under are all unanswered.

That was a reason to leave out the photo, not a reason to leave out the form.
`diet_meal` has no photo column and never did, so everything §04 asks for that
the schema can hold — which kind of meal, at what hour, described how — was
already writable, and "Dodaj posiłek" was the module's primary action leading to
a placeholder from two different screens. So `MealSerializer` below writes those
three, the photo stays the open question it always was, and the day it is
answered this module gains a column rather than a form.

NOTHING IS REQUIRED ON A MEAL, which is §05's rule ("Żadne pole nie blokuje
zapisu — niepełny wpis jest lepszy niż brak wpisu") applied to the schema rather
than only to a form: `kind` and `eaten_at` are nullable and `description` may be
empty. A meal that answers nothing is an ordinary row here, and the history
screen renders it as one instead of as something that failed to load.
"""

import datetime

from django.db import transaction
from django.db.models import F
from rest_framework import serializers

from .models import DietMeal

#: The six categories §04 names, in the order it draws them.
#:
#: The Polish name is the stored value, the same arrangement as `core/emotions.py`
#: and `core/drinks.py`: it is short, stable and already the label. The picker on
#: §04's form offers exactly this list, so `frontend/src/utils/meals.ts` now
#: holds a second copy — and `test_drinks.py`'s cross-language guard is mirrored
#: in `test_meals.py`, comparing the names *and their order* in both directions.
#: The order is the one the mockup draws them in, which is also the order of a
#: day, so it is content rather than presentation.
MEAL_KINDS = (
    'Śniadanie', 'Drugie śniadanie', 'Obiad', 'Podwieczorek', 'Kolacja',
    'Przekąska',
)

#: A runaway-query backstop on the history, in the spirit of
#: `diary.MAX_HISTORY_ENTRIES` and not a product limit: the screen filters and
#: pages in the browser, so it is handed everything. Hitting this means the food
#: diary needs real pagination rather than a bigger number.
MAX_HISTORY_MEALS = 1000

#: How far back `streak_days` looks. A run longer than this reads as this — the
#: same bound `dashboard.STREAK_LOOKBACK_DAYS` puts on the psychotherapy streak,
#: for the same reason: the query has to end somewhere.
STREAK_LOOKBACK_DAYS = 400


#: A backstop on meals per day, in the spirit of `hydration.MAX_ENTRIES_PER_DAY`
#: and `supplements.MAX_SUPPLEMENTS`: this is a table a patient can grow by
#: pressing a button, so a stuck finger (or a script) must not be able to fill
#: it. Comfortably above any real day — §04's picker offers six kinds and
#: nobody writes thirty meals — so nobody meets it by using the app.
#:
#: NOT a product rule, and the wording of the refusal has to keep saying so.
#: "Nie możesz dodać więcej" would read as the module judging how much somebody
#: eats, which is precisely what it is built not to do.
MAX_MEALS_PER_DAY = 30

DAY_IS_FULL = (
    'Na dziś jest już zapisanych bardzo dużo posiłków. '
    'Usuń któryś, jeśli chcesz dopisać kolejny.'
)

#: Why an older meal cannot be corrected.
#:
#: The psychotherapy diary's rule applied to a fourth kind of row: today is
#: editable and nothing older is. Said as a sentence rather than answered with
#: a 404, because unlike a serving of water from yesterday, a meal from
#: yesterday is on the history screen the patient is looking at — see `find`.
#:
#: It names no fault of theirs and offers the one thing that still works: the
#: day is closed, not the diary.
MEAL_NOT_TODAY = (
    'Poprawiać można tylko dzisiejsze posiłki — wcześniejsze dni są już '
    'zapisane. Możesz dopisać nowy posiłek do dzisiejszego dnia.'
)


class MealSerializer(serializers.Serializer):
    """What §04's "Dodawanie posiłku" form sends.

    NOTHING IS REQUIRED — §05 states it outright ("Żadne pole nie blokuje
    zapisu — niepełny wpis jest lepszy niż brak wpisu"), and here that is meant
    literally: a meal answering none of the three questions is a valid save. It
    records that a meal happened, which is itself the thing this diary is for,
    and `pages/DietJournals.tsx` already renders such a row as an ordinary one.
    The schema agrees (every column but `entry_date` is nullable or defaulted),
    so refusing an empty body would be a rule invented by this class alone.

    `kind` IS A `ChoiceField` RATHER THAN FREE TEXT, and that is `0009`'s lesson
    applied before it can bite: a plain `Serializer` silently discards a key it
    does not declare, which is how the diary's "pora dnia" was accepted,
    confirmed and dropped for weeks. A kind outside `MEAL_KINDS` is a 400 here.
    The one thing it must never be is quietly thrown away.

    THERE IS NO PHOTO FIELD, no portion, no weight and no calorie count. The
    first is the module's open question (see the module docstring); the rest are
    excluded by §04 rather than missing, and this class is where somebody would
    add them.

    THE DAY IS NOT AN INPUT. `entry_date` comes from the server's clock in
    `create()`, so a date in the body reaches nothing — the same rule the
    supplement tick follows, and the reason is stronger here: which day a meal
    belongs to is a fact about when it was eaten, and a body that could name it
    would let the archive be rewritten from a form that only ever shows today.
    """

    kind = serializers.ChoiceField(
        choices=MEAL_KINDS, required=False, allow_null=True, allow_blank=True)
    # 'HH:MM' — the hour as the mockups label a meal ("Przekąska · 16:20").
    # Null when the question went unanswered, which is not midnight.
    time = serializers.TimeField(required=False, allow_null=True)
    # Free text and deliberately generous: §04 makes the description one of the
    # two things a meal *is*, so somebody describing a difficult meal in a
    # paragraph must not meet a limit. Bounded only so the column cannot be used
    # as storage.
    description = serializers.CharField(
        max_length=2000, required=False, allow_blank=True, allow_null=True)

    def create(self, validated_data):
        id_medical = self.context['id_medical']
        today = self.context['today']

        with transaction.atomic(using='medical'):
            # Counted inside the transaction, so two submissions racing each
            # other cannot both see 29 rows and both write. Same shape as
            # `hydration.add_entry` and `supplements.SupplementSerializer`.
            written = DietMeal.objects.filter(
                id_medical=id_medical, entry_date=today,
            ).count()
            if written >= MAX_MEALS_PER_DAY:
                # A list, so the body has the same shape as every other
                # request-level refusal in this API — `firstMessage` in
                # src/api/client.ts reads a list's first entry.
                raise serializers.ValidationError({'detail': [DAY_IS_FULL]})
            return DietMeal.objects.create(
                id_medical=id_medical,
                entry_date=today,
                kind=(validated_data.get('kind') or None),
                eaten_at=validated_data.get('time'),
                # '' rather than NULL, matching the column: unlike `kind` there
                # is no third state to tell apart — the box was on screen and
                # left empty.
                description=(validated_data.get('description') or '').strip(),
            )

    def update(self, instance, validated_data):
        """PUT **replaces**, the same rule as `/api/diary/today/`.

        The form submits its whole state, so a field left out is an answer
        taken back rather than one left unchanged. A merge would make clearing
        the hour impossible from the only form that writes it.

        `entry_date` is deliberately absent here as it is in `create()`: an
        edit cannot move a meal to another day. Which day a meal belongs to is
        the one thing about it nobody typed — it came from the server's clock —
        and a form that could change it would be a way into an archived day
        through the back door.

        No `MAX_MEALS_PER_DAY` check: this writes no new row, so the count that
        bound is about cannot go up here.
        """
        instance.kind = validated_data.get('kind') or None
        instance.eaten_at = validated_data.get('time')
        instance.description = (validated_data.get('description') or '').strip()
        instance.save(
            update_fields=['kind', 'eaten_at', 'description', 'updated_at'])
        return instance


def serialize_meal(meal):
    """One meal, as `frontend/src/types/diet.ts`'s `DietMeal` reads it.

    `time` is 'HH:MM' rather than the full moment: the mockups label a meal
    "Przekąska · 16:20", and seconds on a meal somebody typed by hand would be a
    precision nobody entered. NULL stays NULL — an hour left blank is an answer
    not given, not a midnight to render.

    There is no photo on this shape yet, and its absence is the module's largest
    open question rather than an oversight — see the module docstring.
    """
    return {
        'id': str(meal.id_meal),
        'kind': meal.kind or None,
        'time': meal.eaten_at.strftime('%H:%M') if meal.eaten_at else None,
        'description': meal.description or '',
    }


def count_meals(id_medical):
    """How many meals this patient has written, all time.

    Deliberately uncapped, unlike `load_history` below, for the same reason
    `diary.count_entries` is: that cap bounds a *list*, and a COUNT(*) has no
    such problem.
    """
    return DietMeal.objects.filter(id_medical=id_medical).count()


def streak_days(id_medical, today):
    """Consecutive days holding at least one meal, ending today or yesterday.

    Yesterday counts as the end of the run for exactly the reason
    `dashboard.streak_days` says: a run of six days must not read as broken from
    midnight until whenever somebody writes today's first meal.

    IT IS ITS OWN COUNT, not the psychotherapy one. Whether the two modules
    share a streak is an open question for the client — the mockup shows one on
    both home screens and says nothing about which — and keeping them separate
    means answering it later is a change to one function rather than to a
    screen. It is deliberately *not* a call to `dashboard.streak_days`: that one
    counts `diary` rows, and a food diary streak fed by psychotherapy entries
    would be a number the diet module cannot account for.

    Counted off `entry_date`, which is already the calendar day in
    `settings.TIME_ZONE` (see the model docstring), so nothing here converts a
    timezone.
    """
    written = set(
        DietMeal.objects
        .filter(
            id_medical=id_medical,
            entry_date__gte=today - datetime.timedelta(days=STREAK_LOOKBACK_DAYS),
            entry_date__lte=today,
        )
        .values_list('entry_date', flat=True)
    )

    day = today if today in written else today - datetime.timedelta(days=1)
    streak = 0
    while day in written:
        streak += 1
        day -= datetime.timedelta(days=1)
    return streak


def today_meals(id_medical, today):
    """Today's meals, in the order the history renders a day.

    Houred meals first and by hour, then the unhoured ones — `load_history`'s
    own ordering, shared rather than restated so the home screen and the
    history cannot disagree about what order a day happened in.
    """
    return list(
        DietMeal.objects.filter(id_medical=id_medical, entry_date=today)
        .order_by(F('eaten_at').asc(nulls_last=True), 'created_at')
    )


def build_diet_day(id_medical, today):
    """Everything `pages/DietHome.tsx` draws about today.

    IT CARRIES THE MEALS THEMSELVES, not only a count. It used to be the count
    alone, on the argument that the home screen renders whether the day has
    started and the meals live a screen away in the history. That stopped being
    true when today's meals became **editable**: correcting a mistyped meal is
    something somebody does about *today*, on the screen they are already on,
    and a home screen that knew only "three" could offer no way to reach the
    one that is wrong. The history still holds every other day.

    `meal_count` stays alongside them rather than being derived in the browser
    from `len(meals)`. It is what the greeting line renders, and two places
    counting one day is how they end up disagreeing — the same reason
    `/api/diet/hydration/` sends its figures rather than its arithmetic.

    Nothing here is a verdict, and there is nothing in the shape that could
    become one: no target, no comparison with yesterday, no flag, and — now
    that the meals travel — still no quantity on any of them. §02's rule is
    that "pusty dzień nie jest brakiem: jest zaproszeniem bez presji", and the
    module's whole premise is that it does not score a day.
    """
    meals = today_meals(id_medical, today)
    return {
        'date': today.isoformat(),
        'streak_days': streak_days(id_medical, today),
        'meal_count': len(meals),
        'meals': [serialize_meal(meal) for meal in meals],
    }


def find(id_medical, id_meal):
    """One of this patient's meals, or None.

    Filtered on `id_medical` alongside the id, so somebody else's meal answers
    exactly like a nonexistent one — the same convention as `supplements.find`
    and `diary.load_entry`.

    IT DOES **NOT** FILTER ON TODAY, unlike `hydration.remove_entry`, and the
    difference is deliberate rather than an inconsistency. Hydration's list
    only ever shows today, so a serving from yesterday is a row the patient
    cannot see and a 404 tells them nothing they did not know. A *meal* from
    yesterday is on the history screen in front of them, and answering "no such
    thing" about a row somebody is looking at is a worse answer than saying it
    is archived. The view checks the day and refuses with `MEAL_NOT_TODAY`.
    """
    return DietMeal.objects.filter(
        id_medical=id_medical, id_meal=id_meal,
    ).first()


def load_history(id_medical):
    """Every day that holds a meal, newest day first, meals newest-first inside.

    A day rather than a flat list of meals, which is the module's own vocabulary:
    a *dzienniczek* is a day (§07, "Historia dzienniczków żywieniowych") and a
    patient looks back on "wtorek", not on the 41st meal. Grouped here rather
    than in the browser so the two ends cannot disagree about which day a meal
    belongs to — `entry_date` is the answer and it is already stored.

    §07's rule is that a day is editable until midnight and archived afterwards.
    That is enforced where a meal is *written* rather than here: `MealSerializer`
    takes the day from the server's clock and no URL names a meal by id, so a
    past day is not refused — it is unreachable, the same shape
    `/api/diary/today/` gives the psychotherapy diary. Correcting or removing a
    meal written today is the next thing this module needs and does not have.
    """
    meals = (
        DietMeal.objects
        .filter(id_medical=id_medical)
        .order_by(
            '-entry_date',
            # `nulls_last`, because Postgres sorts NULLs first on a DESC and an
            # hour left blank would otherwise open the day. A meal that says no
            # hour says nothing about when it was, so it sits after the ones
            # that do rather than above them.
            F('eaten_at').desc(nulls_last=True),
            '-created_at',
        )[:MAX_HISTORY_MEALS]
    )

    days = []
    # One pass, relying on the ordering above: the rows arrive grouped by day
    # already, so a dict plus a re-sort would only be a second ordering free to
    # disagree with the query's.
    for meal in meals:
        if not days or days[-1]['date'] != meal.entry_date.isoformat():
            days.append({'date': meal.entry_date.isoformat(), 'meals': []})
        days[-1]['meals'].append(serialize_meal(meal))
    return days
