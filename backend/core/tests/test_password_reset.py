"""Tests for resetting a forgotten password by a mailed link.

Two endpoints and one rule that runs through all of it: **a request must not
reveal whether an address has an account here**. Half of this file is about the
happy path, and half is about the ways the flow could start answering that
question — a different status, a different body, a field error, a mail that
arrives only for real accounts.

Only `default` is touched: the `user` row, the session table and the throttle
cache all live in user_db.
"""

import datetime
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core import password_reset
from core.authentication import SESSION_USER_KEY
from core.models import User, UserRole

VALID_PASSWORD = 'TajneHaslo123'
NEW_PASSWORD = 'ZupelnieInne456'

#: The locmem backend writes to `mail.outbox`, which is what every assertion
#: about the message reads. Set per class rather than globally so a test that
#: forgets it fails loudly (console backend, empty outbox) instead of quietly.
MAILERS_LOCMEM = {'default': {'BACKEND': 'django.core.mail.backends.locmem.EmailBackend'}}


def create_user(email='anna@example.com', password=VALID_PASSWORD, **fields):
    role = UserRole.objects.get_or_create(name='patient')[0]
    return User.objects.create(
        user_role=role, email=email, password_hash=make_password(password),
        name='Anna', surname='Kowalska',
        data_consent_at=timezone.now(), services_consent_at=timezone.now(),
        **fields,
    )


@override_settings(MAILERS=MAILERS_LOCMEM, FRONTEND_BASE_URL='https://app.example.com')
class PasswordResetTestCase(TestCase):
    """Shared setup: the throttle counts in the real cache, which outlives a test."""

    databases = {'default'}

    def setUp(self):
        cache.clear()
        mail.outbox.clear()
        self.client = APIClient()
        self.user = create_user()

    def request_reset(self, email='anna@example.com', client=None):
        return (client or self.client).post(
            reverse('core:password-reset'), {'email': email}, format='json',
        )

    def confirm(self, token, password=NEW_PASSWORD, confirmation=None, client=None):
        return (client or self.client).post(
            reverse('core:password-reset-confirm'),
            {
                'token': token,
                'new_password': password,
                'new_password_confirm': confirmation if confirmation is not None else password,
            },
            format='json',
        )

    def token_from_mail(self):
        """The token as the person receiving the message would get it: off the link."""
        self.assertEqual(len(mail.outbox), 1)
        link = next(
            line.strip() for line in mail.outbox[0].body.splitlines()
            if line.strip().startswith('https://app.example.com')
        )
        return link.rsplit('/', 1)[1]


class RequestTests(PasswordResetTestCase):
    def test_a_known_address_is_mailed_a_link(self):
        response = self.request_reset()

        self.assertEqual(response.status_code, 204)
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ['anna@example.com'])
        self.assertIn('https://app.example.com/password-reset/', message.body)

    def test_the_link_is_built_from_the_setting_and_not_from_the_host_header(self):
        """A reset link an attacker can point at their own server is the account."""
        self.request_reset(client=APIClient(HTTP_HOST='testserver'))

        self.assertIn('https://app.example.com/password-reset/', mail.outbox[0].body)
        self.assertNotIn('testserver', mail.outbox[0].body)

    def test_an_unknown_address_gets_the_same_answer_and_no_mail(self):
        known = self.request_reset()
        unknown = self.request_reset(email='nikt@example.com')

        self.assertEqual(unknown.status_code, known.status_code)
        self.assertEqual(unknown.content, known.content)
        # One message, from the first call — the second produced nothing.
        self.assertEqual(len(mail.outbox), 1)

    def test_the_address_is_matched_regardless_of_case(self):
        self.assertEqual(self.request_reset(email='Anna@Example.com').status_code, 204)
        self.assertEqual(len(mail.outbox), 1)

    def test_a_malformed_address_is_a_400(self):
        """A statement about the input, not about who has an account."""
        response = self.request_reset(email='to-nie-adres')

        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.data)
        self.assertEqual(mail.outbox, [])

    def test_the_message_says_nothing_about_the_account(self):
        """It is read on lock screens and shared devices — see `build_message`."""
        self.request_reset()

        message = mail.outbox[0]
        for secret in ('Anna', 'Kowalska', 'patient', VALID_PASSWORD):
            self.assertNotIn(secret, message.body)
            self.assertNotIn(secret, message.subject)

    def test_a_mailer_that_fails_still_answers_204(self):
        """Otherwise the error itself says the address has an account here."""
        with patch.object(
            password_reset.mail, 'mailers',
            {'default': type('Broken', (), {
                'send_messages': staticmethod(lambda messages: (_ for _ in ()).throw(OSError())),
            })()},
        ):
            response = self.request_reset()

        self.assertEqual(response.status_code, 204)

    def test_five_requests_an_hour_and_the_sixth_is_refused(self):
        for _ in range(5):
            self.assertEqual(self.request_reset().status_code, 204)

        self.assertEqual(self.request_reset().status_code, 429)
        self.assertEqual(len(mail.outbox), 5)

    def test_the_cap_follows_the_address_and_not_the_caller(self):
        """A botnet gives every attempt a new IP; the mailbox being flooded is one."""
        for _ in range(5):
            self.request_reset(client=APIClient(REMOTE_ADDR='10.0.0.1'))

        other_caller = APIClient(REMOTE_ADDR='10.0.0.2')
        self.assertEqual(self.request_reset(client=other_caller).status_code, 429)


class ConfirmTests(PasswordResetTestCase):
    def test_the_link_sets_a_new_password(self):
        self.request_reset()

        response = self.confirm(self.token_from_mail())

        self.assertEqual(response.status_code, 204)
        self.user.refresh_from_db()
        self.assertTrue(check_password(NEW_PASSWORD, self.user.password_hash))

    def test_the_caller_is_not_logged_in(self):
        """The token arrived by e-mail; it replaces the password, it is not one."""
        self.request_reset()

        self.confirm(self.token_from_mail())

        self.assertNotIn(SESSION_USER_KEY, self.client.session)

    def test_the_new_password_works_at_the_login_form(self):
        self.request_reset()
        self.confirm(self.token_from_mail())

        response = self.client.post(
            reverse('core:login'),
            {'email': 'anna@example.com', 'password': NEW_PASSWORD}, format='json',
        )

        self.assertEqual(response.status_code, 200)

    def test_a_token_works_once(self):
        self.request_reset()
        token = self.token_from_mail()
        self.confirm(token)

        response = self.confirm(token, password='TrzecieHaslo789')

        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        # Still the password the first, legitimate use set.
        self.assertTrue(check_password(NEW_PASSWORD, self.user.password_hash))

    def test_an_expired_token_is_refused(self):
        self.request_reset()
        token = self.token_from_mail()

        with patch.object(password_reset, 'TOKEN_TTL', datetime.timedelta(seconds=-1)):
            response = self.confirm(token)

        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(check_password(VALID_PASSWORD, self.user.password_hash))

    def test_a_tampered_token_is_refused(self):
        self.request_reset()
        token = self.token_from_mail()

        response = self.confirm(token[:-1] + ('x' if token[-1] != 'x' else 'y'))

        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(check_password(VALID_PASSWORD, self.user.password_hash))

    def test_every_bad_token_is_refused_in_the_same_words(self):
        """Telling forged from expired would confirm a half-guessed token was real."""
        self.request_reset()
        token = self.token_from_mail()
        forged = self.confirm('nie-jest-tokenem').data

        with patch.object(password_reset, 'TOKEN_TTL', datetime.timedelta(seconds=-1)):
            expired = self.confirm(token).data

        self.assertEqual(forged, expired)

    def test_a_weak_password_is_refused_under_its_own_field(self):
        self.request_reset()

        response = self.confirm(self.token_from_mail(), password='haslo')

        self.assertEqual(response.status_code, 400)
        self.assertIn('new_password', response.data)
        self.user.refresh_from_db()
        self.assertTrue(check_password(VALID_PASSWORD, self.user.password_hash))

    def test_a_password_resembling_the_account_is_refused(self):
        """`check_password_strength` is run with the user, so this validator works."""
        self.request_reset()

        response = self.confirm(self.token_from_mail(), password='anna@example.com')

        self.assertEqual(response.status_code, 400)
        self.assertIn('new_password', response.data)

    def test_a_mistyped_confirmation_is_refused(self):
        self.request_reset()

        response = self.confirm(self.token_from_mail(), confirmation='cos-innego')

        self.assertEqual(response.status_code, 400)
        self.assertIn('new_password_confirm', response.data)

    def test_the_token_survives_an_unsuccessful_attempt(self):
        """A refused password must not burn the link the person is holding."""
        self.request_reset()
        token = self.token_from_mail()
        self.confirm(token, password='haslo')

        self.assertEqual(self.confirm(token).status_code, 204)


class PasswordGateTests(PasswordResetTestCase):
    """A specialist account whose generated password was lost — core/colleagues.py."""

    def setUp(self):
        super().setUp()
        self.user.must_change_password = True
        self.user.save(update_fields=['must_change_password'])

    def test_the_reset_clears_the_flag(self):
        self.request_reset()

        self.confirm(self.token_from_mail())

        self.user.refresh_from_db()
        self.assertFalse(self.user.must_change_password)


class SessionTests(PasswordResetTestCase):
    """What a reset does to the sessions the lost password left open."""

    def login(self, email='anna@example.com', password=VALID_PASSWORD):
        client = APIClient()
        response = client.post(
            reverse('core:login'), {'email': email, 'password': password}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        return client

    def test_every_session_of_the_account_is_closed(self):
        phone, laptop = self.login(), self.login()
        self.request_reset()

        self.confirm(self.token_from_mail())

        for client in (phone, laptop):
            self.assertIn(client.get(reverse('core:me')).status_code, (401, 403))

    def test_other_accounts_are_left_alone(self):
        create_user(email='bartek@example.com')
        bartek = self.login(email='bartek@example.com')
        self.request_reset()

        self.confirm(self.token_from_mail())

        self.assertEqual(bartek.get(reverse('core:me')).status_code, 200)

    def test_nothing_breaks_when_the_account_has_no_session(self):
        self.request_reset()

        self.assertEqual(self.confirm(self.token_from_mail()).status_code, 204)


class TokenUnitTests(TestCase):
    """`resolve_token` on its own, where the HTTP layer cannot hide an answer."""

    databases = {'default'}

    def setUp(self):
        self.user = create_user()

    def test_a_token_resolves_to_its_own_account(self):
        resolved = password_reset.resolve_token(password_reset.issue_token(self.user))

        self.assertEqual(resolved.pk, self.user.pk)

    def test_a_token_dies_with_the_password_it_was_minted_against(self):
        token = password_reset.issue_token(self.user)
        self.user.password_hash = make_password('ZmienioneGdzieIndziej1')
        self.user.save(update_fields=['password_hash'])

        self.assertIsNone(password_reset.resolve_token(token))

    def test_a_token_for_a_deleted_account_resolves_to_nothing(self):
        token = password_reset.issue_token(self.user)
        self.user.delete()

        self.assertIsNone(password_reset.resolve_token(token))

    def test_empty_and_malformed_tokens_are_refused_rather_than_raising(self):
        for value in (None, '', 'abc', 42, ['x']):
            with self.subTest(token=value):
                self.assertIsNone(password_reset.resolve_token(value))

    def test_an_account_with_no_usable_hash_can_still_set_one(self):
        """Rows seeded by mock_data.sql hold 'mock_hash_placeholder'."""
        self.user.password_hash = 'mock_hash_placeholder'
        self.user.save(update_fields=['password_hash'])

        token = password_reset.issue_token(self.user)

        self.assertEqual(password_reset.resolve_token(token).pk, self.user.pk)

    def test_the_token_carries_no_readable_secret(self):
        """It is signed, not encrypted — so what is inside it has to be harmless."""
        token = password_reset.issue_token(self.user)

        self.assertNotIn(VALID_PASSWORD, token)
        self.assertNotIn(self.user.password_hash, token)
        self.assertNotIn('anna@example.com', token)


class SettingsTests(TestCase):
    """The two settings this feature adds, as a deployment will meet them."""

    databases = set()

    def test_the_console_backend_is_the_default(self):
        """A checkout with no EMAIL_HOST prints the link instead of mailing nobody."""
        self.assertIn('BACKEND', settings.MAILERS['default'])

    def test_the_frontend_base_url_is_configured(self):
        self.assertTrue(settings.FRONTEND_BASE_URL.startswith('http'))
