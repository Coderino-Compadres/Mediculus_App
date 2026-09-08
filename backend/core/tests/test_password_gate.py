"""The password gate: an account holding a password it did not choose reaches one form.

A specialist account is created by another specialist (core/colleagues.py), and
its first password is *generated* — it comes back once in the creating response,
gets read off a note and typed by hand. Two things are therefore true of that
account and of no other: its owner did not choose the credential, and at least
one other person knows it. What the account opens onto is other people's
clinical records, so it is held on the password form until it has its own.

Same shape as the consent gate, and swept the same way — **every URL the project
registers**, from one place. `permission_classes` on a view replaces the defaults
wholesale, so a view that opts out of one gate silently opts out of both, and
forgetting is exactly one line away.

The order of the two gates is pinned here too. It is not a free choice: `POST
/api/account/password/` is itself behind `HasActiveConsents`, so an account asked
for its password before its consents would have no reachable screen at all.
"""

import uuid

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import SESSION_USER_KEY
from core.colleagues import SPECIALIST_ROLE, create_account
from core.consents import withdraw
from core.models import Patient, Specjalist, User, UserRole
from core.permissions import CONSENT_GATE_REFUSAL, PASSWORD_GATE_REFUSAL
from core.tests.test_consent_gate import all_urls

PASSWORD = 'TajneHaslo123'
CHOSEN_PASSWORD = 'WlasneHaslo!2026'

#: The only URLs an account still holding a generated password may reach.
#:
#: The four the consent gate exempts, plus the form that is the way *out* of this
#: gate. Anything else appearing here is a bug: what the specialist panel serves
#: is patients' records, and "signed in" is not yet evidence of who is typing.
OPEN_WHILE_HELD = {
    'core:me', 'core:logout',
    'core:account-consents-withdraw', 'core:account-consents-restore',
    'core:account-password',
}


class PasswordGateTestCase(TestCase):
    databases = {'default', 'medical'}

    def setUp(self):
        self.client = APIClient()
        UserRole.objects.get_or_create(name=SPECIALIST_ROLE)
        self.specjalist, self.given_password = create_account(
            email='nowa.terapeutka@example.com', name='Nowa', surname='Terapeutka',
            date_of_birth='1985-02-01', specialization='DBT',
        )
        self.user = self.specjalist.user
        # The account this file is about arrives holding *both* refusals. The
        # consents are the outer one and are answered first everywhere below,
        # except where the order itself is what is being tested.
        self.user.data_consent_at = timezone.now()
        self.user.services_consent_at = timezone.now()
        self.user.save(update_fields=['data_consent_at', 'services_consent_at'])
        self.sign_in(self.user)

    def sign_in(self, user):
        session = self.client.session
        session[SESSION_USER_KEY] = str(user.pk)
        session.save()
        self.client.cookies[settings.SESSION_COOKIE_NAME] = session.session_key

    def request(self, method, url, body=None):
        return getattr(self.client, method)(url, body or {}, format='json')

    def change_password(self, new_password=CHOSEN_PASSWORD, current=None):
        return self.client.post(reverse('core:account-password'), {
            'current_password': current or self.given_password,
            'new_password': new_password,
            'new_password_confirm': new_password,
        }, format='json')

    def reread(self):
        return User.objects.get(pk=self.user.pk)


class SweepTests(PasswordGateTestCase):
    """Every URL, against an account that has not chosen its own password."""

    def setUp(self):
        super().setUp()
        self.urls = all_urls(uuid.uuid4(), 'week-2026-08-03', uuid.uuid4())
        self.open_urls = {reverse(name) for name in OPEN_WHILE_HELD}

    def test_everything_but_the_escape_hatches_is_refused(self):
        for method, url in self.urls:
            if url in self.open_urls:
                continue
            with self.subTest(method=method, url=url):
                self.assertEqual(self.request(method, url).status_code, 403)

    def test_the_refusal_says_what_is_missing(self):
        """Not the generic "not allowed" and not the consent wording either: the
        account is one form away from the app, and the frontend reads
        `must_change_password` on /api/auth/me/ to know which form."""
        response = self.client.get(reverse('core:specialist-patients'))

        self.assertEqual(str(response.data['detail']), PASSWORD_GATE_REFUSAL)

    def test_no_data_travels_with_the_refusal(self):
        response = self.client.get(reverse('core:specialist-patients'))

        self.assertEqual(set(response.data), {'detail'})

    def test_a_refused_write_writes_nothing(self):
        """The one that would matter most: an account behind this gate must not
        be able to mint another account behind it."""
        before = Specjalist.objects.count()

        response = self.client.post(reverse('core:specialist-colleagues'), {
            'email': 'kolejna@example.com', 'name': 'Kolejna', 'surname': 'Osoba',
            'date_of_birth': '1990-01-01', 'specialization': 'DBT',
        }, format='json')

        self.assertEqual(response.status_code, 403)
        self.assertEqual(Specjalist.objects.count(), before)

    def test_the_way_out_stays_reachable_from_inside_the_gate(self):
        """Gating these would be a deadlock: the account could not read why it
        was refused, could not set a password, and could not even leave."""
        self.assertEqual(self.client.get(reverse('core:me')).status_code, 200)
        self.assertEqual(self.change_password().status_code, 204)

    def test_changing_the_password_opens_everything_again(self):
        """The specialist endpoints specifically, not "nothing answers 403":
        403 is a legitimate answer elsewhere for unrelated reasons."""
        self.change_password()

        for name in ('core:specialist-patients', 'core:specialist-colleagues',
                     'core:specialist-parent-invitations',
                     'core:specialist-techniques', 'core:technique-catalogue'):
            with self.subTest(name=name):
                self.assertEqual(self.client.get(reverse(name)).status_code, 200)


class OrderTests(PasswordGateTestCase):
    """Consents first, then the password — and the order is forced."""

    def test_an_account_missing_both_is_sent_to_the_consents(self):
        """Which is the only order that works: the password endpoint is behind
        HasActiveConsents, so the other way round has no reachable screen."""
        withdraw(self.user, 'all')

        refused = self.change_password()

        self.assertEqual(refused.status_code, 403)
        self.assertEqual(str(refused.data['detail']), CONSENT_GATE_REFUSAL)
        self.assertTrue(
            check_password(self.given_password, self.reread().password_hash))

    def test_me_reports_both_refusals_so_the_router_can_pick_a_screen(self):
        withdraw(self.user, 'all')

        me = self.client.get(reverse('core:me'))

        self.assertEqual(me.status_code, 200)
        self.assertIs(me.data['consents']['active'], False)
        self.assertIs(me.data['must_change_password'], True)


class ClearingTests(PasswordGateTestCase):
    """What setting a password of one's own does, and what it must not do."""

    def test_it_clears_the_flag_and_stores_the_new_hash(self):
        response = self.change_password()

        user = self.reread()
        self.assertEqual(response.status_code, 204)
        self.assertFalse(user.must_change_password)
        self.assertTrue(check_password(CHOSEN_PASSWORD, user.password_hash))

    def test_a_wrong_current_password_changes_nothing(self):
        """Including the flag: a failed attempt must not open the account."""
        response = self.change_password(current='NieToHaslo123')

        user = self.reread()
        self.assertEqual(response.status_code, 400)
        self.assertTrue(user.must_change_password)
        self.assertTrue(check_password(self.given_password, user.password_hash))

    def test_a_password_the_validators_refuse_leaves_the_gate_shut(self):
        response = self.change_password('haslo')

        self.assertEqual(response.status_code, 400)
        self.assertTrue(self.reread().must_change_password)

    def test_reusing_the_generated_password_is_refused(self):
        """The point of the gate is a password its owner chose. Retyping the one
        that was handed over would clear the flag while changing nothing."""
        response = self.change_password(self.given_password)

        self.assertEqual(response.status_code, 400)
        self.assertTrue(self.reread().must_change_password)


class UnflaggedAccountTests(PasswordGateTestCase):
    """Everybody else is not gated, and nothing about them changed."""

    def make_patient_user(self, email='pacjentka@example.com'):
        user = User.objects.create(
            user_role=UserRole.objects.get_or_create(name='patient')[0],
            email=email, password_hash=make_password(PASSWORD),
            data_consent_at=timezone.now(), services_consent_at=timezone.now(),
        )
        Patient.objects.create(user=user, is_child=False)
        return user

    def test_an_account_that_chose_its_own_password_is_not_held(self):
        self.client = APIClient()
        self.sign_in(self.make_patient_user())

        response = self.client.get(reverse('core:diary-history'))

        self.assertEqual(response.status_code, 200)

    def test_the_flag_is_false_on_such_an_account_and_travels_as_such(self):
        self.client = APIClient()
        self.sign_in(self.make_patient_user())

        me = self.client.get(reverse('core:me'))

        self.assertIs(me.data['must_change_password'], False)

    def test_changing_a_password_that_was_never_flagged_leaves_it_false(self):
        """The write is unconditional, so this is the case that proves it costs
        nothing: FALSE stays FALSE rather than becoming anything else."""
        user = self.make_patient_user()
        self.client = APIClient()
        self.sign_in(user)

        response = self.client.post(reverse('core:account-password'), {
            'current_password': PASSWORD,
            'new_password': CHOSEN_PASSWORD,
            'new_password_confirm': CHOSEN_PASSWORD,
        }, format='json')

        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.get(pk=user.pk).must_change_password)
