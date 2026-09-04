"""Guardian accounts a specialist starts: /api/specialist/parent-invitations/.

The code is the whole security boundary of this feature, so most of this file is
about the code: that it is never stored in readable form, never returned twice,
bound to one address, spendable once, and that it expires. The rest is about who
may be invited for whom — only a minor, only this specialist's patient.

WHY THE LINK LANDS ACCEPTED, since that is the one place this differs from the
child-initiated flow: the guardian accepts *by completing the registration* with
a code handed to them in person. What the specialist supplies is the fact that
these two people are a family — the one thing the app cannot check itself.
"""

import datetime

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import SESSION_USER_KEY
from core.models import ParentChild, ParentInvitation, Patient, Specjalist, User, UserRole
from core.parent_invitations import (INVITATION_TTL_DAYS, generate_code,
                                     normalize_code)
from core.serializers import ACCOUNT_TYPE_PARENT

PASSWORD = 'TajneHaslo123'


class ParentInvitationTestCase(TestCase):
    databases = {'default'}

    def setUp(self):
        self.client = APIClient()
        UserRole.objects.get_or_create(name='rodzic')
        self.specjalist = self.make_specialist()
        self.child = self.make_patient(is_child=True)
        self.assign(self.specjalist, self.child)
        self.sign_in(self.specjalist.user)

    def make_user(self, email, role='patient', **fields):
        fields.setdefault('data_consent_at', timezone.now())
        fields.setdefault('services_consent_at', timezone.now())
        return User.objects.create(
            user_role=UserRole.objects.get_or_create(name=role)[0] if role else None,
            email=email, password_hash=make_password(PASSWORD), **fields,
        )

    def make_patient(self, email='dziecko@example.com', is_child=True):
        return Patient.objects.create(
            user=self.make_user(email, role='patient'), is_child=is_child,
        )

    def make_specialist(self, email='specjalista@example.com'):
        return Specjalist.objects.create(
            user=self.make_user(email, role='specjalista'), specjalization='DBT',
        )

    def assign(self, specjalist, patient):
        patient.specjalist = specjalist
        patient.specjalist_accepted_at = timezone.now()
        patient.save(update_fields=['specjalist', 'specjalist_accepted_at'])
        return patient

    def sign_in(self, user):
        session = self.client.session
        session[SESSION_USER_KEY] = str(user.pk)
        session.save()
        self.client.cookies[settings.SESSION_COOKIE_NAME] = session.session_key

    def sign_out(self):
        self.client = APIClient()

    def issue(self, email='rodzic@example.com', patient=None):
        return self.client.post(
            reverse('core:specialist-parent-invitations'),
            {'patient_id': str((patient or self.child).user_id), 'parent_email': email},
            format='json',
        )


class CodeTests(ParentInvitationTestCase):
    """What the code is, and what is kept of it."""

    def test_the_plaintext_code_exists_in_the_creating_response_and_nowhere_else(self):
        response = self.issue()

        self.assertEqual(response.status_code, 201, response.data)
        code = response.data['code']
        self.assertTrue(code)

        stored = ParentInvitation.objects.get()
        # Hashed like a password: a database dump must not be a set of usable
        # invitations, each of which can attach a guardian to a named minor.
        self.assertNotIn(normalize_code(code), stored.code_hash)
        self.assertNotEqual(stored.code_hash, code)
        self.assertTrue(stored.code_hash.startswith('pbkdf2_'))

        # And the list can never hand it back.
        listing = self.client.get(reverse('core:specialist-parent-invitations'))
        self.assertNotIn('code', listing.data[0])
        self.assertNotIn(code, str(listing.data))

    def test_the_alphabet_avoids_the_characters_that_are_read_wrong(self):
        """The code is dictated and copied by hand, so O/0 and I/1/L would turn
        into support calls rather than typos."""
        for _ in range(50):
            code = generate_code()
            for character in ('O', '0', 'I', '1', 'L', 'S', '5', 'Z', '2'):
                self.assertNotIn(character, code, code)

    def test_a_typed_code_survives_punctuation_and_case(self):
        code = self.issue().data['code']
        squashed = code.replace('-', '').lower()

        response = self.register_parent(code=f'  {squashed}  ')

        self.assertEqual(response.status_code, 201, response.data)

    def register_parent(self, code, email='rodzic@example.com', **overrides):
        self.sign_out()
        body = {
            'email': email,
            'password': 'BardzoTajne987',
            'password_confirm': 'BardzoTajne987',
            'name': 'Rodzic',
            'surname': 'Testowy',
            'date_of_birth': '1980-02-01',
            'account_type': ACCOUNT_TYPE_PARENT,
            'invitation_code': code,
            'data_consent': True,
            'services_consent': True,
        }
        body.update(overrides)
        return self.client.post(reverse('core:register'), body, format='json')


class RedemptionTests(ParentInvitationTestCase):
    """What happens when the parent registers with the code."""

    def register_parent(self, code, email='rodzic@example.com', **overrides):
        self.sign_out()
        body = {
            'email': email,
            'password': 'BardzoTajne987',
            'password_confirm': 'BardzoTajne987',
            'name': 'Rodzic',
            'surname': 'Testowy',
            'date_of_birth': '1980-02-01',
            'account_type': ACCOUNT_TYPE_PARENT,
            'invitation_code': code,
            'data_consent': True,
            'services_consent': True,
        }
        body.update(overrides)
        return self.client.post(reverse('core:register'), body, format='json')

    def test_it_creates_a_guardian_account_already_linked_to_the_child(self):
        code = self.issue().data['code']

        response = self.register_parent(code)

        self.assertEqual(response.status_code, 201, response.data)
        guardian = User.objects.get(email='rodzic@example.com')
        self.assertEqual(guardian.user_role.name, 'rodzic')
        # A guardian is not a clinical subject, code or no code.
        self.assertFalse(Patient.objects.filter(user=guardian).exists())

        link = ParentChild.objects.get(parent=guardian, child=self.child.user)
        # Accepted on creation: the acceptance *is* the registration — see the
        # module docstring.
        self.assertIsNotNone(link.accepted_at)

    def test_the_child_is_unblocked_by_it(self):
        """The point of the whole flow: a minor's account is unusable until a
        guardian's account vouches for it (RODO art. 8)."""
        code = self.issue().data['code']
        self.register_parent(code)

        self.sign_in(self.child.user)
        response = self.client.get(reverse('core:me'))

        self.assertEqual(response.data['guardian_status'], 'accepted')

    def test_a_code_is_spent_once(self):
        code = self.issue().data['code']
        self.register_parent(code)

        response = self.register_parent(code, email='ktos-inny@example.com')

        self.assertEqual(response.status_code, 400)
        self.assertIn('invitation_code', response.data)
        self.assertFalse(User.objects.filter(email='ktos-inny@example.com').exists())

    def test_the_code_only_works_for_the_address_it_was_issued_to(self):
        """A code overheard by somebody else is not an account."""
        code = self.issue(email='rodzic@example.com').data['code']

        response = self.register_parent(code, email='obcy@example.com')

        self.assertEqual(response.status_code, 400)
        self.assertIn('invitation_code', response.data)

    def test_an_expired_code_stops_working(self):
        code = self.issue().data['code']
        ParentInvitation.objects.update(
            expires_at=timezone.now() - datetime.timedelta(minutes=1))

        response = self.register_parent(code)

        self.assertEqual(response.status_code, 400)
        self.assertIn('invitation_code', response.data)

    def test_it_lasts_the_documented_number_of_days(self):
        before = timezone.now()

        self.issue()

        invitation = ParentInvitation.objects.get()
        expected = before + datetime.timedelta(days=INVITATION_TTL_DAYS)
        self.assertAlmostEqual(
            invitation.expires_at, expected, delta=datetime.timedelta(minutes=1))

    def test_a_wrong_code_refuses_the_registration_rather_than_ignoring_it(self):
        """Somebody typing a code was told to. Creating an unlinked guardian
        account instead would look like it worked and leave the child exactly as
        stuck as before."""
        self.issue()

        response = self.register_parent('ABCD-EFGH-JKMN')

        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(email='rodzic@example.com').exists())
        self.assertFalse(ParentChild.objects.exists())

    def test_a_code_on_any_other_account_type_is_refused(self):
        code = self.issue().data['code']

        response = self.register_parent(code, account_type='patient')

        self.assertEqual(response.status_code, 400)
        self.assertIn('invitation_code', response.data)

    def test_a_failed_registration_does_not_spend_the_invitation(self):
        """Redeemed inside the transaction that creates the account, so a
        password the validators refuse cannot burn the code."""
        code = self.issue().data['code']

        response = self.register_parent(code, password='123', password_confirm='123')

        self.assertEqual(response.status_code, 400)
        self.assertIsNone(ParentInvitation.objects.get().used_at)
        # And the code still works afterwards.
        self.assertEqual(self.register_parent(code).status_code, 201)

    def test_a_guardian_can_still_register_with_no_code_at_all(self):
        response = self.register_parent(code='', email='sam@example.com')

        self.assertEqual(response.status_code, 201, response.data)
        self.assertFalse(ParentChild.objects.exists())

    def test_a_redeemed_invitation_is_reported_as_used_rather_than_deleted(self):
        code = self.issue().data['code']
        self.register_parent(code)

        self.sign_in(self.specjalist.user)
        response = self.client.get(reverse('core:specialist-parent-invitations'))

        self.assertEqual(response.data[0]['status'], 'used')
        self.assertIsNotNone(response.data[0]['used_at'])


class IssueRulesTests(ParentInvitationTestCase):
    """Who may be invited, for whom."""

    def test_only_this_specialist_s_patient(self):
        colleague = self.make_specialist(email='kolega@example.com')
        theirs = self.make_patient(email='ich-dziecko@example.com')
        self.assign(colleague, theirs)

        response = self.issue(patient=theirs)

        self.assertEqual(response.status_code, 400)
        self.assertIn('patient_id', response.data)
        self.assertFalse(ParentInvitation.objects.exists())

    def test_not_for_an_adult_patient(self):
        """`parent_child` exists because a minor cannot consent for themselves;
        a guardian attached to an adult would be a link the gate has no meaning
        for."""
        adult = self.make_patient(email='dorosly@example.com', is_child=False)
        self.assign(self.specjalist, adult)

        response = self.issue(patient=adult)

        self.assertEqual(response.status_code, 400)
        self.assertIn('patient_id', response.data)

    def test_not_for_a_patient_who_only_has_a_pending_invitation(self):
        asked = self.make_patient(email='pytany@example.com')
        asked.specjalist_pending = self.specjalist
        asked.save(update_fields=['specjalist_pending'])

        response = self.issue(patient=asked)

        self.assertEqual(response.status_code, 400)

    def test_not_to_an_address_that_already_has_an_account(self):
        """Refused at issue time rather than at redemption: the code is redeemed
        by *registering*, so an existing account would make it a dead code the
        specialist has already handed over."""
        self.make_user('rodzic@example.com', role='rodzic')

        response = self.issue(email='rodzic@example.com')

        self.assertEqual(response.status_code, 400)
        self.assertIn('parent_email', response.data)

    def test_not_to_the_child_s_own_address(self):
        response = self.issue(email=self.child.user.email)

        self.assertEqual(response.status_code, 400)
        self.assertIn('parent_email', response.data)

    def test_one_live_code_per_address(self):
        self.issue()

        response = self.issue()

        self.assertEqual(response.status_code, 400)
        self.assertIn('parent_email', response.data)
        self.assertEqual(ParentInvitation.objects.count(), 1)

    def test_a_revoked_code_frees_the_address_again(self):
        first = self.issue().data['invitation']['id']

        self.client.delete(
            reverse('core:specialist-parent-invitation', args=[first]))

        self.assertEqual(self.issue().status_code, 201)

    def test_the_address_is_stored_lowercased(self):
        self.issue(email='Rodzic@Example.COM')

        self.assertEqual(ParentInvitation.objects.get().email, 'rodzic@example.com')


class RevokeTests(ParentInvitationTestCase):
    def test_an_unused_invitation_can_be_withdrawn(self):
        invitation_id = self.issue().data['invitation']['id']

        response = self.client.delete(
            reverse('core:specialist-parent-invitation', args=[invitation_id]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])
        self.assertFalse(ParentInvitation.objects.exists())

    def test_a_used_one_cannot_be_deleted_because_the_account_exists(self):
        code = self.issue().data['code']
        invitation_id = ParentInvitation.objects.get().pk
        self.sign_out()
        self.client.post(
            reverse('core:register'),
            {
                'email': 'rodzic@example.com',
                'password': 'BardzoTajne987',
                'password_confirm': 'BardzoTajne987',
                'name': 'Rodzic',
                'surname': 'Testowy',
                'date_of_birth': '1980-02-01',
                'account_type': ACCOUNT_TYPE_PARENT,
                'invitation_code': code,
                'data_consent': True,
                'services_consent': True,
            },
            format='json',
        )
        self.sign_in(self.specjalist.user)

        response = self.client.delete(
            reverse('core:specialist-parent-invitation', args=[invitation_id]))

        self.assertEqual(response.status_code, 404)
        self.assertTrue(ParentInvitation.objects.filter(pk=invitation_id).exists())

    def test_somebody_else_s_invitation_answers_like_a_nonexistent_one(self):
        invitation_id = self.issue().data['invitation']['id']
        colleague = self.make_specialist(email='kolega@example.com')
        self.sign_in(colleague.user)

        response = self.client.delete(
            reverse('core:specialist-parent-invitation', args=[invitation_id]))

        self.assertEqual(response.status_code, 404)
        self.assertTrue(ParentInvitation.objects.filter(pk=invitation_id).exists())

    def test_the_listing_is_filtered_to_the_signed_in_specialist(self):
        self.issue()
        colleague = self.make_specialist(email='kolega@example.com')
        self.sign_in(colleague.user)

        response = self.client.get(reverse('core:specialist-parent-invitations'))

        self.assertEqual(response.data, [])


class DeadlockTests(ParentInvitationTestCase):
    """The flow this whole feature exists for, from an unlinked minor to an
    unblocked account.

    It reads as a formality and it is not: it is the reason the three
    specialist-invitation endpoints opt out of the guardian gate. A child with no
    guardian is refused everywhere, and the code that gives them one can only be
    issued for a child who is already the specialist's patient — so if accepting
    were gated too, the specialist could never issue it and the gate would never
    lift. `GUARDIAN_GATE_EXEMPT_REASON` in core/views.py carries the argument.
    """

    # The caseload's engagement figures are read from medical_db, so this class
    # touches both databases where the rest of the file needs only user_db.
    databases = {'default', 'medical'}

    def setUp(self):
        super().setUp()
        # A minor with no guardian at all, unlike the one in the base case.
        self.unlinked = self.make_patient(email='samotne@example.com', is_child=True)

    def sign_in_child(self):
        self.sign_in(self.unlinked.user)

    def test_a_specialist_can_walk_an_unlinked_minor_all_the_way_out(self):
        # 1. The child is blocked: no guardian, so no diary.
        self.sign_in_child()
        self.assertEqual(self.client.get(reverse('core:diary-history')).status_code, 403)
        self.assertEqual(
            self.client.get(reverse('core:me')).data['guardian_status'], 'none')

        # 2. The specialist asks to treat them.
        self.sign_in(self.specjalist.user)
        invited = self.client.post(
            reverse('core:specialist-patients'),
            {'patient_email': self.unlinked.user.email}, format='json',
        )
        self.assertEqual(invited.status_code, 201, invited.data)

        # 3. The child accepts — the step the gate would otherwise refuse.
        self.sign_in_child()
        accepted = self.client.post(reverse('core:specialist-invitation-accept'))
        self.assertEqual(accepted.status_code, 200)
        # Still blocked: accepting a specialist is not a guardian's consent.
        self.assertEqual(self.client.get(reverse('core:diary-history')).status_code, 403)

        # 4. Which is what lets the specialist issue the guardian's code.
        self.sign_in(self.specjalist.user)
        issued = self.issue(email='opiekun@example.com', patient=self.unlinked)
        self.assertEqual(issued.status_code, 201, issued.data)
        code = issued.data['code']

        # 5. The parent registers with it, and the link lands accepted.
        self.sign_out()
        registered = self.client.post(
            reverse('core:register'),
            {
                'email': 'opiekun@example.com',
                'password': 'BardzoTajne987',
                'password_confirm': 'BardzoTajne987',
                'name': 'Opiekun',
                'surname': 'Testowy',
                'date_of_birth': '1980-02-01',
                'account_type': ACCOUNT_TYPE_PARENT,
                'invitation_code': code,
                'data_consent': True,
                'services_consent': True,
            },
            format='json',
        )
        self.assertEqual(registered.status_code, 201, registered.data)

        # 6. And the child is out of the gate.
        self.sign_in_child()
        self.assertEqual(
            self.client.get(reverse('core:me')).data['guardian_status'], 'accepted')
        self.assertEqual(self.client.get(reverse('core:diary-history')).status_code, 200)
