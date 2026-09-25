"""`/api/diet/activity/` and `/api/diet/sleep/` — §09, the last diary to get one.

WHAT THESE CLOSED. "Aktywność i sen" was the one screen in the diet module with
no backend of any kind: both panels held their entries in component state and a
reload lost them, which is why the screen carried three separate pieces of
wording admitting it. Those three go in the commit that wires these endpoints —
that ordering is stated in CLAUDE.md and pinned on the frontend side.

THE PROPERTIES WORTH GUARDING ABOVE THE OTHERS, in order:

1. **Nothing is required** (§05, taken literally — an empty body is a valid
   activity and a valid night), and **nothing is a verdict**: no score, no
   total, no average, no target. §09 inherits §08's rule about the water
   counter, and it matters more here, because among these patients are people
   for whom movement is a burden. `NothingIsAVerdictTests` sweeps both payloads.
2. **The day is never an input.** Both endpoints take it from the server's
   clock, so a date in the body cannot reach a past day — which is what makes
   "a day is locked once it is over" structural rather than a permission.
3. **A step count that was never typed is not a zero.** An absent
   `diet_activity_day` row and a row holding 0 are two different claims, and the
   module is only ever entitled to make the one it was told.
"""

import datetime
import uuid

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.activity import (ACTIVITY_KIND_OTHER, ACTIVITY_KINDS,
                           MAX_ACTIVITIES_PER_DAY, MAX_DURATION_MINUTES)
from core.authentication import SESSION_USER_KEY
from core.models import (DietActivity, DietActivityDay, DietSleep, Patient,
                         Specjalist, User, UserRole)
from core.sleep import WAKE_FEELINGS

PASSWORD = 'TajneHaslo123'


class DietNineTestCase(TestCase):
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

    def activity_url(self):
        return reverse('core:diet-activity')

    def steps_url(self):
        return reverse('core:diet-activity-steps')

    def entry_url(self, id_activity):
        return reverse('core:diet-activity-entry', args=[id_activity])

    def sleep_url(self):
        return reverse('core:diet-sleep')


class ActivityReadTests(DietNineTestCase):
    def test_an_untouched_day_is_an_empty_day_rather_than_an_error(self):
        response = self.client.get(self.activity_url())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            'date': self.today.isoformat(), 'entries': [], 'steps': None,
        })

    def test_only_this_patient_s_rows_are_listed(self):
        other = self.make_patient(email='ktos@example.com')
        DietActivity.objects.create(
            id_medical=other.id_medical, entry_date=self.today,
            logged_at=datetime.time(7, 0), kind='Joga',
        )
        DietActivity.objects.create(
            id_medical=self.patient.id_medical, entry_date=self.today,
            logged_at=datetime.time(18, 0), kind='Spacer',
        )

        entries = self.client.get(self.activity_url()).json()['entries']

        self.assertEqual([entry['kind'] for entry in entries], ['Spacer'])

    def test_a_past_day_is_not_listed(self):
        """The panel shows today; nothing else is reachable from this URL."""
        DietActivity.objects.create(
            id_medical=self.patient.id_medical,
            entry_date=self.today - datetime.timedelta(days=1),
            logged_at=datetime.time(9, 0), kind='Rower',
        )

        self.assertEqual(self.client.get(self.activity_url()).json()['entries'], [])

    def test_entries_come_back_newest_first(self):
        for hour in (7, 18, 12):
            DietActivity.objects.create(
                id_medical=self.patient.id_medical, entry_date=self.today,
                logged_at=datetime.time(hour, 0),
            )

        entries = self.client.get(self.activity_url()).json()['entries']

        self.assertEqual([entry['time'] for entry in entries],
                         ['18:00', '12:00', '07:00'])


class ActivityWriteTests(DietNineTestCase):
    def test_an_empty_body_is_a_valid_activity(self):
        """§05 taken literally: it records that somebody moved, which is what
        this diary is for. The screen renders it as "zapisana bez szczegółów"."""
        response = self.client.post(self.activity_url(), {}, format='json')

        self.assertEqual(response.status_code, 201)
        entries = response.json()['entries']
        self.assertEqual(len(entries), 1)
        self.assertIsNone(entries[0]['kind'])
        self.assertIsNone(entries[0]['duration_minutes'])
        self.assertIsNone(entries[0]['feeling_after'])
        # The hour is stamped rather than typed, so it is always there.
        self.assertIsNotNone(entries[0]['time'])

    def test_it_writes_what_the_form_sends(self):
        response = self.client.post(self.activity_url(), {
            'kind': 'Joga', 'duration_minutes': 25, 'feeling_after': 'better',
        }, format='json')

        entry = response.json()['entries'][0]
        self.assertEqual(entry['kind'], 'Joga')
        self.assertEqual(entry['duration_minutes'], 25)
        self.assertEqual(entry['feeling_after'], 'better')
        self.assertEqual(entry['date'], self.today.isoformat())

    def test_every_chip_the_picker_offers_is_accepted(self):
        for kind in ACTIVITY_KINDS + (ACTIVITY_KIND_OTHER,):
            with self.subTest(kind=kind):
                response = self.client.post(
                    self.activity_url(), {'kind': kind}, format='json')
                self.assertEqual(response.status_code, 201)

    def test_the_other_chip_keeps_what_was_typed_under_it(self):
        response = self.client.post(self.activity_url(), {
            'kind': ACTIVITY_KIND_OTHER, 'kind_other': 'Nordic walking',
        }, format='json')

        entry = response.json()['entries'][0]
        self.assertEqual(entry['kind'], ACTIVITY_KIND_OTHER)
        self.assertEqual(entry['kind_other'], 'Nordic walking')

    def test_free_text_sent_without_the_other_chip_is_dropped(self):
        """It belongs to that chip and to nothing else — two answers on one row
        would be two things to keep in step."""
        response = self.client.post(self.activity_url(), {
            'kind': 'Spacer', 'kind_other': 'coś jeszcze',
        }, format='json')

        self.assertEqual(response.json()['entries'][0]['kind_other'], '')

    def test_a_kind_outside_the_vocabulary_is_a_400(self):
        """`0009`'s lesson: a plain Serializer would drop it silently."""
        response = self.client.post(
            self.activity_url(), {'kind': 'Maraton'}, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('kind', response.json())
        self.assertEqual(DietActivity.objects.count(), 0)

    def test_a_feeling_outside_the_vocabulary_is_a_400(self):
        response = self.client.post(
            self.activity_url(), {'feeling_after': 'świetnie'}, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('feeling_after', response.json())

    def test_a_duration_longer_than_a_day_is_refused(self):
        response = self.client.post(
            self.activity_url(),
            {'duration_minutes': MAX_DURATION_MINUTES + 1}, format='json')

        self.assertEqual(response.status_code, 400)

    def test_a_zero_duration_is_refused(self):
        """Zero minutes of activity is not an activity — and the control cannot
        produce one, so a body carrying it is hand-made."""
        response = self.client.post(
            self.activity_url(), {'duration_minutes': 0}, format='json')

        self.assertEqual(response.status_code, 400)

    def test_a_date_in_the_body_cannot_reach_entry_date(self):
        """§09's lock is structural: no field can move an entry into a past day."""
        old = self.today - datetime.timedelta(days=5)

        self.client.post(self.activity_url(), {
            'entry_date': old.isoformat(), 'date': old.isoformat(), 'kind': 'Joga',
        }, format='json')

        self.assertEqual(DietActivity.objects.get().entry_date, self.today)

    def test_an_hour_in_the_body_cannot_reach_logged_at(self):
        self.client.post(
            self.activity_url(), {'time': '03:00', 'logged_at': '03:00'},
            format='json')

        self.assertNotEqual(
            DietActivity.objects.get().logged_at, datetime.time(3, 0))

    def test_the_day_is_full_at_the_backstop(self):
        for _ in range(MAX_ACTIVITIES_PER_DAY):
            DietActivity.objects.create(
                id_medical=self.patient.id_medical, entry_date=self.today,
                logged_at=datetime.time(12, 0),
            )

        response = self.client.post(self.activity_url(), {}, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            DietActivity.objects.count(), MAX_ACTIVITIES_PER_DAY)

    def test_the_full_day_refusal_is_not_about_how_much_somebody_moves(self):
        for _ in range(MAX_ACTIVITIES_PER_DAY):
            DietActivity.objects.create(
                id_medical=self.patient.id_medical, entry_date=self.today,
                logged_at=datetime.time(12, 0),
            )

        detail = str(self.client.post(
            self.activity_url(), {}, format='json').json()).lower()

        for judgement in ('za dużo', 'przesad', 'wystarczy'):
            self.assertNotIn(judgement, detail)


class ActivityDeleteTests(DietNineTestCase):
    def test_todays_entry_can_be_taken_back(self):
        self.client.post(self.activity_url(), {'kind': 'Joga'}, format='json')
        entry_id = DietActivity.objects.get().id_activity

        response = self.client.delete(self.entry_url(entry_id))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['entries'], [])
        self.assertEqual(DietActivity.objects.count(), 0)

    def test_an_older_entry_is_refused_with_a_sentence_not_a_404(self):
        """It is on the weekly report in front of them — see ENTRY_NOT_TODAY."""
        entry = DietActivity.objects.create(
            id_medical=self.patient.id_medical,
            entry_date=self.today - datetime.timedelta(days=2),
            logged_at=datetime.time(9, 0),
        )

        response = self.client.delete(self.entry_url(entry.id_activity))

        self.assertEqual(response.status_code, 403)
        self.assertTrue(DietActivity.objects.filter(pk=entry.pk).exists())

    def test_somebody_elses_entry_is_a_plain_404(self):
        other = self.make_patient(email='ktos@example.com')
        entry = DietActivity.objects.create(
            id_medical=other.id_medical, entry_date=self.today,
            logged_at=datetime.time(9, 0),
        )

        response = self.client.delete(self.entry_url(entry.id_activity))

        self.assertEqual(response.status_code, 404)
        self.assertTrue(DietActivity.objects.filter(pk=entry.pk).exists())

    def test_an_unknown_id_is_a_404(self):
        self.assertEqual(
            self.client.delete(self.entry_url(uuid.uuid4())).status_code, 404)


class StepsTests(DietNineTestCase):
    def test_a_count_is_written_and_read_back(self):
        response = self.client.put(
            self.steps_url(), {'steps': 6400}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['steps'], 6400)

    def test_writing_twice_edits_rather_than_appends(self):
        self.client.put(self.steps_url(), {'steps': 1000}, format='json')
        self.client.put(self.steps_url(), {'steps': 2000}, format='json')

        self.assertEqual(DietActivityDay.objects.count(), 1)
        self.assertEqual(DietActivityDay.objects.get().steps, 2000)

    def test_null_clears_the_count_by_deleting_the_row(self):
        """A row *means* a count was typed, so clearing it removes the row."""
        self.client.put(self.steps_url(), {'steps': 6400}, format='json')

        response = self.client.put(
            self.steps_url(), {'steps': None}, format='json')

        self.assertIsNone(response.json()['steps'])
        self.assertEqual(DietActivityDay.objects.count(), 0)

    def test_zero_is_a_real_answer_and_is_kept(self):
        """"Nobody typed a count" is an absent row; "no steps" is a row of 0."""
        response = self.client.put(self.steps_url(), {'steps': 0}, format='json')

        self.assertEqual(response.json()['steps'], 0)
        self.assertEqual(DietActivityDay.objects.get().steps, 0)

    def test_a_negative_count_is_refused(self):
        self.assertEqual(
            self.client.put(self.steps_url(), {'steps': -1}, format='json')
            .status_code, 400)

    def test_a_body_with_no_steps_key_is_a_400(self):
        """Unlike every other field in this module: the request is specifically
        "set the count", so naming nothing is a bug at the caller."""
        self.assertEqual(
            self.client.put(self.steps_url(), {}, format='json').status_code, 400)

    def test_the_steps_route_is_not_read_as_an_activity_id(self):
        """URL ordering: 'steps' before '<uuid>'."""
        self.assertEqual(self.steps_url(), '/api/diet/activity/steps/')


class SleepTests(DietNineTestCase):
    def test_a_morning_nobody_answered_for_is_an_empty_night(self):
        response = self.client.get(self.sleep_url())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            'date': self.today.isoformat(),
            'fell_asleep_at': None, 'woke_up_at': None, 'quality': None,
            'awakenings': 0, 'wake_feeling': None,
        })

    def test_an_empty_body_is_a_valid_night(self):
        self.assertEqual(
            self.client.put(self.sleep_url(), {}, format='json').status_code, 200)

    def test_it_writes_what_the_panel_sends(self):
        response = self.client.put(self.sleep_url(), {
            'fell_asleep_at': '23:40', 'woke_up_at': '06:50', 'quality': 3,
            'awakenings': 1, 'wake_feeling': 'heavy',
        }, format='json')

        self.assertEqual(response.json(), {
            'date': self.today.isoformat(),
            'fell_asleep_at': '23:40', 'woke_up_at': '06:50', 'quality': 3,
            'awakenings': 1, 'wake_feeling': 'heavy',
        })

    def test_waking_before_falling_asleep_is_the_ordinary_case(self):
        """The night crosses midnight; nothing refuses it."""
        response = self.client.put(self.sleep_url(), {
            'fell_asleep_at': '23:40', 'woke_up_at': '06:50',
        }, format='json')

        self.assertEqual(response.status_code, 200)

    def test_saving_twice_edits_the_same_night(self):
        self.client.put(self.sleep_url(), {'quality': 2}, format='json')
        self.client.put(self.sleep_url(), {'quality': 5}, format='json')

        self.assertEqual(DietSleep.objects.count(), 1)
        self.assertEqual(DietSleep.objects.get().quality, 5)

    def test_put_replaces_rather_than_merges(self):
        """A field left out is an answer taken back — the app's own rule."""
        self.client.put(self.sleep_url(), {
            'fell_asleep_at': '23:00', 'quality': 4,
        }, format='json')

        response = self.client.put(
            self.sleep_url(), {'quality': 4}, format='json')

        self.assertIsNone(response.json()['fell_asleep_at'])

    def test_a_quality_outside_the_scale_is_a_400(self):
        for value in (0, 6):
            with self.subTest(value=value):
                self.assertEqual(
                    self.client.put(
                        self.sleep_url(), {'quality': value}, format='json')
                    .status_code, 400)

    def test_a_feeling_outside_the_vocabulary_is_a_400(self):
        self.assertEqual(
            self.client.put(
                self.sleep_url(), {'wake_feeling': 'wyspany'}, format='json')
            .status_code, 400)

    def test_every_feeling_the_panel_offers_is_accepted(self):
        for feeling in WAKE_FEELINGS:
            with self.subTest(feeling=feeling):
                self.assertEqual(
                    self.client.put(
                        self.sleep_url(), {'wake_feeling': feeling}, format='json')
                    .status_code, 200)

    def test_a_date_in_the_body_cannot_reach_entry_date(self):
        old = self.today - datetime.timedelta(days=3)

        self.client.put(self.sleep_url(), {
            'entry_date': old.isoformat(), 'date': old.isoformat(), 'quality': 3,
        }, format='json')

        self.assertEqual(DietSleep.objects.get().entry_date, self.today)

    def test_only_this_patient_s_night_is_read(self):
        other = self.make_patient(email='ktos@example.com')
        DietSleep.objects.create(
            id_medical=other.id_medical, entry_date=self.today, quality=5)

        self.assertIsNone(self.client.get(self.sleep_url()).json()['quality'])


class NothingIsAVerdictTests(DietNineTestCase):
    """§09 inherits §08's rule: no score, no streak, no target, no total.

    It matters more here than anywhere else in the module, because for part of
    these patients movement is a burden — a screen that praised it is a screen
    that can shame its absence. These sweeps are what a well-meant "improvement"
    has to get past.
    """

    FORBIDDEN = (
        'score', 'wynik', 'ocena', 'streak', 'seria', 'goal', 'cel', 'target',
        'total', 'suma', 'average', 'srednia', 'średnia', 'progress',
        'percent', 'procent', 'calorie', 'kalor', 'kcal', 'burned', 'spalone',
    )

    def test_the_activity_payload_holds_no_verdict(self):
        self.client.post(self.activity_url(), {
            'kind': 'Spacer', 'duration_minutes': 35, 'feeling_after': 'better',
        }, format='json')
        self.client.put(self.steps_url(), {'steps': 6400}, format='json')

        payload = self.client.get(self.activity_url()).json()
        keys = set(payload) | {
            key for entry in payload['entries'] for key in entry
        }

        for key in keys:
            for forbidden in self.FORBIDDEN:
                self.assertNotIn(forbidden, key.lower())

    def test_the_sleep_payload_holds_no_verdict(self):
        self.client.put(self.sleep_url(), {
            'fell_asleep_at': '23:00', 'woke_up_at': '07:00', 'quality': 4,
        }, format='json')

        for key in self.client.get(self.sleep_url()).json():
            for forbidden in self.FORBIDDEN:
                self.assertNotIn(forbidden, key.lower())

    def test_the_night_carries_no_length(self):
        """Derived from the two hours, in one place, and never stored."""
        self.client.put(self.sleep_url(), {
            'fell_asleep_at': '23:00', 'woke_up_at': '07:00',
        }, format='json')

        payload = self.client.get(self.sleep_url()).json()

        for key in ('duration', 'duration_minutes', 'length', 'minutes'):
            self.assertNotIn(key, payload)


class WhoMayAskTests(DietNineTestCase):
    """Clinical endpoints: a guardian and a specialist are refused rather than
    handed an empty day, the same rule every other diet endpoint follows."""

    def sign_in_guardian(self):
        guardian = self.make_user(email='rodzic@example.com', role='rodzic')
        self.sign_in(guardian)

    def sign_in_specialist(self):
        user = self.make_user(email='spec@example.com', role='specjalista')
        Specjalist.objects.create(
            user=user, specjalization='psychodietetyka', approved_at=timezone.now(),
        )
        self.sign_in(user)

    def test_a_guardian_is_refused_everywhere(self):
        self.sign_in_guardian()

        for method, url in (
            ('get', self.activity_url()),
            ('post', self.activity_url()),
            ('put', self.steps_url()),
            ('get', self.sleep_url()),
            ('put', self.sleep_url()),
        ):
            with self.subTest(url=url, method=method):
                response = getattr(self.client, method)(url, {}, format='json')
                self.assertEqual(response.status_code, 403)

    def test_a_specialist_is_refused_everywhere(self):
        self.sign_in_specialist()

        self.assertEqual(self.client.get(self.activity_url()).status_code, 403)
        self.assertEqual(self.client.get(self.sleep_url()).status_code, 403)

    def test_a_visitor_is_refused(self):
        self.client = APIClient()

        self.assertEqual(self.client.get(self.activity_url()).status_code, 403)

    def test_nothing_identifying_travels(self):
        self.client.post(self.activity_url(), {'kind': 'Joga'}, format='json')
        self.client.put(self.sleep_url(), {'quality': 3}, format='json')

        bodies = (
            str(self.client.get(self.activity_url()).json())
            + str(self.client.get(self.sleep_url()).json())
        )

        self.assertNotIn(str(self.patient.id_medical), bodies)
        self.assertNotIn(str(self.patient.user_id), bodies)
        self.assertNotIn('pacjent@example.com', bodies)
