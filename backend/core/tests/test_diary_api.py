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
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import SESSION_USER_KEY
from core.diary import MAX_LONG_TEXT, MOOD_LABELS
from core.emotions import EMOTIONS, MOOD_SCALE_EMOTIONS, STRES
from core.time_of_day import TIMES_OF_DAY
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


class TimeOfDayTests(DiaryEntryTestCase):
    """The "pora dnia" question — the one answer that used to vanish silently.

    `DiaryEntrySerializer` is a plain `serializers.Serializer`, which discards a
    key it does not declare without saying anything. Until the field existed the
    form's `time_of_day` was therefore dropped on the floor: the patient picked
    "Wieczór", was told the entry had been saved, reopened it and found the
    question blank. So these tests are not only about the column existing —
    every one of them is about an answer either being stored or being refused,
    never quietly accepted and thrown away.

    Note what is *not* asserted anywhere here: a Polish word. The four keys are
    what the API stores, and `frontend/src/utils/timeOfDay.ts` is the only place
    'Rano'/'Południe'/'Wieczór'/'Noc' are written.
    """

    def test_the_answer_is_stored_and_comes_back(self):
        saved = self.put({'time_of_day': 'evening'})

        diary = Diary.objects.get(id_medical=self.patient.id_medical)
        self.assertEqual(diary.time_of_day, 'evening')
        self.assertEqual(saved['time_of_day'], 'evening')
        self.assertEqual(self.get()['time_of_day'], 'evening')

    def test_every_bucket_survives_a_save_and_a_read(self):
        for value in TIMES_OF_DAY:
            with self.subTest(time_of_day=value):
                self.assertEqual(self.put({'time_of_day': value})['time_of_day'], value)
                self.assertEqual(self.get()['time_of_day'], value)

    def test_an_unknown_value_is_refused_rather_than_ignored(self):
        """The bug this field was added to fix, stated as a test.

        A 400 naming the field is the only acceptable answer: a 200 that stored
        NULL is exactly the silent loss the form already suffered.
        """
        response = self.put({'time_of_day': 'afternoon'}, expect=400)

        self.assertIn('time_of_day', response)
        self.assertEqual(Diary.objects.count(), 0)

    def test_a_polish_label_is_not_a_value(self):
        """The backend never translates: 'Wieczór' is a label, not a key."""
        self.put({'time_of_day': 'Wieczór'}, expect=400)
        self.assertEqual(Diary.objects.count(), 0)

    def test_a_refused_value_does_not_damage_the_entry_already_saved(self):
        self.put({'time_of_day': 'morning', 'notes': 'Rano.'})

        self.put({'time_of_day': 'popołudnie', 'notes': 'Inaczej.'}, expect=400)

        entry = self.get()
        self.assertEqual(entry['time_of_day'], 'morning')
        self.assertEqual(entry['notes'], 'Rano.')

    def test_no_answer_is_null_rather_than_an_error(self):
        """Optional on the form, so both null and absent are real answers."""
        for payload in ({'time_of_day': None}, {}):
            with self.subTest(payload=payload):
                self.assertIsNone(self.put(payload)['time_of_day'])

                diary = Diary.objects.get(id_medical=self.patient.id_medical)
                self.assertIsNone(diary.time_of_day)
                self.assertIsNone(self.get()['time_of_day'])

    def test_an_answer_left_out_of_the_second_save_is_cleared(self):
        """Same rule as every other field: the form submits its whole state, so
        a missing key is an answer taken back rather than one left alone."""
        self.put({'time_of_day': 'night'})

        self.put({'notes': 'Bez pory dnia.'})

        self.assertIsNone(self.get()['time_of_day'])

    def test_an_entry_written_before_the_column_existed_still_reads(self):
        """NULL is the correct value for those rows, not a gap to backfill —
        nothing in the row says what time of day it describes."""
        Diary.objects.create(id_medical=self.patient.id_medical, notes='Stary wpis.')

        entry = self.get()

        self.assertEqual(entry['notes'], 'Stary wpis.')
        self.assertIsNone(entry['time_of_day'])

    def test_it_travels_next_to_the_rest_of_the_form(self):
        """The field has to survive a full payload, not only one of its own."""
        entry = self.put({
            'mood': 'bad',
            'emotions': [{'emotion': 'Lęk', 'intensity': 6}],
            'energy_level': 2,
            'tension_level': 9,
            'situation_place': 'Szkoła',
            'situation': 'Sprawdzian.',
            'time_of_day': 'noon',
            'emotion_note': 'Ścisk w gardle.',
            'thought': 'Nie zdążę.',
            'how_situation_handled': 'Oddychałem.',
            'notes': 'Trudno.',
            'risky_behavior_note': None,
        })

        self.assertEqual(entry['time_of_day'], 'noon')
        self.assertEqual(entry['situation_place'], 'Szkoła')


def at_time(diary, day, hour):
    """Stamp an entry at a given hour of `day` — created_at is auto_now_add."""
    moment = timezone.make_aware(datetime.datetime.combine(day, datetime.time(hour, 0)))
    Diary.objects.filter(pk=diary.pk).update(created_at=moment, updated_at=moment)
    diary.refresh_from_db()
    return diary


class MockSaveFailed(Exception):
    """Raised by a patched write so a rollback can be observed."""


class AtomicityTests(DiaryEntryTestCase):
    """`save_today_entry` is atomic on medical_db, and the reason is legibility.

    An entry whose `diary` row saved and whose `mood_scale` row did not would
    read back as a day the patient wrote about and rated nothing — a plausible
    day, not an obviously broken one. Nobody would ever notice it was a partial
    write; the dashboard would simply be wrong about that day forever.
    """

    def test_a_failed_scale_write_leaves_no_diary_row_behind(self):
        with patch('core.diary.MoodScale.objects.create', side_effect=MockSaveFailed):
            with self.assertRaises(MockSaveFailed):
                self.client.put(
                    self.url, {'notes': 'Dziś.', 'emotions': [
                        {'emotion': 'Lęk', 'intensity': 5}]}, format='json',
                )

        self.assertFalse(Diary.objects.exists())
        self.assertFalse(MoodScale.objects.exists())

    def test_a_failed_edit_leaves_the_previous_version_intact(self):
        """The rollback has to restore, not just refrain from creating."""
        self.put({'notes': 'Pierwsza wersja.', 'energy_level': 3})

        # An entry that already has a scale row takes the UPDATE branch, so it
        # is `save` rather than `create` that has to fail here.
        with patch.object(MoodScale, 'save', side_effect=MockSaveFailed):
            with self.assertRaises(MockSaveFailed):
                self.client.put(self.url, {'notes': 'Druga wersja.'}, format='json')

        diary = Diary.objects.get()
        self.assertEqual(diary.notes, 'Pierwsza wersja.')
        self.assertEqual(diary.energy_level, 3)

    def test_a_failed_save_does_not_touch_yesterday(self):
        yesterday = place_on_day(
            Diary.objects.create(id_medical=self.patient.id_medical, notes='Wczoraj.'),
            self.today - datetime.timedelta(days=1),
        )

        with patch('core.diary.MoodScale.objects.create', side_effect=MockSaveFailed):
            with self.assertRaises(MockSaveFailed):
                self.client.put(self.url, {'notes': 'Dziś.'}, format='json')

        yesterday.refresh_from_db()
        self.assertEqual(yesterday.notes, 'Wczoraj.')


class SecondRowOnOneDayTests(DiaryEntryTestCase):
    """Nothing in the schema stops two `diary` rows sharing a day.

    `database_setup.sql` has no unique index on (id_medical, day) — the rule is
    enforced by the endpoint being unable to address any day but today, which
    says nothing about rows that arrived another way: the seed script, a manual
    fix, an import. Both the form and the dashboard resolve it by taking the
    newest row, and they have to agree, or the screen and the chart would
    describe different days.
    """

    def two_entries_today(self):
        older = at_time(
            Diary.objects.create(id_medical=self.patient.id_medical, notes='Rano.'),
            self.today, 8,
        )
        newer = at_time(
            Diary.objects.create(id_medical=self.patient.id_medical, notes='Wieczorem.'),
            self.today, 20,
        )
        return older, newer

    def test_reading_today_answers_with_the_newer_row(self):
        _, newer = self.two_entries_today()

        self.assertEqual(self.get()['id'], str(newer.id_diary))

    def test_saving_edits_the_newer_row_rather_than_adding_a_third(self):
        older, newer = self.two_entries_today()

        self.put({'notes': 'Poprawione.'})

        self.assertEqual(Diary.objects.count(), 2)
        newer.refresh_from_db()
        older.refresh_from_db()
        self.assertEqual(newer.notes, 'Poprawione.')
        self.assertEqual(older.notes, 'Rano.')

    def test_an_entry_at_one_minute_past_midnight_still_counts_as_today(self):
        """The day boundary is Europe/Warsaw, not UTC — under UTC this row would
        belong to yesterday and the form would offer a blank page over the top
        of an entry the patient had already written."""
        entry = at_time(
            Diary.objects.create(id_medical=self.patient.id_medical, notes='Tuż po północy.'),
            self.today, 0,
        )

        self.assertEqual(self.get()['id'], str(entry.id_diary))


class ExistingScaleRowsTests(DiaryEntryTestCase):
    """A `mood_scale` pair that arrived without going through the form."""

    def test_a_save_collapses_a_pre_existing_pair_into_one(self):
        diary = Diary.objects.create(id_medical=self.patient.id_medical)
        MoodScale.objects.create(diary=diary, anxiety_scale=1)
        MoodScale.objects.create(diary=diary, anxiety_scale=9)

        self.put({'emotions': [{'emotion': 'Lęk', 'intensity': 4}]})

        self.assertEqual(MoodScale.objects.count(), 1)
        self.assertEqual(MoodScale.objects.get().anxiety_scale, 4)

    def test_reading_a_pair_answers_with_one_set_of_ratings_not_two(self):
        """Whichever row wins, an emotion must not appear twice — the form binds
        chips by name and a duplicate would render on top of itself."""
        diary = Diary.objects.create(id_medical=self.patient.id_medical)
        MoodScale.objects.create(diary=diary, anxiety_scale=1)
        MoodScale.objects.create(diary=diary, sadness_scale=9)

        emotions = [rating['emotion'] for rating in self.get()['emotions']]

        self.assertEqual(len(emotions), len(set(emotions)))

    def test_a_scale_row_with_no_ratings_reads_as_no_emotions(self):
        diary = Diary.objects.create(id_medical=self.patient.id_medical)
        MoodScale.objects.create(diary=diary)

        self.assertEqual(self.get()['emotions'], [])


class ValuesAlreadyInTheDatabaseTests(DiaryEntryTestCase):
    """The API validates what comes in; the schema does not.

    `database_setup.sql` declares these columns as plain INTEGER with no CHECK,
    so a value outside 0-10 is legal as far as Postgres is concerned and the
    seed script or a manual fix can put one there. These tests document that
    reads pass such a value through untouched rather than clamping or failing —
    if that is not what we want, the fix is a CHECK constraint in the schema,
    not a silent correction on the way out.
    """

    def test_an_out_of_range_level_is_returned_as_stored(self):
        Diary.objects.create(id_medical=self.patient.id_medical, stress_level=99)

        [rating] = [r for r in self.get()['emotions'] if r['emotion'] == STRES]
        self.assertEqual(rating['intensity'], 99)

    def test_a_negative_level_is_returned_as_stored(self):
        Diary.objects.create(id_medical=self.patient.id_medical, energy_level=-4)

        self.assertEqual(self.get()['energy_level'], -4)

    def test_the_same_value_would_be_refused_on_the_way_in(self):
        """Which is the asymmetry worth being deliberate about."""
        self.put({'energy_level': 99}, expect=400)

    def test_text_longer_than_the_api_allows_is_still_readable(self):
        long_note = 'x' * (MAX_LONG_TEXT + 500)
        Diary.objects.create(id_medical=self.patient.id_medical, notes=long_note)

        self.assertEqual(self.get()['notes'], long_note)


class EveryEmotionRoundTripTests(DiaryEntryTestCase):
    """The whole vocabulary, at both ends of the scale, through the API.

    Ten emotions and eleven intensities is a small enough space to cover
    exhaustively, and the mapping is not uniform: nine emotions live in their
    own column on `mood_scale` and 'Stres' lives on the `diary` row, so a
    mistake in SCALE_COLUMNS would show up on exactly one of them.
    """

    def test_every_emotion_survives_a_save_and_a_read(self):
        for emotion in EMOTIONS:
            for intensity in (0, 5, 10):
                with self.subTest(emotion=emotion, intensity=intensity):
                    saved = self.put({'emotions': [
                        {'emotion': emotion, 'intensity': intensity}]})
                    self.assertEqual(
                        saved['emotions'], [{'emotion': emotion, 'intensity': intensity}],
                    )
                    self.assertEqual(self.get()['emotions'], saved['emotions'])

    def test_all_ten_at_once_come_back_as_ten(self):
        payload = [
            {'emotion': emotion, 'intensity': index}
            for index, emotion in enumerate(EMOTIONS)
        ]

        saved = self.put({'emotions': payload})

        self.assertEqual(
            sorted(saved['emotions'], key=lambda r: r['emotion']),
            sorted(payload, key=lambda r: r['emotion']),
        )

    def test_each_scale_emotion_lands_in_its_own_column_and_no_other(self):
        for column, emotion in MOOD_SCALE_EMOTIONS:
            with self.subTest(emotion=emotion):
                self.put({'emotions': [{'emotion': emotion, 'intensity': 7}]})

                scale = MoodScale.objects.get()
                filled = {name for name, _ in MOOD_SCALE_EMOTIONS
                          if getattr(scale, name) is not None}
                self.assertEqual(filled, {column})

    def test_stress_never_lands_in_the_scale_table(self):
        self.put({'emotions': [{'emotion': STRES, 'intensity': 6}]})

        scale = MoodScale.objects.get()
        self.assertEqual(Diary.objects.get().stress_level, 6)
        self.assertTrue(all(getattr(scale, name) is None
                            for name, _ in MOOD_SCALE_EMOTIONS))

    def test_every_mood_label_survives_a_save_and_a_read(self):
        for value in sorted(MOOD_LABELS):
            with self.subTest(mood=value):
                self.assertEqual(self.put({'mood': value})['mood'], value)
                self.assertEqual(self.get()['mood'], value)


class WriteCsrfTests(DiaryEntryTestCase):
    """The one diary URL that changes data has to prove it was not forged.

    Authenticated requests are checked inside SessionUserAuthentication rather
    than by a decorator, so the protection is inherited rather than declared —
    and CsrfTests in test_auth_api.py only ever proved it for logout. A diary
    entry is health data being written; it deserves its own assertion.
    """

    def setUp(self):
        super().setUp()
        self.client = APIClient(enforce_csrf_checks=True)
        self.sign_in(self.patient.user)

    def test_a_write_without_a_token_is_refused(self):
        response = self.client.put(self.url, {'notes': 'Cudza strona.'}, format='json')

        self.assertEqual(response.status_code, 403)
        self.assertFalse(Diary.objects.exists())

    def test_a_write_with_a_token_goes_through(self):
        token = self.client.get(reverse('core:csrf')).data['csrf_token']

        response = self.client.put(
            self.url, {'notes': 'Mój formularz.'}, format='json', HTTP_X_CSRFTOKEN=token,
        )

        self.assertEqual(response.status_code, 200, response.data)

    def test_reading_needs_no_token(self):
        """GET is safe and the archive screens would break behind a token."""
        self.assertEqual(self.client.get(self.url).status_code, 200)
