"""`manage.py seed_demo_diary` — the one screen-filling path that is code.

There was no test for this command while it only wrote diary entries: what it
produces is checked by looking at the screen, which is its whole purpose. It
grew a second half (the diet module) whose correctness is not obvious from
looking — the water is written as *servings* that have to add up to the total,
the streak has to actually break where the seed says it does, and the supplement
list has to come out in the state §08's artboard draws. Those are the things
below.

The refusal to run with `DEBUG=False` is pinned too, because it is the one
property of this command that protects somebody: what it writes is fabricated
clinical content against a named account, and a mis-set `DJANGO_ENV_FILE` must
not be one keystroke from putting it in a real record.
"""

import datetime
import io

from django.contrib.auth.hashers import make_password
from django.core.management import CommandError, call_command
from django.test import TestCase, override_settings
from django.utils import timezone

from core.drinks import WATER
from core.management.commands.seed_demo_diary import (DIET_DAYS,
                                                      SUPPLEMENT_SHAPES,
                                                      WATER_ML_BY_DAY)
from core.meals import streak_days
from core.models import (Diary, DietMeal, Hydration, Patient, Supplement,
                         SupplementIntake, User, UserRole)


@override_settings(DEBUG=True)
class SeedDemoDiaryTests(TestCase):
    databases = {'default', 'medical'}

    def setUp(self):
        self.today = timezone.localdate()
        self.user = User.objects.create(
            user_role=UserRole.objects.get_or_create(name='patient')[0],
            email='test@wp.pl', password_hash=make_password('TajneHaslo123'),
            data_consent_at=timezone.now(), services_consent_at=timezone.now(),
        )
        self.patient = Patient.objects.create(user=self.user, is_child=False)

    def seed(self, *args):
        # `stdout` captured rather than silenced by `verbosity`: the command
        # reports what it wrote unconditionally, which is the point of it when
        # run by hand and only noise in a test run.
        call_command(
            'seed_demo_diary', 'test@wp.pl=3', *args, stdout=io.StringIO())

    def meals(self):
        return DietMeal.objects.filter(id_medical=self.patient.id_medical)

    def water_on(self, day):
        return sum(
            row.amount_ml or 0
            for row in Hydration.objects.filter(
                id_medical=self.patient.id_medical, entry_date=day, drink=WATER)
        )


class DiaryHalfTests(SeedDemoDiaryTests):
    def test_it_writes_the_diary_entries_it_always_did(self):
        self.seed()

        self.assertEqual(
            Diary.objects.filter(id_medical=self.patient.id_medical).count(), 5)

    def test_it_refuses_an_address_with_no_account(self):
        with self.assertRaises(CommandError):
            call_command(
                'seed_demo_diary', 'nikt@example.com=1', stdout=io.StringIO())

    def test_it_refuses_an_account_with_no_patient_row(self):
        User.objects.create(email='opiekun@example.com', password_hash='x')

        with self.assertRaises(CommandError):
            call_command(
                'seed_demo_diary', 'opiekun@example.com=1', stdout=io.StringIO())


class DietHalfTests(SeedDemoDiaryTests):
    """The half that is on today's clock rather than last week's."""

    def test_the_meals_end_today_rather_than_in_last_week(self):
        """Every diet screen shows today; rows in last week would show nothing."""
        self.seed()

        self.assertTrue(self.meals().filter(entry_date=self.today).exists())

    def test_it_covers_the_seven_days_the_chart_draws(self):
        self.seed()

        oldest = self.meals().order_by('entry_date').first()
        self.assertEqual(
            oldest.entry_date, self.today - datetime.timedelta(days=DIET_DAYS - 1))

    def test_the_run_has_a_gap_in_it(self):
        """A seed of seven identical days would hide what a real diary looks like."""
        self.seed()

        days = set(self.meals().values_list('entry_date', flat=True))
        self.assertEqual(len(days), DIET_DAYS - 1)

    def test_the_streak_stops_at_the_gap(self):
        self.seed()

        self.assertEqual(streak_days(self.patient.id_medical, self.today), 4)

    def test_a_meal_with_no_kind_and_one_with_no_hour_are_both_seeded(self):
        """So §05's "no field blocks a save" branches are reachable from a seed."""
        self.seed()

        self.assertTrue(self.meals().filter(kind__isnull=True).exists())
        self.assertTrue(self.meals().filter(eaten_at__isnull=True).exists())

    def test_no_meal_carries_a_quantity_because_there_is_no_column_for_one(self):
        self.seed()

        for meal in self.meals():
            self.assertNotIn('g ', meal.description)
            self.assertNotIn('kcal', meal.description)

    def test_the_servings_add_up_to_the_day_they_describe(self):
        """Water is written as glasses and bottles, not as a total."""
        self.seed()

        for offset, expected in enumerate(WATER_ML_BY_DAY[:DIET_DAYS]):
            day = self.today - datetime.timedelta(days=offset)
            with self.subTest(day=day):
                self.assertEqual(self.water_on(day), expected)

    def test_a_day_under_the_goal_and_a_day_over_it_are_both_seeded(self):
        """§08: the goal is a point of reference, so a seed cannot only ever meet it."""
        totals = set(WATER_ML_BY_DAY[:DIET_DAYS])

        self.assertTrue(any(total < 1500 for total in totals))
        self.assertTrue(any(total > 1500 for total in totals))

    def test_the_other_drinks_are_recorded_with_no_amount(self):
        self.seed()

        others = Hydration.objects.filter(
            id_medical=self.patient.id_medical, entry_date=self.today,
        ).exclude(drink=WATER)

        self.assertTrue(others.exists())
        for row in others:
            self.assertIsNone(row.amount_ml)

    def test_the_supplement_list_is_the_artboard_s_three_rows(self):
        self.seed()

        names = list(
            Supplement.objects
            .filter(id_medical=self.patient.id_medical)
            .order_by('name').values_list('name', flat=True)
        )
        self.assertEqual(names, sorted(shape[0] for shape in SUPPLEMENT_SHAPES))

    def test_two_of_the_three_are_ticked_off_for_today(self):
        """Exactly the state §08 draws; the third is unanswered, not missed."""
        self.seed()

        ticked = SupplementIntake.objects.filter(
            supplement__id_medical=self.patient.id_medical, entry_date=self.today,
        ).count()

        self.assertEqual(ticked, 2)

    def test_running_twice_does_not_double_a_day(self):
        self.seed()
        before = self.meals().count()
        supplements_before = Supplement.objects.count()

        self.seed()

        self.assertEqual(self.meals().count(), before)
        self.assertEqual(Supplement.objects.count(), supplements_before)
        self.assertEqual(
            SupplementIntake.objects.filter(entry_date=self.today).count(), 2)

    def test_no_diet_skips_the_whole_half(self):
        self.seed('--no-diet')

        self.assertFalse(self.meals().exists())
        self.assertFalse(Supplement.objects.exists())
        self.assertFalse(Hydration.objects.exists())

    def test_it_seeds_only_the_named_account(self):
        other = Patient.objects.create(
            user=User.objects.create(email='inny@example.com', password_hash='x'))

        self.seed()

        self.assertFalse(
            DietMeal.objects.filter(id_medical=other.id_medical).exists())


class DebugGuardTests(SeedDemoDiaryTests):
    @override_settings(DEBUG=False)
    def test_it_refuses_to_run_against_a_deployment(self):
        """The one property of this command that protects somebody."""
        with self.assertRaises(CommandError):
            call_command(
                'seed_demo_diary', 'test@wp.pl=3', stdout=io.StringIO())

        self.assertFalse(Diary.objects.exists())
        self.assertFalse(DietMeal.objects.exists())
