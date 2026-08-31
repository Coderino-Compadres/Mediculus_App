"""Tests for /api/analysis/frequency/ — how often the patient wrote, by month.

The endpoint exists because `/api/diary/` stops at the 1000 newest rows, so a
patient asking in 2031 about 2026 is asking about entries the browser is never
sent. These tests therefore care most about the two ways a bucket can lie: a
month that reads as skipped when it was not, and a month counted against the
wrong calendar because the boundary was drawn in UTC.

Touches both databases: the session and the `patient` row are in user_db, the
entries being counted are in medical_db.
"""

import datetime

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import SESSION_USER_KEY
from core.frequency import build_year_frequency, years_with_entries
from core.models import Diary, Patient, User, UserRole


def write_entry(id_medical, moment):
    """An entry stamped at an exact instant. `created_at` is `auto_now_add`, so
    an UPDATE is the only way to place a row anywhere but now."""
    diary = Diary.objects.create(id_medical=id_medical)
    Diary.objects.filter(pk=diary.pk).update(created_at=moment)
    return diary


def write_day(id_medical, day, hour=12):
    return write_entry(
        id_medical,
        timezone.make_aware(datetime.datetime.combine(day, datetime.time(hour, 0))),
    )


class FrequencyTestCase(TestCase):
    databases = {'default', 'medical'}

    def setUp(self):
        self.client = APIClient()
        self.url = reverse('core:analysis-frequency')
        self.today = timezone.localdate()
        self.patient = self.create_patient('pacjent@example.com')
        self.sign_in(self.patient.user)

    def create_patient(self, email, role='patient'):
        user_role = UserRole.objects.get_or_create(name=role)[0]
        user = User.objects.create(
            user_role=user_role, email=email, password_hash=make_password('TajneHaslo123'),
        )
        return Patient.objects.create(user=user, is_child=False)

    def sign_in(self, user):
        session = self.client.session
        session[SESSION_USER_KEY] = str(user.pk)
        session.save()
        self.client.cookies[settings.SESSION_COOKIE_NAME] = session.session_key

    def get(self, **params):
        return self.client.get(self.url, params)


class BucketTests(FrequencyTestCase):
    """What one year's worth of buckets says.

    Driven through `build_year_frequency` with an explicit `today` rather than
    through the endpoint: every rule here is about the calendar, and a suite that
    reads the real clock passes or fails depending on the day it runs on. Today
    happening to be the last of the month would hide the `partial` rule entirely.
    """

    def buckets(self, year, today):
        return build_year_frequency(self.patient.id_medical, year, today)

    def test_reaches_a_year_the_entry_list_would_no_longer_carry(self):
        # The whole reason the endpoint exists: a named year, five years back,
        # answered from the database rather than from a capped payload.
        write_day(self.patient.id_medical, datetime.date(2026, 3, 14))

        march = self.buckets(2026, datetime.date(2031, 6, 1))[0]
        self.assertEqual(march['start'], '2026-03-14')
        self.assertEqual(march['days'], 1)

    def test_counts_days_with_an_entry_not_entries(self):
        # Nothing in the schema stops two rows sharing a day, and two entries on
        # one Tuesday is one day of writing, not two.
        write_day(self.patient.id_medical, datetime.date(2026, 5, 6), hour=9)
        write_day(self.patient.id_medical, datetime.date(2026, 5, 6), hour=21)

        may = self.buckets(2026, datetime.date(2026, 12, 31))[0]
        self.assertEqual(may['days'], 1)

    def test_leaves_out_months_before_the_first_entry(self):
        # An empty bar there would read as a month the patient skipped, and
        # "you had not signed up yet" is not a month somebody skipped.
        write_day(self.patient.id_medical, datetime.date(2026, 11, 2))

        starts = [b['start'] for b in self.buckets(2026, datetime.date(2026, 12, 31))]
        self.assertEqual(starts, ['2026-11-02', '2026-12-01'])

    def test_the_first_month_starts_at_the_first_entry_not_at_the_1st(self):
        # The floor is the oldest thing we can prove: the first entry. Counting
        # the days before it would put a denominator on days we cannot show the
        # patient ever had. The frontend's rolling view clips the same way, so
        # one month cannot render two different lengths depending on which of
        # the two produced it.
        write_day(self.patient.id_medical, datetime.date(2026, 11, 2))

        november = self.buckets(2026, datetime.date(2026, 12, 31))[0]
        self.assertEqual((november['start'], november['end']), ('2026-11-02', '2026-11-30'))
        self.assertEqual(november['length'], 29)
        self.assertTrue(november['partial'])

    def test_leaves_out_months_that_have_not_happened_yet(self):
        write_day(self.patient.id_medical, datetime.date(2026, 1, 8))

        buckets = self.buckets(2026, datetime.date(2026, 4, 10))
        self.assertEqual([b['start'][5:7] for b in buckets], ['01', '02', '03', '04'])

    def test_clips_the_running_month_to_today_and_says_it_is_partial(self):
        # 10 days elapsed must not be drawn against a 30-day ceiling: the month
        # is not over, and the bar would understate it for no reason other than
        # the calendar.
        write_day(self.patient.id_medical, datetime.date(2026, 1, 8))

        current = self.buckets(2026, datetime.date(2026, 4, 10))[-1]
        self.assertEqual((current['start'], current['end']), ('2026-04-01', '2026-04-10'))
        self.assertEqual(current['length'], 10)
        self.assertTrue(current['partial'])

    def test_a_month_ending_exactly_on_today_is_whole(self):
        # The off-by-one the previous test cannot see: on the 30th of April the
        # month is both "running" and complete, and calling it partial would put
        # "(30 dni)" under a bar that needs no explaining.
        write_day(self.patient.id_medical, datetime.date(2026, 1, 8))

        april = self.buckets(2026, datetime.date(2026, 4, 30))[-1]
        self.assertEqual(april['length'], 30)
        self.assertFalse(april['partial'])

    def test_a_whole_past_month_is_not_partial(self):
        write_day(self.patient.id_medical, datetime.date(2026, 1, 5))

        february = self.buckets(2026, datetime.date(2026, 12, 31))[1]
        self.assertEqual((february['start'], february['length']), ('2026-02-01', 28))
        self.assertFalse(february['partial'])

    def test_a_year_the_patient_lived_through_and_skipped_is_twelve_zeroes(self):
        # Not the same as a year before they existed, and it must not answer the
        # same way: they were here and wrote nothing, which is a real reading.
        write_day(self.patient.id_medical, datetime.date(2026, 6, 1))

        buckets = self.buckets(2027, datetime.date(2027, 12, 31))
        self.assertEqual(len(buckets), 12)
        self.assertTrue(all(b['days'] == 0 for b in buckets))

    def test_a_year_before_the_first_entry_is_empty_rather_than_twelve_zeroes(self):
        write_day(self.patient.id_medical, datetime.date(2026, 6, 1))
        self.assertEqual(self.buckets(2024, datetime.date(2026, 12, 31)), [])

    def test_a_patient_who_has_never_written_gets_no_buckets(self):
        self.assertEqual(self.buckets(2026, datetime.date(2026, 12, 31)), [])


class YearBoundaryTests(FrequencyTestCase):
    """The boundary is drawn in settings.TIME_ZONE, not in UTC."""

    def test_after_midnight_local_belongs_to_the_new_year(self):
        # 00:30 on 1 January in Warsaw is 23:30 on 31 December UTC. Filed by the
        # UTC clock this entry would land in the wrong year — and the patient
        # would find a day missing from one year and invented in another.
        write_entry(
            self.patient.id_medical,
            timezone.make_aware(datetime.datetime(2026, 1, 1, 0, 30)),
        )

        self.assertEqual(years_with_entries(self.patient.id_medical), [2026])
        january = build_year_frequency(
            self.patient.id_medical, 2026, datetime.date(2026, 12, 31),
        )[0]
        self.assertEqual((january['start'], january['days']), ('2026-01-01', 1))

    def test_late_on_new_years_eve_stays_in_the_old_year(self):
        write_entry(
            self.patient.id_medical,
            timezone.make_aware(datetime.datetime(2026, 12, 31, 23, 45)),
        )

        self.assertEqual(years_with_entries(self.patient.id_medical), [2026])
        december = build_year_frequency(
            self.patient.id_medical, 2026, datetime.date(2026, 12, 31),
        )[-1]
        self.assertEqual((december['start'], december['days']), ('2026-12-31', 1))
        # And nothing of it leaks into the year after.
        self.assertEqual(
            sum(b['days'] for b in build_year_frequency(
                self.patient.id_medical, 2027, datetime.date(2027, 12, 31))),
            0,
        )


class YearListTests(FrequencyTestCase):
    """`years_with_entries` — what the picker is populated from."""

    def test_lists_every_year_that_holds_an_entry_oldest_first(self):
        for year in (self.today.year - 3, self.today.year - 1, self.today.year - 3):
            write_day(self.patient.id_medical, datetime.date(year, 6, 1))

        self.assertEqual(
            self.get().json()['years_with_entries'],
            [self.today.year - 3, self.today.year - 1],
        )

    def test_rides_along_on_every_answer_so_the_screen_needs_one_request(self):
        write_day(self.patient.id_medical, datetime.date(self.today.year - 1, 6, 1))
        body = self.get(year=self.today.year - 1).json()
        self.assertIn('years_with_entries', body)
        self.assertEqual(body['bucket'], 'month')
        self.assertEqual(body['year'], self.today.year - 1)

    def test_is_empty_for_a_patient_with_no_entries(self):
        self.assertEqual(self.get().json()['years_with_entries'], [])


class IsolationTests(FrequencyTestCase):
    """One account can only ever count its own days."""

    def test_another_patients_entries_are_not_counted(self):
        other = self.create_patient('inny@example.com')
        year = self.today.year - 1
        write_day(other.id_medical, datetime.date(year, 4, 4))

        body = self.get(year=year).json()
        self.assertEqual(body['buckets'], [])
        self.assertEqual(body['years_with_entries'], [])

    def test_an_account_with_no_patient_row_is_refused(self):
        role = UserRole.objects.get_or_create(name='rodzic')[0]
        guardian = User.objects.create(
            user_role=role, email='rodzic@example.com',
            password_hash=make_password('TajneHaslo123'),
        )
        self.sign_in(guardian)
        self.assertEqual(self.get().status_code, 403)

    def test_a_visitor_is_refused(self):
        self.client = APIClient()
        self.assertEqual(self.get().status_code, 403)


class RequestShapeTests(FrequencyTestCase):
    """The query parameter, and the verbs the URL does not answer."""

    def test_no_year_means_the_current_one(self):
        self.assertEqual(self.get().json()['year'], self.today.year)

    def test_a_year_that_is_not_a_number_is_rejected(self):
        # Quietly falling back to the current year would draw one year under
        # another year's heading, which is worse than an error.
        response = self.get(year='dwa-tysiace')
        self.assertEqual(response.status_code, 400)
        self.assertIn('year', response.json())

    def test_an_absurd_year_is_rejected_rather_than_crashing_date(self):
        for year in ('0', '999999', '-5'):
            with self.subTest(year=year):
                self.assertEqual(self.get(year=year).status_code, 400)

    def test_the_url_takes_no_write_verb(self):
        for method in (self.client.post, self.client.put, self.client.delete):
            with self.subTest(method=method.__name__):
                self.assertEqual(method(self.url).status_code, 405)
