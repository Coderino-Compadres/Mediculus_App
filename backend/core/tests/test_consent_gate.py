"""The consent gate: without both RODO consents, the app answers one thing.

Withdrawing a consent does not delete the account — it locks it. Nothing is read,
nothing is written, nothing is listed, and the only endpoints that answer are the
ones that let the owner give the consent back, look at their own account, or
leave. See core/consents.py for why locking replaced the older "withdrawal ends
the account" reading.

The shape is what matters, not any one endpoint, so this file sweeps **every URL
the project registers** from one place. A gate applied to the diary and forgotten
on `/api/guardian/children/` is not a gate — and because setting
`permission_classes` on a view replaces the defaults wholesale, forgetting is
exactly one line away.
"""

import datetime
import uuid

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import SESSION_USER_KEY
from core.consents import (CONSENTS, has_active_consents, is_active, restore,
                           withdraw)
from core.models import Diary, Patient, User, UserRole
from core.permissions import CONSENT_GATE_REFUSAL
from core.reports import DAYS_IN_WEEK, start_of_week, week_report_id

PASSWORD = 'TajneHaslo123'

#: Everything a signed-in account can reach, with a verb that is not 405.
#:
#: Built as a list rather than checked endpoint by endpoint so that adding a URL
#: to core/urls.py and forgetting the gate shows up here as a missing entry.
def all_urls(diary_id, report_id, invitation_id):
    return [
        ('get', reverse('core:me')),
        ('post', reverse('core:logout')),
        ('post', reverse('core:account-consents-withdraw')),
        ('post', reverse('core:account-consents-restore')),
        ('post', reverse('core:account-password')),
        ('get', reverse('core:account-profile')),
        ('post', reverse('core:guardian-link')),
        ('delete', reverse('core:guardian-link')),
        ('get', reverse('core:guardian-invitations')),
        ('get', reverse('core:guardian-children')),
        ('post', reverse('core:guardian-invitation-accept', args=[invitation_id])),
        ('post', reverse('core:guardian-invitation-reject', args=[invitation_id])),
        ('get', reverse('core:home-dashboard')),
        ('get', reverse('core:analysis-frequency')),
        ('get', reverse('core:diary-today')),
        ('put', reverse('core:diary-today')),
        ('get', reverse('core:diary-history')),
        ('get', reverse('core:diary-entry', args=[diary_id])),
        ('get', reverse('core:report-list')),
        ('get', reverse('core:report-detail', args=[report_id])),
        ('get', reverse('core:report-pdf', args=[report_id])),
    ]


#: The only four an account without consents may still reach, and each is the
#: gate's own escape hatch. Anything else appearing here is a bug, not a feature.
OPEN_WHILE_LOCKED = {
    'core:me', 'core:logout',
    'core:account-consents-withdraw', 'core:account-consents-restore',
}


class ConsentTestCase(TestCase):
    databases = {'default', 'medical'}

    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()
        self.week = start_of_week(self.today) - datetime.timedelta(days=DAYS_IN_WEEK)
        self.patient = self.make_patient()

    def make_user(self, email='pacjent@example.com', role='patient', **fields):
        fields.setdefault('data_consent_at', timezone.now())
        fields.setdefault('services_consent_at', timezone.now())
        return User.objects.create(
            user_role=UserRole.objects.get_or_create(name=role)[0] if role else None,
            email=email, password_hash=make_password(PASSWORD), **fields,
        )

    def make_patient(self, email='pacjent@example.com', is_child=False, **fields):
        return Patient.objects.create(
            user=self.make_user(email, **fields), is_child=is_child)

    def entry(self, patient):
        diary = Diary.objects.create(id_medical=patient.id_medical, current_mood='dobre')
        noon = timezone.make_aware(
            datetime.datetime.combine(self.week, datetime.time(12, 0)))
        Diary.objects.filter(pk=diary.pk).update(created_at=noon)
        return diary

    def sign_in(self, user):
        session = self.client.session
        session[SESSION_USER_KEY] = str(user.pk)
        session.save()
        self.client.cookies[settings.SESSION_COOKIE_NAME] = session.session_key

    def request(self, method, url, body=None):
        return getattr(self.client, method)(url, body or {}, format='json')


class SweepTests(ConsentTestCase):
    """Every URL, against an account whose consents are not in force."""

    def setUp(self):
        super().setUp()
        self.diary = self.entry(self.patient)
        self.urls = all_urls(self.diary.pk, week_report_id(self.week), uuid.uuid4())
        self.open_urls = {
            reverse(name) for name in OPEN_WHILE_LOCKED
        }
        withdraw(self.patient.user, 'all')
        self.sign_in(self.patient.user)

    def test_everything_but_the_escape_hatches_is_refused(self):
        for method, url in self.urls:
            if url in self.open_urls:
                continue
            with self.subTest(method=method, url=url):
                self.assertEqual(self.request(method, url).status_code, 403)

    def test_the_escape_hatches_still_answer(self):
        """Gating these would be a deadlock: the account could not read why it
        was refused, could not give the consent back, and could not even leave."""
        self.assertEqual(self.client.get(reverse('core:me')).status_code, 200)
        self.assertEqual(
            self.client.post(reverse('core:account-consents-restore'),
                             {'scope': 'all'}, format='json').status_code, 200)

    def test_the_refusal_says_what_is_missing(self):
        """Not the generic "not allowed": the account is not forbidden from the
        app, it is waiting on a decision only its owner can make."""
        response = self.client.get(reverse('core:diary-history'))

        self.assertEqual(str(response.data['detail']), CONSENT_GATE_REFUSAL)

    def test_no_data_travels_with_the_refusal(self):
        response = self.client.get(reverse('core:diary-history'))

        self.assertEqual(set(response.data), {'detail'})

    def test_a_refused_write_writes_nothing(self):
        before = Diary.objects.filter(id_medical=self.patient.id_medical).count()

        response = self.client.put(
            reverse('core:diary-today'), {'notes': 'nowy wpis'}, format='json')

        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            Diary.objects.filter(id_medical=self.patient.id_medical).count(), before)

    def test_one_missing_consent_is_enough_to_lock_the_account(self):
        """Both, not either. They cover different purposes and the app has no
        mode that runs on one of them."""
        restore(self.patient.user, 'all')
        withdraw(self.patient.user, 'services')

        self.assertEqual(self.client.get(reverse('core:diary-history')).status_code, 403)

    def test_restoring_opens_everything_again(self):
        """The clinical endpoints specifically, not "nothing answers 403".

        403 is a legitimate answer elsewhere for reasons that have nothing to do
        with consent — `/api/auth/guardian/` refuses an adult patient, for one —
        so a blanket sweep here would assert the wrong thing and pass or fail for
        the wrong reason.
        """
        restore(self.patient.user, 'all')

        for name in ('core:diary-history', 'core:diary-today', 'core:home-dashboard',
                     'core:report-list', 'core:analysis-frequency',
                     'core:account-profile', 'core:guardian-children'):
            with self.subTest(name=name):
                self.assertEqual(self.client.get(reverse(name)).status_code, 200)


class NeverConsentedTests(ConsentTestCase):
    """An account that never granted a consent meets the same screen.

    Not merely tidiness: rows seeded by mock_data.sql have neither column set,
    and a check keyed on withdrawal alone would wave them straight through.
    """

    def test_a_seeded_account_with_no_consents_is_locked(self):
        legacy = self.make_patient(
            'stary@example.com', data_consent_at=None, services_consent_at=None)
        self.sign_in(legacy.user)

        self.assertEqual(self.client.get(reverse('core:diary-history')).status_code, 403)

    def test_and_can_grant_them_for_the_first_time_from_the_same_screen(self):
        legacy = self.make_patient(
            'stary2@example.com', data_consent_at=None, services_consent_at=None)
        self.sign_in(legacy.user)

        response = self.client.post(
            reverse('core:account-consents-restore'), {'scope': 'all'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get(reverse('core:diary-history')).status_code, 200)


class WithdrawAndRestoreTests(ConsentTestCase):
    """The two endpoints, and what they write."""

    def setUp(self):
        super().setUp()
        self.user = self.patient.user
        self.sign_in(self.user)

    def withdraw(self, scope):
        return self.client.post(
            reverse('core:account-consents-withdraw'), {'scope': scope}, format='json')

    def restore(self, scope):
        return self.client.post(
            reverse('core:account-consents-restore'), {'scope': scope}, format='json')

    def refresh(self):
        self.user.refresh_from_db()
        return self.user

    def test_withdrawing_one_consent_leaves_the_other_alone(self):
        """They were collected separately and are withdrawable separately —
        art. 7(3), consent is per purpose."""
        self.assertEqual(self.withdraw('services').status_code, 200)

        user = self.refresh()

        self.assertIsNotNone(user.services_consent_withdrawn_at)
        self.assertIsNone(user.data_consent_withdrawn_at)

    def test_withdrawing_does_not_erase_that_the_consent_was_given(self):
        """The whole reason withdrawal is its own column: art. 7(1) puts the
        burden of proving consent on us, and clearing the grant would destroy
        the proof while making "never" and "withdrawn" the same row."""
        granted = self.refresh().data_consent_at

        self.withdraw('data')

        self.assertEqual(self.refresh().data_consent_at, granted)

    def test_withdrawing_all_covers_both(self):
        self.withdraw('all')

        user = self.refresh()

        self.assertFalse(has_active_consents(user))
        for _, granted, withdrawn in CONSENTS:
            with self.subTest(consent=granted):
                self.assertFalse(is_active(user, granted, withdrawn))

    def test_withdrawing_twice_keeps_the_first_moment(self):
        """The record should say when the user decided, not when they last
        pressed the button."""
        self.withdraw('data')
        first = self.refresh().data_consent_withdrawn_at

        self.withdraw('data')

        self.assertEqual(self.refresh().data_consent_withdrawn_at, first)

    def test_restoring_turns_the_consent_back_on_without_hiding_the_withdrawal(self):
        self.withdraw('all')
        withdrawn = self.refresh().data_consent_withdrawn_at

        self.restore('all')

        user = self.refresh()
        self.assertTrue(has_active_consents(user))
        self.assertEqual(user.data_consent_withdrawn_at, withdrawn)
        self.assertGreater(user.data_consent_at, withdrawn)

    def test_restoring_one_of_two_does_not_unlock_the_account(self):
        self.withdraw('all')

        self.restore('data')

        self.assertFalse(has_active_consents(self.refresh()))
        self.assertEqual(self.client.get(reverse('core:diary-history')).status_code, 403)

    def test_restoring_an_active_consent_does_not_move_its_date(self):
        """A profile showing "Udzielona 14 lipca" must not silently become
        today because somebody pressed a button that changed nothing."""
        granted = self.refresh().data_consent_at

        self.restore('data')

        self.assertEqual(self.refresh().data_consent_at, granted)

    def test_the_answer_carries_the_updated_account(self):
        """So the frontend can route on it without re-asking /api/auth/me/ —
        the same convention as the guardian link endpoint."""
        response = self.withdraw('all')

        self.assertFalse(response.data['consents']['active'])
        self.assertFalse(response.data['consents']['data']['active'])
        self.assertIsNotNone(response.data['consents']['data']['withdrawn_at'])

    def test_an_unknown_scope_is_refused_rather_than_guessed(self):
        response = self.withdraw('wszystko')

        self.assertEqual(response.status_code, 400)
        self.assertIn('scope', response.data)

    def test_a_missing_scope_is_refused(self):
        response = self.client.post(
            reverse('core:account-consents-withdraw'), {}, format='json')

        self.assertEqual(response.status_code, 400)

    def test_nothing_is_deleted_by_withdrawing(self):
        """Locking, not deletion. The older reading — that losing the art. 9
        consent ends the account — is what this replaces, and an account whose
        diary vanished on withdrawal could not meaningfully restore it."""
        self.entry(self.patient)
        before = Diary.objects.filter(id_medical=self.patient.id_medical).count()

        self.withdraw('all')

        self.assertEqual(
            Diary.objects.filter(id_medical=self.patient.id_medical).count(), before)
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())
        self.assertTrue(Patient.objects.filter(pk=self.patient.pk).exists())

    def test_the_diary_is_there_again_after_restoring(self):
        self.entry(self.patient)
        self.withdraw('all')

        self.restore('all')

        response = self.client.get(reverse('core:diary-history'))
        self.assertEqual(response.status_code, 200)
        # The one entry written above: withdrawal locked it away, restoring
        # brought it back rather than the account starting over.
        self.assertEqual(len(response.data), 1)

    def test_a_visitor_cannot_withdraw_anybody_s_consent(self):
        self.client = APIClient()

        response = self.client.post(
            reverse('core:account-consents-withdraw'), {'scope': 'all'}, format='json')

        self.assertIn(response.status_code, (401, 403))

    def test_only_post_is_accepted(self):
        for method in ('get', 'put', 'patch', 'delete'):
            with self.subTest(method=method):
                response = getattr(self.client, method)(
                    reverse('core:account-consents-withdraw'), {}, format='json')
                self.assertEqual(response.status_code, 405)


class GateOrderTests(ConsentTestCase):
    """Which gate answers when an account is behind more than one."""

    def test_a_minor_without_consents_hears_about_the_consents(self):
        """The consent gate is the outer one: without a lawful basis there is
        nothing to process, whoever has or has not vouched for the account. It
        is also the only one the account's own owner can clear by themselves."""
        minor = self.make_patient('dziecko@example.com', is_child=True)
        withdraw(minor.user, 'all')
        self.sign_in(minor.user)

        response = self.client.get(reverse('core:diary-history'))

        self.assertEqual(response.status_code, 403)
        self.assertEqual(str(response.data['detail']), CONSENT_GATE_REFUSAL)
