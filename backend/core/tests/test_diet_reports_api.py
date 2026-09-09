"""`/api/diet/reports/` — the diet module's weekly reports (mockups §10).

WHAT §10 DECIDES, and therefore what is pinned here rather than left to taste:

* **The week counts from the patient's first meal, not from Monday.** "Raport
  generuje się automatycznie co siedem dni, licząc od dnia pierwszego wpisu
  pacjentki, a nie od poniedziałku." So the grid is `[anchor + 7k, anchor + 7k +
  6]` and `WeekGridTests` pins that a diary opened on a Thursday gets
  Thursday-to-Wednesday weeks. This is **not** `core/reports.py`'s Monday-Sunday
  grid: a later pass "fixing" it to Mondays would move every boundary this
  module has ever drawn, and would re-date reports a specialist has already
  read. The tests count from `today` rather than from a literal date, so which
  weekday the suite runs on cannot make them pass or fail.
* **The current week is a card, never a report.** "Bieżący tydzień jest widoczny
  jako w toku i domyka się o północy ostatniego dnia." The psychotherapy module
  leaves the week in progress out of its list entirely; this one shows it as
  `in_progress`, and `InProgressTests` pins that it carries no id — so its start
  cannot be opened as a report either.
* **"Zawartość: tylko dane z dzienniczków. Bez ocen, bez wniosków, bez
  kalorii."** `NothingIsAVerdictTests` sweeps every key and every rendered
  string for a target, a percentage, a goal comparison, a calorie and any
  wording that would turn the document into a mark on the person it describes.

WHY THE REPORT HAS THREE ROWS AND NOT SIX, which is the property most likely to
be "completed" by a later pass. medical_db holds `diet_meal` and `hydration` and
nothing else from this module: §05's meal-context questions (emotions, physical
against emotional hunger, the situation around eating) have no columns because
that form is not built, and sleep and activity are §09's "Etap 2". Four of §10's
six content rows therefore have no source, and they travel in `missing` rather
than as rows with an invented value — `MissingSectionsTests` pins the
difference in both directions. A fabricated figure in a document a specialist
reads is this project's worst failure mode; the home screen's technique card was
removed rather than left showing seed data for exactly that reason.

WHAT IS DELIBERATELY ABSENT AND HAS TO STAY ABSENT: §10 records an open question
— whether the report reaches the specialist automatically or only once the
patient confirms — and answers it nowhere. "Ekran celowo tego nie przesądza —
nie ma na nim ani przycisku wyślij, ani informacji o wysyłce." The screen's half
of that is no button and no note; the payload's half is that nothing in it
mentions sending, sharing or who else may read it, which `OpenQuestionTests`
sweeps for. Putting such a note here would answer the question in markup.
"""

import datetime
import json
import re

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import SESSION_USER_KEY
from core.drinks import GLASS_ML, OTHER_DRINKS, WATER
from core.models import (DietMeal, Hydration, Patient, Specjalist, User,
                         UserRole)

PASSWORD = 'TajneHaslo123'

#: `date.weekday()` is Monday-first, so a Thursday anchor is 3 and the Wednesday
#: that closes its week is 2. Named because the whole point of the grid is that
#: it does not land on 0.
THURSDAY = 3
WEDNESDAY = 2

#: One week, in days. The grid's stride and the report's own `week_days`.
WEEK = 7


class DietReportTestCase(TestCase):
    databases = {'default', 'medical'}

    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()
        # The grid most tests use: the anchor three whole weeks back, so the
        # completed weeks are [anchor, +6], [+7, +13], [+14, +20] and the week
        # holding today is [today, today+6]. Relative to today rather than a
        # literal date, because a report boundary here is counted from the first
        # meal and must not depend on what day the suite runs on.
        self.anchor = self.days_ago(3 * WEEK)
        self.last_week = self.days_ago(WEEK)
        self.current_week = self.today
        self.patient = self.make_patient()
        self.sign_in(self.patient.user)

    # -- accounts ---------------------------------------------------------

    def make_user(self, email='pacjent@example.com', role='patient'):
        return User.objects.create(
            user_role=UserRole.objects.get_or_create(name=role)[0] if role else None,
            email=email, password_hash=make_password(PASSWORD),
            data_consent_at=timezone.now(), services_consent_at=timezone.now(),
        )

    def make_patient(self, email='pacjent@example.com', is_child=False):
        return Patient.objects.create(user=self.make_user(email), is_child=is_child)

    def sign_in(self, user):
        session = self.client.session
        session[SESSION_USER_KEY] = str(user.pk)
        session.save()
        self.client.cookies[settings.SESSION_COOKIE_NAME] = session.session_key

    # -- rows -------------------------------------------------------------

    def meal(self, on, patient=None, kind='Obiad', at='13:00', text='Zupa.'):
        """One meal on a given day. `at=None` is a meal saved with no hour."""
        return DietMeal.objects.create(
            id_medical=(patient or self.patient).id_medical,
            entry_date=on,
            kind=kind,
            eaten_at=datetime.time.fromisoformat(at) if at else None,
            description=text,
        )

    def water(self, on, ml=GLASS_ML, patient=None):
        return Hydration.objects.create(
            id_medical=(patient or self.patient).id_medical,
            entry_date=on, drink=WATER, amount_ml=ml,
        )

    def other_drink(self, on, drink=None, patient=None):
        """A serving of something that is recorded and never converted to water."""
        return Hydration.objects.create(
            id_medical=(patient or self.patient).id_medical,
            entry_date=on, drink=drink or OTHER_DRINKS[0], amount_ml=None,
        )

    # -- the grid ---------------------------------------------------------

    def days_ago(self, days):
        return self.today - datetime.timedelta(days=days)

    def day(self, start, offset):
        return start + datetime.timedelta(days=offset)

    def open_the_diary(self):
        """The first meal, which is what fixes the anchor at `self.anchor`."""
        return self.meal(on=self.anchor)

    def a_past_thursday(self, at_least_days_ago=3 * WEEK):
        """A Thursday at least three weeks back, whatever today happens to be."""
        day = self.days_ago(at_least_days_ago)
        return day - datetime.timedelta(days=(day.weekday() - THURSDAY) % WEEK)

    def report_id(self, start):
        return f'week-{start.isoformat()}'

    # -- requests ---------------------------------------------------------

    def list_url(self):
        return reverse('core:diet-reports')

    def detail_url(self, report_id):
        return reverse('core:diet-report', args=[report_id])

    def raw_detail_url(self, report_id):
        """The literal path, for ids `reverse()` cannot build (a slash, empty)."""
        return f'/api/diet/reports/{report_id}/'

    def summary(self):
        response = self.client.get(self.list_url())
        self.assertEqual(response.status_code, 200)
        return response.json()

    def reports(self):
        return self.summary()['reports']

    def report(self, start):
        """One report, read through the detail URL."""
        response = self.client.get(self.detail_url(self.report_id(start)))
        self.assertEqual(response.status_code, 200)
        return response.json()

    def rows(self, report):
        """The report's rows as {key: value}, which is how they are asserted on."""
        return {row['key']: row['value'] for row in report['rows']}

    def row_keys(self, report):
        return [row['key'] for row in report['rows']]


class WeekGridTests(DietReportTestCase):
    """"Licząc od dnia pierwszego wpisu pacjentki, a nie od poniedziałku."

    The one rule in this file that is a decision rather than a shape: the
    psychotherapy module's weeks are Monday-Sunday (`core/reports.py`) and these
    are not. Every assertion here fails if somebody "corrects" the grid.
    """

    def test_the_anchor_is_the_first_meal_and_not_the_monday_of_its_week(self):
        thursday = self.a_past_thursday()
        self.meal(on=thursday)

        body = self.summary()

        self.assertEqual(body['anchor'], thursday.isoformat())
        monday = thursday - datetime.timedelta(days=thursday.weekday())
        self.assertNotEqual(body['anchor'], monday.isoformat())

    def test_a_diary_opened_on_a_thursday_gets_thursday_to_wednesday_weeks(self):
        thursday = self.a_past_thursday()
        for week in range(3):
            self.meal(on=self.day(thursday, WEEK * week))

        body = self.summary()

        self.assertEqual(len(body['reports']), 3)
        for report in body['reports']:
            with self.subTest(report=report['id']):
                start = datetime.date.fromisoformat(report['start'])
                end = datetime.date.fromisoformat(report['end'])
                self.assertEqual(start.weekday(), THURSDAY)
                self.assertEqual(end.weekday(), WEDNESDAY)
                self.assertEqual((end - start).days, WEEK - 1)

    def test_the_week_in_progress_starts_on_the_grid_too(self):
        """Not on a Monday, and not on today: the stride is the same seven days."""
        thursday = self.a_past_thursday()
        self.meal(on=thursday)

        in_progress = self.summary()['in_progress']

        start = datetime.date.fromisoformat(in_progress['start'])
        self.assertEqual(start.weekday(), THURSDAY)
        self.assertEqual((start - thursday).days % WEEK, 0)

    def test_every_week_is_seven_days_long(self):
        self.open_the_diary()
        self.meal(on=self.last_week)

        for report in self.reports():
            with self.subTest(report=report['id']):
                self.assertEqual(report['week_days'], WEEK)
                start = datetime.date.fromisoformat(report['start'])
                end = datetime.date.fromisoformat(report['end'])
                self.assertEqual((end - start).days, WEEK - 1)

    def test_the_id_is_the_weeks_first_day(self):
        """'week-' + start, the same convention as /api/reports/."""
        self.open_the_diary()

        self.assertEqual(self.reports()[0]['id'], self.report_id(self.anchor))

    def test_available_from_is_the_day_after_the_week_ended(self):
        self.open_the_diary()
        self.meal(on=self.last_week)

        report = self.report(self.last_week)

        self.assertEqual(report['end'], self.days_ago(1).isoformat())
        self.assertEqual(report['available_from'], self.today.isoformat())

    def test_reports_are_newest_first(self):
        self.open_the_diary()
        self.meal(on=self.days_ago(2 * WEEK))
        self.meal(on=self.last_week)

        ids = [report['id'] for report in self.reports()]

        self.assertEqual(ids, [
            self.report_id(self.last_week),
            self.report_id(self.days_ago(2 * WEEK)),
            self.report_id(self.anchor),
        ])

    def test_the_anchor_is_the_earliest_meal_and_not_the_earliest_row_written(self):
        """A day filled in afterwards moves the grid, because the anchor is a
        fact about the diary rather than about the order it was typed in."""
        self.meal(on=self.today)
        self.meal(on=self.anchor)

        self.assertEqual(self.summary()['anchor'], self.anchor.isoformat())

    def test_a_completed_week_with_no_meals_produces_no_report(self):
        """Nothing to report on. The psychotherapy module makes the same call for
        an empty week, and for the same reason: a report of zeros would read as a
        week that went badly rather than as one nobody wrote in."""
        self.open_the_diary()
        self.meal(on=self.last_week)

        ids = [report['id'] for report in self.reports()]

        self.assertNotIn(self.report_id(self.days_ago(2 * WEEK)), ids)
        self.assertEqual(ids, [
            self.report_id(self.last_week), self.report_id(self.anchor)])

    def test_an_empty_week_does_not_shift_the_grid_that_follows_it(self):
        """The stride is counted from the anchor, never from the last report, so
        a skipped week leaves the weeks after it where they were."""
        self.open_the_diary()
        self.meal(on=self.last_week)

        report = self.report(self.last_week)

        self.assertEqual(report['start'], self.last_week.isoformat())
        self.assertEqual(
            (datetime.date.fromisoformat(report['start']) - self.anchor).days,
            2 * WEEK,
        )

    def test_a_completed_week_holding_only_hydration_is_not_a_report(self):
        """The grid is the food diary's ("dnia pierwszego wpisu"), and a week
        with no meal has no regularity row to build. A glass of water on its own
        is not a dzienniczek."""
        self.open_the_diary()
        self.water(on=self.days_ago(2 * WEEK))

        ids = [report['id'] for report in self.reports()]

        self.assertEqual(ids, [self.report_id(self.anchor)])


class EmptyDiaryTests(DietReportTestCase):
    """A patient who has never written a meal. Not an error, and not zeros."""

    def test_an_untouched_diary_has_no_anchor_no_week_and_no_reports(self):
        body = self.summary()

        self.assertIsNone(body['anchor'])
        self.assertIsNone(body['in_progress'])
        self.assertEqual(body['reports'], [])

    def test_the_payload_is_the_documented_shape_even_when_empty(self):
        self.assertEqual(sorted(self.summary()), ['anchor', 'in_progress', 'reports'])

    def test_hydration_alone_does_not_open_the_grid(self):
        """The anchor is the first *meal* date. Water with no diary behind it has
        no week to belong to."""
        self.water(on=self.days_ago(2 * WEEK))
        self.other_drink(on=self.today)

        body = self.summary()

        self.assertIsNone(body['anchor'])
        self.assertIsNone(body['in_progress'])
        self.assertEqual(body['reports'], [])


class OnlyTodayTests(DietReportTestCase):
    """A diary opened this morning: one week in progress and nothing else."""

    def setUp(self):
        super().setUp()
        self.meal(on=self.today, kind='Śniadanie', at='08:00')

    def test_there_are_no_reports_at_all_yet(self):
        body = self.summary()

        self.assertEqual(body['reports'], [])
        self.assertEqual(body['anchor'], self.today.isoformat())

    def test_the_week_in_progress_starts_today_and_closes_in_six_days(self):
        in_progress = self.summary()['in_progress']

        self.assertEqual(in_progress['start'], self.today.isoformat())
        self.assertEqual(in_progress['end'], self.day(self.today, WEEK - 1).isoformat())
        self.assertEqual(in_progress['closes_on'], in_progress['end'])

    def test_it_counts_what_the_day_holds(self):
        in_progress = self.summary()['in_progress']

        self.assertEqual(in_progress['meal_count'], 1)
        self.assertEqual(in_progress['days_with_meals'], 1)

    def test_todays_week_cannot_be_opened_as_a_report(self):
        response = self.client.get(self.detail_url(self.report_id(self.today)))

        self.assertEqual(response.status_code, 404)


class InProgressTests(DietReportTestCase):
    """"Bieżący tydzień jest widoczny jako w toku i domyka się o północy."

    A card, not a report — which is the opposite of what the psychotherapy
    module does with the week in progress (it leaves it out). The card carries
    no id, so nothing can open it as a document.
    """

    def setUp(self):
        super().setUp()
        # An anchor that puts today in the middle of a week rather than on its
        # first day, so the card's counters can be exercised on days that have
        # actually happened. Nothing in the app can write a meal into tomorrow,
        # so a fixture that did would be testing a row the module never sees.
        self.anchor = self.days_ago(3 * WEEK + 2)
        self.current_week = self.days_ago(2)
        self.open_the_diary()

    def test_the_card_is_the_documented_shape_and_carries_no_id(self):
        in_progress = self.summary()['in_progress']

        self.assertEqual(sorted(in_progress), [
            'closes_on', 'days_with_meals', 'end', 'meal_count', 'start'])

    def test_the_week_holding_today_is_the_one_in_progress(self):
        in_progress = self.summary()['in_progress']

        start = datetime.date.fromisoformat(in_progress['start'])
        end = datetime.date.fromisoformat(in_progress['end'])
        self.assertLessEqual(start, self.today)
        self.assertLessEqual(self.today, end)

    def test_closes_on_is_the_last_day_of_that_week(self):
        """"o północy ostatniego dnia" — the day, not the day after it."""
        in_progress = self.summary()['in_progress']

        self.assertEqual(in_progress['closes_on'], in_progress['end'])
        self.assertEqual(
            in_progress['closes_on'], self.day(self.current_week, WEEK - 1).isoformat())

    def test_the_week_in_progress_is_not_among_the_reports(self):
        self.meal(on=self.today)
        self.meal(on=self.days_ago(1))

        body = self.summary()

        self.assertNotIn(
            body['in_progress']['start'], [r['start'] for r in body['reports']])
        self.assertNotIn(
            self.report_id(self.current_week), [r['id'] for r in body['reports']])

    def test_it_counts_only_the_current_weeks_meals(self):
        self.meal(on=self.today)
        self.meal(on=self.today, kind='Kolacja', at='19:00')
        self.meal(on=self.current_week)

        in_progress = self.summary()['in_progress']

        self.assertEqual(in_progress['meal_count'], 3)
        self.assertEqual(in_progress['days_with_meals'], 2)

    def test_a_current_week_with_no_meals_is_still_a_card(self):
        """The diary exists, so the week does. Zeros are the true answer here,
        unlike an empty diary — which has no week at all."""
        in_progress = self.summary()['in_progress']

        self.assertIsNotNone(in_progress)
        self.assertEqual(in_progress['meal_count'], 0)
        self.assertEqual(in_progress['days_with_meals'], 0)

    def test_the_card_holds_no_rows_and_nothing_derived(self):
        """It says how far the week has got, not what it means. A row on the card
        would be a report on a week that has not closed."""
        in_progress = self.summary()['in_progress']

        self.assertNotIn('rows', in_progress)
        self.assertNotIn('change_note', in_progress)
        self.assertNotIn('missing', in_progress)


class RegularityRowTests(DietReportTestCase):
    """§10's first row: "REGULARNOŚĆ WPISÓW", days and meals and nothing else.

    A count, never a rate: the module "nie liczy jedzenia" and it does not score
    a week either. What is pinned beyond the figures is the Polish declension,
    because 1/2-4/5+ is three forms and a report a specialist reads should not
    say "1 posiłków".
    """

    def setUp(self):
        super().setUp()
        self.open_the_diary()

    def week_with(self, meals_per_day):
        """`meals_per_day` meals on each of that many days of the last week."""
        for offset, count in enumerate(meals_per_day):
            for _ in range(count):
                self.meal(on=self.day(self.last_week, offset))
        return self.rows(self.report(self.last_week))['regularity']

    def test_it_counts_the_days_and_the_meals(self):
        value = self.week_with([2, 1, 3])

        self.assertIn('3 z 7 dni', value)
        self.assertIn('6 posiłków', value)

    def test_one_meal_is_declined_as_one(self):
        value = self.week_with([1])

        self.assertIn('1 z 7 dni', value)
        self.assertIn('1 posiłek', value)
        self.assertNotIn('posiłki', value)
        self.assertNotIn('posiłków', value)

    def test_two_meals_take_the_plural_of_two_to_four(self):
        value = self.week_with([2])

        self.assertIn('2 posiłki', value)
        self.assertNotIn('posiłków', value)

    def test_five_meals_take_the_genitive_plural(self):
        value = self.week_with([5])

        self.assertIn('5 posiłków', value)

    def test_the_day_count_is_days_with_meals_and_not_meals(self):
        """Two meals on one day is one day."""
        value = self.week_with([2, 2])

        self.assertIn('2 z 7 dni', value)
        self.assertIn('4 posiłki', value)

    def test_the_figures_match_the_reports_own_counters(self):
        """One definition of the week's size, so the row and the card that opens
        it cannot disagree."""
        self.week_with([2, 1, 3])

        report = self.report(self.last_week)

        self.assertEqual(report['days_with_meals'], 3)
        self.assertEqual(report['meal_count'], 6)
        self.assertIn(str(report['days_with_meals']), report['rows'][0]['value'])
        self.assertIn(str(report['meal_count']), report['rows'][0]['value'])

    def test_the_contracts_own_example_verbatim(self):
        """Six of seven days, thirty-one meals. Pinned character for character
        because this string is the contract both ends were written against."""
        for offset, count in enumerate([6, 5, 5, 5, 5, 5]):
            for _ in range(count):
                self.meal(on=self.day(self.last_week, offset))

        value = self.rows(self.report(self.last_week))['regularity']

        self.assertEqual(value, '6 z 7 dni · 31 posiłków zapisanych')


class DistributionRowTests(DietReportTestCase):
    """§10's second row: "ROZKŁAD POSIŁKÓW W CIĄGU DNIA".

    Which hours the week clustered around, and how many meals said nothing about
    when they were. NOT whether the spacing was good: nothing in the schema says
    what a meal should have been near, and "regularnie" is a clinical judgement
    this document is not entitled to make.
    """

    def setUp(self):
        super().setUp()
        self.open_the_diary()

    def distribution(self):
        return self.rows(self.report(self.last_week))['distribution']

    def test_it_names_the_busiest_hour(self):
        for offset in range(3):
            self.meal(on=self.day(self.last_week, offset), at='08:00')
        self.meal(on=self.last_week, at='20:00')

        value = self.distribution()

        # '8:00' rather than '08:00', so either rendering of the hour passes and
        # the assertion is about which hour is named.
        self.assertIn('8:00', value)
        self.assertNotIn('20:00', value)

    def test_a_tie_names_both_hours(self):
        for offset in range(2):
            self.meal(on=self.day(self.last_week, offset), at='08:00')
            self.meal(on=self.day(self.last_week, offset), at='13:00')

        value = self.distribution()

        self.assertIn('8:00', value)
        self.assertIn('13:00', value)

    def test_it_counts_the_meals_that_gave_no_hour(self):
        """§05: "żadne pole nie blokuje zapisu", so a meal with no hour is an
        ordinary row — and one the distribution has to account for rather than
        silently drop out of its own denominator."""
        self.meal(on=self.last_week, at='08:00')
        self.meal(on=self.last_week, at='08:00')
        for offset in range(3):
            self.meal(on=self.day(self.last_week, offset), at=None)

        value = self.distribution()

        self.assertIn('3 posiłki', value)
        self.assertIn('bez godziny', value)

    def test_one_meal_without_an_hour_is_declined_as_one(self):
        self.meal(on=self.last_week, at='08:00')
        self.meal(on=self.last_week, at=None)

        value = self.distribution()

        self.assertIn('1 posiłek', value)

    def test_a_week_where_every_meal_has_an_hour_claims_none_without_one(self):
        for offset in range(3):
            self.meal(on=self.day(self.last_week, offset), at='08:00')

        value = self.distribution()

        self.assertNotIn('bez godziny', value)
        self.assertNotIn('0 posiłków', value)

    def test_a_week_whose_meals_have_no_hour_at_all_still_has_a_row(self):
        """The section is "what the week looked like", and "we do not know when"
        is an answer. A missing row would read as a week with no meals in it."""
        for offset in range(4):
            self.meal(on=self.day(self.last_week, offset), at=None)

        report = self.report(self.last_week)
        value = self.rows(report)['distribution']

        self.assertIn('distribution', self.row_keys(report))
        self.assertTrue(value.strip())
        self.assertIn('godzin', value)

    def test_a_meal_with_no_hour_is_never_rendered_as_midnight(self):
        """NULL is an answer not given, not 00:00 — the same rule
        `meals.serialize_meal` keeps."""
        for offset in range(4):
            self.meal(on=self.day(self.last_week, offset), at=None)

        self.assertNotIn('0:00', self.rows(self.report(self.last_week))['distribution'])


class HydrationRowTests(DietReportTestCase):
    """§10's third row: "NAWODNIENIE", read off the same table §08 writes.

    Two of §08's rules survive into the report and are the reason this row is not
    simply a weekly total: **other drinks are never converted into water**
    ("decyzja merytoryczna zostaje po stronie specjalisty"), and the goal is a
    point of reference rather than a verdict — so the row says what was drunk on
    the days it was recorded and compares it with nothing.
    """

    def setUp(self):
        super().setUp()
        self.open_the_diary()
        self.meal(on=self.last_week)

    def hydration(self):
        return self.rows(self.report(self.last_week)).get('hydration')

    def test_it_says_on_how_many_days_water_was_recorded(self):
        self.water(on=self.last_week, ml=GLASS_ML)
        self.water(on=self.day(self.last_week, 1), ml=GLASS_ML)

        self.assertIn('2 z 7 dni', self.hydration())

    def test_it_averages_over_the_days_that_have_a_serving(self):
        """Not over seven. A day nobody recorded is a day nobody answered for,
        and dividing by seven would pull every week down in proportion to how
        often the screen was not opened — the same argument the weekly report's
        emotion averages settled."""
        self.water(on=self.last_week, ml=1150)
        self.water(on=self.day(self.last_week, 1), ml=1150)

        value = self.hydration()

        self.assertIn('4,6', value)
        # 4.6 * 2 / 7 == 1.31, which is what averaging over the week would say.
        self.assertNotIn('1,3', value)

    def test_the_average_is_written_with_a_decimal_comma(self):
        self.water(on=self.last_week, ml=1150)

        value = self.hydration()

        self.assertIn('4,6', value)
        self.assertNotIn('4.6', value)

    def test_several_servings_on_one_day_are_one_days_total(self):
        for _ in range(4):
            self.water(on=self.last_week, ml=GLASS_ML)

        value = self.hydration()

        self.assertIn('1 z 7 dni', value)
        self.assertIn('4', value)

    def test_other_drinks_are_not_counted_as_water(self):
        """A week of tea has no water in it, so there is no hydration row —
        rather than a row saying nought, which would be the conversion §08
        refuses, performed with a coefficient of zero."""
        for offset in range(3):
            self.other_drink(on=self.day(self.last_week, offset))

        report = self.report(self.last_week)

        self.assertNotIn('hydration', self.row_keys(report))

    def test_a_tea_day_does_not_join_the_days_with_water(self):
        self.water(on=self.last_week, ml=GLASS_ML)
        self.water(on=self.day(self.last_week, 1), ml=GLASS_ML)
        for offset in range(2, 5):
            self.other_drink(on=self.day(self.last_week, offset))

        value = self.hydration()

        self.assertIn('2 z 7 dni', value)
        self.assertNotIn('5 z 7 dni', value)

    def test_water_with_lemon_is_one_of_the_other_drinks(self):
        """The client's call, not a rounding nobody got round to (core/drinks.py)."""
        self.other_drink(on=self.last_week, drink='Woda z cytryną')

        self.assertNotIn('hydration', self.row_keys(self.report(self.last_week)))

    def test_the_row_is_absent_when_the_week_holds_no_hydration_at_all(self):
        report = self.report(self.last_week)

        self.assertEqual(self.row_keys(report), ['regularity', 'distribution'])

    def test_water_from_another_week_does_not_reach_this_one(self):
        self.water(on=self.last_week, ml=GLASS_ML)
        self.water(on=self.today, ml=2000)
        self.water(on=self.anchor, ml=2000)

        self.assertIn('1 z 7 dni', self.hydration())

    def test_the_contracts_own_example_verbatim(self):
        """Six days at 4,6 glasses. Pinned character for character because this
        string is the contract both ends were written against."""
        for offset in range(6):
            self.water(on=self.day(self.last_week, offset), ml=1150)

        self.assertEqual(
            self.hydration(),
            'Zapisane w 6 z 7 dni · średnio 4,6 szklanki w dniach z wpisem.',
        )


class MissingSectionsTests(DietReportTestCase):
    """The four §10 rows that have no columns, named rather than invented.

    THIS IS THE POINT OF THE FEATURE'S SHAPE. §05's meal-context questions
    (emotions, physical against emotional hunger, the situation around eating)
    have no place in `diet_meal` because that form is not built, and sleep and
    activity are §09's "Etap 2". A row rendering "0" or "brak danych" for one of
    them would be a figure in a document a specialist reads that nobody entered
    — the same failure the home screen's technique card was removed for.
    """

    #: §10's four content rows with no source, plus the two §09 sections. The
    #: contract states them verbatim, in this order.
    NAMED = [
        'emocje przy jedzeniu',
        'głód fizyczny i emocjonalny',
        'sytuacje jedzenia emocjonalnego',
        'sen',
        'aktywność',
    ]

    def setUp(self):
        super().setUp()
        self.open_the_diary()
        self.meal(on=self.last_week)

    def test_they_travel_as_a_list(self):
        self.assertEqual(self.report(self.last_week)['missing'], self.NAMED)

    def test_none_of_them_is_a_row(self):
        report = self.report(self.last_week)

        self.assertEqual(self.row_keys(report), ['regularity', 'distribution'])
        for name in self.NAMED:
            with self.subTest(name=name):
                self.assertNotIn(name, [row['label'].lower() for row in report['rows']])

    def test_no_row_carries_a_value_for_a_section_with_no_column(self):
        """The sweep that matters: a later pass adding "Emocje przy jedzeniu: —"
        as a row fails here rather than shipping."""
        report = self.report(self.last_week)

        for row in report['rows']:
            with self.subTest(row=row['key']):
                self.assertIn(row['key'], ('regularity', 'distribution', 'hydration'))

    def test_the_list_is_a_fact_about_the_schema_and_not_about_the_week(self):
        """A busy week is missing exactly what a quiet one is: these are columns
        that do not exist, not questions this patient skipped."""
        for offset in range(6):
            self.meal(on=self.day(self.last_week, offset), at='08:00')
            self.water(on=self.day(self.last_week, offset), ml=1150)
        self.meal(on=self.days_ago(2 * WEEK))

        busy = self.report(self.last_week)
        quiet = self.report(self.days_ago(2 * WEEK))

        self.assertEqual(busy['missing'], quiet['missing'])
        self.assertEqual(busy['missing'], self.NAMED)

    def test_every_report_carries_it(self):
        self.meal(on=self.days_ago(2 * WEEK))

        for report in self.reports():
            with self.subTest(report=report['id']):
                self.assertEqual(report['missing'], self.NAMED)


class ChangeNoteTests(DietReportTestCase):
    """"Więcej dni z wpisem niż w poprzednim tygodniu (6 wobec 4)."

    A direction and two values, which is the psychotherapy report's rule about
    deltas applied here: "changes are always a direction and a value, never an
    assessment of the patient". There is no previous week to compare the first
    report with, and saying so is not the same as saying nothing changed.
    """

    #: Wording that would turn a direction into a verdict. Kept next to the test
    #: because it is the property, not an implementation detail.
    VERDICTS = (
        'lepiej', 'gorzej', 'lepsz', 'gorsz', 'dobrze', 'źle', 'popraw',
        'pogorsz', 'sukces', 'porażk', 'gratul', 'brawo', 'niestety', 'szkoda',
        'powinn', 'zalec', 'niepokoj', 'niedobór', 'nadmiar', 'osiągn',
    )

    def setUp(self):
        super().setUp()
        self.open_the_diary()

    def days_with_meals(self, week_start, days):
        for offset in range(days):
            self.meal(on=self.day(week_start, offset), at='08:00')

    def test_the_oldest_report_has_no_previous_week_to_compare_with(self):
        self.days_with_meals(self.last_week, 3)

        self.assertIsNone(self.report(self.anchor)['change_note'])

    def test_a_report_with_a_previous_one_names_a_direction_and_both_values(self):
        self.days_with_meals(self.days_ago(2 * WEEK), 2)
        self.days_with_meals(self.last_week, 6)

        note = self.report(self.last_week)['change_note']

        self.assertIsNotNone(note)
        self.assertRegex(note, '(?i)więcej')
        self.assertIn('6', note)
        self.assertIn('2', note)

    def test_a_fall_is_named_as_a_fall_and_not_as_a_problem(self):
        self.days_with_meals(self.days_ago(2 * WEEK), 6)
        self.days_with_meals(self.last_week, 2)

        note = self.report(self.last_week)['change_note']

        self.assertIsNotNone(note)
        self.assertRegex(note, '(?i)mniej')
        for verdict in self.VERDICTS:
            with self.subTest(verdict=verdict):
                self.assertNotIn(verdict, note.lower())

    def test_no_note_assesses_anybody_on_any_week(self):
        for weeks_back, days in ((2, 2), (1, 6)):
            self.days_with_meals(self.days_ago(weeks_back * WEEK), days)

        for report in self.reports():
            note = report['change_note'] or ''
            for verdict in self.VERDICTS:
                with self.subTest(report=report['id'], verdict=verdict):
                    self.assertNotIn(verdict, note.lower())

    def test_the_note_is_null_rather_than_absent_when_there_is_nothing_to_compare(self):
        """The key is always on the wire, so no screen has to tell "no previous
        week" apart from "this backend does not send notes"."""
        self.assertIn('change_note', self.report(self.anchor))


class PayloadShapeTests(DietReportTestCase):
    """Every key the frontend's `DietReport` maps, and only those.

    `frontend/src/types/dietReport.ts` camelCases exactly this shape, so a key
    added or renamed here is a field the screen silently stops drawing.
    """

    REPORT_KEYS = [
        'available_from', 'change_note', 'days_with_meals', 'end', 'id',
        'meal_count', 'missing', 'rows', 'start', 'week_days',
    ]

    def setUp(self):
        super().setUp()
        self.open_the_diary()
        for offset in range(3):
            self.meal(on=self.day(self.last_week, offset), at='08:00')
            self.water(on=self.day(self.last_week, offset), ml=1150)

    def test_the_summary_is_the_documented_shape(self):
        self.assertEqual(sorted(self.summary()), ['anchor', 'in_progress', 'reports'])

    def test_a_report_is_the_documented_shape(self):
        self.assertEqual(sorted(self.report(self.last_week)), self.REPORT_KEYS)

    def test_the_reports_on_the_list_are_whole_reports(self):
        """The list screen draws the rows, so it is handed them rather than a
        stub it would have to open a second request to fill."""
        for report in self.reports():
            with self.subTest(report=report['id']):
                self.assertEqual(sorted(report), self.REPORT_KEYS)

    def test_a_row_is_a_label_and_a_value_and_nothing_else(self):
        """§10: "Etykieta i wartość, wiersz po wierszu." No icon, no tone, no
        figure the screen would have to interpret."""
        for row in self.report(self.last_week)['rows']:
            with self.subTest(row=row['key']):
                self.assertEqual(sorted(row), ['key', 'label', 'value'])
                self.assertTrue(row['label'].strip())
                self.assertTrue(row['value'].strip())

    def test_the_rows_come_in_the_documented_order(self):
        self.assertEqual(
            self.row_keys(self.report(self.last_week)),
            ['regularity', 'distribution', 'hydration'],
        )

    def test_the_labels_are_the_contracts_own(self):
        rows = {row['key']: row['label'] for row in self.report(self.last_week)['rows']}

        self.assertEqual(rows, {
            'regularity': 'REGULARNOŚĆ WPISÓW',
            'distribution': 'ROZKŁAD POSIŁKÓW W CIĄGU DNIA',
            'hydration': 'NAWODNIENIE',
        })

    def test_the_list_and_the_detail_are_the_same_document(self):
        """One definition of a week, read through two URLs — the same reason the
        specialist's copy of a psychotherapy report is built by the same
        function as the patient's."""
        from_list = next(
            report for report in self.reports()
            if report['id'] == self.report_id(self.last_week)
        )

        self.assertEqual(from_list, self.report(self.last_week))

    def test_the_payload_is_json_serialisable(self):
        """No date object, no Decimal: the whole shape travels as it is asserted."""
        json.dumps(self.summary(), ensure_ascii=False)


class NothingIsAVerdictTests(DietReportTestCase):
    """"Bez ocen, bez wniosków, bez kalorii."

    The module's premise is that it "nie liczy jedzenia", and among these
    patients are people with eating disorders. A total, a target, a percentage
    or a "6 of 7" read as a mark is precisely what §02, §05 and §10 rule out —
    so this sweeps the whole rendered payload rather than any one row, because
    the failure mode is somebody adding one figure thinking it an improvement.
    """

    #: Calories, targets, percentages and anything that grades a week. Each
    #: family is a thing this document is not entitled to say.
    FORBIDDEN = (
        'kcal', 'kalor', 'calor', 'bmi',
        'procent', '%',
        'norma', 'zalec', 'powinn', 'target', 'goal',
        'lepiej', 'gorzej', 'lepsz', 'gorsz', 'dobrze', 'źle',
        'popraw', 'pogorsz', 'sukces', 'porażk', 'gratul', 'brawo',
        'niestety', 'niedobór', 'nadmiar', 'osiągn', 'seria', 'streak',
        'ocena', 'oceni', 'wynik', 'punkt',
    )

    #: Keys that would put a bar, a score or a run of days on the screen.
    #: `progress` is banned as a whole key and not as a substring, because
    #: `in_progress` is one of the contract's own three.
    FORBIDDEN_KEYS = ('progress', 'score', 'target', 'goal', 'streak', 'rating')

    #: Substrings no key may contain at all.
    FORBIDDEN_KEY_PARTS = (
        'kcal', 'calor', 'kalor', 'percent', 'grade', 'verdict', 'adherence',
        'compliance', 'success',
    )

    def setUp(self):
        super().setUp()
        # A payload with every row, a change note and a week in progress, so the
        # sweep has something to find.
        self.open_the_diary()
        for weeks_back, days in ((2, 2), (1, 6)):
            start = self.days_ago(weeks_back * WEEK)
            for offset in range(days):
                self.meal(on=self.day(start, offset), at='08:00')
                self.water(on=self.day(start, offset), ml=1150)
        self.meal(on=self.day(self.last_week, 6), at=None)
        self.meal(on=self.today, at='08:00')
        self.body = self.summary()

    def keys(self, node, found=None):
        """Every key anywhere in the payload."""
        found = [] if found is None else found
        if isinstance(node, dict):
            for key, value in node.items():
                found.append(key)
                self.keys(value, found)
        elif isinstance(node, list):
            for item in node:
                self.keys(item, found)
        return found

    def test_no_rendered_string_grades_the_week(self):
        blob = json.dumps(self.body, ensure_ascii=False).lower()

        for word in self.FORBIDDEN:
            with self.subTest(word=word):
                self.assertNotIn(word, blob)

    def test_nothing_compares_the_week_with_a_goal(self):
        """§08's rule reaching the report: the daily target is a point of
        reference on the hydration screen and it is not a figure here at all."""
        blob = json.dumps(self.body, ensure_ascii=False).lower()

        self.assertIsNone(re.search(r'\bcel', blob))
        self.assertIsNone(re.search(r'\bz\s+6\s+szklanek', blob))

    def test_no_key_is_a_score_a_target_or_a_streak(self):
        keys = self.keys(self.body)

        for key in keys:
            with self.subTest(key=key):
                self.assertNotIn(key, self.FORBIDDEN_KEYS)
                for part in self.FORBIDDEN_KEY_PARTS:
                    self.assertNotIn(part, key)

    def test_every_row_value_is_a_sentence_and_not_a_figure_out_of_context(self):
        """Each row is "etykieta i wartość", and the value carries its own unit —
        a bare number would be one the screen has to explain."""
        for report in self.body['reports']:
            for row in report['rows']:
                with self.subTest(report=report['id'], row=row['key']):
                    self.assertFalse(row['value'].strip().isdigit())

    def test_the_week_in_progress_is_not_scored_either(self):
        blob = json.dumps(self.body['in_progress'], ensure_ascii=False).lower()

        for word in self.FORBIDDEN:
            with self.subTest(word=word):
                self.assertNotIn(word, blob)


class OpenQuestionTests(DietReportTestCase):
    """§10's own open question, which the payload must not answer.

    "Nie ustalono, czy raport trafia do specjalisty automatycznie, czy dopiero
    po potwierdzeniu pacjentki. Ekran celowo tego nie przesądza — nie ma na nim
    ani przycisku wyślij, ani informacji o wysyłce." The screen's half of that is
    no button and no note; this is the backend's half. It DIFFERS from
    `pages/Reports.tsx` in the psychotherapy module, which carries such a note
    because there the client decided it — copying that note here would settle a
    question in markup.
    """

    #: Anything that would tell the patient who else reads this.
    FORBIDDEN = (
        'wyśl', 'wysł', 'wysyłk', 'udostęp', 'specjalist', 'terapeut',
        'dietetyk', 'psycholog', 'lekarz', 'opiekun', 'rodzic',
    )

    def setUp(self):
        super().setUp()
        self.open_the_diary()
        for offset in range(3):
            self.meal(on=self.day(self.last_week, offset), at='08:00')
            self.water(on=self.day(self.last_week, offset), ml=1150)

    def test_nothing_in_the_payload_says_who_else_can_read_it(self):
        blob = json.dumps(self.summary(), ensure_ascii=False).lower()

        for word in self.FORBIDDEN:
            with self.subTest(word=word):
                self.assertNotIn(word, blob)

    def test_no_key_is_a_sharing_flag(self):
        report = self.report(self.last_week)

        for key in report:
            with self.subTest(key=key):
                self.assertNotIn('shared', key)
                self.assertNotIn('sent', key)
                self.assertNotIn('visib', key)


class DetailUrlTests(DietReportTestCase):
    """The one place a caller names something.

    Matched against the reports that exist rather than parsed, so every id that
    is not one of them — a malformed date, another patient's week, a week nobody
    wrote in — answers the same 404. A 403 would confirm the week exists, which
    is the `/api/diary/<id>/` convention.
    """

    def setUp(self):
        super().setUp()
        self.open_the_diary()
        self.meal(on=self.last_week)

    def status(self, report_id):
        return self.client.get(self.raw_detail_url(report_id)).status_code

    def test_the_urls_are_where_the_contract_says_they_are(self):
        self.assertEqual(self.list_url(), '/api/diet/reports/')
        self.assertEqual(
            self.detail_url(self.report_id(self.last_week)),
            self.raw_detail_url(self.report_id(self.last_week)),
        )

    def test_a_known_id_answers_with_that_week(self):
        report = self.report(self.last_week)

        self.assertEqual(report['id'], self.report_id(self.last_week))
        self.assertEqual(report['start'], self.last_week.isoformat())

    def test_a_week_nobody_wrote_in_answers_404(self):
        self.assertEqual(self.status(self.report_id(self.days_ago(2 * WEEK))), 404)

    def test_another_patients_week_answers_404_rather_than_403(self):
        """The other patient's grid is their own, and this one must not be able
        to learn that a week of theirs exists."""
        other = self.make_patient('inny@example.com')
        their_anchor = self.days_ago(4 * WEEK)
        self.meal(on=their_anchor, patient=other)

        self.assertEqual(self.status(self.report_id(their_anchor)), 404)

    def test_an_id_naming_a_day_that_is_not_on_the_grid_is_404(self):
        """Nothing parses the id — it is matched against the reports that exist,
        so a day one off the stride simply matches none."""
        self.assertEqual(self.status(self.report_id(self.day(self.last_week, 1))), 404)

    def test_an_id_with_no_prefix_is_404(self):
        self.assertEqual(self.status(self.last_week.isoformat()), 404)

    def test_an_id_in_the_wrong_case_is_404_rather_than_matched_loosely(self):
        self.assertEqual(self.status(f'WEEK-{self.last_week.isoformat()}'), 404)

    def test_a_malformed_date_is_404_rather_than_500(self):
        for report_id in ('week-nie-data', 'week-2026-13-45', 'week-', 'tydzien'):
            with self.subTest(report_id=report_id):
                self.assertEqual(self.status(report_id), 404)

    def test_a_very_long_id_is_refused_without_a_crash(self):
        self.assertEqual(self.status('week-' + 'x' * 500), 404)

    def test_an_id_with_a_slash_never_reaches_the_view(self):
        """`<slug>` cannot contain one, so Django's resolver answers first."""
        self.assertEqual(
            self.client.get('/api/diet/reports/week-2026-08-03/extra/').status_code,
            404,
        )

    def test_an_empty_id_falls_back_to_the_list_url(self):
        self.assertEqual(self.client.get('/api/diet/reports/').status_code, 200)
        self.assertEqual(self.client.get('/api/diet/reports//').status_code, 404)

    def test_no_write_verb_reaches_either_url(self):
        """Derived, never stored: there is nothing on either URL to write to, and
        a POST added later without the rest of the thinking fails here."""
        urls = (self.list_url(), self.detail_url(self.report_id(self.last_week)))

        for url in urls:
            for method in ('post', 'put', 'patch', 'delete'):
                with self.subTest(url=url, method=method):
                    response = getattr(self.client, method)(url, {}, format='json')
                    self.assertEqual(response.status_code, 405)


class AccessTests(DietReportTestCase):
    """Who gets an answer at all — `_require_patient`, like every clinical URL.

    A guardian and a specialist are refused rather than handed an empty list:
    neither has a `patient` row, so zeros would be a misleading answer rather
    than a true one, and both read as a clinical record of somebody who has
    written nothing.
    """

    def setUp(self):
        super().setUp()
        self.open_the_diary()
        self.meal(on=self.last_week)
        self.detail = self.detail_url(self.report_id(self.last_week))

    def test_a_visitor_is_refused(self):
        self.client = APIClient()

        self.assertEqual(self.client.get(self.list_url()).status_code, 403)
        self.assertEqual(self.client.get(self.detail).status_code, 403)

    def test_a_guardian_is_refused_rather_than_handed_an_empty_list(self):
        guardian = self.make_user('opiekun@example.com', role='rodzic')
        self.sign_in(guardian)

        self.assertEqual(self.client.get(self.list_url()).status_code, 403)
        self.assertEqual(self.client.get(self.detail).status_code, 403)

    def test_a_specialist_is_refused_too(self):
        """A specialist reads the psychotherapy reports of the patients who
        accepted them, through their own URLs. This is not one of those."""
        user = self.make_user('spec@example.com', role='specjalista')
        Specjalist.objects.create(user=user, specjalization='Psychodietetyka')
        self.sign_in(user)

        self.assertEqual(self.client.get(self.list_url()).status_code, 403)
        self.assertEqual(self.client.get(self.detail).status_code, 403)

    def test_a_minor_without_an_accepted_guardian_is_refused(self):
        """Kept here as well as in `test_guardian_gate.py`, which sweeps every
        clinical URL: a gate applied to /api/diary/ and forgotten here would be
        no gate at all."""
        child = self.make_patient('dziecko@example.com', is_child=True)
        self.meal(on=self.anchor, patient=child)
        self.sign_in(child.user)

        self.assertEqual(self.client.get(self.list_url()).status_code, 403)
        self.assertEqual(self.client.get(self.detail).status_code, 403)

    def test_a_role_less_account_with_a_patient_row_is_still_a_patient(self):
        """`user_role` is a nullable text column seeded by SQL, so the endpoint
        keys on the patient row rather than on a role name."""
        roleless = Patient.objects.create(
            user=self.make_user('bezroli@example.com', role=None))
        self.meal(on=self.anchor, patient=roleless)
        self.sign_in(roleless.user)

        self.assertEqual(self.client.get(self.list_url()).status_code, 200)

    def test_a_cookie_pointing_at_a_deleted_user_is_not_a_session(self):
        user = self.patient.user
        Patient.objects.filter(pk=self.patient.pk).delete()
        User.objects.filter(pk=user.pk).delete()

        self.assertEqual(self.client.get(self.list_url()).status_code, 403)

    def test_a_get_needs_no_csrf_token(self):
        enforcing = APIClient(enforce_csrf_checks=True)
        session = enforcing.session
        session[SESSION_USER_KEY] = str(self.patient.user.pk)
        session.save()
        enforcing.cookies[settings.SESSION_COOKIE_NAME] = session.session_key

        self.assertEqual(enforcing.get(self.list_url()).status_code, 200)


class IsolationTests(DietReportTestCase):
    """The session is the only identity input, so one diary cannot reach another.

    There is no patient id in either URL: the view resolves `request.user` to an
    `id_medical` and the aggregation sees nothing else. These are the regression
    guards for a filter forgotten on one of the two tables.
    """

    def setUp(self):
        super().setUp()
        self.other = self.make_patient('inny@example.com')

    def test_another_patients_earlier_meal_does_not_move_my_anchor(self):
        """The grid is mine, counted from my first meal."""
        self.meal(on=self.days_ago(10 * WEEK), patient=self.other)
        self.open_the_diary()

        self.assertEqual(self.summary()['anchor'], self.anchor.isoformat())

    def test_another_patients_meals_are_not_counted_in_my_week(self):
        self.open_the_diary()
        self.meal(on=self.last_week)
        for offset in range(5):
            self.meal(on=self.day(self.last_week, offset), patient=self.other)

        report = self.report(self.last_week)

        self.assertEqual(report['meal_count'], 1)
        self.assertEqual(report['days_with_meals'], 1)
        self.assertIn('1 z 7 dni', self.rows(report)['regularity'])

    def test_another_patients_water_does_not_reach_my_hydration_row(self):
        self.open_the_diary()
        self.meal(on=self.last_week)
        for offset in range(5):
            self.water(on=self.day(self.last_week, offset), ml=2000,
                       patient=self.other)

        self.assertNotIn('hydration', self.row_keys(self.report(self.last_week)))

    def test_another_patients_diary_does_not_give_me_a_week_in_progress(self):
        self.meal(on=self.today, patient=self.other)

        body = self.summary()

        self.assertIsNone(body['anchor'])
        self.assertIsNone(body['in_progress'])

    def test_my_meals_do_not_reach_their_report(self):
        """Their grid is anchored on their own first meal, and the week it opens
        has one meal in it however busy mine was over the same seven days."""
        self.open_the_diary()
        for offset in range(4):
            self.meal(on=self.day(self.last_week, offset))
        self.meal(on=self.last_week, patient=self.other)

        self.sign_in(self.other.user)
        body = self.summary()

        self.assertEqual(body['anchor'], self.last_week.isoformat())
        self.assertEqual(
            [report['id'] for report in body['reports']],
            [self.report_id(self.last_week)],
        )
        self.assertEqual(body['reports'][0]['meal_count'], 1)
        self.assertEqual(body['reports'][0]['days_with_meals'], 1)


class NothingIdentifyingTests(DietReportTestCase):
    """The report describes a week, and the aggregation never sees a person.

    `core/diet_reports.py` is handed an `id_medical` and nothing else — no name,
    no e-mail, no user id — the same arrangement as `core/hydration.py` and
    `core/dashboard.py`. Neither the pseudonymous key nor the address may travel
    back out: the pseudonymization the two databases exist for is undone the
    moment one payload carries both a diary and an address.
    """

    def setUp(self):
        super().setUp()
        self.open_the_diary()
        for offset in range(3):
            self.meal(on=self.day(self.last_week, offset), at='08:00')
            self.water(on=self.day(self.last_week, offset), ml=1150)

    def test_the_list_carries_neither_the_key_nor_the_address(self):
        blob = json.dumps(self.summary(), ensure_ascii=False)

        self.assertNotIn(str(self.patient.id_medical), blob)
        self.assertNotIn(self.patient.user.email, blob)
        self.assertNotIn(str(self.patient.user.pk), blob)

    def test_the_detail_carries_neither_either(self):
        blob = json.dumps(self.report(self.last_week), ensure_ascii=False)

        self.assertNotIn(str(self.patient.id_medical), blob)
        self.assertNotIn(self.patient.user.email, blob)
        self.assertNotIn(str(self.patient.user.pk), blob)

    def test_no_meal_description_travels(self):
        """A report is figures about a week, not the diary itself: the entries
        are a screen away (`/diet/journals`) and quoting one here would put what
        the patient typed into a document built for somebody else to read."""
        self.meal(on=self.day(self.last_week, 4), text='Zjadłam kanapkę w biegu.')

        blob = json.dumps(self.report(self.last_week), ensure_ascii=False)

        self.assertNotIn('kanapkę', blob)
        self.assertNotIn('biegu', blob)
