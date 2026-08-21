"""Tests for the /api/auth/ endpoints.

Only `default` is touched: registration writes to user_db and the session table
lives there too. Nothing here reaches medical_db — a new patient's `id_medical`
is generated locally and only referenced from the other database later.
"""

import datetime

from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache
from django.test import TestCase
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
