"""Tests for the /api/auth/ endpoints.

Only `default` is touched: registration writes to user_db and the session table
lives there too. Nothing here reaches medical_db — a new patient's `id_medical`
is generated locally and only referenced from the other database later.
"""

import datetime
import unittest
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import IntegrityError
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import SESSION_USER_KEY
from core.models import Patient, User, UserRole

VALID_PASSWORD = 'TajneHaslo123'

REGISTRATION = {
    'email': 'jan.testowy@example.com',
    'password': VALID_PASSWORD,
    'password_confirm': VALID_PASSWORD,
    'name': 'Jan',
    'surname': 'Testowy',
    'date_of_birth': '1990-04-17',
    'account_type': 'patient',
    'data_consent': True,
    'services_consent': True,
}


def create_user(email='anna@example.com', password=VALID_PASSWORD, role='patient'):
    user_role = UserRole.objects.get_or_create(name=role)[0] if role else None
    return User.objects.create(
        user_role=user_role, email=email, password_hash=make_password(password),
    )


class AuthTestCase(TestCase):
    """Shared setup: the throttle counts in the real cache, which outlives a test."""

    databases = {'default'}

    def setUp(self):
        cache.clear()
        self.client = APIClient()


class RegisterTests(AuthTestCase):
    def test_registration_creates_a_patient_and_logs_them_in(self):
        UserRole.objects.create(name='patient')

        response = self.client.post(reverse('core:register'), REGISTRATION, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['email'], 'jan.testowy@example.com')
        self.assertEqual(response.data['role'], 'patient')
        # The password must never travel back out, hashed or not.
        self.assertNotIn('password', response.data)
        self.assertNotIn('password_hash', response.data)

        user = User.objects.get(email='jan.testowy@example.com')
        self.assertEqual(self.client.session[SESSION_USER_KEY], str(user.pk))
        # A patient row is what gives the user an id_medical to file diary
        # entries against; without it registration would be a dead end.
        self.assertTrue(Patient.objects.filter(user=user).exists())

    def test_password_is_stored_only_as_a_hash(self):
        self.client.post(reverse('core:register'), REGISTRATION, format='json')

        user = User.objects.get(email='jan.testowy@example.com')
        self.assertNotEqual(user.password_hash, VALID_PASSWORD)
        self.assertTrue(check_password(VALID_PASSWORD, user.password_hash))

    def test_consents_are_recorded_as_timestamps(self):
        self.client.post(reverse('core:register'), REGISTRATION, format='json')

        user = User.objects.get(email='jan.testowy@example.com')
        self.assertIsNotNone(user.data_consent_at)
        self.assertIsNotNone(user.services_consent_at)

    def test_registration_without_consents_is_rejected(self):
        payload = REGISTRATION | {'data_consent': False, 'services_consent': False}

        response = self.client.post(reverse('core:register'), payload, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('data_consent', response.data)
        self.assertIn('services_consent', response.data)
        self.assertFalse(User.objects.exists())

    def test_mismatched_password_confirmation_is_rejected(self):
        payload = REGISTRATION | {'password_confirm': 'CosInnego123'}

        response = self.client.post(reverse('core:register'), payload, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('password_confirm', response.data)

    def test_password_must_survive_djangos_validators(self):
        """The frontend only checks length; the backend is the real gate."""
        payload = REGISTRATION | {'password': '12345678', 'password_confirm': '12345678'}

        response = self.client.post(reverse('core:register'), payload, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('password', response.data)

    def test_email_is_normalised_and_unique_case_insensitively(self):
        create_user(email='zajete@example.com')
        payload = REGISTRATION | {'email': 'Zajete@Example.COM'}

        response = self.client.post(reverse('core:register'), payload, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.data)

    def test_email_is_lowercased_on_the_way_in(self):
        self.client.post(
            reverse('core:register'), REGISTRATION | {'email': 'MiXeD@Example.com'},
            format='json',
        )

        self.assertTrue(User.objects.filter(email='mixed@example.com').exists())

    def test_registration_survives_a_missing_patient_role_row(self):
        """user_role is seeded by SQL, not by migrations, so it can be absent."""
        response = self.client.post(reverse('core:register'), REGISTRATION, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.data['role'])


class AccountTypeTests(AuthTestCase):
    """The form's three account types, as they land in the schema."""

    def setUp(self):
        super().setUp()
        for name in ('patient', 'rodzic'):
            UserRole.objects.get_or_create(name=name)

    def _register(self, account_type):
        return self.client.post(
            reverse('core:register'),
            REGISTRATION | {'account_type': account_type}, format='json',
        )

    def test_adult_patient_gets_a_patient_row_marked_not_a_child(self):
        response = self._register('patient')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['role'], 'patient')
        self.assertIs(response.data['is_child'], False)
        patient = Patient.objects.get(user__email=REGISTRATION['email'])
        self.assertIs(patient.is_child, False)

    def test_minor_patient_gets_a_patient_row_marked_a_child(self):
        # A minor's date of birth, or the age check would reject the pairing —
        # which is what AgeAgainstAccountTypeTests covers.
        response = self.client.post(
            reverse('core:register'),
            REGISTRATION | {'account_type': 'minor_patient', 'date_of_birth': '2012-06-01'},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['role'], 'patient')
        self.assertIs(response.data['is_child'], True)
        self.assertIs(Patient.objects.get(user__email=REGISTRATION['email']).is_child, True)

    def test_guardian_gets_the_rodzic_role_and_no_patient_row(self):
        """A guardian is not a clinical subject, so they get no id_medical."""
        response = self._register('parent')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['role'], 'rodzic')
        self.assertIsNone(response.data['is_child'])
        self.assertFalse(Patient.objects.filter(user__email=REGISTRATION['email']).exists())

    def test_an_unknown_account_type_is_rejected(self):
        response = self._register('specjalista')

        self.assertEqual(response.status_code, 400)
        self.assertIn('account_type', response.data)
        self.assertFalse(User.objects.exists())

    def test_account_type_is_required(self):
        payload = {k: v for k, v in REGISTRATION.items() if k != 'account_type'}

        response = self.client.post(reverse('core:register'), payload, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('account_type', response.data)


class AgeAgainstAccountTypeTests(AuthTestCase):
    """The declared account type has to agree with the date of birth."""

    def setUp(self):
        super().setUp()
        for name in ('patient', 'rodzic'):
            UserRole.objects.get_or_create(name=name)
        self.today = timezone.localdate()

    def _register(self, account_type, date_of_birth):
        return self.client.post(
            reverse('core:register'),
            REGISTRATION | {
                'account_type': account_type,
                'date_of_birth': date_of_birth.isoformat(),
            },
            format='json',
        )

    def _birthday_years_ago(self, years, days_offset=0):
        """A date of birth whose 18th birthday lands exactly where we want it."""
        try:
            born = self.today.replace(year=self.today.year - years)
        except ValueError:  # 29 February in a non-leap target year
            born = self.today.replace(year=self.today.year - years, day=28)
        return born + datetime.timedelta(days=days_offset)

    def test_adult_account_with_a_minors_date_is_rejected(self):
        response = self._register('patient', self._birthday_years_ago(15))

        self.assertEqual(response.status_code, 400)
        self.assertIn('niepełnoletnią', str(response.data))
        self.assertFalse(User.objects.exists())

    def test_minor_account_with_an_adults_date_is_rejected(self):
        """The mirror case: is_child=True must not be recorded for an adult."""
        response = self._register('minor_patient', self._birthday_years_ago(40))

        self.assertEqual(response.status_code, 400)
        self.assertIn('pełnoletnią', str(response.data))
        self.assertFalse(User.objects.exists())

    def test_the_conflict_is_reported_as_a_non_field_error(self):
        """It belongs to the pair, so the frontend shows it above the form."""
        response = self._register('patient', self._birthday_years_ago(15))

        self.assertIn('non_field_errors', response.data)

    def test_turning_eighteen_today_counts_as_an_adult(self):
        response = self._register('patient', self._birthday_years_ago(18))

        self.assertEqual(response.status_code, 201)

    def test_one_day_short_of_eighteen_is_still_a_minor(self):
        """Born 18 years ago tomorrow — the birthday has not happened yet."""
        response = self._register('patient', self._birthday_years_ago(18, days_offset=1))

        self.assertEqual(response.status_code, 400)

    def test_a_minor_can_register_a_minor_account(self):
        response = self._register('minor_patient', self._birthday_years_ago(15))

        self.assertEqual(response.status_code, 201)
        self.assertIs(Patient.objects.get(user__email=REGISTRATION['email']).is_child, True)

    def test_a_guardian_is_not_age_checked(self):
        """Deliberately unenforced — see the note in the summary."""
        response = self._register('parent', self._birthday_years_ago(15))

        self.assertEqual(response.status_code, 201)


class DateOfBirthTests(AuthTestCase):
    def test_the_date_is_stored_and_returned(self):
        response = self.client.post(reverse('core:register'), REGISTRATION, format='json')

        self.assertEqual(response.data['date_of_birth'], '1990-04-17')
        user = User.objects.get(email=REGISTRATION['email'])
        self.assertEqual(user.date_of_birth, datetime.date(1990, 4, 17))

    def test_date_of_birth_is_required(self):
        payload = {k: v for k, v in REGISTRATION.items() if k != 'date_of_birth'}

        response = self.client.post(reverse('core:register'), payload, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('date_of_birth', response.data)

    def test_a_future_date_is_rejected(self):
        tomorrow = timezone.localdate() + datetime.timedelta(days=1)
        payload = REGISTRATION | {'date_of_birth': tomorrow.isoformat()}

        response = self.client.post(reverse('core:register'), payload, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('date_of_birth', response.data)

    def test_someone_born_today_is_accepted(self):
        """The future check must not swallow the boundary.

        Registered as a minor, since a newborn plainly cannot hold an adult
        patient account — that pairing is the age check's job, not this one's.
        """
        payload = REGISTRATION | {
            'date_of_birth': timezone.localdate().isoformat(),
            'account_type': 'minor_patient',
        }

        response = self.client.post(reverse('core:register'), payload, format='json')

        self.assertEqual(response.status_code, 201)

    def test_an_implausibly_early_date_is_rejected(self):
        payload = REGISTRATION | {'date_of_birth': '0202-05-14'}

        response = self.client.post(reverse('core:register'), payload, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('date_of_birth', response.data)

    def test_a_malformed_date_is_rejected(self):
        payload = REGISTRATION | {'date_of_birth': '17-04-1990'}

        response = self.client.post(reverse('core:register'), payload, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('date_of_birth', response.data)


class LoginTests(AuthTestCase):
    def test_correct_credentials_start_a_session(self):
        user = create_user()

        response = self.client.post(
            reverse('core:login'),
            {'email': 'anna@example.com', 'password': VALID_PASSWORD},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['id'], str(user.pk))
        self.assertEqual(self.client.session[SESSION_USER_KEY], str(user.pk))

    def test_email_matching_is_case_insensitive(self):
        create_user(email='anna@example.com')

        response = self.client.post(
            reverse('core:login'),
            {'email': 'ANNA@example.com', 'password': VALID_PASSWORD},
            format='json',
        )

        self.assertEqual(response.status_code, 200)

    def test_wrong_password_and_unknown_email_are_indistinguishable(self):
        create_user(email='anna@example.com')

        wrong_password = self.client.post(
            reverse('core:login'),
            {'email': 'anna@example.com', 'password': 'NieToHaslo123'}, format='json',
        )
        unknown_email = self.client.post(
            reverse('core:login'),
            {'email': 'nikt@example.com', 'password': VALID_PASSWORD}, format='json',
        )

        self.assertEqual(wrong_password.status_code, 400)
        self.assertEqual(unknown_email.status_code, 400)
        # Same wording both ways: who has an account here is itself private.
        self.assertEqual(wrong_password.data['detail'], unknown_email.data['detail'])
        self.assertNotIn(SESSION_USER_KEY, self.client.session)

    def test_a_row_whose_password_hash_is_not_a_hash_fails_cleanly(self):
        """scripts/mock_data.sql seeds 'mock_hash_placeholder' — must not 500."""
        User.objects.create(email='mock@example.com', password_hash='mock_hash_placeholder')

        response = self.client.post(
            reverse('core:login'),
            {'email': 'mock@example.com', 'password': 'mock_hash_placeholder'},
            format='json',
        )

        self.assertEqual(response.status_code, 400)

    def test_login_is_throttled_per_ip(self):
        create_user()
        payload = {'email': 'anna@example.com', 'password': 'ZleHaslo123'}

        statuses = [
            self.client.post(reverse('core:login'), payload, format='json').status_code
            for _ in range(12)
        ]

        self.assertIn(429, statuses)


class SessionTests(AuthTestCase):
    def test_me_returns_the_logged_in_user(self):
        user = create_user()
        self.client.post(
            reverse('core:login'),
            {'email': user.email, 'password': VALID_PASSWORD}, format='json',
        )

        response = self.client.get(reverse('core:me'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['id'], str(user.pk))

    def test_me_rejects_a_visitor_without_a_session(self):
        response = self.client.get(reverse('core:me'))

        self.assertIn(response.status_code, (401, 403))

    def test_logout_ends_the_session(self):
        user = create_user()
        self.client.post(
            reverse('core:login'),
            {'email': user.email, 'password': VALID_PASSWORD}, format='json',
        )

        response = self.client.post(reverse('core:logout'))

        self.assertEqual(response.status_code, 204)
        self.assertNotIn(SESSION_USER_KEY, self.client.session)
        self.assertIn(self.client.get(reverse('core:me')).status_code, (401, 403))

    def test_a_session_pointing_at_a_deleted_user_is_discarded(self):
        user = create_user()
        self.client.post(
            reverse('core:login'),
            {'email': user.email, 'password': VALID_PASSWORD}, format='json',
        )
        Patient.objects.filter(user=user).delete()
        user.delete()

        response = self.client.get(reverse('core:me'))

        self.assertIn(response.status_code, (401, 403))
        self.assertNotIn(SESSION_USER_KEY, self.client.session)


class CsrfTests(AuthTestCase):
    """The endpoints that accept credentials must not be callable cross-site."""

    def setUp(self):
        super().setUp()
        self.client = APIClient(enforce_csrf_checks=True)

    def test_csrf_endpoint_hands_out_a_cookie_and_a_matching_token(self):
        response = self.client.get(reverse('core:csrf'))

        self.assertEqual(response.status_code, 200)
        self.assertIn('csrftoken', response.cookies)
        # The body copy is what a cross-site frontend uses, since it cannot read
        # the cookie; it has to be a token Django will accept for that cookie.
        self.assertTrue(response.data['csrf_token'])

        accepted = self.client.post(
            reverse('core:login'), {'email': 'x@example.com', 'password': 'y'},
            format='json', HTTP_X_CSRFTOKEN=response.data['csrf_token'],
        )
        self.assertNotEqual(accepted.status_code, 403)

    def test_login_without_a_csrf_token_is_refused(self):
        create_user()

        response = self.client.post(
            reverse('core:login'),
            {'email': 'anna@example.com', 'password': VALID_PASSWORD}, format='json',
        )

        self.assertEqual(response.status_code, 403)

    def test_a_rejected_request_answers_in_json(self):
        """Django's own failure view renders HTML, which a fetch() cannot read.

        Without this the frontend has nothing to show but a generic fallback —
        see core/csrf.py.
        """
        response = self.client.post(
            reverse('core:register'), REGISTRATION, format='json',
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response['Content-Type'], 'application/json')
        self.assertEqual(response.json()['code'], 'csrf_failed')
        self.assertIn('Odśwież stronę', response.json()['detail'])

    @override_settings(DEBUG=True)
    def test_the_technical_reason_is_included_while_debugging(self):
        response = self.client.post(reverse('core:register'), REGISTRATION, format='json')

        self.assertIn('reason', response.json())

    def test_the_technical_reason_is_withheld_in_production(self):
        """It names configuration ('does not match any trusted origins')."""
        response = self.client.post(reverse('core:register'), REGISTRATION, format='json')

        self.assertNotIn('reason', response.json())

    def test_login_with_a_csrf_token_goes_through(self):
        create_user()
        token = self.client.get(reverse('core:csrf')).data['csrf_token']

        response = self.client.post(
            reverse('core:login'),
            {'email': 'anna@example.com', 'password': VALID_PASSWORD}, format='json',
            HTTP_X_CSRFTOKEN=token,
        )

        self.assertEqual(response.status_code, 200)

    def test_logout_without_a_csrf_token_is_refused(self):
        """Authenticated requests are covered by SessionUserAuthentication."""
        create_user()
        token = self.client.get(reverse('core:csrf')).data['csrf_token']
        self.client.post(
            reverse('core:login'),
            {'email': 'anna@example.com', 'password': VALID_PASSWORD}, format='json',
            HTTP_X_CSRFTOKEN=token,
        )

        response = self.client.post(reverse('core:logout'))

        self.assertEqual(response.status_code, 403)


class SessionFixationTests(AuthTestCase):
    """Logging in has to move the session to a new key.

    `start_session` calls `request.session.cycle_key()` for one reason: if an
    attacker managed to plant a session id in the victim's browser before they
    logged in — a link with a cookie-setting side effect, a shared machine —
    then without cycling, the id the attacker knows becomes the id of the
    *authenticated* session. It is one line, trivial to lose in a refactor, and
    invisible afterwards.
    """

    def _csrf(self):
        return self.client.get(reverse('core:csrf')).data['csrf_token']

    def test_logging_in_moves_the_session_to_a_new_key(self):
        create_user()
        # Touch the session so an anonymous key exists to be replaced.
        self.client.get(reverse('core:csrf'))
        before = self.client.session.session_key

        self.client.post(
            reverse('core:login'),
            {'email': 'anna@example.com', 'password': VALID_PASSWORD}, format='json',
        )

        self.assertIsNotNone(before)
        self.assertNotEqual(self.client.session.session_key, before)

    def test_registering_moves_the_session_to_a_new_key_too(self):
        UserRole.objects.create(name='patient')
        self.client.get(reverse('core:csrf'))
        before = self.client.session.session_key

        self.client.post(reverse('core:register'), REGISTRATION, format='json')

        self.assertNotEqual(self.client.session.session_key, before)

    def test_the_key_an_attacker_planted_no_longer_identifies_anyone(self):
        create_user()
        self.client.get(reverse('core:csrf'))
        planted = self.client.session.session_key

        self.client.post(
            reverse('core:login'),
            {'email': 'anna@example.com', 'password': VALID_PASSWORD}, format='json',
        )

        stale = APIClient()
        stale.cookies[settings.SESSION_COOKIE_NAME] = planted
        self.assertIn(stale.get(reverse('core:me')).status_code, (401, 403))

    def test_logging_out_leaves_nothing_behind_on_the_old_key(self):
        create_user()
        token = self._csrf()
        self.client.post(
            reverse('core:login'),
            {'email': 'anna@example.com', 'password': VALID_PASSWORD}, format='json',
            HTTP_X_CSRFTOKEN=token,
        )
        key = self.client.session.session_key

        self.client.post(reverse('core:logout'), HTTP_X_CSRFTOKEN=self._csrf())

        stale = APIClient()
        stale.cookies[settings.SESSION_COOKIE_NAME] = key
        self.assertIn(stale.get(reverse('core:me')).status_code, (401, 403))


class RegistrationRaceTests(AuthTestCase):
    """`validate_email` can lose to a concurrent signup for the same address.

    The unique index is the actual arbiter, and `create()` catches the
    IntegrityError so the loser of the race gets the same 400 as anybody else
    typing a taken address — not a 500. Without a test the branch is unreachable
    code that only production ever executes.
    """

    def test_losing_the_race_reads_as_a_taken_address_rather_than_a_crash(self):
        UserRole.objects.create(name='patient')
        create_user(email=REGISTRATION['email'])

        # Whatever the pre-flight check saw, the index still refuses the insert.
        with patch('core.serializers.RegisterSerializer.validate_email',
                   side_effect=lambda value: value.lower()):
            response = self.client.post(reverse('core:register'), REGISTRATION, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.data)

    def test_the_loser_of_the_race_leaves_no_half_written_account(self):
        """Both writes are in one transaction on `default`: a user without the
        patient row that was supposed to accompany it would be an account that
        can log in and reach nothing."""
        UserRole.objects.create(name='patient')
        create_user(email=REGISTRATION['email'])
        before = Patient.objects.count()

        with patch('core.serializers.RegisterSerializer.validate_email',
                   side_effect=lambda value: value.lower()):
            self.client.post(reverse('core:register'), REGISTRATION, format='json')

        self.assertEqual(Patient.objects.count(), before)
        self.assertEqual(User.objects.filter(email=REGISTRATION['email']).count(), 1)

    def test_a_failure_writing_the_patient_row_rolls_the_user_back(self):
        """transaction.atomic(using='default') covers both writes. Without it a
        failed second insert would leave an account that can log in and then
        reach nothing — every clinical endpoint refuses a user with no patient
        row."""
        UserRole.objects.create(name='patient')

        with patch('core.serializers.Patient.objects.create',
                   side_effect=IntegrityError('mock: insert odrzucony')):
            response = self.client.post(reverse('core:register'), REGISTRATION, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(email=REGISTRATION['email']).exists())
        self.assertFalse(Patient.objects.exists())


class ConsentTests(AuthTestCase):
    """RODO consents are not a checkbox we may quietly default.

    DRF's BooleanField accepts a range of spellings, so "was it actually
    agreed to" has more than one wrong answer available: absent, false, and the
    string 'false' all have to be refused, and each takes a different path
    through the field.
    """

    def setUp(self):
        super().setUp()
        UserRole.objects.create(name='patient')

    def _register_with(self, **overrides):
        return self.client.post(
            reverse('core:register'), REGISTRATION | overrides, format='json',
        )

    def test_an_absent_data_consent_is_refused(self):
        payload = {k: v for k, v in REGISTRATION.items() if k != 'data_consent'}

        response = self.client.post(reverse('core:register'), payload, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('data_consent', response.data)

    def test_an_absent_services_consent_is_refused(self):
        payload = {k: v for k, v in REGISTRATION.items() if k != 'services_consent'}

        response = self.client.post(reverse('core:register'), payload, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('services_consent', response.data)

    def test_a_false_data_consent_is_refused(self):
        response = self._register_with(data_consent=False)

        self.assertEqual(response.status_code, 400)
        self.assertIn('data_consent', response.data)

    def test_the_string_false_is_refused_and_not_read_as_agreement(self):
        """'false' is truthy as a Python string; DRF parses it to False. If that
        parsing ever changes, a client sending JSON strings would register with
        no consent at all."""
        response = self._register_with(data_consent='false')

        self.assertEqual(response.status_code, 400)
        self.assertIn('data_consent', response.data)

    def test_the_string_true_is_accepted_the_same_as_the_boolean(self):
        response = self._register_with(
            email='inny@example.com', data_consent='true', services_consent='true',
        )

        self.assertEqual(response.status_code, 201)

    def test_neither_consent_is_written_when_the_other_is_missing(self):
        self._register_with(services_consent=False)

        self.assertFalse(User.objects.exists())

    def test_the_two_consents_are_recorded_separately(self):
        """Two columns rather than one flag, because they are two decisions and
        art. 7(1) puts the burden of proving each on us."""
        self._register_with()

        user = User.objects.get(email=REGISTRATION['email'])
        self.assertIsNotNone(user.data_consent_at)
        self.assertIsNotNone(user.services_consent_at)


class NullableColumnTests(AuthTestCase):
    """Rows the form would never write, which the database happily holds.

    Almost every column on `"user"` is nullable and scripts/mock_data.sql seeds
    rows the registration form could not produce. `/api/auth/me/` runs on every
    page load, so a row like this must serialize rather than 500 the whole app.
    """

    def sign_in(self, user):
        session = self.client.session
        session[SESSION_USER_KEY] = str(user.pk)
        session.save()
        self.client.cookies[settings.SESSION_COOKIE_NAME] = session.session_key

    def test_a_user_with_no_name_still_answers_me(self):
        self.sign_in(create_user())

        response = self.client.get(reverse('core:me'))

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['name'])
        self.assertIsNone(response.data['surname'])

    def test_a_user_with_no_date_of_birth_still_answers_me(self):
        self.sign_in(create_user())

        self.assertIsNone(self.client.get(reverse('core:me')).data['date_of_birth'])

    def test_a_user_with_no_role_reads_as_a_null_role(self):
        """user_role is seeded by SQL, not by a migration, so its absence is a
        state the app has to survive rather than a bug."""
        self.sign_in(create_user(role=None))

        self.assertIsNone(self.client.get(reverse('core:me')).data['role'])

    def test_an_account_with_no_patient_row_reads_as_neither_child_nor_adult(self):
        self.sign_in(create_user(role='rodzic'))

        response = self.client.get(reverse('core:me'))

        self.assertIsNone(response.data['is_child'])
        self.assertIsNone(response.data['guardian_status'])

    def test_a_patient_with_is_child_null_is_not_forced_into_an_answer(self):
        """`is_child` is nullable, and a NULL is 'we do not know' — which must
        not be read as 'adult' by anything that gates on it."""
        user = create_user()
        Patient.objects.create(user=user, is_child=None)
        self.sign_in(user)

        response = self.client.get(reverse('core:me'))

        self.assertIsNone(response.data['is_child'])
        self.assertIsNone(response.data['guardian_status'])


class ThrottleTests(AuthTestCase):
    """The cap on the credential-accepting endpoints."""

    def _spam(self, url, payload, count=12, **extra):
        return [
            self.client.post(url, payload, format='json', **extra).status_code
            for _ in range(count)
        ]

    def test_registration_is_throttled_as_well_as_login(self):
        """RegisterView carries the same AuthThrottle and nothing covered it:
        an unthrottled signup form is a way to fill the table, and — because a
        taken address answers differently from a free one — to read it."""
        UserRole.objects.create(name='patient')

        statuses = self._spam(reverse('core:register'), REGISTRATION)

        self.assertIn(429, statuses)

    def test_the_cap_is_shared_by_address_not_reset_by_changing_it(self):
        """AnonRateThrottle keys on the caller, not on the credentials, so
        walking through a list of addresses must not buy extra attempts."""
        create_user()
        url = reverse('core:login')

        statuses = [
            self.client.post(
                url, {'email': f'ktos{index}@example.com', 'password': 'Zle123456'},
                format='json',
            ).status_code
            for index in range(12)
        ]

        self.assertIn(429, statuses)

    @unittest.expectedFailure
    def test_a_forwarded_for_header_does_not_buy_a_fresh_budget(self):
        """DOCUMENTS A KNOWN HOLE — remove the decorator once it is fixed.

        DRF's `BaseThrottle.get_ident` uses the *whole* X-Forwarded-For header
        when `NUM_PROXIES` is unset, and that header comes from the client. A
        different value per request is a different cache key per request, so the
        10/min cap counts nothing at all and password guessing is unbounded.

        The requests below model App Service: the client sends whatever it likes
        and the proxy appends the address it actually saw, so the *last* entry
        is the only trustworthy one. Setting `'NUM_PROXIES': 1` in
        REST_FRAMEWORK makes DRF read that entry and turns this green.
        """
        create_user()
        payload = {'email': 'anna@example.com', 'password': 'ZleHaslo123'}
        url = reverse('core:login')

        statuses = [
            self.client.post(
                url, payload, format='json',
                HTTP_X_FORWARDED_FOR=f'10.0.0.{index}, 203.0.113.7',
            ).status_code
            for index in range(12)
        ]

        self.assertIn(429, statuses)


class PasswordPolicyTests(AuthTestCase):
    """AUTH_PASSWORD_VALIDATORS lists four validators; not all of them run."""

    def setUp(self):
        super().setUp()
        UserRole.objects.create(name='patient')

    def test_a_short_password_is_refused(self):
        response = self.client.post(
            reverse('core:register'),
            REGISTRATION | {'password': 'Ab1!', 'password_confirm': 'Ab1!'},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('password', response.data)

    def test_an_all_numeric_password_is_refused(self):
        response = self.client.post(
            reverse('core:register'),
            REGISTRATION | {'password': '4938271056', 'password_confirm': '4938271056'},
            format='json',
        )

        self.assertEqual(response.status_code, 400)

    def test_a_common_password_is_refused(self):
        response = self.client.post(
            reverse('core:register'),
            REGISTRATION | {'password': 'password123', 'password_confirm': 'password123'},
            format='json',
        )

        self.assertEqual(response.status_code, 400)

    def test_the_error_names_the_password_field_so_the_form_can_place_it(self):
        response = self.client.post(
            reverse('core:register'),
            REGISTRATION | {'password': '12345678', 'password_confirm': '12345678'},
            format='json',
        )

        self.assertIn('password', response.data)
        self.assertNotIn('password_confirm', response.data)

    @unittest.expectedFailure
    def test_a_password_identical_to_the_email_is_refused(self):
        """DOCUMENTS A KNOWN HOLE — remove the decorator once it is fixed.

        UserAttributeSimilarityValidator is listed in AUTH_PASSWORD_VALIDATORS
        but never gets a user to compare against: `validate_password(value)` in
        RegisterSerializer is called with one argument, so the validator has
        nothing to look at and silently passes everything. It reads attributes
        with getattr, so passing an object carrying email/name/surname is enough
        to wake it up — it does not need a django.contrib.auth user.
        """
        password = REGISTRATION['email']

        response = self.client.post(
            reverse('core:register'),
            REGISTRATION | {'password': password, 'password_confirm': password},
            format='json',
        )

        self.assertEqual(response.status_code, 400)

    @unittest.expectedFailure
    def test_a_password_identical_to_the_surname_is_refused(self):
        """Same hole as above, from the angle a real person would hit it."""
        password = f"{REGISTRATION['surname']}{REGISTRATION['surname']}"

        response = self.client.post(
            reverse('core:register'),
            REGISTRATION | {'password': password, 'password_confirm': password},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
