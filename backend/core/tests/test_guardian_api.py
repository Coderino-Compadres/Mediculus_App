"""Tests for the guardian invitation: /api/auth/guardian/ and /api/guardian/invitations/.

Only `default` is touched: `parent_child` lives in user_db alongside both
accounts it points at. Nothing here reaches medical_db.

The rule the whole flow exists for: a minor naming a guardian is a *request*.
Until that guardian accepts, nobody has consented to processing the child's
health data, so the child's account stays blocked (RODO art. 8).
"""

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import SESSION_USER_KEY
from core.guardian import STATUS_ACCEPTED, STATUS_NONE, STATUS_PENDING
from core.models import ParentChild, Patient, User, UserRole
from core.serializers import GuardianLinkSerializer

PASSWORD = 'TajneHaslo123'


def create_user(email, role, **fields):
    return User.objects.create(
        user_role=UserRole.objects.get_or_create(name=role)[0] if role else None,
        email=email, password_hash=make_password(PASSWORD), **fields,
    )


def create_minor(email='dziecko@example.com', **fields):
    user = create_user(email, 'patient', **fields)
    Patient.objects.create(user=user, is_child=True)
    return user


class GuardianTestCase(TestCase):
    databases = {'default'}

    def setUp(self):
        cache.clear()  # the throttle counts in the real cache, which outlives a test
        self.client = APIClient()
        self.url = reverse('core:guardian-link')
        self.invitations_url = reverse('core:guardian-invitations')
        self.child = create_minor(name='Ola', surname='Testowa')
        self.guardian = create_user('rodzic@example.com', 'rodzic')

    def sign_in(self, user):
        # The real session cookie rather than force_authenticate, so the request
        # goes through SessionUserAuthentication like a browser's would.
        session = self.client.session
        session[SESSION_USER_KEY] = str(user.pk)
        session.save()
        self.client.cookies[settings.SESSION_COOKIE_NAME] = session.session_key

    def invite(self, email, as_user=None):
        self.sign_in(as_user or self.child)
        return self.client.post(self.url, {'guardian_email': email}, format='json')

    def accept_url(self, invitation_id):
        return reverse('core:guardian-invitation-accept', args=[invitation_id])

    def reject_url(self, invitation_id):
        return reverse('core:guardian-invitation-reject', args=[invitation_id])

    def status_of(self, user):
        self.sign_in(user)
        return self.client.get(reverse('core:me')).data['guardian_status']


class InvitingTests(GuardianTestCase):
    def test_naming_a_guardian_creates_a_request_not_a_link(self):
        response = self.invite('rodzic@example.com')

        self.assertEqual(response.status_code, 200)
        link = ParentChild.objects.get(parent=self.guardian, child=self.child)
        # The whole point of this change: being named is not consenting.
        self.assertIsNone(link.accepted_at)

    def test_the_child_stays_blocked_until_the_guardian_answers(self):
        response = self.invite('rodzic@example.com')

        self.assertEqual(response.data['guardian_status'], STATUS_PENDING)
        self.assertEqual(self.status_of(self.child), STATUS_PENDING)

    def test_the_address_is_matched_case_insensitively(self):
        response = self.invite('Rodzic@EXAMPLE.com')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(ParentChild.objects.filter(child=self.child).exists())

    def test_repeating_the_same_invitation_is_not_an_error(self):
        # A double-clicked button or a retried request is the same answer
        # arriving twice, and uniq_parent_child would otherwise 500 on it.
        self.invite('rodzic@example.com')
        response = self.invite('rodzic@example.com')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(ParentChild.objects.filter(child=self.child).count(), 1)

    def test_a_second_guardian_cannot_be_invited_while_one_is_pending(self):
        # Otherwise a child could fish for whichever adult answers first.
        create_user('inny.rodzic@example.com', 'rodzic')
        self.invite('rodzic@example.com')

        response = self.invite('inny.rodzic@example.com')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data['guardian_email'][0], GuardianLinkSerializer.ALREADY_INVITED,
        )
        self.assertEqual(ParentChild.objects.filter(child=self.child).count(), 1)

    def test_an_accepted_link_cannot_be_swapped_for_another_guardian(self):
        create_user('inny.rodzic@example.com', 'rodzic')
        ParentChild.objects.create(
            parent=self.guardian, child=self.child, accepted_at=timezone.now(),
        )

        response = self.invite('inny.rodzic@example.com')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data['guardian_email'][0], GuardianLinkSerializer.ALREADY_LINKED,
        )

    def test_two_children_can_invite_the_same_guardian(self):
        sibling = create_minor('brat@example.com')

        self.invite('rodzic@example.com')
        response = self.invite('rodzic@example.com', as_user=sibling)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(ParentChild.objects.filter(parent=self.guardian).count(), 2)


class OnlyGuardianAccountsPassTests(GuardianTestCase):
    def test_an_address_belonging_to_a_patient_is_refused(self):
        create_user('dorosly@example.com', 'patient')

        response = self.invite('dorosly@example.com')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data['guardian_email'][0], GuardianLinkSerializer.NOT_A_GUARDIAN,
        )
        self.assertFalse(ParentChild.objects.exists())

    def test_an_address_belonging_to_a_specialist_is_refused(self):
        create_user('terapeuta@example.com', 'specjalista')

        response = self.invite('terapeuta@example.com')

        self.assertEqual(response.status_code, 400)
        self.assertFalse(ParentChild.objects.exists())

    def test_an_account_with_no_role_at_all_is_refused(self):
        # user_role is nullable in the schema, so this is a state the database
        # allows; "no role" must not read as "close enough to rodzic".
        create_user('bezroli@example.com', None)

        response = self.invite('bezroli@example.com')

        self.assertEqual(response.status_code, 400)
        self.assertFalse(ParentChild.objects.exists())

    def test_an_unregistered_address_is_refused(self):
        response = self.invite('nikt@example.com')

        self.assertEqual(response.status_code, 400)
        self.assertFalse(ParentChild.objects.exists())

    def test_a_non_guardian_account_answers_exactly_like_an_unknown_address(self):
        # Telling the two apart would make this form a way to ask "does this
        # person have an account here, and what kind" — which for a
        # mental-health service is itself sensitive.
        create_user('dorosly@example.com', 'patient')

        existing = self.invite('dorosly@example.com')
        unknown = self.invite('nikt@example.com')

        self.assertEqual(existing.status_code, unknown.status_code)
        self.assertEqual(existing.data, unknown.data)

    def test_the_childs_own_address_is_refused_with_a_message_they_can_act_on(self):
        # Mirrors the parent_child_not_self constraint, which would otherwise
        # surface as a database error.
        response = self.invite('dziecko@example.com')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data['guardian_email'][0], GuardianLinkSerializer.OWN_ADDRESS,
        )

    def test_a_malformed_address_never_reaches_the_lookup(self):
        response = self.invite('rodzic-bez-malpy')

        self.assertEqual(response.status_code, 400)
        self.assertIn('guardian_email', response.data)

    def test_the_address_is_required(self):
        self.sign_in(self.child)

        response = self.client.post(self.url, {}, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('guardian_email', response.data)


class WhoMayInviteTests(GuardianTestCase):
    def test_a_visitor_without_a_session_is_refused(self):
        response = self.client.post(
            self.url, {'guardian_email': 'rodzic@example.com'}, format='json',
        )

        self.assertIn(response.status_code, (401, 403))
        self.assertFalse(ParentChild.objects.exists())

    def test_an_adult_patient_has_nothing_to_link(self):
        adult = create_user('dorosly@example.com', 'patient')
        Patient.objects.create(user=adult, is_child=False)

        response = self.invite('rodzic@example.com', as_user=adult)

        self.assertEqual(response.status_code, 403)
        self.assertFalse(ParentChild.objects.exists())

    def test_a_guardian_cannot_use_this_endpoint_to_claim_a_child(self):
        # A guardian has no patient row at all. Adding children is the parent
        # panel's job, and it does not exist yet.
        response = self.invite('rodzic@example.com', as_user=self.guardian)

        self.assertEqual(response.status_code, 403)
        self.assertFalse(ParentChild.objects.exists())

    def test_a_patient_row_with_is_child_null_is_refused(self):
        # is_child is nullable; "unknown" is not "yes".
        undeclared = create_user('nieznany@example.com', 'patient')
        Patient.objects.create(user=undeclared, is_child=None)

        response = self.invite('rodzic@example.com', as_user=undeclared)

        self.assertEqual(response.status_code, 403)

    def test_the_child_is_taken_from_the_session_not_from_the_request_body(self):
        sibling = create_minor('brat@example.com')
        self.sign_in(self.child)

        self.client.post(
            self.url,
            {'guardian_email': 'rodzic@example.com', 'child': str(sibling.pk)},
            format='json',
        )

        self.assertTrue(ParentChild.objects.filter(child=self.child).exists())
        self.assertFalse(ParentChild.objects.filter(child=sibling).exists())


class WithdrawingAnInvitationTests(GuardianTestCase):
    def test_a_child_can_withdraw_a_pending_invitation_and_ask_someone_else(self):
        # Without this a mistyped address that happens to belong to a real
        # guardian account would leave the child waiting forever.
        create_user('inny.rodzic@example.com', 'rodzic')
        self.invite('rodzic@example.com')

        self.sign_in(self.child)
        response = self.client.delete(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['guardian_status'], STATUS_NONE)
        self.assertFalse(ParentChild.objects.exists())
        self.assertEqual(self.invite('inny.rodzic@example.com').status_code, 200)

    def test_an_accepted_link_is_not_the_childs_to_undo(self):
        # Otherwise the guardian's oversight would last exactly as long as the
        # child allowed it.
        ParentChild.objects.create(
            parent=self.guardian, child=self.child, accepted_at=timezone.now(),
        )
        self.sign_in(self.child)

        response = self.client.delete(self.url)

        self.assertEqual(response.status_code, 404)
        self.assertTrue(ParentChild.objects.filter(child=self.child).exists())

    def test_withdrawing_nothing_is_a_404(self):
        self.sign_in(self.child)

        self.assertEqual(self.client.delete(self.url).status_code, 404)

    def test_the_endpoint_accepts_no_other_verb(self):
        self.sign_in(self.child)

        self.assertEqual(self.client.get(self.url).status_code, 405)
        self.assertEqual(self.client.put(self.url, {}, format='json').status_code, 405)


class PendingInvitationListTests(GuardianTestCase):
    def test_the_guardian_sees_who_is_asking(self):
        self.invite('rodzic@example.com')
        self.sign_in(self.guardian)

        response = self.client.get(self.invitations_url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        invitation = response.data[0]
        # Name and address are the only way to tell whose request this is.
        self.assertEqual(invitation['child_name'], 'Ola')
        self.assertEqual(invitation['child_surname'], 'Testowa')
        self.assertEqual(invitation['child_email'], 'dziecko@example.com')

    def test_nothing_clinical_travels_with_an_invitation(self):
        self.invite('rodzic@example.com')
        self.sign_in(self.guardian)

        invitation = self.client.get(self.invitations_url).data[0]

        self.assertEqual(
            sorted(invitation), ['child_email', 'child_name', 'child_surname', 'id'],
        )

    def test_another_guardians_invitations_are_invisible(self):
        other_guardian = create_user('inny.rodzic@example.com', 'rodzic')
        self.invite('rodzic@example.com')
        self.sign_in(other_guardian)

        self.assertEqual(self.client.get(self.invitations_url).data, [])

    def test_an_accepted_invitation_leaves_the_list(self):
        self.invite('rodzic@example.com')
        self.sign_in(self.guardian)
        invitation_id = self.client.get(self.invitations_url).data[0]['id']

        self.client.post(self.accept_url(invitation_id))

        self.assertEqual(self.client.get(self.invitations_url).data, [])

    def test_an_account_nobody_named_gets_an_empty_list_rather_than_a_refusal(self):
        # The guardian's home screen is the same screen every account lands on,
        # so an empty answer is more useful than a 403 to render around.
        self.sign_in(self.child)

        response = self.client.get(self.invitations_url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_a_visitor_without_a_session_is_refused(self):
        self.assertIn(self.client.get(self.invitations_url).status_code, (401, 403))


class AcceptingTests(GuardianTestCase):
    def setUp(self):
        super().setUp()
        self.invite('rodzic@example.com')
        self.link = ParentChild.objects.get(child=self.child)

    def test_accepting_unblocks_the_childs_account(self):
        self.sign_in(self.guardian)

        response = self.client.post(self.accept_url(self.link.pk))

        self.assertEqual(response.status_code, 204)
        self.link.refresh_from_db()
        self.assertIsNotNone(self.link.accepted_at)
        self.assertEqual(self.status_of(self.child), STATUS_ACCEPTED)

    def test_the_moment_of_the_decision_is_recorded_not_just_a_yes(self):
        # RODO art. 7(1) puts the burden of proving consent on us, the same
        # reason the registration consents are timestamps.
        before = timezone.now()
        self.sign_in(self.guardian)

        self.client.post(self.accept_url(self.link.pk))

        self.link.refresh_from_db()
        self.assertGreaterEqual(self.link.accepted_at, before)

    def test_accepting_twice_is_not_an_error(self):
        self.sign_in(self.guardian)

        first = self.client.post(self.accept_url(self.link.pk))
        second = self.client.post(self.accept_url(self.link.pk))

        self.assertEqual(first.status_code, 204)
        self.assertEqual(second.status_code, 204)

    def test_someone_elses_invitation_answers_like_one_that_does_not_exist(self):
        # A 403 would confirm the invitation is real, and who it involves.
        other_guardian = create_user('inny.rodzic@example.com', 'rodzic')
        self.sign_in(other_guardian)

        response = self.client.post(self.accept_url(self.link.pk))

        self.assertEqual(response.status_code, 404)
        self.link.refresh_from_db()
        self.assertIsNone(self.link.accepted_at)

    def test_the_child_cannot_accept_their_own_invitation(self):
        # The entire point of the flow: the minor's own click is not consent.
        self.sign_in(self.child)

        response = self.client.post(self.accept_url(self.link.pk))

        self.assertEqual(response.status_code, 404)
        self.assertEqual(self.status_of(self.child), STATUS_PENDING)

    def test_an_unknown_invitation_id_is_a_404(self):
        self.sign_in(self.guardian)

        response = self.client.post(
            self.accept_url('d0000000-0000-0000-0000-000000000099')
        )

        self.assertEqual(response.status_code, 404)

    def test_a_visitor_without_a_session_is_refused(self):
        # A fresh client: setUp signed the child in to create the invitation.
        self.client = APIClient()

        self.assertIn(
            self.client.post(self.accept_url(self.link.pk)).status_code, (401, 403),
        )

    def test_the_endpoint_only_accepts_post(self):
        self.sign_in(self.guardian)

        self.assertEqual(self.client.get(self.accept_url(self.link.pk)).status_code, 405)


class RejectingTests(GuardianTestCase):
    def setUp(self):
        super().setUp()
        self.invite('rodzic@example.com')
        self.link = ParentChild.objects.get(child=self.child)

    def test_refusing_drops_the_row_so_the_child_can_ask_someone_else(self):
        create_user('inny.rodzic@example.com', 'rodzic')
        self.sign_in(self.guardian)

        response = self.client.post(self.reject_url(self.link.pk))

        self.assertEqual(response.status_code, 204)
        self.assertFalse(ParentChild.objects.filter(pk=self.link.pk).exists())
        self.assertEqual(self.status_of(self.child), STATUS_NONE)
        self.assertEqual(self.invite('inny.rodzic@example.com').status_code, 200)

    def test_an_already_accepted_link_is_not_refusable_here(self):
        # Withdrawing an accepted link is a different decision, with a child's
        # live account behind it; it belongs to the parent panel.
        self.link.accepted_at = timezone.now()
        self.link.save(update_fields=['accepted_at'])
        self.sign_in(self.guardian)

        response = self.client.post(self.reject_url(self.link.pk))

        self.assertEqual(response.status_code, 404)
        self.assertTrue(ParentChild.objects.filter(pk=self.link.pk).exists())

    def test_someone_elses_invitation_answers_like_one_that_does_not_exist(self):
        other_guardian = create_user('inny.rodzic@example.com', 'rodzic')
        self.sign_in(other_guardian)

        response = self.client.post(self.reject_url(self.link.pk))

        self.assertEqual(response.status_code, 404)
        self.assertTrue(ParentChild.objects.filter(pk=self.link.pk).exists())

    def test_the_child_cannot_refuse_on_the_guardians_behalf(self):
        self.sign_in(self.child)

        response = self.client.post(self.reject_url(self.link.pk))

        self.assertEqual(response.status_code, 404)
        self.assertTrue(ParentChild.objects.filter(pk=self.link.pk).exists())


class GuardianStatusTests(GuardianTestCase):
    def test_a_minor_who_named_nobody_reads_as_none(self):
        self.assertEqual(self.status_of(self.child), STATUS_NONE)

    def test_an_adult_patient_is_not_asked_the_question(self):
        adult = create_user('dorosly@example.com', 'patient')
        Patient.objects.create(user=adult, is_child=False)

        self.assertIsNone(self.status_of(adult))

    def test_a_guardian_is_not_asked_the_question(self):
        # They have children_links, not a guardian of their own; answering
        # 'none' would put the guardian's own account behind the linking screen.
        ParentChild.objects.create(parent=self.guardian, child=self.child)

        self.assertIsNone(self.status_of(self.guardian))

    def test_an_accepted_link_outranks_a_pending_one(self):
        # Two rows is a state the invitation rules prevent, but a hand-written
        # row must not lock a linked child out of the app.
        other_guardian = create_user('inny.rodzic@example.com', 'rodzic')
        ParentChild.objects.create(
            parent=self.guardian, child=self.child, accepted_at=timezone.now(),
        )
        ParentChild.objects.create(parent=other_guardian, child=self.child)

        self.assertEqual(self.status_of(self.child), STATUS_ACCEPTED)


class ThrottleTests(GuardianTestCase):
    def test_inviting_is_throttled_per_account(self):
        # AnonRateThrottle exempts requests carrying a session, so the endpoint
        # needs a user-scoped throttle or the cap counts nothing at all: one
        # answer at a time is a question about a person you know, a thousand is
        # an address list.
        self.sign_in(self.child)

        statuses = [
            self.client.post(
                self.url, {'guardian_email': 'nikt@example.com'}, format='json',
            ).status_code
            for _ in range(12)
        ]

        self.assertIn(429, statuses)


class GuardianCsrfTests(GuardianTestCase):
    """Every state-changing step of the invitation, not just the ones with a form.

    The checks live in SessionUserAuthentication rather than on the views, so
    they are inherited rather than declared — and an inherited protection is the
    kind that disappears quietly. Accepting an invitation is the act that
    unblocks a child's account and starts the processing of their health data;
    another site must not be able to trigger it in a guardian's browser.
    """

    def setUp(self):
        super().setUp()
        self.client = APIClient(enforce_csrf_checks=True)

    def token(self):
        return self.client.get(reverse('core:csrf')).data['csrf_token']

    def test_inviting_without_a_token_is_refused(self):
        self.sign_in(self.child)

        response = self.client.post(
            self.url, {'guardian_email': self.guardian.email}, format='json',
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(ParentChild.objects.exists())

    def test_inviting_with_a_token_goes_through(self):
        self.sign_in(self.child)

        response = self.client.post(
            self.url, {'guardian_email': self.guardian.email}, format='json',
            HTTP_X_CSRFTOKEN=self.token(),
        )

        self.assertEqual(response.status_code, 200, response.data)

    def test_withdrawing_without_a_token_is_refused(self):
        ParentChild.objects.create(parent=self.guardian, child=self.child)
        self.sign_in(self.child)

        response = self.client.delete(self.url)

        self.assertEqual(response.status_code, 403)
        self.assertTrue(ParentChild.objects.exists())

    def test_accepting_without_a_token_is_refused(self):
        link = ParentChild.objects.create(parent=self.guardian, child=self.child)
        self.sign_in(self.guardian)

        response = self.client.post(self.accept_url(link.pk))

        self.assertEqual(response.status_code, 403)
        link.refresh_from_db()
        self.assertIsNone(link.accepted_at)

    def test_refusing_without_a_token_is_refused(self):
        link = ParentChild.objects.create(parent=self.guardian, child=self.child)
        self.sign_in(self.guardian)

        response = self.client.post(self.reject_url(link.pk))

        self.assertEqual(response.status_code, 403)
        self.assertTrue(ParentChild.objects.filter(pk=link.pk).exists())

    def test_reading_the_list_needs_no_token(self):
        self.sign_in(self.guardian)

        self.assertEqual(self.client.get(self.invitations_url).status_code, 200)


class InvitationOrderingTests(GuardianTestCase):
    """The order the guardian's home screen renders the cards in.

    Covered directly in test_guardian_unit.py; repeated here once through the
    endpoint so a serializer or a view that re-sorts on its way out cannot undo
    it silently.
    """

    def test_the_endpoint_preserves_the_order_the_rules_chose(self):
        for name, email in (('Zofia', 'z@example.com'), ('Ala', 'a@example.com')):
            ParentChild.objects.create(
                parent=self.guardian, child=create_minor(email, name=name),
            )
        self.sign_in(self.guardian)

        names = [item['child_name']
                 for item in self.client.get(self.invitations_url).data]

        self.assertEqual(names, sorted(names))
