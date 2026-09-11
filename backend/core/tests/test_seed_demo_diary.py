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
import re
from pathlib import Path

from django.contrib.auth.hashers import make_password
from django.core.management import CommandError, call_command
from django.test import TestCase, override_settings
from django.utils import timezone

from core.drinks import WATER
from core.drinks import OTHER_DRINKS
from core.management.commands.seed_demo_diary import (ALL_SUPPLEMENT_SHAPES,
                                                      DIET_DAYS, MEAL_DAYS,
                                                      SUPPLEMENT_SHAPES,
                                                      WATER_ML_BY_DAY,
                                                      last_completed_week_start)
from core.supplements import MAX_SUPPLEMENTS
from core.meals import streak_days
from core.models import (Diary, DietMeal, Hydration, Patient, Supplement,
                         SupplementIntake, User, UserRole)

#: `PAGE_SIZE` read out of the frontend, the same cross-language guard
#: `test_meals.py` and `test_drinks.py` put on their vocabularies.
#:
#: It is here because the whole value of MEAL_DAYS rests on a number declared in
#: TypeScript: the history screen paginates at PAGE_SIZE *days*, so a seed of
#: exactly that many days renders no control at all. Raise PAGE_SIZE to twenty
#: and the seed is silently back to one page — a demo that looks like the
#: feature was never built, with nothing failing anywhere.
PAGINATION_TS = (
    Path(__file__).resolve().parent.parent.parent.parent
    / 'frontend' / 'src' / 'hooks' / 'usePagination.ts'
)


def frontend_page_size():
    """The number of rows a list screen puts on one page."""
    source = PAGINATION_TS.read_text(encoding='utf-8')
    match = re.search(r'export const PAGE_SIZE = (\d+)', source)
    if not match:
        raise AssertionError(
            f'No `export const PAGE_SIZE = <n>` in {PAGINATION_TS}. If it was '
            'renamed or reshaped, this parser has to follow it — silently '
            'matching nothing would retire the guard.'
        )
    return int(match.group(1))


FRONTEND_PAGE_SIZE = frontend_page_size()


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

    def test_the_meals_run_further_back_than_the_chart_does(self):
        """MEAL_DAYS, not DIET_DAYS, and the difference is what makes the
        history screen's pagination visible on a seeded database: seven days is
        exactly one page, so the control renders nothing at all."""
        self.seed()

        oldest = self.meals().order_by('entry_date').first()
        self.assertEqual(
            oldest.entry_date, self.today - datetime.timedelta(days=MEAL_DAYS - 1))

    def test_the_seeded_history_fills_more_than_one_page(self):
        """The point of MEAL_DAYS. PAGE_SIZE in the frontend is seven days, and
        a row on that screen is a day — so a seed of one page's worth left
        `components/Pagination.tsx` rendering nothing, which is correct on the
        screen and indistinguishable from a missing feature on the demo."""
        self.seed()

        days = set(self.meals().values_list('entry_date', flat=True))

        self.assertGreater(len(days), FRONTEND_PAGE_SIZE)

    def test_the_water_stays_inside_the_window_the_chart_draws(self):
        """Deliberately *not* raised with MEAL_DAYS: hydration has no history
        screen, so a serving older than the chart is a row nothing can reach."""
        self.seed()

        oldest = (
            Hydration.objects.filter(id_medical=self.patient.id_medical)
            .order_by('entry_date').first()
        )
        self.assertEqual(
            oldest.entry_date, self.today - datetime.timedelta(days=DIET_DAYS - 1))

    def test_the_run_has_a_gap_in_it(self):
        """A seed of identical days would hide what a real diary looks like."""
        self.seed()

        days = set(self.meals().values_list('entry_date', flat=True))
        self.assertEqual(len(days), MEAL_DAYS - 1)

    def test_the_gap_is_on_the_history_s_first_page(self):
        """Otherwise the one thing it exists to show — that a real diary has
        days missing — is two page turns away from anybody looking at the
        demo."""
        self.seed()

        days = set(self.meals().values_list('entry_date', flat=True))
        first_page = {
            self.today - datetime.timedelta(days=offset)
            for offset in range(FRONTEND_PAGE_SIZE)
        }

        self.assertTrue(first_page - days)

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


class NoDiaryTests(SeedDemoDiaryTests):
    """`--no-diary`, the flag that makes the command safe on a real account.

    THE DIARY HALF REPLACES LAST COMPLETED WEEK — that is what makes it
    idempotent, and on an account whose entries somebody actually wrote it is a
    week of their own writing deleted and fabricated demo text put in its
    place. There is no undo and the command is one line. So the first test here
    is the only one that really matters: with the flag, nothing in the diary is
    touched.
    """

    def existing_entry(self):
        """One real entry inside the window the diary half would replace."""
        week_start = last_completed_week_start(self.today)
        entry = Diary.objects.create(
            id_medical=self.patient.id_medical,
            current_mood='dobrze',
            situation_place='Wpis napisany przez człowieka.',
        )
        # `created_at` is auto_now_add, so it is written afterwards — the same
        # way the command itself has to do it. Passing it to create() is
        # silently ignored, which would leave this entry dated today, i.e.
        # outside the window the diary half replaces, and the test would pass
        # for the wrong reason.
        Diary.objects.filter(pk=entry.pk).update(
            created_at=timezone.make_aware(
                datetime.datetime.combine(
                    week_start + datetime.timedelta(days=1),
                    datetime.time(12, 0),
                )
            )
        )
        # `update()` does not touch the instance in memory, and a test reading
        # `entry.created_at` off a stale object would be asserting about the
        # moment it was created rather than the date it was moved to.
        entry.refresh_from_db()
        return entry

    def test_it_leaves_an_existing_diary_entry_alone(self):
        mine = self.existing_entry()

        call_command(
            'seed_demo_diary', 'test@wp.pl', '--no-diary', stdout=io.StringIO())

        mine.refresh_from_db()
        self.assertEqual(Diary.objects.count(), 1)
        self.assertEqual(mine.situation_place, 'Wpis napisany przez człowieka.')

    def test_the_entry_it_protects_really_is_inside_the_replaced_week(self):
        """Guards the test above from passing vacuously: an entry dated today
        would survive the diary half too, and prove nothing."""
        mine = self.existing_entry()
        week_start = last_completed_week_start(self.today)

        self.assertEqual(
            mine.created_at.astimezone(
                timezone.get_current_timezone()).date(),
            week_start + datetime.timedelta(days=1),
        )

    def test_without_the_flag_that_same_entry_is_replaced(self):
        """The behaviour the flag exists to avoid, pinned so the reason for it
        cannot quietly stop being true."""
        mine = self.existing_entry()

        self.seed()

        self.assertFalse(Diary.objects.filter(pk=mine.pk).exists())

    def test_it_still_writes_the_diet_half(self):
        call_command(
            'seed_demo_diary', 'test@wp.pl', '--no-diary', stdout=io.StringIO())

        self.assertTrue(self.meals().exists())

    def test_the_address_needs_no_flagged_day_count(self):
        """There is no diary entry for a risky-behaviour note to go on, so
        requiring the number would be asking for an answer that reaches
        nothing."""
        call_command(
            'seed_demo_diary', 'test@wp.pl', '--no-diary', stdout=io.StringIO())

        self.assertTrue(self.meals().exists())

    def test_it_still_refuses_an_account_with_no_patient_row(self):
        """The --no-diary path resolves the patient itself, so it has to make
        the same refusals as the path it bypasses."""
        User.objects.create(
            email='opiekun@wp.pl', password_hash=make_password('x'))

        with self.assertRaises(CommandError):
            call_command('seed_demo_diary', 'opiekun@wp.pl', '--no-diary',
                         stdout=io.StringIO())

    def test_together_with_no_diet_it_refuses_rather_than_doing_nothing(self):
        with self.assertRaises(CommandError):
            call_command('seed_demo_diary', 'test@wp.pl', '--no-diary',
                         '--no-diet', stdout=io.StringIO())


class ScaleTests(SeedDemoDiaryTests):
    """`--meal-days`, `--water-days` and `--supplements`."""

    def test_meal_days_sets_how_far_back_the_history_goes(self):
        self.seed('--meal-days', '40')

        oldest = self.meals().order_by('entry_date').first()
        self.assertEqual(
            oldest.entry_date, self.today - datetime.timedelta(days=39))

    def test_a_smaller_run_clears_what_a_larger_one_left(self):
        """Otherwise the history keeps days from a seed nobody asked for any
        more, and the screen shows two runs at once."""
        self.seed('--meal-days', '40')

        self.seed('--meal-days', '10')

        oldest = self.meals().order_by('entry_date').first()
        self.assertEqual(
            oldest.entry_date, self.today - datetime.timedelta(days=9))

    def test_every_day_past_the_seventh_still_gets_its_water(self):
        """The regression `WATER_ML_BY_DAY[:DIET_DAYS]` would have caused: the
        pool is cycled, not sliced, so a longer run does not leave days with
        meals and no water at all."""
        self.seed('--water-days', '21')

        # Day 14 back takes the pool's first entry again, which is non-zero.
        day = self.today - datetime.timedelta(days=14)
        self.assertEqual(self.water_on(day), WATER_ML_BY_DAY[0])

    def test_water_stops_where_it_was_asked_to(self):
        self.seed('--water-days', '10')

        outside = self.today - datetime.timedelta(days=10)
        self.assertEqual(self.water_on(outside), 0)

    def test_supplements_defaults_to_the_artboard_s_three(self):
        self.seed()

        self.assertEqual(
            Supplement.objects.filter(
                id_medical=self.patient.id_medical).count(),
            len(SUPPLEMENT_SHAPES),
        )

    def test_a_longer_list_is_written_and_every_name_is_distinct(self):
        """Two rows with one name on a medicine list is a demo that reads as a
        bug rather than as data."""
        self.seed('--supplements', '15')

        names = list(
            Supplement.objects.filter(id_medical=self.patient.id_medical)
            .values_list('name', flat=True)
        )
        self.assertEqual(len(names), 15)
        self.assertEqual(len(set(names)), 15)

    def test_a_longer_list_is_not_a_fuller_one(self):
        """§08's rule survives the scale: an absent tick is a question nobody
        answered, so a list of fifteen must not come out fifteen-for-fifteen
        and start reading as a score."""
        self.seed('--supplements', '15')

        ticked = SupplementIntake.objects.filter(
            supplement__id_medical=self.patient.id_medical,
            entry_date=self.today,
        ).count()

        self.assertLess(ticked, 15)
        self.assertGreater(ticked, 0)

    def test_more_preparations_than_the_seed_has_is_refused(self):
        with self.assertRaises(CommandError):
            self.seed('--supplements', str(len(ALL_SUPPLEMENT_SHAPES) + 1))

    def test_a_list_the_api_would_refuse_is_refused_here_too(self):
        """MAX_SUPPLEMENTS is what the endpoint stops at, so a longer seeded
        list would be a state the app cannot produce and the patient cannot
        get back to."""
        self.assertGreater(MAX_SUPPLEMENTS, len(ALL_SUPPLEMENT_SHAPES))

    def test_zero_days_is_refused_rather_than_silently_writing_nothing(self):
        for flag in ('--meal-days', '--water-days'):
            with self.subTest(flag=flag):
                with self.assertRaises(CommandError):
                    self.seed(flag, '0')

    def test_nothing_is_written_when_the_scale_is_refused(self):
        """Validated before the first write, not between two of them."""
        with self.assertRaises(CommandError):
            self.seed('--meal-days', '0')

        self.assertFalse(DietMeal.objects.exists())
        self.assertFalse(Diary.objects.exists())


class OtherDrinksTests(SeedDemoDiaryTests):
    def test_every_chip_the_screen_offers_is_seeded_today(self):
        self.seed()

        drinks = set(
            Hydration.objects.filter(
                id_medical=self.patient.id_medical, entry_date=self.today,
            ).exclude(drink=WATER).values_list('drink', flat=True)
        )

        self.assertEqual(drinks, set(OTHER_DRINKS))

    def test_not_one_of_them_moves_the_water_figure(self):
        """The client's rule, and the reason all five are seeded rather than
        two: if any of them were ever counted, a day holding the whole list
        would show it plainly."""
        self.seed()

        self.assertEqual(self.water_on(self.today), WATER_ML_BY_DAY[0])
