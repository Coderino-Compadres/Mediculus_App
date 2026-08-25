"""Calendar days as the person writing the diary experiences them.

Rows are stored in UTC, but a diary "resets at midnight" for its author, so
every question of the form "which day does this entry belong to" is answered in
`settings.TIME_ZONE` (Europe/Warsaw). Under UTC an entry written at 00:30 would
count towards the previous day, and the streak would break for someone who
writes late in the evening.

Both the dashboard's aggregation and the entry form's one-entry-per-day rule
depend on drawing that boundary the same way, which is why this lives in one
place rather than in each of them.
"""

import datetime

from django.utils import timezone


def day_bounds(first_day, last_day):
    """Aware datetimes covering [first_day 00:00, day after last_day 00:00)."""
    start = timezone.make_aware(datetime.datetime.combine(first_day, datetime.time.min))
    end = timezone.make_aware(
        datetime.datetime.combine(last_day + datetime.timedelta(days=1), datetime.time.min)
    )
    return start, end


def local_date(moment):
    """The calendar day an aware datetime falls on, locally."""
    return timezone.localtime(moment).date()
