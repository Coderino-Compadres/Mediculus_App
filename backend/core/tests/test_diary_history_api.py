"""Tests for the read-only diary history: GET /api/diary/ and /api/diary/<id>/.

The rule these endpoints exist to serve is that past entries are immutable and
private. Immutable is structural — no write verb here, and the writing endpoint
can only address today — so what is worth testing is the privacy: this is the
only diary URL carrying an id, and therefore the only one where a request can
name a row belonging to somebody else.
"""

import datetime
import uuid
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import SESSION_USER_KEY
from core.models import Diary, MoodScale, Patient, User, UserRole


def make_diary(id_medical, day, **fields):
    """An entry stamped noon on `day` — created_at is auto_now_add."""
    diary = Diary.objects.create(id_medical=id_medical, **fields)
    noon = timezone.make_aware(datetime.datetime.combine(day, datetime.time(12, 0)))
    Diary.objects.filter(pk=diary.pk).update(created_at=noon, updated_at=noon)
    diary.refresh_from_db()
    return diary


class HistoryTestCase(TestCase):
    databases = {'default', 'medical'}

    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()
        self.url = reverse('core:diary-history')
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

    def days_ago(self, count):
        return self.today - datetime.timedelta(days=count)

    def get_history(self, expect=200):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, expect, response.data)
        return response.data

    def detail_url(self, id_diary):
        return reverse('core:diary-entry', args=[id_diary])


class AccessTests(HistoryTestCase):
    def test_a_visitor_without_a_session_is_refused(self):
        self.client = APIClient()

        self.assertEqual(self.client.get(self.url).status_code, 403)

    def test_an_account_without_a_patient_row_is_refused(self):
        guardian = User.objects.create(
            user_role=UserRole.objects.get_or_create(name='rodzic')[0],
            email='rodzic@example.com',
        )
        self.sign_in(guardian)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 403)
        self.assertIn('pacjenta', response.data['detail'].lower())

    def test_the_list_holds_only_the_signed_in_patient_s_entries(self):
        other = self.create_patient('ktos.inny@example.com')
        make_diary(other.id_medical, self.days_ago(1), notes='Nie twoje.')
        make_diary(self.patient.id_medical, self.days_ago(1), notes='Moje.')

        entries = self.get_history()

        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]['notes'], 'Moje.')

    def test_another_patient_s_entry_is_a_404_not_a_403(self):
        """A wrong owner must be indistinguishable from a wrong id.

        Answering 403 would confirm the entry exists, which is itself a leak.
        """
        other = self.create_patient('ktos.inny@example.com')
        theirs = make_diary(other.id_medical, self.days_ago(1), notes='Nie twoje.')

        response = self.client.get(self.detail_url(theirs.id_diary))

        self.assertEqual(response.status_code, 404)
        self.assertNotIn('Nie twoje.', str(response.data))

    def test_an_id_that_does_not_exist_answers_the_same_way(self):
        response = self.client.get(self.detail_url(uuid.uuid4()))

        self.assertEqual(response.status_code, 404)

    def test_a_visitor_cannot_read_a_detail_either(self):
        mine = make_diary(self.patient.id_medical, self.days_ago(1))
        self.client = APIClient()

        self.assertEqual(self.client.get(self.detail_url(mine.id_diary)).status_code, 403)


class ListTests(HistoryTestCase):
    def test_an_empty_diary_is_an_empty_list_rather_than_an_error(self):
        self.assertEqual(self.get_history(), [])

    def test_entries_come_back_newest_first(self):
        make_diary(self.patient.id_medical, self.days_ago(5), notes='Starszy.')
        make_diary(self.patient.id_medical, self.days_ago(1), notes='Nowszy.')
        make_diary(self.patient.id_medical, self.days_ago(3), notes='Środkowy.')

        entries = self.get_history()

        self.assertEqual([e['notes'] for e in entries], ['Nowszy.', 'Środkowy.', 'Starszy.'])

    def test_today_is_part_of_the_history_too(self):
        # The archive screen lists today alongside the rest and decides on its
        # own that today is the one still editable.
        make_diary(self.patient.id_medical, self.today, notes='Dziś.')
        make_diary(self.patient.id_medical, self.days_ago(1), notes='Wczoraj.')

        entries = self.get_history()

        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[0]['date'], self.today.isoformat())

    def test_each_entry_carries_what_the_archive_needs(self):
        diary = make_diary(
            self.patient.id_medical, self.days_ago(2),
            current_mood='Źle', stress_level=7, energy_level=3, tension_level=8,
            situation='Kłótnia.', situation_place='Dom', emotion_note='Gorąco.',
            thought='Nikt się nie liczy.', how_situation_handled='Wyszedłem.',
            notes='Ciężko.', risky_behavior_note='Alkohol.',
        )
        MoodScale.objects.create(diary=diary, anger_scale=8, shame_scale=3)

        entry = self.get_history()[0]

        self.assertEqual(entry['id'], str(diary.id_diary))
        self.assertEqual(entry['date'], self.days_ago(2).isoformat())
        self.assertIn('saved_at', entry)
        self.assertEqual(entry['mood'], 'bad')
        self.assertEqual(entry['tension_level'], 8)
        self.assertEqual(entry['risky_behavior_note'], 'Alkohol.')
        self.assertEqual(
            sorted(r['emotion'] for r in entry['emotions']),
            sorted(['Złość', 'Wstyd', 'Stres']),
        )

    def test_an_entry_with_no_ratings_still_appears(self):
        make_diary(self.patient.id_medical, self.days_ago(1), notes='Bez ocen.')

        entries = self.get_history()

        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]['emotions'], [])

    def test_the_date_is_the_local_calendar_day(self):
        # Stored in UTC; 22:30 UTC in August is already the next day in Warsaw.
        diary = Diary.objects.create(id_medical=self.patient.id_medical, notes='Późno.')
        late = datetime.datetime(2026, 8, 24, 22, 30, tzinfo=datetime.timezone.utc)
        Diary.objects.filter(pk=diary.pk).update(created_at=late, updated_at=late)

        self.assertEqual(self.get_history()[0]['date'], '2026-08-25')


class DetailTests(HistoryTestCase):
    def test_it_answers_with_the_same_shape_as_the_list(self):
        diary = make_diary(
            self.patient.id_medical, self.days_ago(3),
            current_mood='Dobrze', energy_level=7, notes='Spokojnie.',
        )
        MoodScale.objects.create(diary=diary, calm_scale=8)

        response = self.client.get(self.detail_url(diary.id_diary))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, self.get_history()[0])

    def test_todays_entry_can_also_be_read_by_id(self):
        # The archive links today to the editable form, but a direct link to the
        # read-only view must not 404.
        diary = make_diary(self.patient.id_medical, self.today, notes='Dziś.')

        response = self.client.get(self.detail_url(diary.id_diary))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['notes'], 'Dziś.')

    def test_a_malformed_id_does_not_reach_the_view(self):
        """The <uuid> converter rejects it as a routing failure, not a 500."""
        self.assertEqual(self.client.get('/api/diary/nie-uuid/').status_code, 404)

    def test_the_literal_today_is_not_read_as_an_id(self):
        # 'today' would never parse as a UUID, but the route order is what makes
        # that certain rather than lucky.
        response = self.client.get(reverse('core:diary-today'))

        self.assertEqual(response.status_code, 200)


class ImmutabilityTests(HistoryTestCase):
    def test_the_history_list_refuses_to_be_written_to(self):
        for method in ('post', 'put', 'patch', 'delete'):
            with self.subTest(method=method):
                response = getattr(self.client, method)(self.url, {}, format='json')
                self.assertEqual(response.status_code, 405)

    def test_a_past_entry_refuses_to_be_written_to(self):
        diary = make_diary(self.patient.id_medical, self.days_ago(2), notes='Nie do ruszenia.')

        for method in ('post', 'put', 'patch', 'delete'):
            with self.subTest(method=method):
                response = getattr(self.client, method)(
                    self.detail_url(diary.id_diary), {}, format='json')
                self.assertEqual(response.status_code, 405)

        diary.refresh_from_db()
        self.assertEqual(diary.notes, 'Nie do ruszenia.')

    def test_saving_today_never_touches_an_older_entry(self):
        yesterday = make_diary(self.patient.id_medical, self.days_ago(1), notes='Wczoraj.')

        self.client.put(reverse('core:diary-today'), {'notes': 'Dziś.'}, format='json')

        yesterday.refresh_from_db()
        self.assertEqual(yesterday.notes, 'Wczoraj.')
        self.assertEqual(len(self.get_history()), 2)


class HistoryCapTests(HistoryTestCase):
    """MAX_HISTORY_ENTRIES is a backstop against a runaway query, not a product
    rule — one entry a day means a year is 365 rows. What matters is which rows
    survive the cut: the archive lists newest first, so truncating from the
    wrong end would quietly hide the entries somebody actually came to read.

    Hitting it for real means the screen needs pagination rather than a bigger
    number, so this also serves as the reminder.
    """

    def write_days(self, count):
        return [make_diary(self.patient.id_medical, self.days_ago(index),
                           notes=f'Dzień -{index}.')
                for index in range(count)]

    def test_the_list_is_cut_at_the_cap(self):
        self.write_days(6)

        with patch('core.diary.MAX_HISTORY_ENTRIES', 4):
            entries = self.get_history()

        self.assertEqual(len(entries), 4)

    def test_the_entries_kept_are_the_newest_ones(self):
        self.write_days(6)

        with patch('core.diary.MAX_HISTORY_ENTRIES', 4):
            entries = self.get_history()

        self.assertEqual(
            [entry['date'] for entry in entries],
            [self.days_ago(index).isoformat() for index in range(4)],
        )

    def test_a_diary_shorter_than_the_cap_is_returned_whole(self):
        self.write_days(3)

        with patch('core.diary.MAX_HISTORY_ENTRIES', 4):
            self.assertEqual(len(self.get_history()), 3)

    def test_an_entry_past_the_cap_is_still_readable_by_id(self):
        """The cap belongs to the list query. A link somebody saved, or a report
        referring to an old entry, must not stop working because the archive got
        long."""
        oldest = self.write_days(6)[-1]

        with patch('core.diary.MAX_HISTORY_ENTRIES', 4):
            response = self.client.get(self.detail_url(oldest.id_diary))

        self.assertEqual(response.status_code, 200)

    def test_the_shipped_cap_is_generous_enough_not_to_bite_in_a_year(self):
        """365 entries is a year of perfect attendance; the cap must sit above
        it or the backstop turns into a product limit nobody decided on."""
        from core.diary import MAX_HISTORY_ENTRIES

        self.assertGreater(MAX_HISTORY_ENTRIES, 365)
