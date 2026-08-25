"""Tests for `core.days` — where one calendar day ends and the next begins.

Every "which day does this belong to" question in the app goes through here:
the dashboard's seven-day window and streak, and the entry form's one-entry-per-day
rule. Getting it wrong by an hour moves entries between days for anyone who
writes late in the evening, so the timezone is the whole point.
"""

import datetime

from django.test import SimpleTestCase, override_settings
from django.utils import timezone

from core.days import day_bounds, local_date


class DayBoundsTests(SimpleTestCase):
    def test_a_single_day_spans_midnight_to_midnight(self):
        day = datetime.date(2026, 8, 25)

        start, end = day_bounds(day, day)

        self.assertEqual(timezone.localtime(start).strftime('%Y-%m-%d %H:%M'), '2026-08-25 00:00')
        self.assertEqual(timezone.localtime(end).strftime('%Y-%m-%d %H:%M'), '2026-08-26 00:00')

    def test_the_end_is_exclusive_so_two_days_do_not_overlap(self):
        first = datetime.date(2026, 8, 25)
        second = datetime.date(2026, 8, 26)

        _, first_end = day_bounds(first, first)
        second_start, _ = day_bounds(second, second)

        self.assertEqual(first_end, second_start)

    def test_a_range_covers_every_day_in_it(self):
        start, end = day_bounds(datetime.date(2026, 8, 19), datetime.date(2026, 8, 25))

        self.assertEqual((end - start).days, 7)

    def test_the_bounds_are_timezone_aware(self):
        start, end = day_bounds(datetime.date(2026, 8, 25), datetime.date(2026, 8, 25))

        self.assertIsNotNone(start.tzinfo)
        self.assertIsNotNone(end.tzinfo)

    def test_bounds_follow_the_configured_timezone_not_utc(self):
        day = datetime.date(2026, 8, 25)

        warsaw_start, _ = day_bounds(day, day)
        with override_settings(TIME_ZONE='UTC'):
            timezone.deactivate()
            utc_start, _ = day_bounds(day, day)

        timezone.deactivate()
        # Warsaw is ahead of UTC, so its midnight happens earlier in absolute terms.
        self.assertLess(warsaw_start, utc_start)


class LocalDateTests(SimpleTestCase):
    def test_an_entry_written_just_after_midnight_belongs_to_the_new_day(self):
        # The case the whole module exists for: under UTC this would count
        # towards the previous day and silently break someone's streak.
        moment = timezone.make_aware(datetime.datetime(2026, 8, 25, 0, 30))

        self.assertEqual(local_date(moment), datetime.date(2026, 8, 25))

    def test_an_entry_written_just_before_midnight_belongs_to_the_old_day(self):
        moment = timezone.make_aware(datetime.datetime(2026, 8, 25, 23, 30))

        self.assertEqual(local_date(moment), datetime.date(2026, 8, 25))

    def test_a_utc_timestamp_is_converted_before_the_day_is_read(self):
        # 22:30 UTC in August is 00:30 the next day in Warsaw (UTC+2).
        moment = datetime.datetime(2026, 8, 24, 22, 30, tzinfo=datetime.timezone.utc)

        self.assertEqual(local_date(moment), datetime.date(2026, 8, 25))

    def test_a_day_is_bounded_by_its_own_bounds(self):
        day = datetime.date(2026, 8, 25)
        start, end = day_bounds(day, day)

        self.assertEqual(local_date(start), day)
        self.assertEqual(local_date(end - datetime.timedelta(seconds=1)), day)
        # The exclusive end already belongs to the next day.
        self.assertEqual(local_date(end), day + datetime.timedelta(days=1))
