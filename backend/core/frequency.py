"""How often the patient wrote, over stretches longer than the analysis window.

The "Częstotliwość wpisów" chart on the analysis screen answers "am I keeping
this up". For the last 30 or 90 days the frontend answers that for itself, out
of the entry list it already holds. Reaching back to a *named year* is a
different problem, and it is the reason this module exists rather than another
period chip:

- `/api/diary/` returns at most `MAX_HISTORY_ENTRIES` (1000) rows, newest first,
  with no pagination. At one entry a day that is two years and nine months, so a
  patient asking in 2031 about 2026 would be asking about rows the browser is
  never sent. No amount of UI fixes that, and a year drawn from rows that never
  arrived would render as a flat "you did not write" — a false statement about
  somebody's own history, which is the worst way for this particular chart to be
  wrong.
- Even under the cap it is the wrong shape: a year is ~365 entries, ~264 kB of
  diary text with situations and notes in it, downloaded to a phone to draw
  twelve bars. This answers with twelve numbers.

The same move `core/reports.py` already made, for the same reasons.

Kept out of the views so it can be tested without a request, like
`core/dashboard.py` and `core/reports.py`.

**No Polish in here.** Buckets travel as dates and counts; 'sty'/'lut' are
`frontend/src/utils/analysis.ts`'s business, which already formats month names
for the rolling views. A second copy in Python would be one that can quietly
disagree — the same split as `core/time_of_day.py`, and the opposite of
`core/emotions.py`, where the Polish name *is* the stored value.
"""

import calendar
import datetime

from django.db.models.functions import ExtractYear, TruncDate

from .days import day_bounds
from .models import Diary

#: Months in a year, named rather than spelled 12 at each use site.
MONTHS_IN_YEAR = 12


def years_with_entries(id_medical, today):
    """Every calendar year this patient has at least one entry in, oldest first.

    What the year picker is populated from. It has to come from the database
    rather than from the entry list the screen already holds, for the reason in
    the module docstring: that list stops at the 1000 newest rows, so the years
    missing from it are exactly the ones a long-standing patient would want.

    The year is read in `settings.TIME_ZONE`, like every other calendar question
    in this codebase — an entry written at 00:30 on 1 January belongs to the new
    year, and under UTC it would be filed in the old one.

    Rows dated after today are left out, and `today` is a parameter rather than a
    call to the clock so the boundary can be tested. Nothing in the API writes
    one — `save_today_entry` can only ever address today — but `mock_data.sql`
    and the seed scripts can, and `core/reports.py` already guards against them.
    Without the cutoff the picker would offer a year that `build_year_frequency`
    then draws as empty, because that function stops at today: a year listed as
    having entries and showing none is a worse answer than not listing it.
    """
    _, end_of_today = day_bounds(today, today)
    return sorted(
        Diary.objects.filter(id_medical=id_medical, created_at__lt=end_of_today)
        .annotate(year=ExtractYear('created_at'))
        .values_list('year', flat=True)
        .distinct()
    )


def _days_with_entry(id_medical, first_day, last_day):
    """The calendar days in `[first_day, last_day]` that hold an entry.

    A set of dates rather than a count per month, because the chart counts *days
    with an entry*, not entries: nothing in the schema stops a second row from
    existing for one day, and two rows on one Tuesday must not read as two days
    of writing. `TruncDate` does the UTC→local conversion in the database, so the
    grouping matches `core/days.py`.
    """
    start, end = day_bounds(first_day, last_day)
    return set(
        Diary.objects.filter(id_medical=id_medical, created_at__gte=start, created_at__lt=end)
        .annotate(day=TruncDate('created_at'))
        .values_list('day', flat=True)
        .distinct()
    )


def _first_entry_day(id_medical):
    """The patient's oldest entry as a local date, or None if they have none."""
    oldest = (
        Diary.objects.filter(id_medical=id_medical)
        .annotate(day=TruncDate('created_at'))
        .order_by('created_at')
        .values_list('day', flat=True)
        .first()
    )
    return oldest


def build_year_frequency(id_medical, year, today):
    """One bucket per calendar month of `year`, oldest first.

    Every bucket is clipped to the stretch the patient could actually have
    written in — `today` at the new end, their first entry at the old one — and a
    month falling entirely outside that is left out rather than returned as a
    zero. Both halves of that matter for the same reason: a bar at nought reads
    as a month somebody skipped, and neither "you had not signed up yet" nor
    "that month has not happened" is a month somebody skipped.

    `length` travels with each bucket so the screen can say what the bar is a
    fraction *of*: December is 31 days, a current August cut off on the 28th is
    28, and 18 out of 28 drawn against a 31-day ceiling would understate a month
    for no reason other than the calendar.
    """
    first_day = _first_entry_day(id_medical)
    if first_day is None:
        return []

    # One query for the whole year, bucketed in Python afterwards. Per-month
    # queries would be twelve round trips to draw twelve bars, and the set they
    # would build between them is the same set.
    year_start = max(datetime.date(year, 1, 1), first_day)
    year_end = min(datetime.date(year, MONTHS_IN_YEAR, 31), today)
    if year_end < year_start:
        return []
    written = _days_with_entry(id_medical, year_start, year_end)

    buckets = []
    for month in range(1, MONTHS_IN_YEAR + 1):
        month_start = datetime.date(year, month, 1)
        month_end = datetime.date(year, month, calendar.monthrange(year, month)[1])
        if month_end < first_day or month_start > today:
            continue

        start = max(month_start, first_day)
        end = min(month_end, today)
        buckets.append({
            'start': start.isoformat(),
            'end': end.isoformat(),
            'days': sum(1 for day in written if start <= day <= end),
            'length': (end - start).days + 1,
            # Decided here, where both the clipped and the full month are in
            # hand. The frontend could re-derive it from the dates, but then two
            # places would own the rule about what counts as a whole month.
            'partial': start != month_start or end != month_end,
        })

    return buckets
