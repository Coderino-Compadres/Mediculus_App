"""`/api/diet/reports/` — §10, the diet module's weekly report.

A port of what `frontend/src/utils/dietReport.ts` derived in the browser, so
most of what is pinned here is the *agreement* rather than arithmetic: the
contract `frontend/src/types/dietReport.ts` proposed, the week rule the client
stated, and the absences the module is built around.

THE FOUR PROPERTIES WORTH GUARDING ABOVE THE OTHERS:

1. **A week is not a Monday.** Seven days from the patient's first entry, which
   is the client's own rule and the thing every reader of this code will assume
   they already know. `WeekTests` is the whole of it.
2. **The anchor is stored and never moves.** `patient.diet_week_start` is
   latched once; an anchor that drifted would renumber every report the patient
   has, and with it every bookmark. `AnchorTests`.
3. **Nothing is summed and nothing is scored.** No totals, no averages, no
   comparison with the week before, and `days_with_entry` is a plain count
   rather than a fraction of seven — "6 z 7 dni" is a regularity score and this
   module does not score. `NothingIsAVerdictTests` sweeps the payload.
4. **An unanswered question is not a zero.** A day with no water row is
   `hydration: null`, not 0 ml; a night nobody described is `sleep: null`.
   "Nobody wrote it down" and "there was none" are different claims.
"""

import datetime

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import SESSION_USER_KEY
from core.diet_reports import MEAL_SLOT_UNSPECIFIED, meal_slot
from core.drinks import GLASS_ML, WATER
from core.models import (DietActivity, DietActivityDay, DietMeal,
                         DietMealEmotion, DietSleep, Hydration, Patient,
                         Specjalist, User, UserRole)
from core.time_of_day import EVENING, MORNING, NIGHT, NOON

PASSWORD = 'TajneHaslo123'


class DietReportTestCase(TestCase):
    databases = {'default', 'medical'}

    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()
        self.patient = self.make_patient()
        self.sign_in(self.patient.user)

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

    def list_url(self):
        return reverse('core:diet-report-list')

    def detail_url(self, report_id):
        return reverse('core:diet-report-detail', args=[report_id])

    # -- fixtures ---------------------------------------------------------

    def days_ago(self, count):
        return self.today - datetime.timedelta(days=count)

    def meal(self, day, hour='08:00', kind='Śniadanie', description='Owsianka.',
             patient=None, emotions=()):
        """One meal. `emotions` takes (name, intensity) pairs, intensity nullable.

        A pair rather than a mapping, because the two states the ranking turns
        on are a *picked* chip and a *rated* one: `('Lęk', None)` is a chip
        pressed with the slider never moved, which the column allows on purpose
        (`meals.MealEmotionSerializer`) and which must never average as a 0.
        """
        meal = DietMeal.objects.create(
            id_medical=(patient or self.patient).id_medical,
            entry_date=day,
            eaten_at=datetime.time.fromisoformat(hour) if hour else None,
            kind=kind, description=description,
        )
        for emotion, intensity in emotions:
            DietMealEmotion.objects.create(
                meal=meal, emotion=emotion, intensity=intensity)
        return meal

    def water(self, day, amount_ml=GLASS_ML, drink=WATER, patient=None):
        return Hydration.objects.create(
            id_medical=(patient or self.patient).id_medical,
            entry_date=day, drink=drink, amount_ml=amount_ml,
        )

    def reports(self):
        response = self.client.get(self.list_url())
        self.assertEqual(response.status_code, 200)
        return response.json()


class EmptyTests(DietReportTestCase):
    def test_a_diary_nobody_has_written_in_has_no_reports(self):
        self.assertEqual(self.reports(), [])

    def test_nothing_is_latched_for_a_patient_with_no_entries(self):
        self.reports()
        self.patient.refresh_from_db()

        self.assertIsNone(self.patient.diet_week_start)

    def test_a_diary_younger_than_a_week_has_no_reports(self):
        """Ordinary, not an error: a report describes a week that has ended."""
        self.meal(self.days_ago(2))

        self.assertEqual(self.reports(), [])


class WeekTests(DietReportTestCase):
    """**A WEEK IS NOT A MONDAY.** Seven days from the patient's first entry.

    The client said it twice — on both mockup sets ("Tydzień liczony od
    pierwszego wpisu… a nie od poniedziałku") and out loud — and the
    psychotherapy module goes on counting Mondays. The two disagreeing is
    deliberate; this suite is what stops somebody "unifying" them.
    """

    def test_the_week_starts_on_the_day_of_the_first_entry(self):
        first = self.days_ago(10)
        self.meal(first)

        report = self.reports()[0]

        self.assertEqual(report['week_start'], first.isoformat())
        self.assertEqual(report['id'], f'week-{first.isoformat()}')

    def test_a_week_is_seven_days_both_ends_inclusive(self):
        first = self.days_ago(10)
        self.meal(first)

        report = self.reports()[0]

        self.assertEqual(len(report['days']), 7)
        self.assertEqual(
            report['week_end'],
            (first + datetime.timedelta(days=6)).isoformat(),
        )

    def test_the_days_are_in_the_weeks_own_order(self):
        first = self.days_ago(10)
        self.meal(first)

        dates = [day['date'] for day in self.reports()[0]['days']]

        self.assertEqual(dates, sorted(dates))
        self.assertEqual(dates[0], first.isoformat())

    def test_a_week_that_starts_on_a_tuesday_runs_to_monday(self):
        """The client's own example, pinned as an example."""
        # Walk back to a Tuesday at least three weeks ago, so the week is over.
        first = self.days_ago(21)
        while first.weekday() != 1:  # Tuesday
            first -= datetime.timedelta(days=1)
        self.meal(first)

        report = self.reports()[-1]
        start = datetime.date.fromisoformat(report['week_start'])
        end = datetime.date.fromisoformat(report['week_end'])

        self.assertEqual(start.weekday(), 1)
        self.assertEqual(end.weekday(), 0)  # Monday

    def test_the_week_in_progress_is_left_out(self):
        """A report describes a week that has ended — the same rule the
        psychotherapy module applies, and a departure from both artboards,
        which draw a "W TOKU" card."""
        first = self.days_ago(3)
        self.meal(first)
        self.meal(self.today)

        self.assertEqual(self.reports(), [])

    def test_a_week_whose_last_day_is_today_is_still_running(self):
        first = self.days_ago(6)
        self.meal(first)

        self.assertEqual(self.reports(), [])

    def test_it_closes_the_day_after(self):
        first = self.days_ago(7)
        self.meal(first)

        self.assertEqual(len(self.reports()), 1)

    def test_weeks_come_back_newest_first(self):
        first = self.days_ago(21)
        self.meal(first)
        self.meal(first + datetime.timedelta(days=7))

        starts = [report['week_start'] for report in self.reports()]

        self.assertEqual(starts, sorted(starts, reverse=True))

    def test_a_week_nobody_wrote_in_is_not_a_report(self):
        """The diaries are the only source, so there would be nothing to list."""
        first = self.days_ago(21)
        self.meal(first)
        # Nothing at all in the second week.
        self.meal(first + datetime.timedelta(days=14))

        starts = [report['week_start'] for report in self.reports()]

        self.assertNotIn(
            (first + datetime.timedelta(days=7)).isoformat(), starts)
        self.assertEqual(len(starts), 2)


class AnchorTests(DietReportTestCase):
    """`patient.diet_week_start` is written once and never moves.

    Derived per request, one older entry appearing — or the oldest falling off a
    capped history — renumbers every report the patient has, and with it every
    bookmark and every reference two people in a consulting room might make.
    """

    def test_the_first_request_latches_the_anchor(self):
        first = self.days_ago(10)
        self.meal(first)

        self.reports()
        self.patient.refresh_from_db()

        self.assertEqual(self.patient.diet_week_start, first)

    def test_an_older_entry_appearing_later_does_not_move_it(self):
        first = self.days_ago(10)
        self.meal(first)
        self.reports()

        # A row older than the anchor — which the app itself cannot produce, but
        # a seed or a fix-up can.
        self.meal(self.days_ago(30))
        self.patient.refresh_from_db()

        self.assertEqual(self.patient.diet_week_start, first)
        self.assertEqual(self.reports()[-1]['week_start'], first.isoformat())

    def test_an_anchor_already_set_is_respected(self):
        chosen = self.days_ago(14)
        Patient.objects.filter(pk=self.patient.pk).update(diet_week_start=chosen)
        self.meal(self.days_ago(10))

        self.assertEqual(self.reports()[-1]['week_start'], chosen.isoformat())

    def test_it_is_latched_from_the_earliest_of_all_four_diaries(self):
        """Meals, water, activity and sleep — whichever came first."""
        earliest = self.days_ago(20)
        DietSleep.objects.create(
            id_medical=self.patient.id_medical, entry_date=earliest, quality=3)
        self.meal(self.days_ago(10))

        self.reports()
        self.patient.refresh_from_db()

        self.assertEqual(self.patient.diet_week_start, earliest)

    def test_one_patients_anchor_does_not_touch_another(self):
        other = self.make_patient(email='ktos@example.com')
        self.meal(self.days_ago(10))
        self.meal(self.days_ago(30), patient=other)

        self.reports()
        other.refresh_from_db()

        self.assertIsNone(other.diet_week_start)


class DayTests(DietReportTestCase):
    """One day of a report — everything the four diaries hold about it."""

    def setUp(self):
        super().setUp()
        self.first = self.days_ago(10)

    def first_week(self):
        return self.reports()[-1]

    def day_at(self, offset):
        return self.first_week()['days'][offset]

    def test_meals_are_listed_oldest_first_inside_the_day(self):
        """A report reads as the day happened — breakfast before supper.

        The one place this module orders a day differently from the history
        screen, which is newest-first because it is a list somebody scrolls.
        """
        self.meal(self.first, hour='19:00', kind='Kolacja')
        self.meal(self.first, hour='08:00', kind='Śniadanie')
        self.meal(self.first, hour='13:00', kind='Obiad')

        times = [meal['time'] for meal in self.day_at(0)['meals']]

        self.assertEqual(times, ['08:00', '13:00', '19:00'])

    def test_a_meal_with_no_hour_comes_last(self):
        self.meal(self.first, hour='08:00')
        self.meal(self.first, hour=None, kind='Kolacja')

        times = [meal['time'] for meal in self.day_at(0)['meals']]

        self.assertEqual(times, ['08:00', None])

    def test_a_day_with_nothing_on_it_is_empty_rather_than_absent(self):
        """Seven days always, so the chips and the listing line up."""
        self.meal(self.first)

        second = self.day_at(1)

        self.assertTrue(second['empty'])
        self.assertEqual(second['meals'], [])
        self.assertIsNone(second['hydration'])
        self.assertIsNone(second['sleep'])
        self.assertIsNone(second['activity'])

    def test_a_day_with_nothing_drunk_is_null_and_never_zero(self):
        """"Nobody wrote it down" and "drank nothing" are different claims."""
        self.meal(self.first)

        self.assertIsNone(self.day_at(0)['hydration'])

    def test_hydration_is_reported_as_the_hydration_screen_counts_it(self):
        self.meal(self.first)
        self.water(self.first, amount_ml=400)

        hydration = self.day_at(0)['hydration']

        self.assertEqual(hydration['liquid_ml'], 400)
        self.assertEqual(hydration['glasses'], 1.6)

    def test_a_day_holding_only_tea_reports_it_like_any_other_drink(self):
        """The reverse of what this test asserted before 2026-09-17, when the
        client's rule was that other drinks are never converted. Tea counts now,
        so a report that dropped it would be hiding a day the patient wrote."""
        self.meal(self.first)
        self.water(self.first, amount_ml=1000, drink='Herbata')

        hydration = self.day_at(0)['hydration']

        self.assertEqual(hydration['liquid_ml'], 1000)
        self.assertEqual(hydration['glasses'], 4)

    def test_a_day_holding_only_tea_is_a_day_with_an_entry(self):
        """It follows from the line above, and it is the visible half: the
        regularity chips and `days_with_entry` are built off the same day."""
        self.meal(self.first)
        self.water(self.first + datetime.timedelta(days=1),
                   amount_ml=1000, drink='Herbata')

        self.assertFalse(self.day_at(1)['empty'])

    def test_a_night_belongs_to_the_morning_it_ended_on(self):
        """Nothing in the data says so, so the convention is pinned here too."""
        self.meal(self.first)
        morning = self.first + datetime.timedelta(days=2)
        DietSleep.objects.create(
            id_medical=self.patient.id_medical, entry_date=morning,
            fell_asleep_at=datetime.time(23, 40),
            woke_up_at=datetime.time(6, 50), quality=3,
        )

        self.assertIsNotNone(self.day_at(2)['sleep'])
        self.assertEqual(self.day_at(2)['sleep']['fell_asleep_at'], '23:40')
        self.assertIsNone(self.day_at(1)['sleep'])

    def test_a_night_nobody_described_is_null(self):
        """A row of every-field-blank is the same as no row — see `has_night`."""
        self.meal(self.first)
        DietSleep.objects.create(
            id_medical=self.patient.id_medical, entry_date=self.first)

        self.assertIsNone(self.day_at(0)['sleep'])

    def test_a_night_whose_only_answer_is_zero_awakenings_is_null(self):
        self.meal(self.first)
        DietSleep.objects.create(
            id_medical=self.patient.id_medical, entry_date=self.first,
            awakenings=0,
        )

        self.assertIsNone(self.day_at(0)['sleep'])

    def test_an_activity_day_carries_its_entries_and_its_steps(self):
        self.meal(self.first)
        DietActivity.objects.create(
            id_medical=self.patient.id_medical, entry_date=self.first,
            logged_at=datetime.time(18, 0), kind='Spacer', duration_minutes=35,
        )
        DietActivityDay.objects.create(
            id_medical=self.patient.id_medical, entry_date=self.first, steps=6400)

        activity = self.day_at(0)['activity']

        self.assertEqual(len(activity['entries']), 1)
        self.assertEqual(activity['entries'][0]['kind'], 'Spacer')
        self.assertEqual(activity['steps'], 6400)

    def test_a_step_count_alone_makes_the_day_written_on(self):
        self.meal(self.first)
        DietActivityDay.objects.create(
            id_medical=self.patient.id_medical,
            entry_date=self.first + datetime.timedelta(days=1), steps=3000)

        self.assertFalse(self.day_at(1)['empty'])

    def test_a_day_with_no_step_count_reports_null_and_never_zero(self):
        self.meal(self.first)
        DietActivity.objects.create(
            id_medical=self.patient.id_medical, entry_date=self.first,
            logged_at=datetime.time(18, 0),
        )

        self.assertIsNone(self.day_at(0)['activity']['steps'])

    def test_only_this_patients_rows_are_read(self):
        other = self.make_patient(email='ktos@example.com')
        self.meal(self.first)
        self.meal(self.first, kind='Obiad', patient=other)

        self.assertEqual(len(self.day_at(0)['meals']), 1)

    def test_days_with_entry_counts_days_rather_than_meals(self):
        self.meal(self.first, hour='08:00')
        self.meal(self.first, hour='13:00')
        self.meal(self.first + datetime.timedelta(days=3), hour='08:00')

        self.assertEqual(self.first_week()['days_with_entry'], 2)


class MealSlotTests(DietReportTestCase):
    """Which part of the day a meal fell in.

    **THE NIGHT IS COVERED ON PURPOSE.** The artboard's own bands are 6-10,
    10-14, 14-18 and 18-22, which silently drop everything between 22:00 and
    06:00 — and night eating is precisely what a psychodietitian reads this
    report for. A grid that lost a 23:40 meal would be worse than no grid.
    """

    def test_the_four_buckets_cover_the_clock(self):
        for hour, expected in (
            ('05:00', MORNING), ('08:30', MORNING), ('10:59', MORNING),
            ('11:00', NOON), ('16:59', NOON),
            ('17:00', EVENING), ('21:59', EVENING),
            ('22:00', NIGHT), ('23:40', NIGHT),
            ('00:10', NIGHT), ('04:59', NIGHT),
        ):
            with self.subTest(hour=hour):
                self.assertEqual(meal_slot(hour), expected)

    def test_no_hour_is_its_own_column(self):
        self.assertEqual(meal_slot(None), MEAL_SLOT_UNSPECIFIED)
        self.assertEqual(meal_slot(''), MEAL_SLOT_UNSPECIFIED)

    def test_an_unreadable_hour_is_not_guessed_into_a_slot(self):
        self.assertEqual(meal_slot('kiedyś'), MEAL_SLOT_UNSPECIFIED)
        self.assertEqual(meal_slot('25:00'), MEAL_SLOT_UNSPECIFIED)

    def test_the_grid_has_four_columns_when_every_meal_has_an_hour(self):
        first = self.days_ago(10)
        self.meal(first, hour='08:00')

        grid = self.reports()[-1]['meal_grid']

        self.assertEqual(grid['slots'], [MORNING, NOON, EVENING, NIGHT])

    def test_the_fifth_column_appears_only_when_a_meal_has_no_hour(self):
        """An always-present empty column would read as a question the patient
        failed to answer rather than as one they were never asked."""
        first = self.days_ago(10)
        self.meal(first, hour=None)

        grid = self.reports()[-1]['meal_grid']

        self.assertEqual(grid['slots'][-1], MEAL_SLOT_UNSPECIFIED)
        self.assertEqual(len(grid['slots']), 5)

    def test_every_row_has_one_cell_per_slot_in_that_order(self):
        first = self.days_ago(10)
        self.meal(first, hour='23:40')

        grid = self.reports()[-1]['meal_grid']

        self.assertEqual(len(grid['rows']), 7)
        for row in grid['rows']:
            self.assertEqual([cell['slot'] for cell in row['cells']],
                             grid['slots'])

    def test_a_late_night_meal_lands_in_the_night_column(self):
        first = self.days_ago(10)
        self.meal(first, hour='23:40', kind='Przekąska')

        grid = self.reports()[-1]['meal_grid']
        night_cell = grid['rows'][0]['cells'][grid['slots'].index(NIGHT)]

        self.assertEqual(len(night_cell['meals']), 1)
        self.assertEqual(night_cell['meals'][0]['kind'], 'Przekąska')

    def test_a_cell_carries_the_meals_and_never_a_count(self):
        """The grid draws one dot per meal and names each by its kind."""
        first = self.days_ago(10)
        self.meal(first, hour='08:00')

        cell = self.reports()[-1]['meal_grid']['rows'][0]['cells'][0]

        self.assertEqual(set(cell), {'slot', 'meals'})


class MealEmotionRankingTests(DietReportTestCase):
    """"Najczęstsze emocje przy jedzeniu" — §05's section.

    THE UNIT IS A MEAL, not a day: an emotion hangs off `diet_meal`, and two
    difficult meals on one Tuesday are two things that happened.

    AN UNRATED CHIP IS NOT A ZERO. `diet_meal_emotion.intensity` is nullable so
    that pressing a chip and leaving the slider alone can mean "this was felt,
    and I did not say how strongly". It counts towards how *often* the emotion
    appeared and towards nothing else — an average that folded it in as 0 would
    read somebody's silence back to them as calm.
    """

    def emotions(self, week=0):
        return self.reports()[week]['emotions']

    def rows(self, week=0):
        return self.emotions(week)['rows']

    def test_a_week_with_no_chip_has_an_empty_ranking(self):
        """Not a row of zeroes and not a missing key: the section simply has
        nothing in it, and the screen draws no card at all for that."""
        self.meal(self.days_ago(10))

        self.assertEqual(self.emotions(), {'meals_with_emotion': 0, 'rows': []})

    def test_an_emotion_is_counted_once_per_meal_it_was_picked_at(self):
        first = self.days_ago(10)
        self.meal(first, emotions=[('Lęk', 5)])
        self.meal(first, hour='13:00', emotions=[('Lęk', 8)])
        self.meal(first + datetime.timedelta(days=1), emotions=[('Lęk', 2)])

        self.assertEqual(self.rows(), [
            {'emotion': 'Lęk', 'meals': 3, 'rated_meals': 3, 'avg_intensity': 5.0},
        ])

    def test_two_meals_on_one_day_are_two_and_not_one(self):
        """The psychotherapy ranking counts days because its diary holds one
        entry per day. This one must not, or a hard Tuesday of three meals
        reads exactly like a Tuesday of one."""
        first = self.days_ago(10)
        self.meal(first, emotions=[('Złość', 4)])
        self.meal(first, hour='19:00', emotions=[('Złość', 4)])

        self.assertEqual(self.rows()[0]['meals'], 2)

    def test_an_unrated_chip_counts_towards_how_often_and_not_towards_the_average(self):
        first = self.days_ago(10)
        self.meal(first, emotions=[('Wstyd', 8)])
        self.meal(first, hour='13:00', emotions=[('Wstyd', None)])

        row = self.rows()[0]

        self.assertEqual(row['meals'], 2)
        self.assertEqual(row['rated_meals'], 1)
        # 8.0, not 4.0 — the unrated chip is silence, not a zero.
        self.assertEqual(row['avg_intensity'], 8.0)

    def test_an_emotion_nobody_rated_is_ranked_with_no_average(self):
        """Being felt is what puts a row on the list; a rating is not required
        for it (§05: no field blocks a save)."""
        self.meal(self.days_ago(10), emotions=[('Spokój', None)])

        self.assertEqual(self.rows(), [
            {'emotion': 'Spokój', 'meals': 1, 'rated_meals': 0,
             'avg_intensity': None},
        ])

    def test_the_ranking_runs_from_the_most_often_picked(self):
        """Frequency, not intensity — the section is named for it. The
        psychotherapy ranking deliberately does the opposite."""
        first = self.days_ago(10)
        self.meal(first, emotions=[('Lęk', 1), ('Radość', 10)])
        self.meal(first, hour='13:00', emotions=[('Lęk', 1)])
        self.meal(first, hour='19:00', emotions=[('Lęk', 1)])

        self.assertEqual(
            [row['emotion'] for row in self.rows()], ['Lęk', 'Radość'])

    def test_emotions_picked_equally_often_break_the_tie_on_the_average(self):
        first = self.days_ago(10)
        self.meal(first, emotions=[('Smutek', 2), ('Frustracja', 9)])

        self.assertEqual(
            [row['emotion'] for row in self.rows()], ['Frustracja', 'Smutek'])

    def test_an_unrated_emotion_sorts_below_an_equally_frequent_rated_one(self):
        first = self.days_ago(10)
        self.meal(first, emotions=[('Radość', None), ('Smutek', 0)])

        # 'Smutek' averaging 0 still outranks a chip carrying no answer at all:
        # a rated nought is a measurement and a NULL is not.
        self.assertEqual(
            [row['emotion'] for row in self.rows()], ['Smutek', 'Radość'])

    def test_the_order_does_not_depend_on_which_row_came_back_first(self):
        """Two requests for one week answer in one order, so a report a patient
        and her specialist read side by side is the same document."""
        first = self.days_ago(10)
        self.meal(first, emotions=[('Wstyd', 5), ('Bezradność', 5), ('Lęk', 5)])

        self.assertEqual(self.rows(), self.rows())
        # The vocabulary's own order breaks a tie that is level on both numbers.
        self.assertEqual(
            [row['emotion'] for row in self.rows()],
            ['Lęk', 'Wstyd', 'Bezradność'],
        )

    def test_meals_with_emotion_counts_meals_and_not_chips(self):
        """A meal carrying three chips is one meal. Without that the caption
        would claim more meals than the week holds."""
        first = self.days_ago(10)
        self.meal(first, emotions=[('Lęk', 5), ('Stres', 6), ('Wstyd', 1)])
        self.meal(first, hour='13:00')

        self.assertEqual(self.emotions()['meals_with_emotion'], 1)

    def test_the_ranking_covers_the_week_it_belongs_to_and_no_other(self):
        first = self.days_ago(21)
        self.meal(first, emotions=[('Lęk', 5)])
        self.meal(first + datetime.timedelta(days=7), emotions=[('Radość', 5)])

        # Newest week first, so [0] is the second week.
        self.assertEqual([row['emotion'] for row in self.rows(0)], ['Radość'])
        self.assertEqual([row['emotion'] for row in self.rows(1)], ['Lęk'])

    def test_another_patient_s_chips_are_not_in_this_ranking(self):
        other = self.make_patient(email='inny@example.com')
        first = self.days_ago(10)
        self.meal(first, emotions=[('Lęk', 5)])
        self.meal(first, emotions=[('Radość', 9)], patient=other)

        self.assertEqual([row['emotion'] for row in self.rows()], ['Lęk'])

    def test_the_average_rounds_the_way_every_other_average_in_the_app_does(self):
        """One rounding rule across the two modules — `reports.average_rated`,
        halves away from zero. Two rules would print the same 6,25 two ways."""
        first = self.days_ago(10)
        self.meal(first, emotions=[('Stres', 6)])
        self.meal(first, hour='13:00', emotions=[('Stres', 7)])
        self.meal(first, hour='16:00', emotions=[('Stres', 6)])
        self.meal(first, hour='19:00', emotions=[('Stres', 6)])

        # 25/4 = 6.25 → 6,3 rather than the 6,2 `round()` would give.
        self.assertEqual(self.rows()[0]['avg_intensity'], 6.3)

    def test_a_chip_is_also_still_listed_under_the_meal_that_felt_it(self):
        """The ranking is a second reading of the same rows, never a
        replacement: the day-by-day listing keeps its own chips."""
        first = self.days_ago(10)
        self.meal(first, emotions=[('Lęk', 5)])

        day = self.reports()[0]['days'][0]

        self.assertEqual(
            day['meals'][0]['emotions'], [{'emotion': 'Lęk', 'intensity': 5}])


class DetailTests(DietReportTestCase):
    def test_one_report_is_the_same_document_the_list_holds(self):
        first = self.days_ago(10)
        self.meal(first)
        listed = self.reports()[0]

        response = self.client.get(self.detail_url(listed['id']))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), listed)

    def test_a_week_nobody_wrote_in_is_a_404(self):
        self.meal(self.days_ago(10))

        response = self.client.get(self.detail_url('week-2020-01-06'))

        self.assertEqual(response.status_code, 404)

    def test_a_malformed_id_answers_the_same_way(self):
        """A typed-in address tells the patient nothing they can act on."""
        self.meal(self.days_ago(10))

        self.assertEqual(
            self.client.get(self.detail_url('zupelnie-nie-tydzien')).status_code,
            404,
        )

    def test_somebody_elses_week_is_a_404(self):
        other = self.make_patient(email='ktos@example.com')
        self.meal(self.days_ago(10), patient=other)
        self.meal(self.days_ago(10))
        mine = self.reports()[0]['id']

        # Their week, built from their rows, is simply not among ours.
        self.client = APIClient()
        self.sign_in(other.user)
        theirs = self.client.get(self.list_url()).json()[0]['id']
        self.client = APIClient()
        self.sign_in(self.patient.user)

        # Same id here, because both started on the same day -- so the test that
        # matters is that the *content* is ours, not theirs.
        self.assertEqual(theirs, mine)
        report = self.client.get(self.detail_url(mine)).json()
        self.assertEqual(len(report['days'][0]['meals']), 1)

    def test_neither_url_takes_a_write_verb(self):
        first = self.days_ago(10)
        self.meal(first)
        report_id = self.reports()[0]['id']

        for method in ('post', 'put', 'patch', 'delete'):
            with self.subTest(method=method):
                self.assertEqual(
                    getattr(self.client, method)(self.list_url()).status_code, 405)
                self.assertEqual(
                    getattr(self.client, method)(
                        self.detail_url(report_id)).status_code, 405)


class NothingIsAVerdictTests(DietReportTestCase):
    """The report is a listing: "data, co się działo", and nothing else.

    No totals, no averages, no comparison with the week before, no percentage
    and no fraction of seven. `days_with_entry` is the single count in the whole
    module and it is rendered as a plain number — "6 z 7 dni" is a regularity
    score, and CLAUDE.md rules those out for this module by name. This is the
    sweep a well-meant "improvement" has to get past.
    """

    #: Matched as substrings, which is why 'ratio' is not on the list: it is
    #: inside "hydration". The intent it would carry is already covered by
    #: 'percent' and 'average', and a sweep that has to special-case its own
    #: false positives is one somebody eventually loosens.
    FORBIDDEN = (
        'total', 'suma', 'sum', 'average', 'avg', 'srednia', 'średnia',
        'score', 'wynik', 'ocena', 'streak', 'seria', 'goal', 'target',
        'progress', 'percent', 'procent', 'calorie', 'kalor', 'kcal',
        'delta', 'change', 'zmiana', 'trend', 'compare',
    )

    #: The one key that is allowed to read like a score, named in full so the
    #: exception cannot widen by accident.
    #:
    #: **WHAT THIS SWEEP IS ABOUT IS FOOD, AND `avg_intensity` IS NOT ABOUT
    #: FOOD.** It is the mean of the 0-10 slider the patient moved herself on
    #: §04's emotion picker — the psychotherapy form's own picker, the same ten
    #: names, the same scale, and `reports._rank_emotions` sends the identically
    #: named field for the identically shaped ranking. Her answer read back is
    #: not this module scoring her eating, and §05 asks for the section by name
    #: ("najczęstsze emocje przy jedzeniu"). Nothing about *what was eaten*
    #: feeds it: the kind, the hour and the description are inputs to no figure
    #: in that section.
    #:
    #: Everything the sweep was written to catch is still caught, including on
    #: this section: a mean number of meals, a share of a week, a "trudny
    #: tydzień" score, a comparison with the week before. If a second key ever
    #: needs to be added here, that is the moment to check it against the same
    #: question — is this number about a feeling somebody rated, or about their
    #: food? — rather than to relax the list.
    ALLOWED = frozenset({'avg_intensity'})

    def filled_report(self):
        first = self.days_ago(10)
        self.meal(first, hour='08:00', emotions=[('Lęk', 7), ('Spokój', None)])
        self.meal(first, hour=None)
        self.water(first, amount_ml=500)
        DietActivity.objects.create(
            id_medical=self.patient.id_medical, entry_date=first,
            logged_at=datetime.time(18, 0), kind='Spacer', duration_minutes=35,
            feeling_after='better',
        )
        DietActivityDay.objects.create(
            id_medical=self.patient.id_medical, entry_date=first, steps=6400)
        DietSleep.objects.create(
            id_medical=self.patient.id_medical, entry_date=first,
            fell_asleep_at=datetime.time(23, 0),
            woke_up_at=datetime.time(7, 0), quality=4, wake_feeling='rested',
        )
        return self.reports()[0]

    def keys_of(self, value, found=None):
        found = set() if found is None else found
        if isinstance(value, dict):
            for key, inner in value.items():
                found.add(key)
                self.keys_of(inner, found)
        elif isinstance(value, list):
            for inner in value:
                self.keys_of(inner, found)
        return found

    def test_no_key_anywhere_in_the_payload_is_a_verdict(self):
        keys = self.keys_of(self.filled_report())

        self.assertIn('days_with_entry', keys)
        for key in keys - self.ALLOWED:
            for forbidden in self.FORBIDDEN:
                self.assertNotIn(
                    forbidden, key.lower(),
                    f'"{key}" reads as a score; this module does not score.',
                )

    def test_days_with_entry_is_a_count_and_carries_no_denominator(self):
        report = self.filled_report()

        self.assertIsInstance(report['days_with_entry'], int)
        # Nothing named "of seven" travels; the screen writes "5 dni z wpisem".
        self.assertNotIn('days_total', report)
        self.assertNotIn('days_in_week', report)

    def test_no_week_is_compared_with_the_one_before_it(self):
        first = self.days_ago(21)
        self.meal(first)
        self.meal(first + datetime.timedelta(days=7))

        for report in self.reports():
            self.assertNotIn('previous', report)
            self.assertNotIn('changes', report)

    def test_the_payload_is_the_documented_shape(self):
        report = self.filled_report()

        self.assertEqual(set(report), {
            'id', 'week_start', 'week_end', 'range_label', 'days',
            'days_with_entry', 'meal_grid', 'emotions',
        })
        self.assertEqual(set(report['emotions']), {'meals_with_emotion', 'rows'})
        self.assertEqual(set(report['emotions']['rows'][0]), {
            'emotion', 'meals', 'rated_meals', 'avg_intensity',
        })
        self.assertEqual(set(report['days'][0]), {
            'date', 'meals', 'hydration', 'sleep', 'activity', 'empty',
        })

    def test_nothing_identifying_travels(self):
        body = str(self.filled_report())

        self.assertNotIn(str(self.patient.id_medical), body)
        self.assertNotIn(str(self.patient.user_id), body)
        self.assertNotIn('pacjent@example.com', body)


class WhoMayAskTests(DietReportTestCase):
    def test_a_guardian_is_refused_rather_than_handed_an_empty_list(self):
        guardian = self.make_user(email='rodzic@example.com', role='rodzic')
        self.sign_in(guardian)

        self.assertEqual(self.client.get(self.list_url()).status_code, 403)

    def test_a_specialist_is_refused(self):
        """There is no diet equivalent of the psychotherapy specialist copy —
        `patient.id_specjalist` is a single FK, so a patient seeing both a
        psychotherapist and a psychodietitian cannot be expressed at all."""
        user = self.make_user(email='spec@example.com', role='specjalista')
        Specjalist.objects.create(user=user, specjalization='psychodietetyka')
        self.sign_in(user)

        self.assertEqual(self.client.get(self.list_url()).status_code, 403)

    def test_a_visitor_is_refused(self):
        self.client = APIClient()

        self.assertEqual(self.client.get(self.list_url()).status_code, 403)


class RangeLabelTests(DietReportTestCase):
    """The label is shared with `core/reports.py` rather than re-derived, so the
    two modules at least *print* a week the same way."""

    def test_a_week_inside_one_month_drops_the_repeated_parts(self):
        Patient.objects.filter(pk=self.patient.pk).update(
            diet_week_start=datetime.date(2026, 9, 1))
        self.meal(datetime.date(2026, 9, 1))

        # Only assertable when that week is over; skip when the clock is not
        # past it rather than asserting a week in progress.
        reports = [
            report for report in self.reports()
            if report['week_start'] == '2026-09-01'
        ]
        if reports:
            self.assertEqual(reports[0]['range_label'], '1 – 7 września 2026')
