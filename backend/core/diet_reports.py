"""The diet module's weekly report — §10, built from the four diaries.

A port of `frontend/src/utils/dietReport.ts` and `frontend/src/utils/
dietWeeks.ts`, which derived the same listing in the browser while there was no
endpoint to ask. Both were written as pure functions over plain data precisely
so this would be a transcription rather than a rewrite, and the contract they
settled on (`frontend/src/types/dietReport.ts`, which describes itself as "a
proposal, not a contract yet") is what this module answers with, snake_cased on
the wire like every other payload.

TWO THINGS THE BROWSER COULD NOT DO ARE FIXED BY THE MOVE, and they are the same
two that justified moving the psychotherapy reports (`core/reports.py`):

- the "has this week ended" cutoff is now read in `settings.TIME_ZONE`, the same
  clock that decided which calendar day each entry belongs to. Read from the
  client, a week the backend already considered over still looked current for a
  few hours west of Warsaw.
- there is one document rather than one per browser. That matters the moment a
  specialist can open one of these — which they cannot yet; see the note at the
  foot of this docstring.

**NOTHING IS SUMMED AND NOTHING IS SCORED.** No total meals for a week, no
millilitres added up, no minutes of activity, no averages and no comparison with
the week before. The report is a listing — the client's own words are "etykieta i
wartość, wiersz po wierszu: data, co się działo" and "bez ocen, bez wniosków,
bez kalorii". The single count in this whole module is `days_with_entry`, which
counts *days the patient wrote something on* and is rendered as a plain number,
never as a fraction of seven: "6 z 7 dni" is a regularity score and this module
does not score. That absence is the thing most likely to be "improved" by
somebody adding an average here, and `test_diet_reports_api` sweeps the payload
for one.

THE WEEK IS NOT A MONDAY. Seven days counted from the patient's first entry —
the client's rule, on her own artboards ("Tydzień liczony od pierwszego wpisu…
a nie od poniedziałku") and said out loud in the meeting. `core/reports.py` goes
on counting Mondays for the psychotherapy module; the two disagreeing is
deliberate, and neither is being unified into the other. What follows from it is
`patient.diet_week_start` (0019): the anchor is *stored*, because derived it
would make every week id a function of whatever history is in hand.

WHAT IS DELIBERATELY NOT BUILT, each argued where it would go:

* **The three §05 sections** — najczęstsze emocje przy jedzeniu, głód fizyczny
  wobec emocjonalnego, sytuacje jedzenia emocjonalnego. All three read the
  psychodietetic context of a meal, and *none of those columns exists*: not in
  `diet_meal`, not in 0016, and §04/§05's form that would write them is not
  built. They join this module together with that form and its migration, and
  not before — a field invented here would be a report claiming to summarise
  something nobody was ever asked.
* **"Zmiany od ostatniej wizyty."** The one pair the mockup says a report may
  compare is the two hungers (§05, neither exists), the app does not know when a
  visit happened, and comparing meal or entry counts week to week would be a
  verdict on how regularly somebody wrote things down.
* **A PDF.** The psychotherapy module renders one (`core/report_pdf.py`); there
  is no such renderer here, and the client has not seen this report's content
  settle yet. `pages/DietReportDetail.tsx` carries the TODO.
* **A specialist's copy.** `/api/specialist/patients/<id>/reports/` serves the
  psychotherapy reports; there is no diet equivalent, and the blocker is
  structural rather than missing work: `patient.id_specjalist` is a single FK,
  so a patient seeing both a psychotherapist and a psychodietitian cannot be
  expressed at all. That is the first thing to fix if the client confirms the
  plural in her own rule ("specjaliści prowadzący pacjenta").

Kept out of the views like `core/reports.py` and `core/dashboard.py`, so it can
be tested without a request.
"""

import datetime

from . import activity as activity_rules
from . import sleep as sleep_rules
from .hydration import glasses_for, water_by_day
from .meals import load_history as load_meal_history
from .meals import first_entry_date as first_meal_date
from .reports import format_week_range
from .time_of_day import EVENING, MORNING, NIGHT, NOON, TIMES_OF_DAY

DAYS_IN_DIET_WEEK = 7

#: The column holding meals saved without an hour. Not a time of day: it is the
#: fifth column of the grid, and §05's "żadne pole nie blokuje zapisu" is what
#: makes it an ordinary answer rather than an error.
MEAL_SLOT_UNSPECIFIED = 'unspecified'

#: Where the four parts of the day begin, in minutes from midnight.
#:
#: **THESE BOUNDARIES ARE THIS MODULE'S OWN.** `core/time_of_day.py` holds the
#: vocabulary — morning/noon/evening/night — and deliberately holds *no clock
#: mapping at all*, because in the psychotherapy module "pora dnia" is a chip
#: the patient taps, never something derived from a timestamp. A meal carries an
#: hour and no chip, so somewhere has to say which hour is which part of the
#: day, and this is that place. The vocabulary is reused rather than reinvented
#: so the two modules use one set of words.
#:
#: **THE NIGHT IS COVERED ON PURPOSE, AND THIS IS A DEPARTURE FROM THE MOCKUP.**
#: The artboard's own bands are 6-10, 10-14, 14-18 and 18-22, which silently
#: drop everything between 22:00 and 06:00. Night eating is precisely what a
#: psychodietitian reads this report for, so a grid that lost a 23:40 meal would
#: be worse than no grid. The four buckets below meet end to end and cover the
#: whole twenty-four hours, with `night` wrapping around midnight.
#:
#: TODO(klientka): the exact cut-offs are the team's, not hers. Worth
#: confirming — a breakfast at 4:50 lands in "Noc" today.
SLOT_STARTS = (
    (5 * 60, MORNING),
    (11 * 60, NOON),
    (17 * 60, EVENING),
    (22 * 60, NIGHT),
)


def meal_slot(time):
    """Which column a meal belongs in. `time` is 'HH:MM' or None.

    A meal with no hour, or an hour nothing can read, goes to
    `MEAL_SLOT_UNSPECIFIED` rather than being guessed into a slot or dropped:
    it is an ordinary entry (§05), and the grid owes it a column of its own.
    """
    if not time:
        return MEAL_SLOT_UNSPECIFIED
    try:
        parsed = datetime.time.fromisoformat(time)
    except ValueError:
        return MEAL_SLOT_UNSPECIFIED

    minutes = parsed.hour * 60 + parsed.minute
    slot = NIGHT
    for boundary, name in SLOT_STARTS:
        if minutes >= boundary:
            slot = name
    # Before 05:00 the loop matches nothing and the answer stays NIGHT, which is
    # the correct one: the night bucket wraps midnight.
    return slot


def diet_week_id(start):
    """The route param and the map key for one week: 'week-2026-09-01'.

    The same shape `reports.week_report_id` gives a psychotherapy week, on
    purpose: one form of week id in the app, even though the two modules
    disagree about which seven days it names.
    """
    return f'week-{start.isoformat()}'


def completed_diet_weeks(first_entry, today):
    """Every week that has *ended*, newest first.

    **THE WEEK IN PROGRESS IS LEFT OUT, AND THAT IS A DEPARTURE FROM BOTH
    MOCKUPS.** Each of them opens the list with the running week as a card
    labelled "W TOKU" / "TRWA". It is left out for two reasons taken together:
    the psychotherapy module already defines a report as something that exists
    once its week has ended (`build_weekly_reports` filters exactly this way),
    and the client asked for reports rather than for a live view of the current
    week. Two modules disagreeing about whether a report can describe an
    unfinished week is a difference a patient crossing between them reads as a
    fault. If she asks for the running week back, this is the one function that
    changes.

    A week has ended when `today` has moved past its last day, so a week whose
    last day *is* today is still running and closes at midnight.

    An empty result is the ordinary state of a diary younger than a week, and a
    `first_entry` in the future (a clock somebody set forward) yields one too
    rather than looping.
    """
    if first_entry is None:
        return []

    weeks = []
    start = first_entry
    while True:
        end = start + datetime.timedelta(days=DAYS_IN_DIET_WEEK - 1)
        if end >= today:
            break
        weeks.append((start, end))
        start = start + datetime.timedelta(days=DAYS_IN_DIET_WEEK)

    weeks.reverse()
    return weeks


def diet_week_days(start):
    """The week's seven days, **in the week's own order** — starting at `start`,
    which is where the chips and the day-by-day list start too."""
    return [start + datetime.timedelta(days=offset) for offset in range(DAYS_IN_DIET_WEEK)]


def first_entry_date(id_medical):
    """The earliest day anything was written on, across all four diaries.

    An exact `MIN` per diary rather than a scan of the histories: this answer is
    latched into `patient.diet_week_start` and must not depend on how much
    history happens to be in hand. `meals.load_history` is capped at
    `MAX_HISTORY_MEALS`, so deriving it from that list would have quietly moved
    the anchor for anybody past the cap.

    Supplements are deliberately **not** one of the four. A preparation on the
    "Suplementy i leki" list is a regimen rather than a day's entry — it carries
    a start date that may predate the app — and the four diaries are what §10's
    report actually lists. `firstEntryDate` in `utils/dietReport.ts` takes the
    same four.
    """
    from .hydration import first_entry_date as first_water_date

    found = [
        date for date in (
            first_meal_date(id_medical),
            first_water_date(id_medical),
            activity_rules.first_entry_date(id_medical),
            sleep_rules.first_entry_date(id_medical),
        )
        if date is not None
    ]
    return min(found) if found else None


def latch_week_start(patient):
    """The day this patient's diet weeks are counted from, stored on first use.

    **THE ANCHOR IS WRITTEN ONCE AND NEVER MOVED**, which is the whole reason
    `patient.diet_week_start` exists (see 0019). Derived per request, one older
    entry appearing — or the oldest falling off a capped history — renumbers
    every report the patient has, and with it every bookmark and every reference
    two people in a consulting room might make to one.

    Latched here, on a read, rather than written by every diet write path. Both
    were possible and this one is smaller and self-healing: it is one place
    rather than five, it fills correctly for the accounts that already have
    history (nothing needed a backfill), and it converges — an account that
    writes its first entry and then opens the reports gets the same answer
    either way. The cost is a write during a GET, which is idempotent and
    happens at most once per patient.

    Returns None for a patient with no diet entry at all, which is the ordinary
    state of a new account and which yields no reports.
    """
    if patient.diet_week_start is not None:
        return patient.diet_week_start

    first = first_entry_date(patient.id_medical)
    if first is None:
        return None

    patient.diet_week_start = first
    patient.save(update_fields=['diet_week_start'])
    return first


def _meal_grid(days):
    """The "Pory posiłków" table: one row per day, one cell per slot.

    THE MEALS THEMSELVES AND NEVER A COUNT. The grid draws one dot per meal and
    names each dot by its kind; it prints no number in a cell, at the end of a
    row or at the foot of a column, and `DietReportDetail.test.tsx` sweeps for
    one. A count here would be the first tally in a module built without any.
    """
    slots = list(TIMES_OF_DAY)
    # The fifth column exists only when the week actually holds a meal with no
    # hour. An always-present empty column would read as a question the patient
    # failed to answer rather than as one they were never asked.
    if any(
        meal_slot(meal['time']) == MEAL_SLOT_UNSPECIFIED
        for day in days for meal in day['meals']
    ):
        slots.append(MEAL_SLOT_UNSPECIFIED)

    rows = [
        {
            'date': day['date'],
            'cells': [
                {
                    'slot': slot,
                    'meals': [
                        meal for meal in day['meals'] if meal_slot(meal['time']) == slot
                    ],
                }
                for slot in slots
            ],
        }
        for day in days
    ]
    return {'slots': slots, 'rows': rows}


def _by_hour(meals):
    """Meals in the order they were eaten, with the unhoured ones last.

    OLDEST FIRST INSIDE THE DAY, which is the one place this module orders a day
    differently from `meals.load_history` — that one is newest-first, because it
    is a list somebody scrolls. A report reads as the day happened, so breakfast
    comes before supper. `mealsByHour` in `utils/dietReport.ts` does the same.
    """
    return sorted(
        meals,
        key=lambda meal: (meal['time'] is None, meal['time'] or ''),
    )


def build_report(week_start, week_end, days):
    """One week's report from seven already-built days."""
    return {
        'id': diet_week_id(week_start),
        'week_start': week_start.isoformat(),
        'week_end': week_end.isoformat(),
        # The same three cases `format_week_range` handles for a psychotherapy
        # week, and the same en dash -- shared rather than re-derived, so the
        # two modules at least *print* a week the same way.
        'range_label': format_week_range(week_start, week_end),
        'days': days,
        # A plain count, never a fraction of seven. See the module docstring.
        'days_with_entry': sum(1 for day in days if not day['empty']),
        'meal_grid': _meal_grid(days),
    }


def build_diet_reports(id_medical, first_entry, today):
    """Every report the four diaries support, newest first.

    Two kinds of week are absent, both matching what the psychotherapy module
    does with its own: **the week in progress** (a report describes a week that
    has ended) and **a week nobody wrote anything in** (the diaries are the only
    source, so there would be nothing to list).

    One pass over each diary for the whole span rather than one query per week:
    a patient with a year of entries has fifty-odd weeks, and a per-week query
    would be four hundred round trips to render a list of rows nobody has opened
    yet.
    """
    weeks = completed_diet_weeks(first_entry, today)
    if not weeks:
        return []

    # The whole span the reports cover, oldest week's first day to newest week's
    # last. `weeks` is newest first, so the ends are the last and the first.
    span_start = weeks[-1][0]
    span_end = weeks[0][1]

    meals_by_date = {day['date']: day for day in load_meal_history(id_medical)}
    water_by_date = water_by_day(id_medical, span_start, span_end)
    activity_by_date = activity_rules.load_history(id_medical, span_start, span_end)
    sleep_by_date = sleep_rules.load_history(id_medical, span_start, span_end)

    reports = []
    for week_start, week_end in weeks:
        days = [
            _build_day(day, meals_by_date, water_by_date, activity_by_date, sleep_by_date)
            for day in diet_week_days(week_start)
        ]
        report = build_report(week_start, week_end, days)
        # A week the patient wrote nothing in has nothing to list, so it is not
        # a report -- the same rule `build_weekly_reports` applies to a week
        # with no diary entries.
        if report['days_with_entry'] > 0:
            reports.append(report)

    return reports


def _build_day(day, meals_by_date, water_by_date, activity_by_date, sleep_by_date):
    """One day of a report — everything the four diaries hold about it.

    **NOTHING IS SUMMED AND EVERY FIELD MAY BE NULL.** A day with no water row
    is `hydration: None`, not zero millilitres: "nobody wrote it down" and "this
    person drank nothing" are different claims and the module is only ever
    entitled to the first. The same rule the diary applies to an untouched
    slider.
    """
    key = day.isoformat()

    meals = _by_hour(meals_by_date.get(key, {}).get('meals', []))

    # A day nobody recorded a serving on is absent from `water_by_day`, and a
    # day holding only tea has a row of 0 -- which is not a serving of water and
    # must not make the day count as written-on. `hasHydration` in
    # utils/dietReport.ts reads it the same way.
    water_ml = water_by_date.get(day, 0)
    hydration = None
    if water_ml > 0:
        hydration = {
            'date': key,
            'water_ml': water_ml,
            # The hydration screen's own figure, from the same function, so a
            # report and that screen cannot disagree about a day.
            'glasses': glasses_for(water_ml),
        }

    activity = activity_by_date.get(key)
    if activity is not None and not activity_rules.has_activity(activity):
        activity = None

    # Matched on the *morning* the night ended on, which is what
    # `diet_sleep.entry_date` holds -- so a night belongs to the week its
    # morning falls in. See core/sleep.py.
    night = sleep_by_date.get(key)
    if night is not None and not sleep_rules.has_night(night):
        night = None

    return {
        'date': key,
        'meals': meals,
        'hydration': hydration,
        'sleep': night,
        'activity': activity,
        # Rendered as "brak wpisu" -- an ordinary day, never a gap to apologise
        # for, which is what the footer on the detail screen says in words.
        'empty': not meals and hydration is None and night is None and activity is None,
    }


def find_diet_report(reports, report_id):
    """One report by its route id, or None when the id names no week with entries.

    A typed-in id and a week nobody wrote in answer the same way, because
    neither tells the patient anything they can act on — the same convention as
    `reports.find_report` and as `/api/diary/<id>/`.
    """
    for report in reports:
        if report['id'] == report_id:
            return report
    return None
