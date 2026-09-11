"""`/api/diet/hydration/` — the diet module's first endpoint of any kind.

Three groups of decisions are worth pinning here, and each one is a rule the
client stated rather than a default this project reached for:

* **Other drinks are recorded and never converted into water.** A week of tea is
  not a hydrated week on this screen. If somebody ever "fixes" that with a
  coefficient, `OtherDrinkTests` is what says no.
* **The goal is a point of reference, not a verdict.** Past it the bar is simply
  full; nothing congratulates, nothing counts a streak, nothing reports a
  deficit. `GoalTests` sweeps the payload for a value a day could fail.
* **Today is editable and nothing else is.** The diary's own rule applied to a
  second kind of row — a mis-tap must be correctable on the day, and the
  seven-day chart must go on describing the seven days that happened.

Plus the ordinary shape every clinical endpoint in this project has: the session
is the only identity input, one account cannot reach another's rows, and a
non-patient is refused rather than answered with zeroes.
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
from core.drinks import (BOTTLE_ML, DAILY_TARGET_GLASSES, DEFAULT_SERVING_ML,
                         DRINK_NAME_REQUIRED, DRINKS, GLASS_ML,
                         MAX_AMOUNT_ML, MAX_DRINK_NAME, MAX_ENTRIES_PER_DAY,
                         MIN_AMOUNT_ML, OTHER_DRINKS, WATER, WEEK_DAYS)
from core.hydration import DAY_IS_FULL, build_hydration_day
from core.models import Hydration, Patient, Specjalist, User, UserRole

PASSWORD = 'TajneHaslo123'


class HydrationTestCase(TestCase):
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

    def url(self):
        return reverse('core:diet-hydration')

    def entry_url(self, id_hydration):
        return reverse('core:diet-hydration-entry', args=[id_hydration])

    def drink(self, **body):
        return self.client.post(self.url(), body, format='json')

    def glass(self, patient=None, on=None, amount_ml=GLASS_ML, drink=WATER):
        """A serving written straight into the table, dated as asked."""
        return Hydration.objects.create(
            id_medical=(patient or self.patient).id_medical,
            entry_date=on or self.today,
            drink=drink,
            amount_ml=amount_ml if drink == WATER else None,
        )

    def day(self):
        return self.client.get(self.url()).data


class EmptyDayTests(HydrationTestCase):
    """The state every account starts in, and the one the module was in until
    this endpoint existed — `api/diet.ts` returned it without asking anybody."""

    def test_nothing_drunk_is_zero_rather_than_an_error(self):
        day = self.day()

        self.assertEqual(day['water_ml'], 0)
        self.assertEqual(day['glasses'], 0)
        self.assertEqual(day['entries'], [])

    def test_the_scale_and_the_goal_travel_so_no_screen_hardcodes_them(self):
        day = self.day()

        self.assertEqual(day['glass_ml'], GLASS_ML)
        self.assertEqual(day['bottle_ml'], BOTTLE_ML)
        self.assertEqual(day['target_glasses'], DAILY_TARGET_GLASSES)

    def test_the_week_has_seven_days_even_when_all_of_them_are_empty(self):
        """A missing key would silently shift the chart's labels."""
        week = self.day()['week']

        self.assertEqual(len(week), WEEK_DAYS)
        self.assertEqual([d['glasses'] for d in week], [0] * WEEK_DAYS)

    def test_the_week_ends_on_today(self):
        week = self.day()['week']

        self.assertEqual(week[-1]['date'], self.today.isoformat())
        self.assertEqual(
            week[0]['date'],
            (self.today - datetime.timedelta(days=WEEK_DAYS - 1)).isoformat(),
        )


class DrinkingTests(HydrationTestCase):
    def test_a_glass_is_recorded_and_counted(self):
        response = self.drink(amount_ml=GLASS_ML)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['day']['water_ml'], GLASS_ML)
        self.assertEqual(response.data['day']['glasses'], 1)

    def test_the_answer_carries_the_whole_day_so_the_screen_recomputes_nothing(self):
        """Three figures move when one glass is recorded — the count, the bar
        and today's column in the chart."""
        response = self.drink(amount_ml=BOTTLE_ML)
        day = response.data['day']

        self.assertEqual(day['water_ml'], BOTTLE_ML)
        self.assertEqual(day['week'][-1]['water_ml'], BOTTLE_ML)
        self.assertEqual(len(day['entries']), 1)

    def test_water_is_the_default_so_the_commonest_call_is_one_field(self):
        self.drink(amount_ml=GLASS_ML)

        self.assertEqual(Hydration.objects.get().drink, WATER)

    def test_servings_add_up(self):
        self.drink(amount_ml=GLASS_ML)
        self.drink(amount_ml=BOTTLE_ML)

        self.assertEqual(self.day()['water_ml'], GLASS_ML + BOTTLE_ML)

    def test_a_custom_amount_is_reported_back_as_the_fraction_it_is(self):
        """400 ml is 1,6 glasses. Rounding it to 2 would report more than was
        entered, on a figure a specialist may read."""
        self.drink(amount_ml=400)

        self.assertEqual(self.day()['glasses'], 1.6)

    def test_the_newest_serving_is_first(self):
        self.drink(amount_ml=GLASS_ML)
        self.drink(amount_ml=BOTTLE_ML)

        self.assertEqual(self.day()['entries'][0]['amount_ml'], BOTTLE_ML)

    def test_a_serving_with_no_size_given_is_a_glass(self):
        """The rule this file used to pin the opposite of.

        Water with no amount was a 400 ("podaj ilość") and a drink with no
        amount was a row holding NULL. Both are a glass now: one tap means "I
        drank a glass of it", which is what "+ Szklanka" has meant for water all
        along, so the two acts write the same number.

        WORTH KNOWING THAT THIS IS A NUMBER NOBODY TYPED. It enters a clinical
        record and, on water, moves the goal bar — the sort of default this
        project is otherwise careful not to invent. It holds only because the
        screen says so above the chips; `DietHydration.test.tsx` pins that
        sentence, and if it goes this default goes with it.
        """
        for body in ({}, {'drink': WATER}, {'drink': 'Herbata'}, {'drink': 'Lemoniada'}):
            with self.subTest(body=body):
                Hydration.objects.all().delete()
                response = self.client.post(self.url(), body, format='json')

                self.assertEqual(response.status_code, 201)
                self.assertEqual(Hydration.objects.get().amount_ml, DEFAULT_SERVING_ML)

    def test_typing_water_into_the_name_box_is_no_longer_refused(self):
        """It records exactly what "+ Szklanka" records, so there is nothing
        left to refuse — the message that used to point at the buttons is gone
        with the rule that produced it."""
        response = self.drink(drink='woda')

        self.assertEqual(response.status_code, 201)
        row = Hydration.objects.get()
        self.assertEqual(row.drink, WATER)
        self.assertEqual(row.amount_ml, DEFAULT_SERVING_ML)
        self.assertEqual(self.day()['water_ml'], DEFAULT_SERVING_ML)

    def test_a_glass_of_tea_still_counts_towards_no_water(self):
        """The default is a size, not a conversion. This is the pairing that
        would be easiest to get wrong: every drink now carries millilitres, so
        the only thing separating tea from water is the filter on the total."""
        self.drink(drink='Herbata')

        self.assertEqual(Hydration.objects.get().amount_ml, DEFAULT_SERVING_ML)
        self.assertEqual(self.day()['water_ml'], 0)
        self.assertEqual(self.day()['glasses'], 0)

    def test_a_given_amount_still_wins_over_the_default(self):
        self.drink(drink='Herbata', amount_ml=300)

        self.assertEqual(Hydration.objects.get().amount_ml, 300)

    def test_an_amount_outside_the_bounds_is_refused(self):
        for amount in (MIN_AMOUNT_ML - 1, MAX_AMOUNT_ML + 1, 0, -250):
            with self.subTest(amount=amount):
                self.assertEqual(self.drink(amount_ml=amount).status_code, 400)
        self.assertEqual(Hydration.objects.count(), 0)

    def test_a_drink_the_chips_do_not_offer_can_be_typed(self):
        """The vocabulary is the quick way in, not the whole of what may be drunk.

        It was a closed `ChoiceField` until the chips turned out to be the
        commonest drinks rather than all of them. What made opening it safe is
        that the client's "nie przeliczamy na wodę" rule rests on the **amount**
        rule, not on the name list — see the next test.
        """
        response = self.drink(drink='Sok pomarańczowy')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Hydration.objects.get().drink, 'Sok pomarańczowy')

    def test_a_typed_drink_counts_towards_nothing(self):
        """The rule the whole screen rests on, now that any name is accepted."""
        self.drink(drink='Sok pomarańczowy')
        self.drink(drink='Lemoniada')

        day = self.day()
        self.assertEqual(day['water_ml'], 0)
        self.assertEqual(day['glasses'], 0)
        self.assertEqual(day['progress'], 0)
        self.assertEqual(len(day['entries']), 2)

    def test_a_typed_drink_may_carry_an_amount_and_still_counts_for_nothing(self):
        """The size is kept because a patient may want it kept; it is simply not
        added to anything. See `WaterIsTheOnlyOneCountedTests`."""
        response = self.drink(drink='Sok pomarańczowy', amount_ml=200)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Hydration.objects.get().amount_ml, 200)
        self.assertEqual(self.day()['water_ml'], 0)

    def test_a_typed_name_is_folded_onto_the_chip_that_already_says_it(self):
        """Otherwise one patient's list shows "herbata" and "Herbata" as two
        drinks, which is what makes a record read as unreliable."""
        for typed in ('herbata', 'HERBATA', '  Herbata  '):
            with self.subTest(typed=typed):
                self.assertEqual(self.drink(drink=typed).status_code, 201)

        self.assertEqual(
            set(Hydration.objects.values_list('drink', flat=True)), {'Herbata'})

    def test_a_typed_name_has_its_inner_whitespace_collapsed(self):
        self.drink(drink='Sok   pomarańczowy')

        self.assertEqual(Hydration.objects.get().drink, 'Sok pomarańczowy')

    def test_a_blank_name_is_refused_on_the_input_that_produced_it(self):
        for blank in ('', '   '):
            with self.subTest(blank=blank):
                response = self.drink(drink=blank)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(
                    str(response.data['drink'][0]), DRINK_NAME_REQUIRED)
        self.assertEqual(Hydration.objects.count(), 0)

    def test_a_name_longer_than_the_column_should_hold_is_refused(self):
        response = self.drink(drink='x' * (MAX_DRINK_NAME + 1))

        self.assertEqual(response.status_code, 400)
        self.assertIn('drink', response.data)
        self.assertEqual(Hydration.objects.count(), 0)

    def test_a_name_at_the_limit_is_accepted(self):
        """The bound the screen's input carries has to be one the API takes."""
        self.assertEqual(self.drink(drink='x' * MAX_DRINK_NAME).status_code, 201)

    def test_the_day_is_capped_as_a_backstop_against_a_stuck_button(self):
        for _ in range(MAX_ENTRIES_PER_DAY):
            self.glass()

        response = self.drink(amount_ml=GLASS_ML)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(str(response.data['detail'][0]), DAY_IS_FULL)
        self.assertEqual(Hydration.objects.count(), MAX_ENTRIES_PER_DAY)


class OtherDrinkTests(HydrationTestCase):
    """"Herbata, kawa i napary są zapisywane, ale nie przeliczane na wodę —
    decyzja merytoryczna zostaje po stronie specjalisty." (mockups §08)"""

    def test_a_drink_is_recorded(self):
        response = self.drink(drink='Herbata')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['entry']['drink'], 'Herbata')

    def test_and_counts_towards_nothing(self):
        for name in OTHER_DRINKS:
            self.drink(drink=name)

        day = self.day()

        self.assertEqual(day['water_ml'], 0)
        self.assertEqual(day['glasses'], 0)
        self.assertEqual(day['progress'], 0)
        self.assertEqual([d['water_ml'] for d in day['week']], [0] * WEEK_DAYS)

    def test_but_is_listed_so_the_patient_can_see_and_undo_it(self):
        self.drink(drink='Kawa')

        entries = self.day()['entries']

        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]['drink'], 'Kawa')
        # A glass, like every serving that gave no size — and still counted
        # towards nothing, which is the assertion above this one.
        self.assertEqual(entries[0]['amount_ml'], DEFAULT_SERVING_ML)

    def test_water_with_lemon_is_deliberately_not_water(self):
        """The client's own list puts it under "Inne napoje". Reading that as an
        oversight and adding it to the total would be answering a clinical
        question this app is not entitled to answer."""
        self.assertIn('Woda z cytryną', OTHER_DRINKS)

        self.drink(drink='Woda z cytryną')

        self.assertEqual(self.day()['water_ml'], 0)

    def test_an_amount_on_another_drink_is_kept_and_added_to_nothing(self):
        """This used to be a 400, and the refusal was doing two jobs.

        One was real — but recording how much tea somebody drank is information
        they may want kept, and refusing it threw the answer away. The other was
        structural: while nothing but water could carry an amount, no serving
        could *possibly* reach the total. That guarantee is gone, and the two
        `drink == WATER` filters are what replaced it — which is what the class
        below exists to hold.
        """
        response = self.drink(drink='Herbata', amount_ml=GLASS_ML)

        self.assertEqual(response.status_code, 201)
        row = Hydration.objects.get()
        self.assertEqual(row.drink, 'Herbata')
        self.assertEqual(row.amount_ml, GLASS_ML)
        self.assertEqual(self.day()['water_ml'], 0)

    def test_an_amount_on_another_drink_still_has_to_be_a_sane_number(self):
        """The bounds are about a number typed by hand, not about water."""
        for amount in (MIN_AMOUNT_ML - 1, MAX_AMOUNT_ML + 1, 0):
            with self.subTest(amount=amount):
                self.assertEqual(
                    self.drink(drink='Herbata', amount_ml=amount).status_code, 400)
        self.assertEqual(Hydration.objects.count(), 0)

    def test_another_drink_still_needs_no_amount_at_all(self):
        """One tap on a chip is still a serving — §05's rule that no field
        blocks a save. What it stores changed: an unmeasured serving is a glass
        rather than a row holding NULL."""
        self.assertEqual(self.drink(drink='Herbata').status_code, 201)
        self.assertEqual(Hydration.objects.get().amount_ml, DEFAULT_SERVING_ML)

    def test_an_older_row_holding_no_amount_is_still_read_back(self):
        """Nothing was backfilled, so NULL is what every serving written before
        this default holds — and the list has to keep rendering it as a drink
        with no size rather than as a glass it never was."""
        Hydration.objects.create(
            id_medical=self.patient.id_medical, entry_date=self.today,
            drink='Herbata', amount_ml=None,
        )

        entry = self.day()['entries'][0]
        self.assertIsNone(entry['amount_ml'])
        self.assertEqual(entry['drink'], 'Herbata')


class WaterIsTheOnlyOneCountedTests(HydrationTestCase):
    """The client's rule, now that it is held by two filters and nothing else.

    "Herbata, kawa i napary są zapisywane, ale nie przeliczane na wodę —
    decyzja merytoryczna zostaje po stronie specjalisty." (§08)

    THIS CLASS EXISTS BECAUSE THE STRUCTURAL GUARANTEE WAS GIVEN UP. While no
    drink but water could carry an amount, the rule could not be broken: there
    was no number on a cup of tea to add. Amounts on every drink are useful —
    somebody may want to record 300 ml of herbal tea — but they mean the rule
    now rests entirely on `build_hydration_day` and `_week` filtering on
    `drink == WATER`. A third place computing the total, or either filter
    loosened, and a patient's tea starts filling their water bar.

    Every assertion below is deliberately about a *large* amount, so a bug that
    added them would be unmissable rather than a rounding.
    """

    def test_a_litre_of_tea_moves_no_figure_on_the_day(self):
        self.drink(drink='Herbata', amount_ml=1000)

        day = self.day()
        self.assertEqual(day['water_ml'], 0)
        self.assertEqual(day['glasses'], 0)
        self.assertEqual(day['progress'], 0)

    def test_it_moves_no_column_on_the_week_either(self):
        """`_week` is the second filter, and it is a separate query — a fix
        applied to the day's total alone would leave the chart wrong."""
        self.drink(drink='Kawa', amount_ml=2000)

        today = [d for d in self.day()['week'] if d['date'] == self.today.isoformat()]
        self.assertEqual(len(today), 1)
        self.assertEqual(today[0]['water_ml'], 0)
        self.assertEqual(today[0]['glasses'], 0)

    def test_every_drink_but_water_is_excluded_including_a_typed_one(self):
        """Water with lemon is the one the client was explicit about, and a
        typed name is the case no vocabulary can enumerate."""
        for name in (*OTHER_DRINKS, 'Sok pomarańczowy', 'Lemoniada'):
            with self.subTest(drink=name):
                Hydration.objects.all().delete()
                self.drink(drink=name, amount_ml=1000)
                self.assertEqual(self.day()['water_ml'], 0)

    def test_water_alongside_them_is_counted_and_only_water(self):
        """The other half: the filter must not have been tightened into nothing."""
        self.drink(amount_ml=GLASS_ML)
        self.drink(drink='Herbata', amount_ml=1000)
        self.drink(drink='Napar ziołowy', amount_ml=1000)

        day = self.day()
        self.assertEqual(day['water_ml'], GLASS_ML)
        self.assertEqual(day['glasses'], 1)
        self.assertEqual(len(day['entries']), 3)

    def test_the_amount_is_kept_on_the_row_rather_than_discarded(self):
        """Not counted is not the same as not recorded — the size travels back
        so the list can say "Herbata · 300 ml"."""
        self.drink(drink='Herbata', amount_ml=300)

        entry = self.day()['entries'][0]
        self.assertEqual(entry['drink'], 'Herbata')
        self.assertEqual(entry['amount_ml'], 300)


class GoalTests(HydrationTestCase):
    """"Po przekroczeniu celu pasek po prostu jest pełny. Nie ma gratulacji,
    serii ani komunikatu o niedoborze." (mockups §08)"""

    def test_the_bar_fills_and_stops(self):
        for _ in range(DAILY_TARGET_GLASSES + 3):
            self.drink(amount_ml=GLASS_ML)

        self.assertEqual(self.day()['progress'], 1.0)

    def test_but_the_day_still_says_what_it_actually_was(self):
        for _ in range(DAILY_TARGET_GLASSES + 3):
            self.drink(amount_ml=GLASS_ML)

        self.assertEqual(self.day()['glasses'], DAILY_TARGET_GLASSES + 3)

    def test_nothing_in_the_payload_is_a_verdict(self):
        """The sweep the rule is worth: no streak, no flag, no achievement, no
        word for a day that fell short. A figure a day can fail is what this
        screen was told not to have."""
        self.drink(amount_ml=GLASS_ML)

        day = self.day()

        for key in ('streak', 'streak_days', 'goal_met', 'achieved', 'deficit',
                    'shortfall', 'status', 'message', 'ok', 'success'):
            with self.subTest(key=key):
                self.assertNotIn(key, day)


class WeekTests(HydrationTestCase):
    def test_a_past_day_keeps_its_own_total(self):
        yesterday = self.today - datetime.timedelta(days=1)
        self.glass(on=yesterday, amount_ml=BOTTLE_ML)
        self.glass(amount_ml=GLASS_ML)

        week = {d['date']: d['water_ml'] for d in self.day()['week']}

        self.assertEqual(week[yesterday.isoformat()], BOTTLE_ML)
        self.assertEqual(week[self.today.isoformat()], GLASS_ML)

    def test_a_day_older_than_the_window_is_not_in_it(self):
        old = self.today - datetime.timedelta(days=WEEK_DAYS)
        self.glass(on=old, amount_ml=BOTTLE_ML)

        week = self.day()['week']

        self.assertNotIn(old.isoformat(), [d['date'] for d in week])
        self.assertEqual(sum(d['water_ml'] for d in week), 0)

    def test_only_today_is_listed_as_entries(self):
        self.glass(on=self.today - datetime.timedelta(days=1))

        self.assertEqual(self.day()['entries'], [])


class UndoTests(HydrationTestCase):
    """A "+1" with no undo is a counter that cannot be corrected."""

    def test_todays_serving_can_be_taken_back(self):
        entry = self.glass()

        response = self.client.delete(self.entry_url(entry.pk))

        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.day()['water_ml'], 0)

    def test_a_past_serving_cannot(self):
        """Yesterday's glass is as immutable as yesterday's diary entry, or the
        chart stops describing the seven days that happened."""
        entry = self.glass(on=self.today - datetime.timedelta(days=1))

        response = self.client.delete(self.entry_url(entry.pk))

        self.assertEqual(response.status_code, 404)
        self.assertTrue(Hydration.objects.filter(pk=entry.pk).exists())

    def test_somebody_elses_serving_answers_like_a_nonexistent_one(self):
        """404 rather than 403 — the same convention as /api/diary/<id>/, so
        nothing leaks about whether the row exists."""
        other = self.make_patient('inny@example.com')
        entry = self.glass(patient=other)

        response = self.client.delete(self.entry_url(entry.pk))

        self.assertEqual(response.status_code, 404)
        self.assertTrue(Hydration.objects.filter(pk=entry.pk).exists())

    def test_a_serving_that_never_existed_is_the_same_404(self):
        self.assertEqual(
            self.client.delete(self.entry_url(uuid.uuid4())).status_code, 404)


class IsolationTests(HydrationTestCase):
    def test_only_the_signed_in_patients_own_water_is_counted(self):
        other = self.make_patient('inny@example.com')
        self.glass(patient=other, amount_ml=BOTTLE_ML)
        self.glass(amount_ml=GLASS_ML)

        day = self.day()

        self.assertEqual(day['water_ml'], GLASS_ML)
        self.assertEqual(len(day['entries']), 1)

    def test_an_unknown_id_medical_is_an_empty_day_rather_than_an_error(self):
        """The pseudonymized join is not a foreign key; medical_db cannot tell
        an id nobody owns from one nobody has written against."""
        day = build_hydration_day(uuid.uuid4(), self.today)

        self.assertEqual(day['water_ml'], 0)
        self.assertEqual(len(day['week']), WEEK_DAYS)


class AccessTests(HydrationTestCase):
    def test_a_visitor_is_refused(self):
        self.client = APIClient()

        self.assertEqual(self.client.get(self.url()).status_code, 403)
        self.assertEqual(self.drink(amount_ml=GLASS_ML).status_code, 403)

    def test_an_account_with_no_patient_row_is_refused_rather_than_told_zero(self):
        """A guardian is not a clinical subject. "0 z 6 szklanek" would be a
        true sentence about a row that does not exist, and would read as a
        record."""
        guardian = self.make_user('opiekun@example.com', role='rodzic')
        self.sign_in(guardian)

        response = self.client.get(self.url())

        self.assertEqual(response.status_code, 403)
        self.assertEqual(set(response.data), {'detail'})

    def test_a_specialist_is_refused_too(self):
        specialist = self.make_user('terapeutka@example.com', role='specjalista')
        Specjalist.objects.create(user=specialist, specjalization='DBT')
        self.sign_in(specialist)

        self.assertEqual(self.client.get(self.url()).status_code, 403)

    def test_no_write_verb_reaches_the_collection_but_post(self):
        for method in ('put', 'patch', 'delete'):
            with self.subTest(method=method):
                response = getattr(self.client, method)(self.url(), {}, format='json')
                self.assertEqual(response.status_code, 405)

    def test_the_entry_url_only_deletes(self):
        entry = self.glass()

        for method in ('get', 'post', 'put', 'patch'):
            with self.subTest(method=method):
                response = getattr(self.client, method)(
                    self.entry_url(entry.pk), {}, format='json')
                self.assertEqual(response.status_code, 405)


class PayloadTests(HydrationTestCase):
    def test_nothing_identifying_travels(self):
        """`core/hydration.py` never sees a name, an address or a user id, and
        `id_medical` is the pseudonym — none of the three belongs on the wire."""
        self.drink(amount_ml=GLASS_ML)

        body = str(self.day())

        for secret in (str(self.patient.id_medical), str(self.patient.user_id),
                       self.patient.user.email):
            with self.subTest(secret=secret):
                self.assertNotIn(secret, body)

    def test_an_entry_carries_what_the_list_renders_and_nothing_else(self):
        self.drink(amount_ml=GLASS_ML)

        self.assertEqual(
            set(self.day()['entries'][0]), {'id', 'drink', 'amount_ml', 'at'})

    def test_the_vocabulary_the_endpoint_accepts_is_the_one_module(self):
        """A sixth drink added to `core/drinks.py` reaches the API for free;
        one added to the API alone would not reach `utils/drinks.ts`."""
        for name in DRINKS:
            with self.subTest(drink=name):
                body = {'drink': name}
                if name == WATER:
                    body['amount_ml'] = GLASS_ML
                self.assertEqual(
                    self.client.post(self.url(), body, format='json').status_code, 201)
