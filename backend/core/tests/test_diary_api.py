"""Tests for /api/diary/today/ — writing the "Dodaj wpis" form into medical_db.

Like the dashboard endpoint this straddles both databases: the session and the
`patient` row are in user_db, the entry it writes is in medical_db, and the two
are joined only by `id_medical` in application code.

The product rule under test is: one entry per calendar day, editable on the day
it was written, everything older read-only. It is enforced by the URL naming no
entry at all — only "today" — so most of these tests are about that boundary
holding rather than about a permission check firing.
"""

import datetime

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import SESSION_USER_KEY
from core.diary import MOOD_LABELS
from core.models import Diary, MoodScale, Patient, User, UserRole


def place_on_day(diary, day):
    """Move an entry to `day` — `created_at` is auto_now_add, so only UPDATE can."""
    noon = timezone.make_aware(datetime.datetime.combine(day, datetime.time(12, 0)))
    Diary.objects.filter(pk=diary.pk).update(created_at=noon)
    diary.refresh_from_db()
    return diary


class DiaryEntryTestCase(TestCase):
    databases = {'default', 'medical'}

    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()
        self.url = reverse('core:diary-today')
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

    def put(self, payload, expect=200):
        response = self.client.put(self.url, payload, format='json')
        self.assertEqual(response.status_code, expect, response.data)
        return response.data

    def get(self, expect=200):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, expect, response.data)
        return response.data


class AccessTests(DiaryEntryTestCase):
    def test_a_visitor_without_a_session_cannot_read_or_write(self):
        self.client = APIClient()

        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(self.client.put(self.url, {}, format='json').status_code, 403)

    def test_an_account_without_a_patient_row_is_rejected(self):
        guardian = User.objects.create(
            user_role=UserRole.objects.get_or_create(name='rodzic')[0],
            email='rodzic@example.com',
        )
        self.sign_in(guardian)

        response = self.client.put(self.url, {'mood': 'good'}, format='json')

        self.assertEqual(response.status_code, 403)
        self.assertIn('pacjenta', response.data['detail'].lower())
        self.assertEqual(Diary.objects.count(), 0)

    def test_one_patient_cannot_see_or_overwrite_another_s_entry(self):
        other = self.create_patient('ktos.inny@example.com')
        theirs = Diary.objects.create(id_medical=other.id_medical, notes='Nie twoje.')

        self.put({'notes': 'Moje.'})

        theirs.refresh_from_db()
        self.assertEqual(theirs.notes, 'Nie twoje.')
        self.assertEqual(Diary.objects.filter(id_medical=other.id_medical).count(), 1)
        self.assertEqual(self.get()['notes'], 'Moje.')


class WriteTests(DiaryEntryTestCase):
    def test_an_empty_form_is_still_a_valid_entry(self):
        """Both questions on the first screen are optional, so {} is a real answer."""
        self.put({})

        self.assertEqual(Diary.objects.filter(id_medical=self.patient.id_medical).count(), 1)

    def test_every_answer_lands_in_its_own_column(self):
        self.put({
            'mood': 'good',
            'emotions': [{'emotion': 'Lęk', 'intensity': 7}],
            'energy_level': 5,
            'tension_level': 3,
            'situation_place': 'Praca',
            'situation': 'Rozmowa z przełożonym.',
            'emotion_note': 'Ścisk w żołądku.',
            'thought': 'Znowu coś zepsułem.',
            'how_situation_handled': 'Wyszedłem na spacer.',
            'notes': 'Do omówienia na terapii.',
            'risky_behavior_note': 'Wieczorem alkohol.',
        })

        diary = Diary.objects.get(id_medical=self.patient.id_medical)
        self.assertEqual(diary.current_mood, MOOD_LABELS['good'])
        self.assertEqual(diary.energy_level, 5)
        self.assertEqual(diary.tension_level, 3)
        self.assertEqual(diary.situation_place, 'Praca')
        self.assertEqual(diary.situation, 'Rozmowa z przełożonym.')
        self.assertEqual(diary.emotion_note, 'Ścisk w żołądku.')
        self.assertEqual(diary.thought, 'Znowu coś zepsułem.')
        self.assertEqual(diary.how_situation_handled, 'Wyszedłem na spacer.')
        self.assertEqual(diary.notes, 'Do omówienia na terapii.')
        self.assertEqual(diary.risky_behavior_note, 'Wieczorem alkohol.')
        self.assertEqual(diary.mood_scales.get().anxiety_scale, 7)

    def test_stress_is_stored_on_the_diary_row_not_the_scale_table(self):
        """The one emotion of the ten without a `mood_scale` column."""
        self.put({'emotions': [{'emotion': 'Stres', 'intensity': 8}]})

        diary = Diary.objects.get(id_medical=self.patient.id_medical)
        self.assertEqual(diary.stress_level, 8)

    def test_shame_and_calm_use_the_columns_migration_0005_added(self):
        self.put({'emotions': [
            {'emotion': 'Wstyd', 'intensity': 6},
            {'emotion': 'Spokój', 'intensity': 2},
        ]})

        scale = MoodScale.objects.get()
        self.assertEqual(scale.shame_scale, 6)
        self.assertEqual(scale.calm_scale, 2)

    def test_an_unpicked_emotion_is_null_not_zero(self):
        """NULL means "not rated"; 0 means "rated, and it was nothing".

        The dashboard tells them apart -- a NULL is skipped, a 0 competes (and
        loses) -- so writing zeroes for the nine chips nobody touched would put
        ten emotions on every entry.
        """
        self.put({'emotions': [{'emotion': 'Smutek', 'intensity': 0}]})

        scale = MoodScale.objects.get()
        self.assertEqual(scale.sadness_scale, 0)
        self.assertIsNone(scale.anxiety_scale)
        self.assertIsNone(Diary.objects.get().stress_level)

    def test_blank_text_is_stored_as_null(self):
        self.put({'notes': '   ', 'situation': ''})

        diary = Diary.objects.get()
        self.assertIsNone(diary.notes)
        self.assertIsNone(diary.situation)

    def test_the_strongest_emotion_is_derived_from_the_highest_rating(self):
        """The form does not ask it, so the column records the top slider."""
        self.put({'emotions': [
            {'emotion': 'Lęk', 'intensity': 7},
            {'emotion': 'Złość', 'intensity': 9},
            {'emotion': 'Wstyd', 'intensity': 2},
        ]})

        self.assertEqual(Diary.objects.get().current_strongest_emotion, 'Złość')

    def test_stress_can_be_the_strongest_emotion_too(self):
        """It is rated on the diary row rather than in mood_scale, and still competes."""
        self.put({'emotions': [
            {'emotion': 'Smutek', 'intensity': 4},
            {'emotion': 'Stres', 'intensity': 8},
        ]})

        self.assertEqual(Diary.objects.get().current_strongest_emotion, 'Stres')

    def test_a_tie_is_broken_the_same_way_the_chart_would_break_it(self):
        """Otherwise the stored emotion and the one the dashboard infers diverge."""
        self.put({'emotions': [
            {'emotion': 'Smutek', 'intensity': 6},
            {'emotion': 'Lęk', 'intensity': 6},
        ]})

        # RATING_ORDER puts anxiety before sadness, as MOOD_SCALE_EMOTIONS does.
        self.assertEqual(Diary.objects.get().current_strongest_emotion, 'Lęk')

    def test_an_entry_that_rates_nothing_leaves_the_column_null(self):
        self.put({'mood': 'neutral'})

        self.assertIsNone(Diary.objects.get().current_strongest_emotion)

    def test_clearing_every_emotion_clears_the_strongest_too(self):
        self.put({'emotions': [{'emotion': 'Złość', 'intensity': 9}]})
        self.put({'mood': 'good'})

        self.assertIsNone(Diary.objects.get().current_strongest_emotion)


class ReplaceTests(DiaryEntryTestCase):
    def test_saving_twice_edits_the_same_entry_rather_than_adding_one(self):
        self.put({'notes': 'Pierwsza wersja.'})
        self.put({'notes': 'Druga wersja.'})

        self.assertEqual(Diary.objects.count(), 1)
        self.assertEqual(Diary.objects.get().notes, 'Druga wersja.')

    def test_an_answer_left_out_of_the_second_save_is_cleared(self):
        """The form submits its whole state, so a missing field is a retraction."""
        self.put({'notes': 'Coś tam.', 'energy_level': 7,
                  'emotions': [{'emotion': 'Lęk', 'intensity': 5}]})
        self.put({'notes': 'Tylko notatka.'})

        diary = Diary.objects.get()
        self.assertEqual(diary.notes, 'Tylko notatka.')
        self.assertIsNone(diary.energy_level)
        self.assertIsNone(diary.mood_scales.get().anxiety_scale)

    def test_editing_never_leaves_a_second_scale_row_behind(self):
        self.put({'emotions': [{'emotion': 'Lęk', 'intensity': 5}]})
        self.put({'emotions': [{'emotion': 'Smutek', 'intensity': 4}]})

        self.assertEqual(MoodScale.objects.count(), 1)


class HistoryTests(DiaryEntryTestCase):
    def test_yesterday_s_entry_is_not_touched_by_today_s_save(self):
        yesterday = place_on_day(
            Diary.objects.create(id_medical=self.patient.id_medical, notes='Wczoraj.'),
            self.today - datetime.timedelta(days=1),
        )

        self.put({'notes': 'Dziś.'})

        yesterday.refresh_from_db()
        self.assertEqual(yesterday.notes, 'Wczoraj.')
        self.assertEqual(Diary.objects.count(), 2)

    def test_get_does_not_return_an_older_entry(self):
        place_on_day(
            Diary.objects.create(id_medical=self.patient.id_medical, notes='Wczoraj.'),
            self.today - datetime.timedelta(days=1),
        )

        self.assertIsNone(self.get())


class ReadTests(DiaryEntryTestCase):
    def test_no_entry_yet_is_null_rather_than_an_error(self):
        self.assertIsNone(self.get())

    def test_what_was_saved_is_what_comes_back(self):
        payload = {
            'mood': 'very_bad',
            'emotions': [{'emotion': 'Bezradność', 'intensity': 9}],
            'energy_level': 1,
            'tension_level': 10,
            'situation_place': 'Dom',
            'situation': 'Kłótnia.',
            'emotion_note': 'Pustka.',
            'thought': 'Nie dam rady.',
            'how_situation_handled': 'Poszedłem spać.',
            'notes': 'Ciężki dzień.',
            'risky_behavior_note': None,
        }
        self.put(payload)

        entry = self.get()

        self.assertEqual(entry['date'], self.today.isoformat())
        self.assertEqual(entry['mood'], 'very_bad')
        self.assertEqual(entry['emotions'], [{'emotion': 'Bezradność', 'intensity': 9}])
        self.assertEqual(entry['tension_level'], 10)
        self.assertEqual(entry['situation_place'], 'Dom')
        self.assertIsNone(entry['risky_behavior_note'])

    def test_a_mood_word_the_form_never_wrote_reads_back_as_unset(self):
        """`mock_data.sql` seeds 'dobry'/'neutralny', which are not the form's labels."""
        Diary.objects.create(id_medical=self.patient.id_medical, current_mood='dobry')

        self.assertIsNone(self.get()['mood'])


class ValidationTests(DiaryEntryTestCase):
    def test_an_intensity_above_ten_is_refused(self):
        self.put({'emotions': [{'emotion': 'Lęk', 'intensity': 11}]}, expect=400)
        self.assertEqual(Diary.objects.count(), 0)

    def test_an_emotion_outside_the_vocabulary_is_refused(self):
        self.put({'emotions': [{'emotion': 'zmęczenie', 'intensity': 4}]}, expect=400)

    def test_the_same_emotion_twice_is_refused(self):
        response = self.put(
            {'emotions': [
                {'emotion': 'Lęk', 'intensity': 4},
                {'emotion': 'Lęk', 'intensity': 8},
            ]},
            expect=400,
        )
        self.assertIn('emotions', response)

    def test_an_unknown_mood_is_refused(self):
        self.put({'mood': 'wspaniale'}, expect=400)

    def test_a_negative_level_is_refused(self):
        self.put({'energy_level': -1}, expect=400)

    def test_an_absurdly_long_note_is_refused(self):
        self.put({'notes': 'x' * 5000}, expect=400)
