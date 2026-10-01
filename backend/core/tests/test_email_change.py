"""Changing an account's address — core/email_change.py.

Two halves, and the address changes only in the second: the request proves the
person (the current password), the link mailed to the new address proves the
mailbox. What is pinned: nothing changes until the link is used, the link works
once and not after the address moved, and every session ends with the change.
"""

import datetime
from unittest.mock import patch

from django.contrib.sessions.models import Session
from django.core import mail, signing
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from core import email_change
from core.models import User
from core.serializers import (EMAIL_TAKEN, EmailChangeConfirmSerializer,
                              EmailChangeRequestSerializer)
from core.tests.test_password_reset import (MAILERS_LOCMEM,
                                            PasswordResetTestCase,
                                            VALID_PASSWORD, create_user)


@override_settings(MAILERS=MAILERS_LOCMEM, FRONTEND_BASE_URL='https://app.example.com')
class EmailChangeTestCase(PasswordResetTestCase):
    """Reuses the reset tests' user, client and locmem outbox."""

    def setUp(self):
        super().setUp()
        self.sign_in(self.user)

    def sign_in(self, user, client=None):
        client = client or self.client
        from core.authentication import SESSION_USER_KEY
        session = client.session
        session[SESSION_USER_KEY] = str(user.pk)
        session.save()
        client.cookies['sessionid'] = session.session_key

    def ask(self, new_email='nowy@example.com', password=VALID_PASSWORD):
        return self.client.post(
            reverse('core:account-email'),
            {'new_email': new_email, 'current_password': password}, format='json',
        )

    def confirm_token(self, token, client=None):
        return (client or APIClient()).post(
            reverse('core:email-change-confirm'), {'token': token}, format='json',
        )

    def link_token(self):
        self.assertEqual(len(mail.outbox), 1)
        link = next(
            line.strip() for line in mail.outbox[0].body.splitlines()
            if line.strip().startswith('https://app.example.com/email-change/')
        )
        return link.rsplit('/', 1)[1]


class RequestTests(EmailChangeTestCase):
    def test_the_link_goes_to_the_new_address_and_nothing_changes_yet(self):
        response = self.ask()

        self.assertEqual(response.status_code, 202)
        self.assertEqual(mail.outbox[0].to, ['nowy@example.com'])
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'anna@example.com')

    def test_the_link_is_built_from_the_frontend_address_not_the_host(self):
        self.ask()

        self.assertIn('https://app.example.com/email-change/', mail.outbox[0].body)
        self.assertNotIn('testserver', mail.outbox[0].body)

    def test_the_message_says_nothing_about_the_account(self):
        self.ask()

        body = mail.outbox[0].body
        for word in ('Anna', 'Kowalska', 'anna@example.com', 'dzienniczek'):
            self.assertNotIn(word, body)

    def test_a_wrong_password_sends_nothing(self):
        response = self.ask(password='zle-haslo')

        self.assertEqual(response.status_code, 400)
        self.assertIn('current_password', response.data)
        self.assertEqual(mail.outbox, [])

    def test_a_taken_address_is_refused(self):
        create_user(email='zajety@example.com')

        response = self.ask(new_email='Zajety@Example.com')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['new_email'], [EMAIL_TAKEN])
        self.assertEqual(mail.outbox, [])

    def test_a_taken_address_is_not_revealed_without_the_password(self):
        """Without the password the answer is about the password, and only it."""
        create_user(email='zajety@example.com')

        response = self.ask(new_email='zajety@example.com', password='zle-haslo')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.data), {'current_password'})

    def test_the_current_address_is_refused(self):
        response = self.ask(new_email='ANNA@example.com')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data['new_email'], [EmailChangeRequestSerializer.SAME_AS_CURRENT])

    def test_the_address_is_stored_lowercased(self):
        self.ask(new_email='Nowy@Example.COM')
        self.confirm_token(self.link_token())

        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'nowy@example.com')

    def test_a_mail_that_cannot_be_sent_is_reported(self):
        with patch.object(email_change, 'request_change', return_value=False):
            response = self.ask()

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            str(response.data['detail']), EmailChangeRequestSerializer.NOT_SENT)

    def test_a_visitor_cannot_ask(self):
        response = APIClient().post(
            reverse('core:account-email'),
            {'new_email': 'nowy@example.com', 'current_password': VALID_PASSWORD},
            format='json',
        )
        self.assertEqual(response.status_code, 403)


class ConfirmTests(EmailChangeTestCase):
    def test_the_link_changes_the_address(self):
        self.ask()

        response = self.confirm_token(self.link_token())

        self.assertEqual(response.status_code, 204)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'nowy@example.com')

    def test_every_session_ends_with_the_change(self):
        other_device = APIClient()
        self.sign_in(self.user, client=other_device)
        self.ask()

        self.confirm_token(self.link_token())

        self.assertFalse(Session.objects.exists())
        self.assertEqual(self.client.get(reverse('core:me')).status_code, 403)

    def test_the_new_address_signs_in_and_the_old_one_does_not(self):
        self.ask()
        self.confirm_token(self.link_token())
        client = APIClient()

        old = client.post(reverse('core:login'),
                          {'email': 'anna@example.com', 'password': VALID_PASSWORD},
                          format='json')
        new = client.post(reverse('core:login'),
                          {'email': 'nowy@example.com', 'password': VALID_PASSWORD},
                          format='json')

        self.assertEqual(old.status_code, 400)
        self.assertEqual(new.status_code, 200)

    def test_the_link_works_once(self):
        self.ask()
        token = self.link_token()
        self.confirm_token(token)

        again = self.confirm_token(token)

        self.assertEqual(again.status_code, 400)
        self.assertEqual(
            str(again.data['detail'][0]), EmailChangeConfirmSerializer.INVALID_TOKEN)

    def test_an_older_link_dies_once_another_was_used(self):
        self.ask(new_email='pierwszy@example.com')
        first = self.link_token()
        mail.outbox.clear()
        cache.clear()
        self.ask(new_email='drugi@example.com')
        self.confirm_token(self.link_token())

        self.assertEqual(self.confirm_token(first).status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'drugi@example.com')

    def test_a_link_older_than_an_hour_is_refused(self):
        self.ask()
        token = self.link_token()
        later = datetime.timedelta(hours=1, minutes=1)

        with patch('django.core.signing.time.time',
                   return_value=signing.time.time() + later.total_seconds()):
            response = self.confirm_token(token)

        self.assertEqual(response.status_code, 400)

    def test_a_forged_token_is_refused(self):
        self.assertEqual(self.confirm_token('cokolwiek').status_code, 400)
        self.assertEqual(self.confirm_token('').status_code, 400)

    def test_an_address_taken_in_the_meantime_is_refused(self):
        self.ask()
        token = self.link_token()
        create_user(email='nowy@example.com')

        response = self.confirm_token(token)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            str(response.data['detail']), EmailChangeConfirmSerializer.TAKEN_SINCE)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'anna@example.com')

    def test_a_deleted_account_s_link_is_refused(self):
        self.ask()
        token = self.link_token()
        User.objects.filter(pk=self.user.pk).delete()

        self.assertEqual(self.confirm_token(token).status_code, 400)
