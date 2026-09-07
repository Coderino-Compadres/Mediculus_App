"""Where a specialist account comes from: POST /api/specialist/colleagues/.

The public form used to make one. It cannot any more, and the two halves of that
change are what this file is about:

* registration refuses `account_type: 'specialist'` outright, so there is no way
  to self-declare a profession the app cannot check;
* an existing specialist creates the account instead, gets the password once,
  and hands it over in the room — this deployment sends no mail at all.

The property that needs pinning hardest is the consent one: the created account
has granted **nothing**, because consent is the data subject's act and a
colleague cannot perform it for them. So a brand-new specialist account is
locked by `HasActiveConsents` until its owner logs in and grants the consents
themselves — which also means it cannot read anything before agreeing to
anything.

The second gate is the password. The one that came back from this endpoint was
generated, spoken aloud and typed off a note, so its holder did not choose it and
whoever created the account knows it — `must_change_password` holds the account
on the password form until it has its own. The order the two gates are answered
in is pinned here as well (consents, then the password), because it is not free:
`POST /api/account/password/` is itself behind `HasActiveConsents`.
"""

import datetime

from unittest.mock import patch

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import SESSION_USER_KEY
from core.colleagues import (COLLEAGUE_SUMMARY_FIELDS, PASSWORD_ALPHABET,
                             SPECIALIST_ROLE, generate_password)
from core.consents import has_active_consents
from core.models import Patient, Specjalist, User, UserRole
from core.permissions import PASSWORD_GATE_REFUSAL
from core.throttling import SpecialistAccountThrottle
from core.views import SPECIALIST_REFUSAL

PASSWORD = 'TajneHaslo123'

NEW_COLLEAGUE = {
    'email': 'Nowa.Terapeutka@Example.com',
    'name': 'Nowa',
    'surname': 'Terapeutka',
    'date_of_birth': '1985-02-01',
    'specialization': 'psychoterapia poznawczo-behawioralna',
}


class ColleagueTestCase(TestCase):
    databases = {'default', 'medical'}

    def setUp(self):
        self.client = APIClient()
        # Roles are seeded by scripts/mock_data.sql rather than by a migration,
        # so the test database has none until something makes them.
        UserRole.objects.get_or_create(name=SPECIALIST_ROLE)
        self.specjalist = self.make_specialist()
        self.sign_in(self.specjalist.user)

    def make_user(self, email, role='patient', **fields):
        fields.setdefault('data_consent_at', timezone.now())
        fields.setdefault('services_consent_at', timezone.now())
        return User.objects.create(
            user_role=UserRole.objects.get_or_create(name=role)[0] if role else None,
            email=email, password_hash=make_password(PASSWORD), **fields,
        )

    def make_specialist(self, email='specjalista@example.com', specjalization='DBT'):
        return Specjalist.objects.create(
            user=self.make_user(email, role=SPECIALIST_ROLE),
            specjalization=specjalization,
        )

    def sign_in(self, user):
        session = self.client.session
        session[SESSION_USER_KEY] = str(user.pk)
        session.save()
        self.client.cookies[settings.SESSION_COOKIE_NAME] = session.session_key

    def create(self, **overrides):
        body = NEW_COLLEAGUE | overrides
        return self.client.post(
            reverse('core:specialist-colleagues'), body, format='json',
        )


class CreationTests(ColleagueTestCase):
    """What the request writes, and what it deliberately does not."""

    def test_it_creates_a_specjalist_row_and_no_patient_row(self):
        """The whole shape of the account: a specialist is not a clinical
        subject, so there is no id_medical and nothing in medical_db can ever
        refer to them."""
        response = self.create()

        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get(email='nowa.terapeutka@example.com')
        self.assertEqual(user.user_role.name, SPECIALIST_ROLE)
        self.assertEqual(user.name, 'Nowa')
        self.assertEqual(user.surname, 'Terapeutka')
        self.assertEqual(user.date_of_birth, datetime.date(1985, 2, 1))
        self.assertTrue(Specjalist.objects.filter(user=user).exists())
        self.assertFalse(Patient.objects.filter(user=user).exists())
        self.assertEqual(
            Specjalist.objects.get(user=user).specjalization,
            'psychoterapia poznawczo-behawioralna',
        )

    def test_the_address_is_stored_lowercased(self):
        """Which is what makes the plain unique index behave case-insensitively
        — and what lets the new specialist log in however they type it."""
        self.create()

        self.assertTrue(User.objects.filter(email='nowa.terapeutka@example.com').exists())

    def test_the_password_comes_back_once_and_is_stored_hashed(self):
        response = self.create()

        password = response.data['password']
        user = User.objects.get(email='nowa.terapeutka@example.com')
        self.assertNotEqual(user.password_hash, password)
        self.assertTrue(check_password(password, user.password_hash))

    def test_the_password_is_nowhere_in_the_roster(self):
        """Nothing can read it back — not this API, not the list, not the row."""
        password = self.create().data['password']

        listing = self.client.get(reverse('core:specialist-colleagues'))

        self.assertNotIn(password, str(listing.data))
        for row in listing.data:
            self.assertNotIn('password', row)

    def test_the_password_is_drawn_from_the_readable_alphabet(self):
        """It is dictated off a note and typed by hand, so O/0, I/1/L, S/5 and
        Z/2 are a support call rather than a typo."""
        for _ in range(20):
            self.assertTrue(
                set(generate_password()) <= set(PASSWORD_ALPHABET) | {'-'},
                generate_password(),
            )
        for character in 'OIL0125SZ':
            self.assertNotIn(character, PASSWORD_ALPHABET)

    def test_two_accounts_do_not_get_the_same_password(self):
        first = self.create().data['password']
        second = self.create(email='druga@example.com').data['password']

        self.assertNotEqual(first, second)

    def test_no_consent_is_granted_on_the_new_account(self):
        """THE LOAD-BEARING ONE. Consent is the data subject's act (RODO art. 7)
        and the person creating the account is not that subject, so both columns
        stay NULL and the account is locked until its owner grants them."""
        self.create()

        user = User.objects.get(email='nowa.terapeutka@example.com')
        self.assertIsNone(user.data_consent_at)
        self.assertIsNone(user.services_consent_at)
        self.assertFalse(has_active_consents(user))

    def test_the_response_carries_the_new_account_for_the_roster(self):
        response = self.create()

        self.assertEqual(
            set(response.data['specialist']),
            {'id', *COLLEAGUE_SUMMARY_FIELDS},
        )
        self.assertEqual(response.data['specialist']['email'], 'nowa.terapeutka@example.com')
        self.assertIs(response.data['specialist']['consents_active'], False)


class NewAccountTests(ColleagueTestCase):
    """What the created account can do with itself."""

    NEW_PASSWORD = 'WlasneHaslo!2026'

    def sign_in_as_new(self):
        self.given_password = self.create().data['password']
        self.client = APIClient()
        response = self.client.post(reverse('core:login'), {
            'email': 'nowa.terapeutka@example.com', 'password': self.given_password,
        }, format='json')
        return response

    def grant_consents(self):
        return self.client.post(
            reverse('core:account-consents-restore'), {'scope': 'all'}, format='json',
        )

    def set_own_password(self, new_password=None):
        new_password = new_password or self.NEW_PASSWORD
        return self.client.post(reverse('core:account-password'), {
            'current_password': self.given_password,
            'new_password': new_password,
            'new_password_confirm': new_password,
        }, format='json')

    def unlock(self):
        """Both gates, in the order the account actually meets them."""
        self.grant_consents()
        return self.set_own_password()

    def test_it_can_log_in_with_the_password_that_came_back(self):
        response = self.sign_in_as_new()

        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['is_specialist'])
        self.assertFalse(response.data['is_patient'])

    def test_it_meets_the_consent_screen_before_anything_else(self):
        """Locked, and told why: the panel is refused until its owner has agreed
        to the processing. `/api/auth/me/` stays open — that is how the frontend
        learns which screen to show."""
        self.sign_in_as_new()

        panel = self.client.get(reverse('core:specialist-patients'))
        me = self.client.get(reverse('core:me'))

        self.assertEqual(panel.status_code, 403)
        self.assertEqual(me.status_code, 200)
        self.assertFalse(me.data['consents']['data']['active'])
        self.assertFalse(me.data['consents']['services']['active'])

    def test_the_new_account_is_flagged_to_change_its_password(self):
        """Set here and nowhere else: this password was generated, read off a
        note and typed by hand, so its holder did not choose it and at least one
        other person knows it."""
        self.create()

        user = User.objects.get(email='nowa.terapeutka@example.com')
        self.assertTrue(user.must_change_password)

    def test_registration_does_not_flag_the_account_it_creates(self):
        """The gate is about a password somebody else chose. Somebody who typed
        their own into the registration form has already done what it asks."""
        self.client = APIClient()
        response = self.client.post(reverse('core:register'), {
            'email': 'pacjentka@example.com', 'password': 'TajneHaslo123',
            'password_confirm': 'TajneHaslo123', 'name': 'Ala', 'surname': 'Nowak',
            'date_of_birth': '1990-05-05', 'account_type': 'patient',
            'data_consent': True, 'services_consent': True,
        }, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        self.assertIs(response.data['must_change_password'], False)
        self.assertFalse(
            User.objects.get(email='pacjentka@example.com').must_change_password)

    def test_the_flag_travels_on_me_so_the_router_can_read_it(self):
        """The frontend learns *which* screen it is being held on from this
        payload, exactly as it does for the consents."""
        self.sign_in_as_new()

        me = self.client.get(reverse('core:me'))

        self.assertEqual(me.status_code, 200)
        self.assertIs(me.data['must_change_password'], True)

    def test_the_consents_come_first_and_the_password_form_is_shut_until_they_do(self):
        """The order is forced rather than chosen: the password endpoint is
        itself behind HasActiveConsents, so asking for the password first would
        leave the account with no reachable screen at all."""
        self.sign_in_as_new()

        refused = self.set_own_password()

        self.assertEqual(refused.status_code, 403)
        self.assertTrue(
            check_password(
                self.given_password,
                User.objects.get(email='nowa.terapeutka@example.com').password_hash,
            ),
        )

    def test_the_panel_stays_shut_on_the_generated_password_after_consenting(self):
        """Consents granted is half of it. The account still holds a credential
        somebody handed it, and what the panel opens onto is patients' records."""
        self.sign_in_as_new()
        granted = self.grant_consents()

        panel = self.client.get(reverse('core:specialist-patients'))
        me = self.client.get(reverse('core:me'))

        self.assertEqual(granted.status_code, 200, granted.data)
        self.assertEqual(panel.status_code, 403)
        self.assertEqual(str(panel.data['detail']), PASSWORD_GATE_REFUSAL)
        self.assertIs(me.data['consents']['active'], True)
        self.assertIs(me.data['must_change_password'], True)

    def test_setting_its_own_password_clears_the_flag_and_opens_the_panel(self):
        """And the caseload is empty, which is the point of the whole design:
        creating an account grants its holder nothing about anybody."""
        patient = Patient.objects.create(
            user=self.make_user('pacjent@example.com'), is_child=False,
        )
        self.assertIsNone(patient.specjalist_id)
        self.sign_in_as_new()

        changed = self.unlock()
        panel = self.client.get(reverse('core:specialist-patients'))

        self.assertEqual(changed.status_code, 204, getattr(changed, 'data', None))
        self.assertFalse(
            User.objects.get(email='nowa.terapeutka@example.com').must_change_password)
        self.assertEqual(panel.status_code, 200)
        self.assertEqual(panel.data, {'patients': [], 'pending': []})

    def test_the_session_survives_the_change_so_nobody_is_bounced_to_login(self):
        """The gate is a screen inside the app, not a sign-out. Our sessions
        carry `core_user_id` and no password hash, so nothing goes stale."""
        self.sign_in_as_new()
        self.unlock()

        me = self.client.get(reverse('core:me'))

        self.assertEqual(me.status_code, 200)
        self.assertIs(me.data['must_change_password'], False)

    def test_the_generated_password_stops_working_afterwards(self):
        self.sign_in_as_new()
        self.unlock()

        client = APIClient()
        old = client.post(reverse('core:login'), {
            'email': 'nowa.terapeutka@example.com', 'password': self.given_password,
        }, format='json')
        new = client.post(reverse('core:login'), {
            'email': 'nowa.terapeutka@example.com', 'password': self.NEW_PASSWORD,
        }, format='json')

        self.assertEqual(old.status_code, 400)
        self.assertEqual(new.status_code, 200, new.data)

    def test_a_refused_new_password_leaves_the_account_where_it_was(self):
        """A validator saying no must not half-open the account, the same
        property `_redeem` gives a guardian invitation code."""
        self.sign_in_as_new()
        self.grant_consents()

        refused = self.set_own_password('haslo')

        self.assertEqual(refused.status_code, 400)
        user = User.objects.get(email='nowa.terapeutka@example.com')
        self.assertTrue(user.must_change_password)
        self.assertTrue(check_password(self.given_password, user.password_hash))

    def test_it_can_create_a_further_account_once_it_is_through_both_gates(self):
        """A specialist account is a specialist account however it was made —
        there is no second class of them, and no bootstrap flag anywhere."""
        self.sign_in_as_new()
        self.unlock()

        response = self.client.post(reverse('core:specialist-colleagues'), {
            **NEW_COLLEAGUE, 'email': 'trzecia@example.com',
        }, format='json')

        self.assertEqual(response.status_code, 201, response.data)


class RefusalTests(ColleagueTestCase):
    """Who may ask, and which answers are refusals rather than accounts."""

    def test_a_patient_cannot_create_a_specialist_account(self):
        patient = Patient.objects.create(
            user=self.make_user('pacjent@example.com'), is_child=False,
        )
        self.sign_in(patient.user)

        response = self.create()

        self.assertEqual(response.status_code, 403)
        self.assertEqual(str(response.data['detail']), SPECIALIST_REFUSAL)
        self.assertFalse(User.objects.filter(email='nowa.terapeutka@example.com').exists())

    def test_a_guardian_cannot_either(self):
        self.sign_in(self.make_user('rodzic@example.com', role='rodzic'))

        response = self.create()

        self.assertEqual(response.status_code, 403)
        self.assertFalse(Specjalist.objects.filter(user__email__startswith='nowa').exists())

    def test_a_visitor_cannot_either(self):
        self.client = APIClient()

        response = self.create()

        self.assertEqual(response.status_code, 403)
        self.assertFalse(User.objects.filter(email='nowa.terapeutka@example.com').exists())

    def test_an_address_that_already_has_an_account_is_refused(self):
        """The one thing this form cannot keep quiet about: an account cannot be
        created on an address that has one, so the alternative is a form failing
        with no reason."""
        response = self.create(email='specjalista@example.com')

        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.data)
        self.assertEqual(Specjalist.objects.count(), 1)

    def test_the_address_is_matched_case_insensitively(self):
        response = self.create(email='SPECJALISTA@example.com')

        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.data)

    def test_the_specialization_is_required(self):
        """The patient reads it when deciding whether to accept them."""
        response = self.create(specialization='')

        self.assertEqual(response.status_code, 400)
        self.assertIn('specialization', response.data)
        self.assertFalse(User.objects.filter(email='nowa.terapeutka@example.com').exists())

    def test_a_minor_cannot_hold_a_specialist_account(self):
        minor = (timezone.localdate() - datetime.timedelta(days=365 * 15)).isoformat()

        response = self.create(date_of_birth=minor)

        self.assertEqual(response.status_code, 400)
        self.assertIn('date_of_birth', response.data)

    def test_a_date_of_birth_from_the_future_is_refused(self):
        tomorrow = (timezone.localdate() + datetime.timedelta(days=1)).isoformat()

        response = self.create(date_of_birth=tomorrow)

        self.assertEqual(response.status_code, 400)
        self.assertIn('date_of_birth', response.data)

    def test_every_field_is_required(self):
        for field in NEW_COLLEAGUE:
            with self.subTest(field=field):
                body = {k: v for k, v in NEW_COLLEAGUE.items() if k != field}

                response = self.client.post(
                    reverse('core:specialist-colleagues'), body, format='json')

                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)

    def test_a_failed_create_writes_nothing_at_all(self):
        self.create(specialization='')

        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(Specjalist.objects.count(), 1)

    def test_there_is_no_delete_and_no_edit(self):
        """Not an omission worth working around: closing an account is the
        still-unanswered legal question about retaining records, and it is the
        same answer for a specialist as for a patient."""
        url = reverse('core:specialist-colleagues')

        self.assertEqual(self.client.delete(url).status_code, 405)
        self.assertEqual(self.client.put(url, {}, format='json').status_code, 405)


class RosterTests(ColleagueTestCase):
    """What the list says, and what it must never grow."""

    def test_it_lists_every_specialist_account_newest_first(self):
        self.create()

        response = self.client.get(reverse('core:specialist-colleagues'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [row['email'] for row in response.data],
            ['nowa.terapeutka@example.com', 'specjalista@example.com'],
        )

    def test_a_row_carries_identity_and_status_and_nothing_else(self):
        response = self.client.get(reverse('core:specialist-colleagues'))

        self.assertEqual(set(response.data[0]), {'id', *COLLEAGUE_SUMMARY_FIELDS})

    def test_nothing_clinical_and_no_caseload_travels(self):
        """A colleague's patients agreed to *them*, not to every specialist in
        the roster. The failure mode is somebody adding a patient counter here
        and it looking like an improvement."""
        patient = Patient.objects.create(
            user=self.make_user('pacjent@example.com'), is_child=False,
            specjalist=self.specjalist, specjalist_accepted_at=timezone.now(),
        )

        response = self.client.get(reverse('core:specialist-colleagues'))

        body = str(response.data)
        self.assertNotIn(str(patient.id_medical), body)
        self.assertNotIn('pacjent@example.com', body)
        for leaked in ('patients', 'pending', 'activity', 'entry_count',
                       'streak_days', 'id_medical', 'avg_mood'):
            self.assertNotIn(leaked, response.data[0])

    def test_the_id_on_the_wire_is_the_user_id(self):
        response = self.client.get(reverse('core:specialist-colleagues'))

        rows = {row['email']: row for row in response.data}
        self.assertEqual(
            rows['specjalista@example.com']['id'], str(self.specjalist.user_id),
        )

    def test_an_account_that_has_consented_is_reported_as_active(self):
        """The column is what answers "why can they not log in" — see the
        module header."""
        self.create()

        response = self.client.get(reverse('core:specialist-colleagues'))

        rows = {row['email']: row for row in response.data}
        self.assertIs(rows['specjalista@example.com']['consents_active'], True)
        self.assertIs(rows['nowa.terapeutka@example.com']['consents_active'], False)

    def test_a_patient_cannot_read_the_roster(self):
        patient = Patient.objects.create(
            user=self.make_user('pacjent@example.com'), is_child=False,
        )
        self.sign_in(patient.user)

        response = self.client.get(reverse('core:specialist-colleagues'))

        self.assertEqual(response.status_code, 403)


class ThrottleTests(ColleagueTestCase):
    """Creating accounts is bounded, and reading the roster is not."""

    def setUp(self):
        super().setUp()
        cache.clear()

    def cap_at(self, rate):
        """Patched on the class, not through `override_settings(REST_FRAMEWORK=...)`,
        which silently does nothing here: `SimpleRateThrottle.THROTTLE_RATES` is
        bound to the settings dict at import time and never re-reads it.

        create=True because there is no `rate` class attribute — it is set per
        instance in __init__, which skips the lookup when one is already there.
        """
        patched = patch.object(SpecialistAccountThrottle, 'rate', rate, create=True)
        patched.start()
        self.addCleanup(patched.stop)

    def test_the_creating_is_capped_per_account(self):
        self.cap_at('2/hour')

        self.assertEqual(self.create(email='a@example.com').status_code, 201)
        self.assertEqual(self.create(email='b@example.com').status_code, 201)

        self.assertEqual(self.create(email='c@example.com').status_code, 429)
        self.assertFalse(User.objects.filter(email='c@example.com').exists())

    def test_reading_the_roster_is_not(self):
        """The screen reads it every time it opens; a cap there would lock a
        specialist out of their own roster for nothing."""
        self.cap_at('1/hour')
        self.create(email='a@example.com')

        for _ in range(4):
            self.assertEqual(
                self.client.get(reverse('core:specialist-colleagues')).status_code, 200,
            )
