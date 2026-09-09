"""§10's weekly report for the diet module — what the diaries hold, and nothing else.

Out of the views like `core/hydration.py`, `core/meals.py` and `core/reports.py`,
so the rules can be tested without a request, and like them this module sees
nothing but an `id_medical`: no name, no e-mail, no user id. The session is the
only identity input and it is resolved in the view; `today` is passed in from
`timezone.localdate()`, because every date here is already a calendar date
(`entry_date`) and nothing in this file converts a timezone.

FIVE THINGS §10 DECIDES, none of them a default:

* **The week is counted from the patient's first entry, not from Monday.**
  "Raport generuje się automatycznie co siedem dni, licząc od dnia PIERWSZEGO
  WPISU pacjentki, a nie od poniedziałku." So a week is `[anchor + 7k, anchor +
  7k + 6]` and the grid is fixed once the first meal is written. THIS IS
  DELIBERATELY DIFFERENT from the psychotherapy module, whose weeks are
  Monday-to-Sunday (`core/reports.start_of_week`) — the two modules do not share
  a week and this one must not be "fixed" to Mondays. It is also why this module
  exists at all rather than reusing that one.
* **The week in progress is visible as in progress.** "Bieżący tydzień jest
  widoczny jako w toku i domyka się o północy ostatniego dnia." It travels as
  `in_progress`, a card on the list screen and never a report — again the
  opposite of `core/reports.py`, which leaves the running week out entirely.
* **"Zawartość: tylko dane z dzienniczków. Bez ocen, bez wniosków, bez
  kalorii."** Nothing in this module returns a verdict, a target, a score or a
  percentage, and there is no figure here that a week could fail. The hydration
  row in particular does **not** compare the average with §08's daily goal: that
  goal is "punkt odniesienia, nie wyrok", and a report is exactly where "4,6 z
  6" would read as a mark.
* **Four of the six content rows §10 draws have no column to read.** §05's
  meal-context questions (emotions at eating, physical versus emotional hunger,
  stress, satiety, the triggering situation) are not built, and neither are
  sleep and activity (§09, "Etap 2"). So this module composes the three rows the
  tables can answer and names the rest in `missing` — see `MISSING_SECTIONS`. A
  fabricated figure in a document a specialist reads is this project's worst
  failure mode: the home screen's technique card was removed rather than left
  showing seed data, and the food diary reported zeros rather than the mockup's
  sample numbers. Never invent a number here.
* **Whether the report reaches the specialist is an open question, and the
  payload does not answer it.** "Ekran celowo tego nie przesądza — nie ma na nim
  ani przycisku wyślij, ani informacji o wysyłce." Which is why nothing in this
  shape mentions sharing, sending or who may read it — unlike the psychotherapy
  module's Raporty screen, which carries such a note because there the client
  decided it. Adding one here would answer an open question in markup.

DERIVED, NEVER STORED, like the psychotherapy reports and for the same reason:
every figure is rebuilt from the rows the food-diary and hydration screens show,
so a report cannot disagree with the diary it came from. There is no
`diet_report` table and nothing writes one.
"""

import datetime
import decimal

from django.db.models import Count, Min, Sum
from django.db.models.functions import ExtractHour

from .drinks import GLASS_ML, WATER
from .models import DietMeal, Hydration

#: The length of a report's week. Its own constant rather than an import of
#: `drinks.WEEK_DAYS` (which is a chart's width) or `reports.DAYS_IN_WEEK`
#: (which is a Monday-Sunday week): this one is the stride of the anchor grid,
#: and the three would only look interchangeable.
WEEK_DAYS = 7

#: How far back the grid is walked, as a runaway backstop rather than a product
#: limit — the same role `diary.MAX_HISTORY_ENTRIES` and
#: `meals.MAX_HISTORY_MEALS` play. 260 completed weeks is five years, which is
#: longer than this app has existed and longer than any diary in it; the list
#: screen is handed everything and pages in the browser, so hitting this means
#: the history needs real paging rather than a bigger number.
MAX_REPORTS = 260

#: §10's rows that have no column behind them, worded as the screen lists them.
#:
#: They are NAMED rather than rendered with an invented value, which is the
#: whole argument of this module: a report a specialist reads may be incomplete,
#: and must not be wrong. The first three are §05's meal-context questions (the
#: form that would ask them is not built — the photo in it would be the first
#: file this deployment ever stored, see CLAUDE.md); the last two are §09, which
#: the mockups themselves mark "Etap 2". Each one leaves this tuple and becomes a
#: row on the day a column answers it, and not before.
MISSING_SECTIONS = (
    'emocje przy jedzeniu',
    'głód fizyczny i emocjonalny',
    'sytuacje jedzenia emocjonalnego',
    'sen',
    'aktywność',
)

#: How many whole hours the distribution row may name ("Najwięcej wpisów o 8:00
#: i 13:00."). Past two, naming a couple of the hours that tie for the busiest
#: would put emphasis on an arbitrary half of them, so the row states the count
#: instead — see `_hours_sentence`.
MAX_NAMED_HOURS = 2

#: How many hours a week with no busiest hour may list by name before the row
#: becomes a count instead. Higher than MAX_NAMED_HOURS because a list of "po
#: jednym" hours is the whole of what that week has to say about its hours,
#: while a *tie* for the busiest is a figure that a long list would bury.
MAX_LISTED_HOURS = 4

#: The row labels, uppercase as §10 draws them ("Etykieta i wartość, wiersz po
#: wierszu"). They travel on the wire rather than living in the screen because
#: the payload contract names them, and because a row whose label the frontend
#: supplies is a row the frontend can invent.
LABEL_REGULARITY = 'REGULARNOŚĆ WPISÓW'
LABEL_DISTRIBUTION = 'ROZKŁAD POSIŁKÓW W CIĄGU DNIA'
LABEL_HYDRATION = 'NAWODNIENIE'

_ID_PREFIX = 'week-'

#: 'week-' plus an ISO date is 15 characters. The cap is only so a 500-character
#: route param is refused by a length test rather than by the date parser.
_MAX_ID_LENGTH = 32


# ---- Formatting ----------------------------------------------------------------


def _round1(value):
    """One decimal, rounding halves away from zero.

    The same Decimal/ROUND_HALF_UP as `reports._round1`, and for the same
    reason: `round()`'s banker's rounding sends 0.25 to 0.2 while sending 3.35
    to 3.4, depending on where the float lands. Unpredictable at the boundary is
    a poor property for a figure somebody reads clinically.
    """
    quantized = decimal.Decimal(value).quantize(
        decimal.Decimal('0.1'), rounding=decimal.ROUND_HALF_UP,
    )
    return float(quantized)


def _format_number(value):
    """Polish decimal comma, and no trailing ',0'.

    "4,6" and "4", the way `formatGlasses` in `frontend/src/utils/drinks.ts`
    writes the same number — a report and the hydration screen must not spell
    one figure two ways.
    """
    if float(value).is_integer():
        return str(int(value))
    return f'{value:.1f}'.replace('.', ',')


def _plural_meals(count):
    """1 posiłek, 3 posiłki, 5 posiłków, 13 posiłków."""
    if count == 1:
        return 'posiłek'
    last, teens = count % 10, count % 100
    if 2 <= last <= 4 and not 12 <= teens <= 14:
        return 'posiłki'
    return 'posiłków'


def _plural_written(count):
    """'zapisany' / 'zapisane' / 'zapisanych'.

    Its own helper because the participle agrees with the noun: "31 posiłków
    zapisanych" but "1 posiłek zapisany" and "3 posiłki zapisane". Declining one
    half of the phrase and not the other is how a generated sentence starts
    reading as a template.
    """
    if count == 1:
        return 'zapisany'
    last, teens = count % 10, count % 100
    if 2 <= last <= 4 and not 12 <= teens <= 14:
        return 'zapisane'
    return 'zapisanych'


def _plural_glasses(glasses):
    """'szklanka' / 'szklanki' / 'szklanek', including the fractional case.

    A fraction takes the genitive singular in Polish — "4,6 szklanki", the same
    form as "1,5 litra" — which is the wording §10 itself uses. Worth knowing
    that `pluralGlasses` in `frontend/src/utils/drinks.ts` answers 'szklanek'
    for a fraction; the two disagree on that one branch, this module follows
    §10, and reconciling them is a change to that file (and to the hydration
    screen's wording) rather than to this line.
    """
    if not float(glasses).is_integer():
        return 'szklanki'
    whole = int(glasses)
    if whole == 1:
        return 'szklanka'
    last, teens = whole % 10, whole % 100
    if 2 <= last <= 4 and not 12 <= teens <= 14:
        return 'szklanki'
    return 'szklanek'


# ---- The report id -------------------------------------------------------------


def report_id(start):
    """'week-2026-08-01' — the id of the week beginning on `start`.

    The same convention as `reports.week_report_id`, deliberately: both are a
    slug in a URL a patient can bookmark, and one shape for "a weekly report's
    address" is one thing to remember. What the date means differs — a Monday
    there, a day on this patient's own grid here.
    """
    return f'{_ID_PREFIX}{start.isoformat()}'


def parse_report_id(raw):
    """The week start an id names, or None when it names no week at all.

    Strict about what the id is, and deliberately **case-sensitive**: the
    psychotherapy half matches its report id as an exact string
    (`core.reports.find_report`), and `test_reports_api` pins that 'WEEK-…'
    answers 404 there. Two report endpoints in one app that disagree about case
    would be a wart, and a second address for one document is the thing the
    round-trip check below exists to prevent. Surrounding whitespace is the one
    thing absorbed, because a trailing space in a hand-typed URL is not a
    different week. The round-trip check on the date is
    what keeps ONE address per document — `date.fromisoformat` also accepts
    '20260801' and '2026-W31-1', so without it the same report would answer on
    three URLs and none of them would be the one this module hands out.

    Returning None rather than raising is what lets the view answer a plain 404,
    the same answer another patient's report gets: an id is either a report of
    yours or it is nothing.
    """
    if not raw:
        return None

    text = raw.strip()
    if len(text) > _MAX_ID_LENGTH or not text.startswith(_ID_PREFIX):
        return None

    stamp = text[len(_ID_PREFIX):]
    try:
        parsed = datetime.date.fromisoformat(stamp)
    except ValueError:
        return None
    return parsed if parsed.isoformat() == stamp else None


# ---- The anchor grid -----------------------------------------------------------


def _anchor(id_medical):
    """The patient's earliest meal date, or None if they have never written one.

    A MIN over an indexed column rather than a load of the diary: nothing here
    needs a meal, only the day the grid starts on.
    """
    return DietMeal.objects.filter(id_medical=id_medical).aggregate(
        first=Min('entry_date'),
    )['first']


def _week_index(anchor, day):
    """Which week of the grid a day belongs to. Week 0 begins on the anchor.

    Floor division, so a day before the anchor lands on a negative index rather
    than on week 0. That can only happen with a future-dated row (nothing in the
    app writes one, `mock_data.sql` could), and the honest consequence is a week
    in progress that holds no meals — not a report, since no week has ended.
    """
    return (day - anchor).days // WEEK_DAYS


def _week_bounds(anchor, index):
    """The first and last day of week `index`."""
    start = anchor + datetime.timedelta(days=WEEK_DAYS * index)
    return start, start + datetime.timedelta(days=WEEK_DAYS - 1)


# ---- Loading a window of weeks -------------------------------------------------


class _WeekData:
    """One week's raw counts, before any of it is worded.

    Attributes rather than a dict, like `reports.WeekStats`, so a typo raises
    instead of quietly reading None.
    """

    __slots__ = ('meal_count', 'meal_days', 'hours', 'no_hour', 'water_by_day')

    def __init__(self):
        self.meal_count = 0
        #: The days of this week that hold at least one meal.
        self.meal_days = set()
        #: Whole hour -> how many meals were written at it.
        self.hours = {}
        #: Meals with no hour at all, which §05 allows ("żadne pole nie blokuje
        #: zapisu") and the distribution row therefore has to say out loud.
        self.no_hour = 0
        #: Day -> millilitres of water. Only water, and only days that hold
        #: some — see `_hydration_row`.
        self.water_by_day = {}

    @property
    def days_with_meals(self):
        return len(self.meal_days)


def _load_weeks(id_medical, anchor, first_day, last_day):
    """Every week of the window, keyed by grid index, counted in the database.

    Two aggregate queries rather than a load of the diary: the report needs
    counts per day, per hour and per day of water, and none of them needs a
    meal's description or a serving's id. `meals.load_history` exists for the
    screen that renders rows; this is the one that renders figures.
    """
    weeks = {}

    def week_for(day):
        return weeks.setdefault(_week_index(anchor, day), _WeekData())

    meal_rows = (
        DietMeal.objects
        .filter(id_medical=id_medical, entry_date__gte=first_day, entry_date__lte=last_day)
        # `hour` is NULL for a meal saved without one, which GROUP BY keeps as
        # its own bucket -- so the count of hourless meals falls out of the same
        # query rather than needing a second one.
        .values('entry_date', hour=ExtractHour('eaten_at'))
        .annotate(meals=Count('id_meal'))
    )
    for row in meal_rows:
        week = week_for(row['entry_date'])
        week.meal_count += row['meals']
        week.meal_days.add(row['entry_date'])
        if row['hour'] is None:
            week.no_hour += row['meals']
        else:
            # int(), because Postgres' EXTRACT answers with a numeric: the hour
            # is a dict key here and a label ("8:00") on the screen, and neither
            # should depend on whether the driver handed back 8 or Decimal('8').
            hour = int(row['hour'])
            week.hours[hour] = week.hours.get(hour, 0) + row['meals']

    water_rows = (
        Hydration.objects
        .filter(
            id_medical=id_medical, drink=WATER,
            entry_date__gte=first_day, entry_date__lte=last_day,
        )
        .values('entry_date')
        .annotate(water_ml=Sum('amount_ml'))
    )
    for row in water_rows:
        # `Sum` skips NULLs, so a water row seeded without an amount sums to
        # None -- a day that records no millilitres is not a day of water.
        millilitres = row['water_ml'] or 0
        if millilitres:
            week_for(row['entry_date']).water_by_day[row['entry_date']] = millilitres

    return weeks


# ---- The three rows ------------------------------------------------------------


def _regularity_row(week):
    """"6 z 7 dni · 31 posiłków zapisanych" — two counts and no reading of them."""
    days = week.days_with_meals
    meals = week.meal_count
    return {
        'key': 'regularity',
        'label': LABEL_REGULARITY,
        'value': (
            f'{days} z {WEEK_DAYS} dni · '
            f'{meals} {_plural_meals(meals)} {_plural_written(meals)}'
        ),
    }


def _hours_sentence(hours):
    """"Najwięcej wpisów o 8:00 i 13:00.", or None when no meal carries an hour.

    Counts only. "Wieczorem rzadziej" would be an interpretation of the same
    numbers, and §10's rule is "bez ocen, bez wniosków" — so the row names the
    busiest hours and stops.

    When more than `MAX_NAMED_HOURS` hours tie for the busiest, naming two of
    them would emphasise an arbitrary half of a tie, and naming all of them
    turns the row into a list. So the sentence states the tie as what it is: how
    many meals, across how many hours.

    AND WHEN THE PEAK IS ONE, NOTHING IS "NAJWIĘCEJ" AT ALL: a week whose meals
    each fell in a different hour has no busiest hour, and "Najwięcej wpisów o
    8:00" about a single meal would be emphasis the numbers do not carry -- the
    same "bez wniosków" rule, applied to the word rather than to the figure. So
    that week's hours are simply listed, or counted when there are too many to
    list.
    """
    if not hours:
        return None

    busiest = max(hours.values())
    at_peak = sorted(hour for hour, count in hours.items() if count == busiest)

    if busiest == 1:
        if len(at_peak) <= MAX_LISTED_HOURS:
            return f'Wpisy o {_join_hours(at_peak)}.'
        return f'Wpisy w {len(at_peak)} różnych godzinach, po jednym.'

    if len(at_peak) <= MAX_NAMED_HOURS:
        return f'Najwięcej wpisów o {_join_hours(at_peak)}.'
    return f'Najwięcej wpisów po {busiest}, w {len(at_peak)} różnych godzinach.'


def _join_hours(hours):
    """"8:00, 9:00 i 13:00" -- Polish lists with "i" before the last item."""
    labels = [f'{hour}:00' for hour in hours]
    if len(labels) == 1:
        return labels[0]
    return ', '.join(labels[:-1]) + ' i ' + labels[-1]


def _distribution_row(week):
    """The hours the week's meals were written at, plus the ones with no hour.

    Both halves are optional and at least one is always present: a report exists
    only for a week that holds a meal, and every meal either carries an hour or
    counts towards `no_hour`. A week whose meals all lack an hour therefore says
    only that, which is the true reading of it.
    """
    parts = []
    sentence = _hours_sentence(week.hours)
    if sentence:
        parts.append(sentence)
    if week.no_hour:
        parts.append(f'{week.no_hour} {_plural_meals(week.no_hour)} bez godziny.')

    return {
        'key': 'distribution',
        'label': LABEL_DISTRIBUTION,
        'value': ' '.join(parts),
    }


def _hydration_row(week):
    """Water this week, or None when the week holds none.

    Omitted entirely rather than rendered as a zero: a week nobody logged water
    in is not a week of no water, and "0 szklanek" in a document a specialist
    reads would be a claim about the patient's drinking rather than about the
    diary. The same judgement as an emotion with no row in the psychotherapy
    report.

    THE AVERAGE IS OVER THE DAYS THAT HAVE A SERVING, not over seven — a day
    nobody logged is not a day of nought, and dividing by seven would pull every
    figure down in proportion to how often the patient skipped the screen. It is
    the same argument `reports._emotion_ratings` makes about an unrated chip.

    AND THERE IS NO COMPARISON WITH THE GOAL. §08's rule is that the daily goal
    is a point of reference and never a verdict ("nie ma gratulacji, serii ani
    komunikatu o niedoborze"), and a weekly report is exactly the place where
    "4,6 z 6" would read as a mark.
    """
    logged = list(week.water_by_day.values())
    if not logged:
        return None

    average = _round1(sum(logged) / len(logged) / GLASS_ML)
    return {
        'key': 'hydration',
        'label': LABEL_HYDRATION,
        'value': (
            f'Zapisane w {len(logged)} z {WEEK_DAYS} dni · '
            f'średnio {_format_number(average)} {_plural_glasses(average)} '
            'w dniach z wpisem.'
        ),
    }


def _rows(week):
    """The three rows §10 can actually be given, in the order it draws them."""
    rows = [_regularity_row(week), _distribution_row(week)]
    hydration = _hydration_row(week)
    if hydration is not None:
        rows.append(hydration)
    return rows


# ---- The change against the previous report ------------------------------------


def _change_note(week, previous, adjacent):
    """A direction and a value against the previous report, or None.

    TODO(klientka): the artboard titles this card "Zmiany od ostatniej wizyty",
    and this app holds no visit dates of any kind — there is no appointment
    anywhere in the schema. So what is actually computed is the change from the
    previous week, the screen titles it that way, and whether the client wants
    it tied to visits is a question about a feature that does not exist yet.

    ONLY THE TWO FIGURES WE HOLD are compared: how many days held a meal and how
    many meals there were. Nothing else in the report is a number, so nothing
    else could be compared without inventing one.

    A direction and a value, never an assessment — the same rule the
    psychotherapy report's deltas follow ("+0,6 od poprzedniego tygodnia", never
    a judgement of the patient). None when there is no previous report or when
    neither figure moved: "bez zmian" would be a sentence saying nothing, and
    the screen renders the card only when there is something in it.

    `adjacent` is passed rather than derived because the wording depends on it:
    the previous *report* may be several weeks back (an empty week gets no
    report), and calling that "poprzedni tydzień" would be false.
    """
    if previous is None:
        return None

    reference = 'poprzednim tygodniu' if adjacent else 'poprzednim tygodniu z wpisami'
    sentences = []

    days, previous_days = week.days_with_meals, previous.days_with_meals
    if days != previous_days:
        direction = 'Więcej' if days > previous_days else 'Mniej'
        sentences.append(
            f'{direction} dni z wpisem niż w {reference} ({days} wobec {previous_days}).'
        )

    if week.meal_count != previous.meal_count:
        direction = 'Więcej' if week.meal_count > previous.meal_count else 'Mniej'
        sentences.append(
            f'{direction} posiłków niż w {reference} '
            f'({week.meal_count} wobec {previous.meal_count}).'
        )

    return ' '.join(sentences) or None


# ---- Building the payload ------------------------------------------------------


def _build_report(anchor, index, week, previous, adjacent):
    """One completed week, as `frontend/src/types/dietReport.ts` reads it."""
    start, end = _week_bounds(anchor, index)
    return {
        'id': report_id(start),
        'start': start.isoformat(),
        'end': end.isoformat(),
        # The day after the week ended, i.e. the day this document appeared.
        # Sent rather than derived in the browser so the screen and the server
        # cannot disagree about when a report became available.
        'available_from': (end + datetime.timedelta(days=1)).isoformat(),
        'week_days': WEEK_DAYS,
        'meal_count': week.meal_count,
        'days_with_meals': week.days_with_meals,
        'rows': _rows(week),
        'change_note': _change_note(week, previous, adjacent),
        'missing': list(MISSING_SECTIONS),
    }


def _in_progress(anchor, today, weeks):
    """The running week, as the card on the list screen shows it.

    A card and never a report, which is §10's own distinction: "bieżący tydzień
    jest widoczny jako w toku i domyka się o północy ostatniego dnia". It
    carries the two counts the week has so far and no rows at all — a document
    of a week that has not finished would be a document that changes under the
    reader.
    """
    index = _week_index(anchor, today)
    start, end = _week_bounds(anchor, index)
    week = weeks.get(index) or _WeekData()
    return {
        'start': start.isoformat(),
        'end': end.isoformat(),
        # The same date as `end`, and named separately on purpose: the screen
        # says it in a sentence ("domyka się o północy…"), and a screen that has
        # to know the two are the same is a screen free to disagree about it.
        'closes_on': end.isoformat(),
        'meal_count': week.meal_count,
        'days_with_meals': week.days_with_meals,
    }


def _build_reports(anchor, weeks, first_loaded, first_reported, newest):
    """Every completed week that holds a meal, newest first.

    A COMPLETED WEEK WITH NO MEALS GETS NO REPORT. There is nothing to report on
    — the diaries are the only source — and a run of empty weeks would fill the
    list with identical documents saying so. `reports.build_weekly_reports`
    leaves an empty week out for the same reason. An empty week shifts nothing:
    the grid is anchored on the first meal and a week that holds none still
    occupies its place on it.

    Walked oldest-first because each report's change_note names the previous one
    (`previous_index == index - 1` is what tells an adjacent week from a week
    with empty weeks between them), and reversed at the end because the screen
    reads newest-first. Weeks between `first_loaded` and `first_reported` are
    walked and never emitted: they exist only to give the oldest report a
    comparison — see `build_report_summary` on the cap.
    """
    built = []
    previous = None
    previous_index = None

    for index in range(first_loaded, newest + 1):
        week = weeks.get(index)
        if week is None or not week.meal_count:
            continue
        if index >= first_reported:
            built.append((index, week, previous, previous_index == index - 1))
        previous, previous_index = week, index

    return [
        _build_report(anchor, index, week, earlier, adjacent)
        for index, week, earlier, adjacent in reversed(built)
    ]


def build_report_summary(id_medical, today):
    """The whole of `GET /api/diet/reports/` for one patient.

    NO MEALS EVER is answered with a shape rather than an error: `anchor` null,
    no week in progress and an empty list. The grid starts at the first meal, so
    a patient who has written none has no grid — which is a state the screen
    words ("pierwszy wpis zaczyna pierwszy tydzień"), not a failure.
    """
    anchor = _anchor(id_medical)
    if anchor is None:
        return {'anchor': None, 'in_progress': None, 'reports': []}

    current_index = _week_index(anchor, today)
    newest_index = current_index - 1
    oldest_index = max(0, current_index - MAX_REPORTS)

    # One week further back than the oldest report is loaded and never reported
    # on, purely so that report's change_note has a real comparison rather than
    # one the cap took away. The cap has to end somewhere: if that week holds no
    # meals, the oldest report carries no note, and it is the one place where a
    # missing note is about MAX_REPORTS rather than about the diary.
    first_loaded = max(0, oldest_index - 1)
    window_start, _ = _week_bounds(anchor, first_loaded)
    _, window_end = _week_bounds(anchor, current_index)

    weeks = _load_weeks(id_medical, anchor, window_start, window_end)

    return {
        'anchor': anchor.isoformat(),
        'in_progress': _in_progress(anchor, today, weeks),
        'reports': _build_reports(
            anchor, weeks, first_loaded, oldest_index, newest_index,
        ),
    }


def find_report(id_medical, report_id, today):
    """One report by its route id, or None for an unknown one.

    Built through `build_report_summary`, so the detail screen and the list
    cannot disagree about a week — the same choice `reports.find_report` makes,
    and cheaper here: this module's figures come from two aggregate queries
    rather than from a loaded diary.

    None covers every way an id can fail to name a report of this patient's: a
    malformed id, a day that is not the start of one of their weeks, a week that
    has not ended, a week with no meals, and another patient's week. The view
    answers all of them with a plain 404, so nothing leaks about whether the
    document exists.
    """
    start = parse_report_id(report_id)
    if start is None:
        return None

    # Matched on `start` rather than on the id, because the id is derived from
    # it: comparing the parsed date is the same test without a second place that
    # renders one.
    wanted = start.isoformat()
    for report in build_report_summary(id_medical, today)['reports']:
        if report['start'] == wanted:
            return report
    return None
