"""Tests for /api/account/ — the profile screen's own two endpoints.

`profile/` is the one endpoint in the project that reads both databases: the
counters come from medical_db through `id_medical`, the care relationship from
user_db through `patient.specjalist`. Most of what is worth pinning here is that
the two halves say the same thing as the screens they summarise, and that an
account with no clinical half is refused rather than handed zeroes.

`password/` touches user_db only.
"""

import datetime

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import SESSION_USER_KEY
from core.models import Diary, Patient, Specjalist, User, UserRole
from core.serializers import PasswordChangeSerializer

PASSWORD = 'TajneHaslo123'


class AccountTestCase(TestCase):
    databases = {'default', 'medical'}

    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()
        # DatabaseCache is shared by the whole test database, so a throttle
        # counter left by one test would answer 429 in the next one.
        cache.clear()

    def make_user(self, email, role='patient', **fields):
        return User.objects.create(
            user_role=UserRole.objects.get_or_create(name=role)[0] if role else None,
            email=email, password_hash=make_password(PASSWORD), **fields,
        )

    def make_patient(self, email='pacjent@example.com', **fields):
        return Patient.objects.create(
            user=self.make_user(email), is_child=False, **fields,
        )

    def make_specjalist(self, email='terapeutka@example.com', **fields):
        user = self.make_user(email, role='specjalista', **fields)
        return Specjalist.objects.create(user=user, specjalization='CBT / DBT')

    def sign_in(self, user):
        session = self.client.session
        session[SESSION_USER_KEY] = str(user.pk)
        session.save()
        self.client.cookies[settings.SESSION_COOKIE_NAME] = session.session_key

    def entry(self, patient, days_ago=0):
        """One diary entry, placed on a past day.

        `created_at` is auto_now_add, so an UPDATE is the only way to backdate
        one — the same helper the dashboard tests use, for the same reason.
        """
        diary = Diary.objects.create(id_medical=patient.id_medical)
        day = self.today - datetime.timedelta(days=days_ago)
        noon = timezone.make_aware(datetime.datetime.combine(day, datetime.time(12, 0)))
        Diary.objects.filter(pk=diary.pk).update(created_at=noon)
        return diary

    def get_profile(self, patient=None):
        self.sign_in((patient or self.patient).user)
        response = self.client.get(reverse('core:account-profile'))
        self.assertEqual(response.status_code, 200)
        return response.data


class ProfileAccessTests(AccountTestCase):
    """Who may ask. The session is the only identity input — there is no id."""

    def test_a_visitor_is_refused(self):
        response = self.client.get(reverse('core:account-profile'))

        self.assertIn(response.status_code, (401, 403))

    def test_a_guardian_is_refused_rather_than_told_they_wrote_nothing(self):
        """A guardian has no `patient` row, so '0 wpisów, brak terapeuty' would
        be a clinical record of somebody who is not a clinical subject."""
        self.sign_in(self.make_user('rodzic@example.com', role='rodzic'))

        response = self.client.get(reverse('core:account-profile'))

        self.assertEqual(response.status_code, 403)
        self.assertEqual(set(response.data), {'detail'})

    def test_the_counters_belong_to_the_session_and_not_to_another_patient(self):
        self.patient = self.make_patient()
        other = self.make_patient('ktos.inny@example.com')
        for days_ago in range(4):
            self.entry(other, days_ago)
        self.entry(self.patient)

        self.assertEqual(self.get_profile()['activity']['entry_count'], 1)

    def test_no_write_verb_exists(self):
        self.patient = self.make_patient()
        self.sign_in(self.patient.user)
        url = reverse('core:account-profile')

        for method in ('post', 'put', 'patch', 'delete'):
            with self.subTest(method=method):
                response = getattr(self.client, method)(url, {}, format='json')
                self.assertEqual(response.status_code, 405)


class ActivityTests(AccountTestCase):
    """The two counters that used to be hardcoded to the mockup's 8 and 6."""

    def setUp(self):
        super().setUp()
        self.patient = self.make_patient()

    def test_a_new_account_is_zero_and_zero_rather_than_an_error(self):
        self.assertEqual(
            self.get_profile()['activity'], {'entry_count': 0, 'streak_days': 0},
        )

    def test_every_entry_is_counted_all_time(self):
        for days_ago in (0, 1, 40, 300):
            self.entry(self.patient, days_ago)

        self.assertEqual(self.get_profile()['activity']['entry_count'], 4)

    def test_the_count_matches_what_the_archive_lists(self):
        """The counter is a summary of a screen the patient can open, so the two
        must not disagree — which is why both go through core/diary.py."""
        for days_ago in range(5):
            self.entry(self.patient, days_ago)
        self.sign_in(self.patient.user)

        archive = self.client.get(reverse('core:diary-history'))
        profile = self.client.get(reverse('core:account-profile'))

        self.assertEqual(profile.data['activity']['entry_count'], len(archive.data))

    def test_the_streak_matches_the_home_screen(self):
        """Same argument, and the reason `dashboard.streak_days` is public."""
        for days_ago in range(3):
            self.entry(self.patient, days_ago)
        self.sign_in(self.patient.user)

        home = self.client.get(reverse('core:home-dashboard'))
        profile = self.client.get(reverse('core:account-profile'))

        self.assertEqual(profile.data['activity']['streak_days'], home.data['streak_days'])
        self.assertEqual(profile.data['activity']['streak_days'], 3)

    def test_a_streak_ending_yesterday_still_counts(self):
        """Today's entry is not written yet — the run is not broken, and saying
        it is would be the app telling somebody they lost something they have."""
        for days_ago in (1, 2, 3):
            self.entry(self.patient, days_ago)

        self.assertEqual(self.get_profile()['activity']['streak_days'], 3)

    def test_a_gap_ends_the_streak_but_not_the_count(self):
        for days_ago in (0, 1, 3, 4):
            self.entry(self.patient, days_ago)

        activity = self.get_profile()['activity']

        self.assertEqual(activity['streak_days'], 2)
        self.assertEqual(activity['entry_count'], 4)


class CareTests(AccountTestCase):
    """The "OPIEKA" card — `patient.specjalist`, which is nullable."""

    def test_an_unassigned_patient_gets_null_rather_than_a_row_of_blanks(self):
        """Registering before the first appointment is the ordinary case, and
        the screen has to be able to say so in words."""
        self.patient = self.make_patient()

        self.assertIsNone(self.get_profile()['care'])

    def test_the_specialist_is_named_from_their_own_user_row(self):
        specjalist = self.make_specjalist(name='Marta', surname='Zielińska')
        self.patient = self.make_patient(specjalist=specjalist)

        self.assertEqual(
            self.get_profile()['care'],
            {'specialist': 'Marta Zielińska', 'approach': 'CBT / DBT', 'phone': None},
        )

    def test_a_specialist_with_no_name_falls_back_to_the_address(self):
        """A broken record, not a missing relationship: the care exists, so the
        card should name whoever it can rather than render an empty line."""
        specjalist = self.make_specjalist('bezimienna@example.com')
        self.patient = self.make_patient(specjalist=specjalist)

        self.assertEqual(self.get_profile()['care']['specialist'], 'bezimienna@example.com')

    def test_a_specialist_with_no_specjalization_still_has_care(self):
        specjalist = self.make_specjalist(name='Marta', surname='Zielińska')
        Specjalist.objects.filter(pk=specjalist.pk).update(specjalization=None)
        self.patient = self.make_patient(specjalist=specjalist)

        care = self.get_profile()['care']

        self.assertEqual(care['specialist'], 'Marta Zielińska')
        self.assertIsNone(care['approach'])

    def test_the_phone_is_always_null_because_no_column_holds_one(self):
        """Pinned rather than left implicit: the safety plan renders a `tel:`
        link off this key, and the day a column appears this test is what says
        the mapping has to be revisited."""
        specjalist = self.make_specjalist(name='Marta', surname='Zielińska')
        self.patient = self.make_patient(specjalist=specjalist)

        self.assertIsNone(self.get_profile()['care']['phone'])

    def test_nothing_identifying_about_the_specialist_leaks_beyond_the_name(self):
        specjalist = self.make_specjalist(name='Marta', surname='Zielińska')
        self.patient = self.make_patient(specjalist=specjalist)

        self.assertEqual(set(self.get_profile()['care']), {'specialist', 'approach', 'phone'})


class ConsentDatesTests(AccountTestCase):
    """The consent register the profile reads back — on /api/auth/me/.

    Deliberately there and not on the profile endpoint: they are columns on
    `user`, every account has them, and two endpoints answering for one row is
    two endpoints that can disagree.
    """

    def me(self, user):
        self.sign_in(user)
        response = self.client.get(reverse('core:me'))
        self.assertEqual(response.status_code, 200)
        return response.data

    def test_registration_writes_both_and_me_reports_them(self):
        UserRole.objects.get_or_create(name='patient')
        before = timezone.now()
        response = self.client.post(
            reverse('core:register'),
            {
                'email': 'nowa@example.com',
                'password': 'MocneHaslo987',
                'password_confirm': 'MocneHaslo987',
                'name': 'Nowa',
                'surname': 'Osoba',
                'date_of_birth': '1990-04-17',
                'account_type': 'patient',
                'data_consent': True,
                'services_consent': True,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        for field in ('data_consent_at', 'services_consent_at'):
            with self.subTest(field=field):
                self.assertIsNotNone(response.data[field])
                self.assertGreaterEqual(
                    datetime.datetime.fromisoformat(response.data[field]), before,
                )

    def test_an_account_that_never_granted_one_reports_null(self):
        """Not everything in this table came through the form — mock_data.sql
        seeds rows with neither column set, and 'Nieudzielona' has to be a state
        the screen can render rather than one it has to infer."""
        user = self.make_user('stara@example.com')

        payload = self.me(user)

        self.assertIsNone(payload['data_consent_at'])
        self.assertIsNone(payload['services_consent_at'])

    def test_the_two_consents_are_reported_separately(self):
        """They were collected separately and are withdrawable separately (art.
        7(3)), so one timestamp for both would be the wrong shape."""
        moment = timezone.now()
        user = self.make_user('polowiczna@example.com', data_consent_at=moment)

        payload = self.me(user)

        self.assertIsNotNone(payload['data_consent_at'])
        self.assertIsNone(payload['services_consent_at'])

    def test_is_patient_tells_a_null_is_child_patient_from_a_guardian(self):
        """The two look identical through `is_child` alone, and must not.

        `patient.is_child` is nullable and mock_data.sql predates it being set,
        so a real patient row can answer None to the minor question — while a
        guardian has no row at all and answers None because there is nothing to
        ask. `_require_patient` serves the first and refuses the second, so the
        frontend needs the same distinction or it hides a patient's own counters
        from them. `hasPatientProfile` in src/api/auth.ts reads this field.
        """
        patient = self.make_patient('bez-odpowiedzi@example.com')
        Patient.objects.filter(pk=patient.pk).update(is_child=None)
        guardian = self.make_user('rodzic2@example.com', role='rodzic')

        unanswered = self.me(patient.user)
        self.client = APIClient()
        absent = self.me(guardian)

        self.assertIsNone(unanswered['is_child'])
        self.assertIsNone(absent['is_child'])
        self.assertTrue(unanswered['is_patient'])
        self.assertFalse(absent['is_patient'])

    def test_the_null_is_child_patient_is_actually_served(self):
        """The other half of the pair above: `is_patient` would be a lie if the
        endpoint refused them anyway."""
        patient = self.make_patient('bez-odpowiedzi2@example.com')
        Patient.objects.filter(pk=patient.pk).update(is_child=None)
        self.sign_in(patient.user)

        self.assertEqual(
            self.client.get(reverse('core:account-profile')).status_code, 200,
        )

    def test_a_guardian_gets_the_dates_too(self):
        """The consent register is not clinical data — every account has one,
        and a guardian must be able to see and withdraw their own."""
        moment = timezone.now()
        user = self.make_user(
            'rodzic@example.com', role='rodzic',
            data_consent_at=moment, services_consent_at=moment,
        )

        payload = self.me(user)

        self.assertIsNotNone(payload['data_consent_at'])
        self.assertIsNotNone(payload['services_consent_at'])


class PasswordChangeTests(AccountTestCase):
    """POST /api/account/password/."""

    def setUp(self):
        super().setUp()
        self.patient = self.make_patient()
        self.url = reverse('core:account-password')

    def change(self, **overrides):
        body = {
            'current_password': PASSWORD,
            'new_password': 'ZupelnieInne987',
            'new_password_confirm': 'ZupelnieInne987',
        } | overrides
        return self.client.post(self.url, body, format='json')

    def stored_hash(self):
        return User.objects.get(pk=self.patient.user.pk).password_hash

    def test_a_visitor_cannot_reach_it(self):
        self.assertIn(self.change().status_code, (401, 403))

    def test_the_new_password_is_stored_hashed_and_the_old_one_stops_working(self):
        self.sign_in(self.patient.user)

        response = self.change()

        self.assertEqual(response.status_code, 204)
        stored = self.stored_hash()
        self.assertNotIn('ZupelnieInne987', stored)
        self.assertTrue(check_password('ZupelnieInne987', stored))
        self.assertFalse(check_password(PASSWORD, stored))

    def test_the_answer_carries_no_body_at_all(self):
        """Nothing to send back, and one less place a password could be echoed."""
        self.sign_in(self.patient.user)

        response = self.change()

        self.assertEqual(response.status_code, 204)
        self.assertFalse(response.content)

    def test_a_wrong_current_password_changes_nothing(self):
        self.sign_in(self.patient.user)
        before = self.stored_hash()

        response = self.change(current_password='NieToHaslo123')

        self.assertEqual(response.status_code, 400)
        self.assertIn('current_password', response.data)
        self.assertEqual(self.stored_hash(), before)

    def test_the_wrong_current_password_is_named_plainly(self):
        """Unlike login, saying which half is wrong leaks nothing here: the
        caller is already signed in as this account."""
        self.sign_in(self.patient.user)

        response = self.change(current_password='NieToHaslo123')

        self.assertEqual(
            str(response.data['current_password'][0]),
            PasswordChangeSerializer.WRONG_CURRENT_PASSWORD,
        )

    def test_a_short_current_password_is_not_refused_for_being_short(self):
        """Rows seeded before the 8-character rule hold shorter passwords.
        Validating this field for strength would put 'min. 8 znaków' under
        *Obecne hasło* and leave those accounts unable to submit the form —
        the one dead end a password-change screen must not have.
        """
        User.objects.filter(pk=self.patient.user.pk).update(
            password_hash=make_password('krotkie'),
        )
        self.patient.user.refresh_from_db()
        self.sign_in(self.patient.user)

        response = self.change(current_password='krotkie')

        self.assertEqual(response.status_code, 204)

    def test_a_mismatched_repeat_is_refused(self):
        self.sign_in(self.patient.user)

        response = self.change(new_password_confirm='CosInnego987')

        self.assertEqual(response.status_code, 400)
        self.assertIn('new_password_confirm', response.data)

    def test_reusing_the_current_password_is_a_request_level_error(self):
        """Blaming either input would be arbitrary, so it travels as `detail` —
        which is what the form renders above the fields."""
        self.sign_in(self.patient.user)

        response = self.change(new_password=PASSWORD, new_password_confirm=PASSWORD)

        self.assertEqual(response.status_code, 400)
        # A list, like every other message DRF normalizes — `firstMessage` in
        # src/api/client.ts unwraps it, the same as it does for login's `detail`.
        self.assertEqual(
            str(response.data['detail'][0]), PasswordChangeSerializer.SAME_AS_CURRENT,
        )
        self.assertNotIn('new_password', response.data)

    def test_the_new_password_goes_through_djangos_validators(self):
        self.sign_in(self.patient.user)

        response = self.change(new_password='haslo', new_password_confirm='haslo')

        self.assertEqual(response.status_code, 400)
        self.assertIn('new_password', response.data)

    def test_the_new_password_cannot_be_the_accounts_own_e_mail(self):
        """The validator that was listed and dead until the user was passed in —
        and the reason this endpoint reaches for `check_password_strength`
        rather than calling `validate_password` on its own."""
        self.sign_in(self.patient.user)
        address = self.patient.user.email

        response = self.change(new_password=address, new_password_confirm=address)

        self.assertEqual(response.status_code, 400)
        self.assertIn('new_password', response.data)

    def test_the_session_survives_the_change(self):
        """Ours carry `core_user_id` and no password hash, so nothing goes stale
        — and signing the person out of the device they are holding would be a
        strange answer to 'I just set a new password'."""
        self.sign_in(self.patient.user)

        self.assertEqual(self.change().status_code, 204)
        self.assertEqual(self.client.get(reverse('core:me')).status_code, 200)

    def test_a_guardian_can_change_their_password(self):
        """Not gated by `_require_patient`: everyone has a password, including
        the accounts that are not clinical subjects."""
        self.sign_in(self.make_user('rodzic@example.com', role='rodzic'))

        self.assertEqual(self.change().status_code, 204)

    def test_only_post_is_accepted(self):
        self.sign_in(self.patient.user)

        for method in ('get', 'put', 'patch', 'delete'):
            with self.subTest(method=method):
                response = getattr(self.client, method)(self.url, {}, format='json')
                self.assertEqual(response.status_code, 405)

    def test_guessing_the_current_password_is_capped(self):
        """The endpoint verifies a password, so it is a second oracle for one —
        reachable from a session left open on a borrowed phone. The login cap
        counts nothing here: no address is submitted."""
        self.sign_in(self.patient.user)

        refused = 0
        for _ in range(12):
            if self.change(current_password='NieToHaslo123').status_code == 429:
                refused += 1

        self.assertGreater(refused, 0)
        self.assertTrue(check_password(PASSWORD, self.stored_hash()))
