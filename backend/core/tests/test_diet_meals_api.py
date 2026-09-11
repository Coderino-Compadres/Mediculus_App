"""`/api/diet/today/` and `/api/diet/meals/` — the food diary.

WHAT THESE TWO ENDPOINTS CLOSED. Both screens they serve
(`pages/DietHome.tsx`, `pages/DietJournals.tsx`) used to read a hardcoded empty
day out of `api/diet.ts`, because nothing could write a meal and zero was
therefore the true answer rather than a placeholder. They read rows now.

WRITING IS §04 MINUS THE PHOTO, and `WriteTests` is where the argument for that
lives. The form was held back by one field — a photo would be the first file
this deployment ever stored — but `diet_meal` has no photo column, so the three
things it does hold were writable all along. What the tests pin hardest is the
pair of rules that keep the write honest: **nothing is required** (§05, taken
literally — an empty body is a valid meal) and **the day is never an input**, so
a body naming a date cannot rewrite the archive from a form that only shows
today.

THE ONE PROPERTY WORTH GUARDING ABOVE THE OTHERS is that nothing in either
payload is a verdict. The module's premise is that it "nie liczy jedzenia", and
among these patients are people with eating disorders — a total, a target or a
"3 of 5" on the screen they open every morning is precisely what §02 and §05
rule out. `NothingIsAVerdictTests` sweeps for one.
"""

import datetime
import uuid

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import SESSION_USER_KEY
from core.meals import (
    MAX_HISTORY_MEALS, MAX_MEALS_PER_DAY, MEAL_KINDS, streak_days,
)
from core.models import DietMeal, Patient, Specjalist, User, UserRole

PASSWORD = 'TajneHaslo123'


class DietTestCase(TestCase):
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

    def day_url(self):
        return reverse('core:diet-today')

    def history_url(self):
        return reverse('core:diet-meals')

    def meal_url(self, meal):
        return reverse(
            'core:diet-meal',
            args=[meal.id_meal if hasattr(meal, 'id_meal') else meal],
        )

    def meal(self, patient=None, on=None, kind='Obiad', at='13:00', text='Zupa.'):
        return DietMeal.objects.create(
            id_medical=(patient or self.patient).id_medical,
            entry_date=on or self.today,
            kind=kind,
            eaten_at=datetime.time.fromisoformat(at) if at else None,
            description=text,
        )

    def days_ago(self, days):
        return self.today - datetime.timedelta(days=days)


class TodayTests(DietTestCase):
    """What the diet home screen reads."""

    def test_an_untouched_day_is_zeros_rather_than_an_error(self):
        body = self.client.get(self.day_url()).json()

        self.assertEqual(body['date'], self.today.isoformat())
        self.assertEqual(body['meal_count'], 0)
        self.assertEqual(body['streak_days'], 0)

    def test_it_counts_only_today_s_meals(self):
        self.meal()
        self.meal(kind='Kolacja', at='19:30')
        self.meal(on=self.days_ago(1))

        self.assertEqual(self.client.get(self.day_url()).json()['meal_count'], 2)

    def test_another_patient_s_meals_are_not_counted(self):
        other = self.make_patient('inny@example.com')
        self.meal(patient=other)
        self.meal(patient=other, kind='Kolacja')

        body = self.client.get(self.day_url()).json()
        self.assertEqual(body['meal_count'], 0)
        self.assertEqual(body['streak_days'], 0)

    def test_an_id_medical_with_no_rows_is_an_empty_day(self):
        """A patient who has never opened the module, not an error."""
        body = self.client.get(self.day_url()).json()

        self.assertEqual(
            sorted(body), ['date', 'meal_count', 'meals', 'streak_days'])
        self.assertEqual(body['meals'], [])
        self.assertEqual(body['meal_count'], 0)


class StreakTests(DietTestCase):
    """The run of days with a meal — its own count, not the diary's."""

    def test_consecutive_days_ending_today(self):
        for offset in range(3):
            self.meal(on=self.days_ago(offset))

        self.assertEqual(self.client.get(self.day_url()).json()['streak_days'], 3)

    def test_a_run_ending_yesterday_still_counts(self):
        """Or a streak would read as broken from midnight until breakfast."""
        for offset in (1, 2, 3):
            self.meal(on=self.days_ago(offset))

        self.assertEqual(self.client.get(self.day_url()).json()['streak_days'], 3)

    def test_a_gap_ends_it(self):
        for offset in (0, 1, 3, 4):
            self.meal(on=self.days_ago(offset))

        self.assertEqual(self.client.get(self.day_url()).json()['streak_days'], 2)

    def test_two_meals_in_one_day_are_one_day_of_the_streak(self):
        self.meal()
        self.meal(kind='Kolacja', at='20:00')

        self.assertEqual(streak_days(self.patient.id_medical, self.today), 1)

    def test_it_is_not_the_psychotherapy_streak(self):
        """A diary entry is not a meal, and must not feed this number.

        The two are separate on purpose — whether they should be one count is an
        open question for the client — so a `diary` row with no meal beside it
        leaves this at zero.
        """
        from core.models import Diary
        Diary.objects.create(id_medical=self.patient.id_medical, current_mood='Dobrze')

        self.assertEqual(self.client.get(self.day_url()).json()['streak_days'], 0)


class HistoryTests(DietTestCase):
    """"Historia dzienniczków żywieniowych" — a list of days, not of meals."""

    def test_a_day_holds_its_meals(self):
        self.meal(kind='Śniadanie', at='08:00', text='Owsianka.')
        self.meal(kind='Obiad', at='13:30', text='Zupa.')

        body = self.client.get(self.history_url()).json()

        self.assertEqual(len(body), 1)
        self.assertEqual(body[0]['date'], self.today.isoformat())
        self.assertEqual(
            [meal['kind'] for meal in body[0]['meals']], ['Obiad', 'Śniadanie'])

    def test_days_come_newest_first(self):
        self.meal(on=self.days_ago(2))
        self.meal(on=self.days_ago(0))
        self.meal(on=self.days_ago(5))

        dates = [day['date'] for day in self.client.get(self.history_url()).json()]

        self.assertEqual(dates, [
            self.days_ago(0).isoformat(),
            self.days_ago(2).isoformat(),
            self.days_ago(5).isoformat(),
        ])

    def test_a_meal_that_answered_nothing_is_an_ordinary_row(self):
        """§05: no field blocks a save, so this is a row and not an error."""
        self.meal(kind=None, at=None, text='')

        meal = self.client.get(self.history_url()).json()[0]['meals'][0]

        self.assertIsNone(meal['kind'])
        self.assertIsNone(meal['time'])
        self.assertEqual(meal['description'], '')

    def test_an_hour_left_blank_does_not_open_the_day(self):
        """`nulls_last`: a meal saying no hour sits after the ones that do."""
        self.meal(kind='Obiad', at=None)
        self.meal(kind='Śniadanie', at='08:00')

        meals = self.client.get(self.history_url()).json()[0]['meals']

        self.assertEqual([meal['kind'] for meal in meals], ['Śniadanie', 'Obiad'])

    def test_the_hour_is_hh_mm_and_nothing_finer(self):
        self.meal(at='16:20')

        self.assertEqual(
            self.client.get(self.history_url()).json()[0]['meals'][0]['time'],
            '16:20',
        )

    def test_only_the_signed_in_patient_s_days_are_listed(self):
        other = self.make_patient('inny@example.com')
        self.meal(patient=other, on=self.days_ago(1))
        self.meal()

        body = self.client.get(self.history_url()).json()

        self.assertEqual([day['date'] for day in body], [self.today.isoformat()])

    def test_an_empty_diary_is_an_empty_list(self):
        self.assertEqual(self.client.get(self.history_url()).json(), [])

    def test_the_payload_is_the_documented_shape(self):
        self.meal()

        day = self.client.get(self.history_url()).json()[0]

        self.assertEqual(sorted(day), ['date', 'meals'])
        self.assertEqual(sorted(day['meals'][0]), ['description', 'id', 'kind', 'time'])


class NothingIsAVerdictTests(DietTestCase):
    """The module "nie liczy jedzenia", and neither payload may start to."""

    #: Anything that would let a screen tell somebody their day was wrong.
    FORBIDDEN = (
        'calories', 'kcal', 'macros', 'protein', 'carbs', 'fat', 'weight',
        'grams', 'target', 'goal', 'score', 'rating', 'progress', 'balance',
        'deficit', 'surplus', 'limit', 'exceeded', 'success',
    )

    def test_the_day_carries_no_figure_a_day_could_fail(self):
        self.meal()

        for key in self.client.get(self.day_url()).json():
            self.assertNotIn(key, self.FORBIDDEN)

    def test_a_meal_carries_no_quantity_of_any_kind(self):
        self.meal()

        meal = self.client.get(self.history_url()).json()[0]['meals'][0]

        for key in meal:
            self.assertNotIn(key, self.FORBIDDEN)

    def test_nothing_identifying_travels(self):
        """No id_medical, no e-mail — the same sweep every clinical payload gets."""
        self.meal()
        blob = repr(self.client.get(self.history_url()).json()) + repr(
            self.client.get(self.day_url()).json())

        self.assertNotIn(str(self.patient.id_medical), blob)
        self.assertNotIn(self.patient.user.email, blob)


class WriteTests(DietTestCase):
    """POST /api/diet/meals/ — §04's "Dodawanie posiłku"."""

    def post(self, **body):
        return self.client.post(self.history_url(), body, format='json')

    def test_writes_the_three_things_a_meal_holds(self):
        response = self.post(kind='Obiad', time='13:30', description='Zupa i kanapka.')

        self.assertEqual(response.status_code, 201)
        meal = DietMeal.objects.get()
        self.assertEqual(meal.id_medical, self.patient.id_medical)
        self.assertEqual(meal.entry_date, self.today)
        self.assertEqual(meal.kind, 'Obiad')
        self.assertEqual(meal.eaten_at.strftime('%H:%M'), '13:30')
        self.assertEqual(meal.description, 'Zupa i kanapka.')

    def test_nothing_is_required_so_an_empty_body_is_a_meal(self):
        """§05, taken literally: a meal happened, and that is the whole record.

        Not an edge case to tolerate — `pages/DietJournals.tsx` already renders
        such a row as an ordinary one, and refusing it here would be a rule
        invented by the serializer that neither the schema nor the mockups have.
        """
        response = self.post()

        self.assertEqual(response.status_code, 201)
        meal = DietMeal.objects.get()
        self.assertIsNone(meal.kind)
        self.assertIsNone(meal.eaten_at)
        self.assertEqual(meal.description, '')

    def test_a_blank_answer_is_stored_as_no_answer(self):
        """'' from an emptied input is "unanswered", with one representation."""
        response = self.post(kind='', time=None, description='   ')

        self.assertEqual(response.status_code, 201)
        meal = DietMeal.objects.get()
        self.assertIsNone(meal.kind)
        self.assertIsNone(meal.eaten_at)
        self.assertEqual(meal.description, '')

    def test_a_kind_outside_the_vocabulary_is_refused_not_dropped(self):
        """`0009`'s lesson: a plain Serializer discards an undeclared key.

        The diary's "pora dnia" was accepted, confirmed and silently thrown away
        for weeks that way. A ChoiceField makes the same mistake a 400.
        """
        response = self.post(kind='Drugie danie')

        self.assertEqual(response.status_code, 400)
        self.assertIn('kind', response.json())
        self.assertFalse(DietMeal.objects.exists())

    def test_every_kind_the_picker_offers_is_accepted(self):
        for kind in MEAL_KINDS:
            with self.subTest(kind=kind):
                self.assertEqual(self.post(kind=kind).status_code, 201)

    def test_the_day_comes_from_the_clock_not_from_the_body(self):
        """A form that only ever shows today must not be able to write Tuesday."""
        response = self.post(
            kind='Kolacja', entry_date='2020-01-01', date='2020-01-01')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(DietMeal.objects.get().entry_date, self.today)

    def test_the_answer_carries_the_meal_and_the_rebuilt_day(self):
        """Both, because the two screens reading this table draw different things.

        The history draws the row; the home screen draws a count and a streak
        that move the moment one meal is written. A browser recomputing either
        is how one day ends up with two versions of itself.
        """
        body = self.post(kind='Śniadanie', time='08:10').json()

        self.assertEqual(body['meal']['kind'], 'Śniadanie')
        self.assertEqual(body['meal']['time'], '08:10')
        self.assertEqual(body['day']['meal_count'], 1)
        self.assertEqual(body['day']['streak_days'], 1)
        self.assertEqual(body['day']['date'], self.today.isoformat())

    def test_a_written_meal_shows_up_in_the_history(self):
        self.post(kind='Przekąska', time='16:20', description='Orzechy.')

        days = self.client.get(self.history_url()).json()
        self.assertEqual(len(days), 1)
        self.assertEqual(days[0]['date'], self.today.isoformat())
        self.assertEqual(days[0]['meals'][0]['description'], 'Orzechy.')

    def test_a_day_has_a_backstop_and_it_does_not_judge_how_much_somebody_eats(self):
        DietMeal.objects.bulk_create([
            DietMeal(id_medical=self.patient.id_medical, entry_date=self.today)
            for _ in range(MAX_MEALS_PER_DAY)
        ])

        response = self.post(kind='Kolacja')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            DietMeal.objects.filter(entry_date=self.today).count(),
            MAX_MEALS_PER_DAY,
        )
        # The wording is the point: a cap on rows must not read as the module
        # having an opinion about the food.
        said = str(response.json()).lower()
        for verdict in ('za dużo', 'nie możesz', 'przekroczy', 'limit'):
            self.assertNotIn(verdict, said)

    def test_the_backstop_is_per_day_not_per_patient(self):
        yesterday = self.today - datetime.timedelta(days=1)
        DietMeal.objects.bulk_create([
            DietMeal(id_medical=self.patient.id_medical, entry_date=yesterday)
            for _ in range(MAX_MEALS_PER_DAY)
        ])

        self.assertEqual(self.post(kind='Obiad').status_code, 201)

    def test_a_meal_is_written_against_the_session_and_nobody_else(self):
        other = self.make_patient('inny@example.com')

        self.post(kind='Obiad')

        self.assertEqual(
            DietMeal.objects.filter(id_medical=other.id_medical).count(), 0)
        self.assertEqual(
            DietMeal.objects.filter(id_medical=self.patient.id_medical).count(), 1)

    def test_a_guardian_cannot_write_one(self):
        guardian = self.make_user('opiekun2@example.com', role='rodzic')
        self.sign_in(guardian)

        self.assertEqual(self.post(kind='Obiad').status_code, 403)
        self.assertFalse(DietMeal.objects.exists())

    def test_a_visitor_cannot_write_one(self):
        self.client = APIClient()

        self.assertEqual(self.post(kind='Obiad').status_code, 403)
        self.assertFalse(DietMeal.objects.exists())


class VerbTests(DietTestCase):
    """Which verbs exist on the two URLs, and why the missing ones are missing.

    This class used to be `ReadOnlyTests` and pinned the opposite: no write verb
    anywhere in the food diary. That was a real decision with a stated reason —
    §04's form carries a photo, and a photo would be the first file this
    deployment ever stored. What it got wrong is that `diet_meal` has no photo
    column, so the three things it *can* hold were writable all along while
    "Dodaj posiłek", the module's primary action, led to a placeholder from two
    screens. The photo is still the open question; the form is no longer waiting
    on it.
    """

    def test_the_day_takes_no_write(self):
        """Still none, and structurally: the day is derived from the meals."""
        for method in ('post', 'put', 'patch', 'delete'):
            with self.subTest(method=method):
                response = getattr(self.client, method)(self.day_url(), {}, format='json')
                self.assertEqual(response.status_code, 405)

    def test_the_history_takes_a_post_and_nothing_else(self):
        """Correcting one is a verb on the meal's own URL, not on the list."""
        for method in ('put', 'patch', 'delete'):
            with self.subTest(method=method):
                response = getattr(self.client, method)(
                    self.history_url(), {}, format='json')
                self.assertEqual(response.status_code, 405)

        self.assertEqual(
            self.client.post(self.history_url(), {}, format='json').status_code, 201)

    def test_the_meal_url_takes_put_and_delete_but_not_post(self):
        meal = self.meal()

        self.assertEqual(
            self.client.post(self.meal_url(meal), {}, format='json').status_code,
            405,
        )
        self.assertEqual(
            self.client.put(self.meal_url(meal), {}, format='json').status_code,
            200,
        )
        self.assertEqual(self.client.delete(self.meal_url(meal)).status_code, 200)


class AccessTests(DietTestCase):
    """Who may ask — the shape every clinical endpoint in this project has."""

    def test_a_visitor_is_refused(self):
        self.client = APIClient()

        for url in (self.day_url(), self.history_url()):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 403)

    def test_a_guardian_is_refused_rather_than_told_zero(self):
        """No `patient` row, so an empty diary would be a misleading answer."""
        guardian = self.make_user('opiekun@example.com', role='rodzic')
        self.sign_in(guardian)

        for url in (self.day_url(), self.history_url()):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 403)

    def test_a_specialist_is_refused_too(self):
        user = self.make_user('spec@example.com', role='specjalista')
        Specjalist.objects.create(user=user, specjalization='Psychodietetyka')
        self.sign_in(user)

        for url in (self.day_url(), self.history_url()):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 403)


class VocabularyTests(TestCase):
    """`MEAL_KINDS` is §04's six categories, in its order."""

    def test_the_six_categories_in_the_order_the_mockup_draws_them(self):
        self.assertEqual(MEAL_KINDS, (
            'Śniadanie', 'Drugie śniadanie', 'Obiad', 'Podwieczorek', 'Kolacja',
            'Przekąska',
        ))

    def test_the_history_cap_is_a_backstop_rather_than_a_page_size(self):
        """Well above any real diary — hitting it means paginating for real."""
        self.assertGreaterEqual(MAX_HISTORY_MEALS, 500)


class EditTests(DietTestCase):
    """PUT /api/diet/meals/<id>/ — correcting today's meal.

    The gap the supplement list never had: until this endpoint a meal was
    write-once, so a description typed into the wrong meal or an hour out by
    one stayed that way, on a screen whose whole premise is that writing
    something down should be easy.
    """

    def test_it_replaces_the_three_things_a_meal_holds(self):
        meal = self.meal(kind='Obiad', at='13:00', text='Zupa.')

        body = self.client.put(
            self.meal_url(meal),
            {'kind': 'Kolacja', 'time': '19:30', 'description': 'Naleśniki.'},
            format='json',
        ).json()

        meal.refresh_from_db()
        self.assertEqual(meal.kind, 'Kolacja')
        self.assertEqual(meal.eaten_at, datetime.time(19, 30))
        self.assertEqual(meal.description, 'Naleśniki.')
        self.assertEqual(body['meal']['kind'], 'Kolacja')

    def test_put_replaces_rather_than_merges(self):
        """The form submits its whole state, so a field left out is an answer
        taken back — the same rule as /api/diary/today/. A merge would make
        clearing the hour impossible from the only form that writes it."""
        meal = self.meal(kind='Obiad', at='13:00', text='Zupa.')

        self.client.put(self.meal_url(meal), {}, format='json')

        meal.refresh_from_db()
        self.assertIsNone(meal.kind)
        self.assertIsNone(meal.eaten_at)
        self.assertEqual(meal.description, '')

    def test_an_edit_cannot_move_a_meal_to_another_day(self):
        """Which day a meal belongs to is the one thing about it nobody typed."""
        meal = self.meal()

        self.client.put(
            self.meal_url(meal),
            {'description': 'Zupa.', 'entry_date': str(self.days_ago(3)),
             'date': str(self.days_ago(3))},
            format='json',
        )

        meal.refresh_from_db()
        self.assertEqual(meal.entry_date, self.today)

    def test_a_kind_outside_the_vocabulary_is_refused(self):
        """`0009`'s lesson holds on the edit too: never silently dropped."""
        meal = self.meal()

        response = self.client.put(
            self.meal_url(meal), {'kind': 'Podjadanie'}, format='json')

        self.assertEqual(response.status_code, 400)
        meal.refresh_from_db()
        self.assertEqual(meal.kind, 'Obiad')

    def test_it_answers_with_the_row_and_the_rebuilt_day(self):
        meal = self.meal()

        body = self.client.put(
            self.meal_url(meal), {'description': 'Inna zupa.'}, format='json',
        ).json()

        self.assertEqual(body['meal']['description'], 'Inna zupa.')
        self.assertEqual(body['day']['meal_count'], 1)
        self.assertEqual(
            [m['description'] for m in body['day']['meals']], ['Inna zupa.'])

    def test_an_older_meal_is_refused_with_a_sentence_rather_than_a_404(self):
        """It is on the history screen in front of them: "no such thing" about
        a row somebody is looking at is a worse answer than "that day is
        closed"."""
        meal = self.meal(on=self.days_ago(2))

        response = self.client.put(
            self.meal_url(meal), {'description': 'Poprawka.'}, format='json')

        self.assertEqual(response.status_code, 403)
        self.assertIn('dzisiejsze', str(response.json()).lower())
        meal.refresh_from_db()
        self.assertEqual(meal.description, 'Zupa.')

    def test_somebody_else_s_meal_is_a_plain_404_on_both_verbs(self):
        """A 403 would confirm the row exists — the /api/diary/<id>/ rule."""
        other = self.meal(patient=self.make_patient(email='inny@example.com'))

        self.assertEqual(
            self.client.put(
                self.meal_url(other), {'description': 'x'}, format='json',
            ).status_code,
            404,
        )
        self.assertEqual(self.client.delete(self.meal_url(other)).status_code, 404)
        self.assertTrue(DietMeal.objects.filter(pk=other.pk).exists())

    def test_an_unknown_id_is_a_404(self):
        self.assertEqual(
            self.client.put(
                self.meal_url(uuid.uuid4()), {}, format='json').status_code,
            404,
        )


class DeleteTests(DietTestCase):
    def test_it_removes_the_meal_and_answers_with_the_day(self):
        meal = self.meal()
        self.meal(kind='Kolacja', at='19:00', text='Kanapka.')

        body = self.client.delete(self.meal_url(meal)).json()

        self.assertFalse(DietMeal.objects.filter(pk=meal.pk).exists())
        self.assertEqual(body['day']['meal_count'], 1)
        self.assertEqual(
            [m['description'] for m in body['day']['meals']], ['Kanapka.'])

    def test_an_older_meal_cannot_be_removed(self):
        meal = self.meal(on=self.days_ago(1))

        response = self.client.delete(self.meal_url(meal))

        self.assertEqual(response.status_code, 403)
        self.assertTrue(DietMeal.objects.filter(pk=meal.pk).exists())

    def test_removing_the_last_meal_leaves_an_ordinary_empty_day(self):
        """Not an error and not a gap — the state the home screen invites."""
        meal = self.meal()

        body = self.client.delete(self.meal_url(meal)).json()

        self.assertEqual(body['day']['meal_count'], 0)
        self.assertEqual(body['day']['meals'], [])

    def test_it_frees_a_slot_under_the_per_day_backstop(self):
        """What DAY_IS_FULL tells somebody to do has to actually work."""
        meals = [self.meal(text=f'{n}') for n in range(MAX_MEALS_PER_DAY)]
        self.assertEqual(
            self.client.post(self.history_url(), {}, format='json').status_code,
            400,
        )

        self.client.delete(self.meal_url(meals[0]))

        self.assertEqual(
            self.client.post(self.history_url(), {}, format='json').status_code,
            201,
        )


class TodayMealsPayloadTests(DietTestCase):
    """The home screen's day now carries the meals, not only a count."""

    def test_the_day_lists_todays_meals_in_the_history_s_own_order(self):
        """Newest first, exactly as `load_history` renders a day.

        Not a preference: today is the one day drawn on *both* the home screen
        and the history, one screen apart, and it used to come out ascending
        here and descending there. Which order a day happened in is a fact
        about the day rather than a property of the screen.
        """
        self.meal(kind='Kolacja', at='19:00', text='Kanapka.')
        self.meal(kind=None, at=None, text='Bez godziny.')
        self.meal(kind='Śniadanie', at='08:00', text='Owsianka.')

        body = self.client.get(self.day_url()).json()

        self.assertEqual(
            [m['description'] for m in body['meals']],
            ['Kanapka.', 'Owsianka.', 'Bez godziny.'],
        )

    def test_the_home_screen_and_the_history_agree_about_today(self):
        """The regression itself, pinned across the two endpoints."""
        self.meal(kind='Kolacja', at='19:00', text='Kanapka.')
        self.meal(kind='Śniadanie', at='08:00', text='Owsianka.')
        self.meal(kind=None, at=None, text='Bez godziny.')

        day = self.client.get(self.day_url()).json()
        history = self.client.get(self.history_url()).json()
        today_in_history = next(
            d for d in history if d['date'] == self.today.isoformat())

        self.assertEqual(
            [m['description'] for m in day['meals']],
            [m['description'] for m in today_in_history['meals']],
        )

    def test_it_holds_no_other_day(self):
        self.meal(text='Dzisiejszy.')
        self.meal(on=self.days_ago(1), text='Wczorajszy.')

        body = self.client.get(self.day_url()).json()

        self.assertEqual([m['description'] for m in body['meals']], ['Dzisiejszy.'])

    def test_the_count_still_agrees_with_the_list(self):
        """Both travel rather than one being derived in the browser, so this
        is the thing that has to stay true."""
        for n in range(3):
            self.meal(text=str(n))

        body = self.client.get(self.day_url()).json()

        self.assertEqual(body['meal_count'], len(body['meals']))

    def test_no_meal_on_the_day_carries_a_quantity(self):
        self.meal()

        body = self.client.get(self.day_url()).json()

        for meal in body['meals']:
            self.assertEqual(set(meal), {'id', 'kind', 'time', 'description'})
