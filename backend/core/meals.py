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

WHY THE READ HALF EXISTS BEFORE THE WRITE HALF. The two screens that were built
first (`pages/DietHome.tsx`, `pages/DietJournals.tsx`) used to read
`api/diet.ts`'s hardcoded empty day, because nothing could write a meal and zero
was therefore the true answer rather than a placeholder. This closes the reading
side: those screens now show what the table holds. What is deliberately still
missing is the form that writes one — §04/§05 is a two-step screen with a photo
in it, and the photo is the first file this deployment would ever store (storage,
retention and the consent it falls under are all unanswered, see CLAUDE.md).
`manage.py seed_demo_diary` and `scripts/mock_data.sql` are what put rows here
today. When §04 is built, the write path belongs in this module next to the
reads, and `MEAL_KINDS` is the vocabulary its picker offers.

NOTHING IS REQUIRED ON A MEAL, which is §05's rule ("Żadne pole nie blokuje
zapisu — niepełny wpis jest lepszy niż brak wpisu") applied to the schema rather
than only to a form: `kind` and `eaten_at` are nullable and `description` may be
empty. A meal that answers nothing is an ordinary row here, and the history
screen renders it as one instead of as something that failed to load.
"""

import datetime

from django.db.models import F

from .models import DietMeal

#: The six categories §04 names, in the order it draws them.
#:
#: The Polish name is the stored value, the same arrangement as `core/emotions.py`
#: and `core/drinks.py`: it is short, stable and already the label. There is no
#: second copy in TypeScript — unlike the drinks and the emotions, no screen
#: offers this list yet (a meal is only *displayed* by its kind, and the picker
#: belongs to §04's form, which is not built). Add the cross-language guard
#: `test_drinks.py` uses at the same time as the picker, not before it.
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


def build_diet_day(id_medical, today):
    """Everything `pages/DietHome.tsx` draws about today.

    A *count* of meals rather than the meals themselves, because that screen
    never renders one — it renders whether the day has started. The meals belong
    to "Historia dzienniczków żywieniowych" (`load_history`), which is a screen
    away.

    Nothing here is a verdict, and there is nothing in the shape that could
    become one: no target, no comparison with yesterday, no flag. §02's rule is
    that "pusty dzień nie jest brakiem: jest zaproszeniem bez presji", and the
    module's whole premise is that it does not score a day.
    """
    return {
        'date': today.isoformat(),
        'streak_days': streak_days(id_medical, today),
        'meal_count': DietMeal.objects.filter(
            id_medical=id_medical, entry_date=today,
        ).count(),
    }


def load_history(id_medical):
    """Every day that holds a meal, newest day first, meals newest-first inside.

    A day rather than a flat list of meals, which is the module's own vocabulary:
    a *dzienniczek* is a day (§07, "Historia dzienniczków żywieniowych") and a
    patient looks back on "wtorek", not on the 41st meal. Grouped here rather
    than in the browser so the two ends cannot disagree about which day a meal
    belongs to — `entry_date` is the answer and it is already stored.

    Read-only by construction: nothing in this module writes, and no URL over it
    carries a write verb. §07's rule is that a day is editable until midnight and
    archived afterwards; enforcing that belongs with the form that writes a meal
    (the same shape as `/api/diary/today/`), not here.
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
