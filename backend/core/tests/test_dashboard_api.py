"""Tests for /api/dashboard/home/ — the home screen's own data.

Touches both databases: the session and the `patient` row live in user_db, the
diary entries and reports being aggregated live in medical_db, and the whole
point of the endpoint is joining the two on `id_medical` in application code.
"""

import datetime
import uuid

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.test import SimpleTestCase, TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import SESSION_USER_KEY
from core.dashboard import WEEK_LENGTH
from core.emotions import normalize_emotion
from core.models import (Diary, MoodScale, Patient, Raport, Technique, User,
                         UserRole)


def make_diary(id_medical, day, **fields):
    """A diary entry stamped as written at noon on `day`.

    `created_at` is `auto_now_add`, so it cannot be passed to create(); an UPDATE
    is the only way to place an entry on a past day.
    """
    diary = Diary.objects.create(id_medical=id_medical, **fields)
    noon = timezone.make_aware(datetime.datetime.combine(day, datetime.time(12, 0)))
    Diary.objects.filter(pk=diary.pk).update(created_at=noon)
    diary.refresh_from_db()
    return diary


class DashboardTestCase(TestCase):
    databases = {'default', 'medical'}

    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()
        self.url = reverse('core:home-dashboard')
        self.patient = self.create_patient('pacjent@example.com')

    def create_patient(self, email, role='patient'):
        user_role = UserRole.objects.get_or_create(name=role)[0]
        user = User.objects.create(
            user_role=user_role, email=email, password_hash=make_password('TajneHaslo123'),
            data_consent_at=timezone.now(),
            services_consent_at=timezone.now(),
        )
        return Patient.objects.create(user=user, is_child=False)

    def sign_in(self, user):
        session = self.client.session
        session[SESSION_USER_KEY] = str(user.pk)
        session.save()
        self.client.cookies[settings.SESSION_COOKIE_NAME] = session.session_key

    def days_ago(self, count):
        return self.today - datetime.timedelta(days=count)

    def get_dashboard(self):
        self.sign_in(self.patient.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        return response.data


class AccessTests(DashboardTestCase):
    def test_a_visitor_without_a_session_is_rejected(self):
        self.assertEqual(self.client.get(self.url).status_code, 403)

    def test_an_account_without_a_patient_row_is_rejected(self):
        guardian = User.objects.create(
            user_role=UserRole.objects.get_or_create(name='rodzic')[0],
            email='rodzic@example.com',
            data_consent_at=timezone.now(),
            services_consent_at=timezone.now(),
        )
        self.sign_in(guardian)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 403)
        self.assertIn('pacjenta', response.data['detail'].lower())

    def test_only_the_signed_in_patient_s_entries_are_counted(self):
        other = self.create_patient('ktos.inny@example.com')
        make_diary(other.id_medical, self.today, stress_level=9, energy_level=1)
        make_diary(self.patient.id_medical, self.today, stress_level=3, energy_level=8)

        data = self.get_dashboard()

        self.assertEqual(data['average_stress'], 3.0)
        self.assertEqual(data['average_energy'], 8.0)


class WeekTests(DashboardTestCase):
    def test_the_week_is_seven_days_ending_today(self):
        data = self.get_dashboard()

        self.assertEqual(len(data['week']), WEEK_LENGTH)
        self.assertEqual(data['week'][-1]['date'], self.today.isoformat())
        self.assertEqual(data['week'][0]['date'], self.days_ago(WEEK_LENGTH - 1).isoformat())
        self.assertTrue(all(day['has_entry'] is False for day in data['week']))

    def test_a_day_takes_its_colour_from_the_declared_strongest_emotion(self):
        diary = make_diary(
            self.patient.id_medical, self.days_ago(2),
            current_strongest_emotion='niepokój', stress_level=3,
        )
        MoodScale.objects.create(diary=diary, anxiety_scale=7, sadness_scale=2)

        day = self.get_dashboard()['week'][WEEK_LENGTH - 3]

        self.assertTrue(day['has_entry'])
        # 'niepokój' is the patient's own word for 'Lęk'; the height comes from
        # the anxiety slider, so bar and colour describe the same feeling.
        self.assertEqual(day['dominant_emotion'], 'Lęk')
        self.assertEqual(day['intensity'], 7)

    def test_an_unrecognised_emotion_falls_back_to_the_highest_rating(self):
        diary = make_diary(
            self.patient.id_medical, self.today,
            current_strongest_emotion='zmęczenie', stress_level=4,
        )
        MoodScale.objects.create(diary=diary, sadness_scale=6, anxiety_scale=2)

        day = self.get_dashboard()['week'][-1]

        self.assertEqual(day['dominant_emotion'], 'Smutek')
        self.assertEqual(day['intensity'], 6)

    def test_shame_and_calm_are_rateable_like_the_other_scales(self):
        """core.0005 gave the last two emotions without a column one of their own.

        Before it, 'Wstyd' and 'Spokój' could only arrive as free text, so an
        entry where one of them was the strongest feeling drew a bar with no
        height. Both now compete on rating like the other seven.
        """
        diary = make_diary(self.patient.id_medical, self.today, stress_level=3)
        MoodScale.objects.create(diary=diary, shame_scale=8, calm_scale=1, sadness_scale=5)

        day = self.get_dashboard()['week'][-1]

        self.assertEqual(day['dominant_emotion'], 'Wstyd')
        self.assertEqual(day['intensity'], 8)

    def test_a_declared_shame_takes_its_height_from_the_new_column(self):
        """The declared-emotion path needs the column too, not just the fallback."""
        diary = make_diary(
            self.patient.id_medical, self.today,
            current_strongest_emotion='wstyd', stress_level=9,
        )
        MoodScale.objects.create(diary=diary, shame_scale=4)

        day = self.get_dashboard()['week'][-1]

        # Stress is rated higher, but the patient said shame was the strongest
        # feeling -- so the bar is shame's, at shame's height.
        self.assertEqual(day['dominant_emotion'], 'Wstyd')
        self.assertEqual(day['intensity'], 4)

    def test_stress_competes_with_the_mood_scales(self):
        diary = make_diary(self.patient.id_medical, self.today, stress_level=9)
        MoodScale.objects.create(diary=diary, sadness_scale=3, anxiety_scale=4)

        day = self.get_dashboard()['week'][-1]

        self.assertEqual(day['dominant_emotion'], 'Stres')
        self.assertEqual(day['intensity'], 9)

    def test_an_entry_with_no_ratings_still_counts_as_a_day_written(self):
        make_diary(self.patient.id_medical, self.today, notes='Bez ocen.')

        day = self.get_dashboard()['week'][-1]

        self.assertTrue(day['has_entry'])
        self.assertIsNone(day['dominant_emotion'])
        self.assertIsNone(day['intensity'])

    def test_entries_older_than_the_window_are_left_out(self):
        make_diary(self.patient.id_medical, self.days_ago(WEEK_LENGTH), stress_level=10)

        data = self.get_dashboard()

        self.assertTrue(all(day['has_entry'] is False for day in data['week']))
        self.assertIsNone(data['average_stress'])


class AverageTests(DashboardTestCase):
    def test_averages_cover_the_seven_day_window(self):
        make_diary(self.patient.id_medical, self.today, stress_level=8, energy_level=3)
        make_diary(self.patient.id_medical, self.days_ago(3), stress_level=5, energy_level=6)

        data = self.get_dashboard()

        self.assertEqual(data['average_stress'], 6.5)
        self.assertEqual(data['average_energy'], 4.5)

    def test_a_missing_rating_does_not_drag_the_average_down(self):
        make_diary(self.patient.id_medical, self.today, stress_level=6, energy_level=None)
        make_diary(self.patient.id_medical, self.days_ago(1), stress_level=None, energy_level=4)

        data = self.get_dashboard()

        self.assertEqual(data['average_stress'], 6.0)
        self.assertEqual(data['average_energy'], 4.0)

    def test_a_second_entry_on_one_day_replaces_the_first(self):
        """One entry per day is the rule; nothing in the schema enforces it."""
        make_diary(self.patient.id_medical, self.today, stress_level=2, energy_level=2)
        make_diary(self.patient.id_medical, self.today, stress_level=8, energy_level=8)

        data = self.get_dashboard()

        self.assertEqual(data['average_stress'], 8.0)
        self.assertEqual(len([day for day in data['week'] if day['has_entry']]), 1)


class StreakTests(DashboardTestCase):
    def test_consecutive_days_are_counted_back_from_today(self):
        for offset in range(3):
            make_diary(self.patient.id_medical, self.days_ago(offset))

        self.assertEqual(self.get_dashboard()['streak_days'], 3)

    def test_a_gap_ends_the_streak(self):
        for offset in (0, 1, 3, 4):
            make_diary(self.patient.id_medical, self.days_ago(offset))

        self.assertEqual(self.get_dashboard()['streak_days'], 2)

    def test_today_being_unwritten_does_not_break_yesterday_s_streak(self):
        for offset in (1, 2):
            make_diary(self.patient.id_medical, self.days_ago(offset))

        self.assertEqual(self.get_dashboard()['streak_days'], 2)

    def test_nothing_written_recently_is_a_streak_of_zero(self):
        make_diary(self.patient.id_medical, self.days_ago(2))

        self.assertEqual(self.get_dashboard()['streak_days'], 0)

    def test_a_streak_may_be_longer_than_the_chart(self):
        for offset in range(WEEK_LENGTH + 3):
            make_diary(self.patient.id_medical, self.days_ago(offset))

        self.assertEqual(self.get_dashboard()['streak_days'], WEEK_LENGTH + 3)


class TodayEntryTests(DashboardTestCase):
    def test_no_entry_today_reads_as_empty(self):
        make_diary(self.patient.id_medical, self.days_ago(1), stress_level=5)

        self.assertIsNone(self.get_dashboard()['today_entry'])

    def test_today_s_entry_lists_its_strongest_emotions(self):
        diary = make_diary(
            self.patient.id_medical, self.today,
            current_mood='neutralny', current_strongest_emotion='niepokój', stress_level=6,
        )
        MoodScale.objects.create(
            diary=diary, anxiety_scale=7, sadness_scale=4, anger_scale=1, happiness_scale=0,
        )

        entry = self.get_dashboard()['today_entry']

        self.assertEqual(entry['mood_label'], 'Neutralny')
        # Strongest first, capped at three, and a zero rating is not "felt".
        self.assertEqual(
            entry['emotions'],
            [
                {'emotion': 'Lęk', 'intensity': 7},
                {'emotion': 'Stres', 'intensity': 6},
                {'emotion': 'Smutek', 'intensity': 4},
            ],
        )

    def test_a_missing_mood_label_is_null_rather_than_invented(self):
        make_diary(self.patient.id_medical, self.today, current_mood='   ', stress_level=5)

        self.assertIsNone(self.get_dashboard()['today_entry']['mood_label'])


class TechniqueTests(DashboardTestCase):
    def test_no_report_means_no_suggestion(self):
        self.assertIsNone(self.get_dashboard()['technique'])

    def test_the_suggestion_comes_from_the_latest_report(self):
        grounding = Technique.objects.create(name='Technika 5-4-3-2-1', type='DBT')
        journal = Technique.objects.create(name='Dziennik emocji', type='CBT')
        Raport.objects.create(
            id_medical=self.patient.id_medical, technique=journal,
            most_frequent_emotion='frustracja',
        )
        Raport.objects.create(
            id_medical=self.patient.id_medical, technique=grounding,
            most_frequent_emotion='niepokój',
        )

        technique = self.get_dashboard()['technique']

        self.assertEqual(technique['name'], 'Technika 5-4-3-2-1')
        self.assertIn('lęk', technique['match_reason'])

    def test_another_patient_s_report_is_not_borrowed(self):
        other = self.create_patient('ktos.inny@example.com')
        Raport.objects.create(
            id_medical=other.id_medical,
            technique=Technique.objects.create(name='Body scan', type='DBT'),
        )

        self.assertIsNone(self.get_dashboard()['technique'])

    def test_an_unreadable_emotion_still_yields_a_suggestion(self):
        Raport.objects.create(
            id_medical=self.patient.id_medical,
            technique=Technique.objects.create(name='Body scan', type='DBT'),
            most_frequent_emotion='zmęczenie',
        )

        technique = self.get_dashboard()['technique']

        self.assertEqual(technique['name'], 'Body scan')
        self.assertTrue(technique['match_reason'])


class NormalizeEmotionTests(SimpleTestCase):
    """Free text from `diary.current_strongest_emotion`, mapped or refused."""

    def test_synonyms_and_spellings_reach_the_same_name(self):
        for text in ('Lęk', 'lek', ' NIEPOKÓJ ', 'strach'):
            self.assertEqual(normalize_emotion(text), 'Lęk', text)

    def test_an_emotion_outside_the_vocabulary_is_refused(self):
        self.assertIsNone(normalize_emotion('zmęczenie'))
        self.assertIsNone(normalize_emotion(''))
        self.assertIsNone(normalize_emotion(None))


class UnknownPatientTests(DashboardTestCase):
    def test_an_id_medical_with_no_rows_yields_an_empty_dashboard(self):
        """The pseudonymized join has no foreign key behind it (see CLAUDE.md)."""
        self.patient.id_medical = uuid.uuid4()
        self.patient.save(update_fields=['id_medical'])

        data = self.get_dashboard()

        self.assertEqual(data['streak_days'], 0)
        self.assertIsNone(data['today_entry'])
        self.assertIsNone(data['average_stress'])
        self.assertIsNone(data['technique'])
